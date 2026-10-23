#!/usr/bin/env python3
"""Import the mapped power network across the complete city coverage from its regional PBF.

uv run --python 3.13 --with osmium tools/import-kazan-power.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium


def overlaps(points, bounds):
    return (bool(points) and min(p['lon'] for p in points) <= bounds['east']
            and max(p['lon'] for p in points) >= bounds['west']
            and min(p['lat'] for p in points) <= bounds['north']
            and max(p['lat'] for p in points) >= bounds['south'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    args = parser.parse_args()
    data = Path(__file__).resolve().parent / 'data'
    with gzip.open(data / 'kazan-osm.json.gz', 'rt') as stream:
        city = json.load(stream)
    with args.source.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != city['extract']['sha256']:
            raise ValueError('Power network and city must use the same regional extract')
    bounds = json.loads((data / 'kazan-coverage.json').read_text())['bounds']
    keys = ('power', 'disused:power', 'construction:power', 'demolished:power', 'proposed:power', 'abandoned:power')
    relations, needed = [], set()
    for obj in osmium.FileProcessor(str(args.source), osmium.osm.RELATION).with_filter(osmium.filter.KeyFilter(*keys, 'route')):
        tags = dict(obj.tags)
        if not any(k in tags for k in keys) and tags.get('route') != 'power':
            continue
        members = [{'type': {'w': 'way', 'n': 'node', 'r': 'relation'}[m.type], 'ref': m.ref, 'role': m.role} for m in obj.members]
        relations.append({'type': 'relation', 'id': obj.id, 'tags': tags, 'members': members})
        needed.update(m['ref'] for m in members if m['type'] == 'way')
    elements, ways = {}, {}
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    processor = processor.with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY))
    for obj in processor.with_filter(osmium.filter.KeyFilter(*keys)):
        tags = dict(obj.tags)
        if obj.is_node():
            point = {'lon': obj.lon, 'lat': obj.lat}
            if overlaps([point], bounds):
                elements[('node', obj.id)] = {'type': 'node', 'id': obj.id, **point, 'tags': tags}
            continue
        if not all(n.location.valid() for n in obj.nodes):
            continue
        geometry = [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes]
        item = {'type': 'way', 'id': obj.id, 'nodes': [n.ref for n in obj.nodes], 'geometry': geometry, 'tags': tags}
        if obj.id in needed:
            ways[obj.id] = item
        if overlaps(geometry, bounds):
            elements[('way', obj.id)] = item
    missing = needed - ways.keys()
    if missing:
        processor = osmium.FileProcessor(str(args.source)).with_locations()
        processor = processor.with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(osmium.filter.IdFilter(missing))
        for obj in processor:
            if all(n.location.valid() for n in obj.nodes):
                ways[obj.id] = {'type': 'way', 'id': obj.id, 'nodes': [n.ref for n in obj.nodes],
                                'geometry': [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes], 'tags': dict(obj.tags)}
    for relation in relations:
        selected = False
        for member in relation['members']:
            if member['type'] == 'way' and member['ref'] in ways:
                member['geometry'] = ways[member['ref']]['geometry']
                selected = selected or overlaps(member['geometry'], bounds)
        if selected:
            elements[('relation', relation['id'])] = relation
    result = {'source': city['extract'], 'bounds': bounds, 'elements': [elements[k] for k in sorted(elements)]}
    payload = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    (data / 'kazan-power.json.gz').write_bytes(gzip.compress(payload, mtime=0))
    print(f'Imported {len(elements)} power features across {bounds}')


if __name__ == '__main__':
    main()
