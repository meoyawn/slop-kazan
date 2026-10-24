#!/usr/bin/env python3
"""Retain the public mapped Yapeyeva16 architectural enclosure from the city PBF.

uv run --python 3.13 --with osmium tools/import-kazan-prison-site.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    args = parser.parse_args()
    data = Path(__file__).resolve().parent / 'data'
    with gzip.open(data / 'kazan-osm.json.gz', 'rt') as stream:
        city = json.load(stream)
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != city['extract']['sha256']:
        raise ValueError('Site and city footprints must use the same regional extract')
    west, south, east, north = 49.1158, 55.8000, 49.1196, 55.80165
    elements = []
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    processor = processor.with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY))
    for obj in processor.with_filter(osmium.filter.KeyFilter('barrier', 'amenity', 'landuse')):
        tags = dict(obj.tags)
        if 'barrier' not in tags and tags.get('amenity') != 'prison':
            continue
        if obj.is_node():
            if west <= obj.lon <= east and south <= obj.lat <= north:
                elements.append({'type': 'node', 'id': obj.id, 'lon': obj.lon, 'lat': obj.lat, 'tags': tags})
            continue
        if not all(n.location.valid() for n in obj.nodes):
            continue
        geometry = [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes]
        if not geometry or min(p['lon'] for p in geometry) > east or max(p['lon'] for p in geometry) < west:
            continue
        if min(p['lat'] for p in geometry) > north or max(p['lat'] for p in geometry) < south:
            continue
        elements.append({'type': 'way', 'id': obj.id, 'nodes': [n.ref for n in obj.nodes], 'geometry': geometry, 'tags': tags})
    result = {'source': city['extract'], 'bounds': [west, south, east, north],
              'elements': sorted(elements, key=lambda e: (e['type'], e['id']))}
    (data / 'kazan-prison-site.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(elements)} mapped enclosure records around Yapeyeva16')


if __name__ == '__main__':
    main()
