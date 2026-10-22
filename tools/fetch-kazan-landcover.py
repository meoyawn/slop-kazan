#!/usr/bin/env python3
"""Extract ESA WorldCover 2021 land-cover classes on Kazan's 10 m world grid.

uv run --no-project --python 3.13 --with rasterio tools/fetch-kazan-landcover.py
"""
import gzip
import hashlib
import json
import math
from pathlib import Path
import subprocess

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling

ROOT = Path(__file__).resolve().parent.parent
URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N54E048_Map.tif"
CACHE = Path("/tmp/slop-kazan-source-tiles") / URL.rsplit("/", 1)[1]


def main():
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        temporary = CACHE.with_suffix(".download")
        subprocess.run(["curl", "-fLsS", "--max-time", "120", URL, "-o", str(temporary)], check=True)
        temporary.replace(CACHE)
    bounds = json.loads((ROOT / "tools/data/kazan-coverage.json").read_text())["bounds"]
    lon, lat = 49.108, 55.79
    phi = math.radians(lat)
    d = 1 - 6.69437999014e-3 * math.sin(phi) ** 2
    kx = math.pi / 180 * 6378137 / math.sqrt(d) * math.cos(phi)
    kz = math.pi / 180 * 6378137 * (1 - 6.69437999014e-3) / d ** 1.5
    step = 10
    x0 = math.floor((bounds["west"] - lon) * kx / step) * step
    z0 = math.floor((lat - bounds["north"]) * kz / step) * step
    cols = math.ceil(((bounds["east"] - lon) * kx - x0) / step) + 1
    rows = math.ceil(((lat - bounds["south"]) * kz - z0) / step) + 1
    values = np.zeros((rows, cols), dtype=np.uint8)
    transform = from_origin(lon + (x0 - step / 2) / kx, lat - (z0 - step / 2) / kz, step / kx, step / kz)
    with rasterio.open(CACHE) as source:
        reproject(rasterio.band(source, 1), values, src_transform=source.transform, src_crs=source.crs,
                  dst_transform=transform, dst_crs="EPSG:4326", resampling=Resampling.nearest)
    if np.any(values == 0):
        raise ValueError("Land cover has missing cells")
    flat = values.ravel()
    starts = np.r_[0, np.flatnonzero(flat[1:] != flat[:-1]) + 1]
    runs = np.column_stack((flat[starts], np.diff(np.r_[starts, flat.size]))).astype(int).ravel().tolist()
    data = {"source": "ESA WorldCover 2021 v200", "url": "https://doi.org/10.5281/zenodo.7254221",
            "license": "CC-BY-4.0", "tile": URL, "sha256": hashlib.sha256(CACHE.read_bytes()).hexdigest(),
            "attribution": "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
            "sampling": "Nearest land-cover class on a 10 m local grid. Tree-cover pixels constrain procedural vegetation; they are not individual tree observations.",
            "x0": x0, "z0": z0, "cols": cols, "rows": rows, "step": step, "runs": runs}
    destination = ROOT / "tools/data/kazan-landcover.json.gz"
    with gzip.GzipFile(destination, "wb", mtime=0) as stream:
        stream.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode())
    print(f"Land cover: {cols} × {rows}; {len(starts)} runs; {destination.stat().st_size / 1024:.0f} KiB", flush=True)


if __name__ == "__main__":
    main()
