#!/usr/bin/env python3
"""Retain mapped chimneys/cooling towers at existing Kazan CHP station sites.

uv run --python 3.13 --with osmium tools/import-kazan-power-station-structures.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium


def inside(x, z, ring):
    points = list(zip(ring[::2], ring[1::2]))
    result = False
    for i, (a, b) in enumerate(points):
        c, d = points[i - 1]
        if (b > z) != (d > z) and x < (c - a) * (z - b) / (d - b) + a:
            result = not result
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    with gzip.open(root / 'js/kazan-geodata.json.gz', 'rt') as stream:
        city = json.load(stream)
    with args.source.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != city['source']['extract']['sha256']:
            raise ValueError('Station structures and city must share the regional source')
    sites = [s for s in city['power']['facilities'] if s['name'] in ('Казанская ТЭЦ-1', 'Казанская ТЭЦ-2', 'Казанская ТЭЦ-3')]
    frame = city['frame']
    elements = []
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    processor = processor.with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY))
    processor = processor.with_filter(osmium.filter.TagFilter(('man_made', 'chimney'), ('man_made', 'cooling_tower'),
                                                              ('tower:type', 'cooling'), ('building', 'cooling_tower')))
    for obj in processor:
        if obj.is_node():
            geometry = [{'lon': obj.lon, 'lat': obj.lat}]
        else:
            if not all(n.location.valid() for n in obj.nodes):
                continue
            geometry = [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes]
        if not geometry:
            continue
        x = sum((p['lon'] - frame['origin']['lon']) * frame['kx'] for p in geometry) / len(geometry)
        z = sum((frame['origin']['lat'] - p['lat']) * frame['kz'] for p in geometry) / len(geometry)
        site = next((s for s in sites if any(inside(x, z, ring) for ring in s['rings'])), None)
        if site:
            elements.append({'id': obj.id, 'type': 'node' if obj.is_node() else 'way', 'tags': dict(obj.tags),
                             'geometry': geometry, 'station': f'{site["osmType"]}/{site["id"]}'})
    result = {'source': city['source']['extract'], 'elements': sorted(elements, key=lambda e: (e['type'], e['id']))}
    (root / 'tools/data/kazan-power-station-structures.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(elements)} mapped structures inside the existing three CHP sites')


if __name__ == '__main__':
    main()
