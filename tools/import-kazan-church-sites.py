#!/usr/bin/env python3
"""Import church/monastery grounds, mapped barriers and gates from the city PBF.

uv run --python 3.13 --with osmium tools/import-kazan-church-sites.py
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
        raise ValueError('Church sites and city geometry must use the same regional extract')
    west, south, east, north = 49.1095, 55.7983, 49.1153, 55.8004
    elements = []
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    processor = processor.with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY))
    for obj in processor.with_filter(osmium.filter.KeyFilter('barrier', 'landuse', 'amenity')):
        tags = dict(obj.tags)
        if 'barrier' not in tags and tags.get('landuse') != 'religious' and tags.get('amenity') != 'monastery':
            continue
        if obj.is_node():
            if west <= obj.lon <= east and south <= obj.lat <= north:
                elements.append({'type': 'node', 'id': obj.id, 'lon': obj.lon, 'lat': obj.lat, 'tags': tags})
            continue
        if not all(n.location.valid() for n in obj.nodes):
            continue
        geometry = [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes]
        if not geometry or min(n['lon'] for n in geometry) > east or max(n['lon'] for n in geometry) < west:
            continue
        if min(n['lat'] for n in geometry) > north or max(n['lat'] for n in geometry) < south:
            continue
        elements.append({'type': 'way', 'id': obj.id, 'nodes': [n.ref for n in obj.nodes], 'geometry': geometry, 'tags': tags})
    result = {'source': city['extract'], 'bounds': [west, south, east, north],
              'elements': sorted(elements, key=lambda e: (e['type'], e['id']))}
    (data / 'kazan-church-sites.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(elements)} church-site boundaries, barriers and gate records')


if __name__ == '__main__':
    main()
