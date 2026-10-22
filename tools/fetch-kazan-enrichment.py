#!/usr/bin/env python3
"""Fetch only Kazan's source tiles and save reproducible terrain/height extracts.

Run with Python 3.11+ and rasterio, numpy, shapely installed (e.g. uv run
--with rasterio --with shapely tools/fetch-kazan-enrichment.py).
GBA heights: CC BY-NC 4.0. FABDEM terrain: CC BY-NC-SA 4.0.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import zlib

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from rasterio.warp import transform_geom
from shapely.geometry import Polygon, mapping, shape

ROOT = Path(__file__).resolve().parent.parent
FABDEM = "https://data.bris.ac.uk/datasets/s5hqmjcdj8yo2ibzi9b4ew3sn/N50E040-N60E050_FABDEM_V1-2.zip"
GBA = "ftp://m1782307:m1782307@dataserv.ub.tum.de/Height/europe/e045_n60_e050_n55.zip"


def fetch_range(url, start, end=None):
    byte_range = str(start) if end is None else f"{start}-{end}"
    return subprocess.run(["curl", "--fail", "--silent", "--show-error", "--retry", "2", "--max-time", "240",
                           "--range", byte_range, url], check=True, stdout=subprocess.PIPE).stdout


def archive_entries(url):
    tail = fetch_range(url, -300000)
    pos = tail.find(b"PK\x01\x02")
    entries = {}
    while pos >= 0 and tail[pos:pos + 4] == b"PK\x01\x02":
        h = struct.unpack_from("<4s6H3I5H2I", tail, pos)
        name = tail[pos + 46:pos + 46 + h[10]].decode()
        extra = tail[pos + 46 + h[10]:pos + 46 + h[10] + h[11]]
        size, compressed, offset = h[9], h[8], h[16]
        i = 0
        while i + 4 <= len(extra):
            kind, length = struct.unpack_from("<HH", extra, i)
            if kind == 1:
                j = i + 4
                if size == 0xFFFFFFFF: size, j = struct.unpack_from("<Q", extra, j)[0], j + 8
                if compressed == 0xFFFFFFFF: compressed, j = struct.unpack_from("<Q", extra, j)[0], j + 8
                if offset == 0xFFFFFFFF: offset = struct.unpack_from("<Q", extra, j)[0]
            i += 4 + length
        entries[name] = (offset, compressed, h[4], h[7])
        pos += 46 + h[10] + h[11] + h[12]
    if not entries:
        raise ValueError("ZIP central directory missing from range response")
    return entries


def extract_tile(url, name, cache):
    target = cache / Path(name).name
    if target.exists():
        return target
    offset, compressed, method, crc = archive_entries(url)[name]
    print(f"Fetching {name}: {compressed / 1e6:.1f} MB", flush=True)
    header = fetch_range(url, offset, offset + 29)
    fields = struct.unpack("<4s5H3I2H", header)
    if fields[0] != b"PK\x03\x04":
        raise ValueError("Invalid ZIP local header")
    start = offset + 30 + fields[9] + fields[10]
    packed = fetch_range(url, start, start + compressed - 1)
    raw = zlib.decompress(packed, -15) if method == 8 else packed
    if zlib.crc32(raw) != crc:
        raise ValueError(f"CRC mismatch for {name}")
    target.write_bytes(raw)
    return target


def write_gzip(path, value):
    with gzip.GzipFile(path, "wb", mtime=0) as stream:
        stream.write(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode())


def terrain_extract(tiles, destination):
    lat, lon = 55.79, 49.108
    phi = math.radians(lat)
    d = 1 - 6.69437999014e-3 * math.sin(phi) ** 2
    kx = math.pi / 180 * 6378137 / math.sqrt(d) * math.cos(phi)
    kz = math.pi / 180 * 6378137 * (1 - 6.69437999014e-3) / d ** 1.5
    datasets = [rasterio.open(tile) for tile in tiles]
    def grid(x0, z0, step, cols, rows):
        coordinates = np.array([(lon + (x0 + x * step) / kx, lat - (z0 + z * step) / kz)
                                for z in range(rows) for x in range(cols)])
        elevations = np.full(len(coordinates), np.nan, dtype=np.float32)
        for dem in datasets:
            selected = ((coordinates[:, 0] >= dem.bounds.left) & (coordinates[:, 0] < dem.bounds.right) &
                        (coordinates[:, 1] >= dem.bounds.bottom) & (coordinates[:, 1] < dem.bounds.top))
            elevations[selected] = [v[0] for v in dem.sample(coordinates[selected])]
        if np.any(~np.isfinite(elevations)) or np.any(elevations < -100):
            raise ValueError("Terrain tiles have missing cells in Kazan")
        print(f"Terrain: {cols} × {rows} cells; {elevations.min():.1f}–{elevations.max():.1f} m above sea level", flush=True)
        return {"datum": 53, "x0": x0, "z0": z0, "step": step, "cols": cols, "rows": rows,
                "elevations": np.round(elevations * 10).astype(int).tolist()}
    data = {"source": "FABDEM V1-2", "url": "https://doi.org/10.5523/bris.s5hqmjcdj8yo2ibzi9b4ew3sn",
            "license": "CC-BY-NC-SA-4.0",
            "tiles": [{"name": tile.name, "sha256": hashlib.sha256(tile.read_bytes()).hexdigest()} for tile in tiles],
            **grid(-6500, -6000, 30, 518, 401),
            "far": grid(-18000, -14000, 90, 357, 334)}
    for dem in datasets:
        dem.close()
    write_gzip(destination, data)


def height_extract(tiles, destination):
    with gzip.open(ROOT / "tools/data/kazan-osm.json.gz", "rt") as stream:
        osm = json.load(stream)
    datasets = [rasterio.open(path) for path in tiles]
    heights = {}
    for element in osm["elements"]:
        t = element.get("tags", {})
        if not (t.get("building") or t.get("building:part")) or not element.get("geometry"):
            continue
        ring = [(p["lon"], p["lat"]) for p in element["geometry"]]
        if len(ring) < 4:
            continue
        polygon = Polygon(ring)
        if not polygon.is_valid or polygon.area <= 0:
            continue
        samples = []
        for ds in datasets:
            projected = shape(transform_geom("EPSG:4326", ds.crs, mapping(polygon)))
            west, south, east, north = projected.bounds
            if east < ds.bounds.left or west > ds.bounds.right or north < ds.bounds.bottom or south > ds.bounds.top:
                continue
            window = from_bounds(max(west, ds.bounds.left), max(south, ds.bounds.bottom),
                                 min(east, ds.bounds.right), min(north, ds.bounds.top), ds.transform)
            window = window.round_offsets().round_lengths()
            if window.width < 1 or window.height < 1:
                continue
            values = ds.read(1, window=window, masked=True)
            mask = geometry_mask([mapping(projected)], out_shape=values.shape, transform=ds.window_transform(window), invert=True)
            valid = np.asarray(values)[mask & ~np.ma.getmaskarray(values)]
            samples.extend(valid[(valid >= 2) & (valid < 200)].tolist())
        if samples:
            heights[f"{element['type']}/{element['id']}"] = round(float(np.median(samples)), 1)
    for ds in datasets:
        ds.close()
    data = {"source": "GlobalBuildingAtlas GBA.Height", "url": "https://doi.org/10.14459/2025mp1782307",
            "license": "CC-BY-NC-4.0", "method": "Median valid height pixel under OSM footprint; first height band",
            "tiles": [{"name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in tiles],
            "heights": heights}
    write_gzip(destination, data)
    print(f"Height estimates for {len(heights)} OSM outlines/parts", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/slop-kazan-source-tiles"))
    parser.add_argument("--terrain-only", action="store_true")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    dems = [extract_tile(FABDEM, f"N55E0{longitude}_FABDEM_V1-2.tif", args.cache) for longitude in [48, 49]]
    terrain_extract(dems, ROOT / "tools/data/kazan-terrain.json.gz")
    if not args.terrain_only:
        tiles = [extract_tile(GBA, name, args.cache) for name in
                 ["49.0_56.0_49.2_55.8_sr_ss.tif", "49.0_55.8_49.2_55.6_sr_ss.tif"]]
        height_extract(tiles, ROOT / "tools/data/kazan-heights.json.gz")


if __name__ == "__main__":
    main()
