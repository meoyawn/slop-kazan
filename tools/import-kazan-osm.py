#!/usr/bin/env python3
"""Import the full requested Kazan area from an OSM France regional PBF.

uv run --python 3.13 --with osmium tools/import-kazan-osm.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import osmium

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "tools/data"
SOURCE_URL = "https://download.openstreetmap.fr/extracts/russia/volga_federal_district/tatarstan_republic-latest.osm.pbf"


def relevant(tags):
    return ("building" in tags or "building:part" in tags or "highway" in tags
            or tags.get("natural") in ("water", "wood", "peak")
            or tags.get("landuse") in ("grass", "forest", "cemetery", "industrial", "education")
            or tags.get("leisure") in ("park", "garden", "pitch", "track", "sports_centre")
            or tags.get("aeroway") in ("runway", "taxiway", "apron", "helipad")
            or tags.get("amenity") in ("monastery", "parking", "parking_space", "university", "college")
            or tags.get("attraction") == "big_wheel"
            or tags.get("tourism") == "artwork"
            or "bridge:support" in tags or tags.get("man_made") == "bridge"
            or tags.get("historic") in ("citywalls", "monument", "memorial"))


def overlaps(points, bounds):
    return (bool(points) and min(p["lon"] for p in points) <= bounds["east"]
            and max(p["lon"] for p in points) >= bounds["west"]
            and min(p["lat"] for p in points) <= bounds["north"]
            and max(p["lat"] for p in points) >= bounds["south"])


def write_gzip(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temporary = Path(temp.name)
        with gzip.GzipFile(fileobj=temp, mode="wb", mtime=0) as stream:
            stream.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("/tmp/slop-kazan-region/tatarstan.osm.pbf"))
    args = parser.parse_args()
    if not args.source.exists():
        args.source.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.source.with_suffix(".download")
        subprocess.run(["curl", "--fail", "--location", "--show-error", "--retry", "2", "--max-time", "240",
                        SOURCE_URL, "-o", str(temporary)], check=True)
        temporary.replace(args.source)
    reader = osmium.io.Reader(str(args.source))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    coverage = json.loads((DATA / "kazan-coverage.json").read_text())
    bounds = coverage["bounds"]
    relations, required_ways = [], set()
    for relation in osmium.FileProcessor(str(args.source), osmium.osm.RELATION):
        tags = dict(relation.tags)
        if relevant(tags) and tags.get("type") in ("multipolygon", "site"):
            members = [{"type": {"w": "way", "n": "node", "r": "relation"}[m.type], "ref": m.ref, "role": m.role}
                       for m in relation.members]
            relations.append({"type": "relation", "id": relation.id, "tags": tags, "members": members})
            required_ways.update(m["ref"] for m in members if m["type"] == "way")
    print(f"Assembling {len(relations)} relevant relations", flush=True)
    elements, ways = {}, {}
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    for obj in processor.with_filter(osmium.filter.EntityFilter(osmium.osm.WAY | osmium.osm.NODE)):
        if obj.is_node():
            if (obj.tags.get("natural") != "peak" and obj.tags.get("aeroway") != "helipad"
                    and obj.tags.get("attraction") != "big_wheel" and obj.tags.get("tourism") != "artwork"
                    and "bridge:support" not in obj.tags and obj.tags.get("historic") not in ("monument", "memorial")):
                continue
            point = {"lon": obj.lon, "lat": obj.lat}
            if overlaps([point], bounds):
                elements[("node", obj.id)] = {"type": "node", "id": obj.id, **point, "tags": dict(obj.tags)}
            continue
        tags = dict(obj.tags)
        needed = obj.id in required_ways
        if not needed and not relevant(tags):
            continue
        if not all(n.location.valid() for n in obj.nodes):
            if needed:
                print(f"Incomplete regional member way {obj.id}", flush=True)
            continue
        points = [{"lon": n.lon, "lat": n.lat} for n in obj.nodes]
        if needed:
            ways[obj.id] = points
        if relevant(tags) and overlaps(points, bounds):
            elements[("way", obj.id)] = {"type": "way", "id": obj.id, "nodes": [n.ref for n in obj.nodes],
                                         "geometry": points, "tags": tags}
    with gzip.open(DATA / "kazan-water.json.gz", "rt") as stream:
        water = json.load(stream)
    water_fallback = {e["id"]: e for e in water["elements"] if e["type"] == "relation"}
    incomplete, retained_water = [], []
    for relation in relations:
        members = []
        missing = []
        for member in relation["members"]:
            if member["type"] == "way":
                if member["ref"] not in ways:
                    missing.append(member["ref"])
                else:
                    members.append({**member, "geometry": ways[member["ref"]]})
        if not any(overlaps(m["geometry"], bounds) for m in members):
            continue
        if missing:
            if relation["id"] in water_fallback:
                elements[("relation", relation["id"])] = water_fallback[relation["id"]]
                retained_water.append(relation["id"])
            else:
                incomplete.append({"id": relation["id"], "missingWays": missing})
            continue
        relation["members"] = members
        elements[("relation", relation["id"])] = relation
    counts = {kind: sum(e["type"] == kind for e in elements.values()) for kind in ("node", "way", "relation")}
    if counts["way"] < 50000:
        raise ValueError(f"Regional extract unexpectedly small: {counts}; previous source kept")
    result = {"version": 0.6, "generator": "import-kazan-osm.py",
              "osm3s": {"timestamp_osm_base": timestamp}, "coverage": coverage,
              "extract": {"url": SOURCE_URL, "sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
                          "timestamp": timestamp, "incompleteRelations": incomplete,
                          "retainedWaterRelations": retained_water,
                          "retainedWaterTimestamp": water.get("osm3s", {}).get("timestamp_osm_base")},
              "elements": sorted(elements.values(), key=lambda e: (e["type"], e["id"]))}
    write_gzip(DATA / "kazan-osm.json.gz", result)
    print(f"Imported {counts}; {len(retained_water)} complete water fallbacks, {len(incomplete)} incomplete relations omitted", flush=True)


if __name__ == "__main__":
    main()
