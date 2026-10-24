#!/usr/bin/env python3
"""Retain citywide sports identities, properties and ground features from the city PBF.

uv run --python 3.13 --with osmium tools/import-kazan-sports.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium

VENUES = {'stadium', 'sports_centre', 'sports_hall', 'ice_rink', 'swimming_pool', 'fitness_centre'}
GROUNDS = {'pitch', 'track', 'bleachers', 'fitness_station'}


def sporting(tags):
    return (tags.get('leisure') in VENUES | GROUNDS
            or tags.get('building') in {'stadium', 'sports_hall', 'sports_centre', 'grandstand'}
            or bool(tags.get('building') and tags.get('sport')))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    args = parser.parse_args()
    data = Path(__file__).resolve().parent / 'data'
    with gzip.open(data / 'kazan-osm.json.gz', 'rt') as stream:
        city = json.load(stream)
    digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if digest != city['extract']['sha256']:
        raise ValueError('Sports and city geometry must use the same regional extract')
    bounds = city['coverage']['bounds']

    def overlaps(points, box=bounds):
        return (bool(points) and min(p['lon'] for p in points) <= box['east']
                and max(p['lon'] for p in points) >= box['west']
                and min(p['lat'] for p in points) <= box['north']
                and max(p['lat'] for p in points) >= box['south'])

    relations, required = [], set()
    for obj in osmium.FileProcessor(str(args.source), osmium.osm.RELATION):
        tags = dict(obj.tags)
        if not sporting(tags) or tags.get('type') not in {'multipolygon', 'site'}:
            continue
        members = [{'type': {'w': 'way', 'n': 'node', 'r': 'relation'}[m.type],
                    'ref': m.ref, 'role': m.role} for m in obj.members]
        relations.append({'type': 'relation', 'id': obj.id, 'tags': tags, 'members': members})
        required.update(m['ref'] for m in members if m['type'] == 'way')

    def objects():
        yield from (osmium.FileProcessor(str(args.source)).with_locations()
                    .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)))
        yield from (osmium.FileProcessor(str(args.source))
                    .with_filter(osmium.filter.EntityFilter(osmium.osm.NODE))
                    .with_filter(osmium.filter.KeyFilter('leisure', 'sport', 'building', 'barrier', 'entrance', 'highway')))

    elements, ways, context = {}, {}, []
    for obj in objects():
        tags = dict(obj.tags)
        identity = sporting(tags)
        nearby = bool(tags.get('barrier') or tags.get('entrance') and tags['entrance'] != 'no'
                      or tags.get('highway') == 'steps')
        if not identity and not nearby and (obj.is_node() or obj.id not in required):
            continue
        if obj.is_node():
            points = [{'lon': obj.lon, 'lat': obj.lat}]
            element = {'type': 'node', 'id': obj.id, **points[0], 'tags': tags}
        else:
            if not all(n.location.valid() for n in obj.nodes):
                continue
            points = [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes]
            element = {'type': 'way', 'id': obj.id, 'nodes': [n.ref for n in obj.nodes],
                       'geometry': points, 'tags': tags}
            if obj.id in required:
                ways[obj.id] = element
        if not overlaps(points):
            continue
        if identity:
            elements[(element['type'], element['id'])] = element
        elif nearby:
            context.append((element, points))

    incomplete = []
    for relation in relations:
        members = [{**m, 'geometry': ways[m['ref']]['geometry']}
                   if m['type'] == 'way' and m['ref'] in ways else m for m in relation['members']]
        if not any(overlaps(m.get('geometry', [])) for m in members):
            continue
        missing = [m['ref'] for m in members if m['type'] == 'way' and 'geometry' not in m]
        if missing:
            incomplete.append({'id': relation['id'], 'missingWays': missing})
            continue
        relation['members'] = members
        elements[('relation', relation['id'])] = relation

    boxes = []
    for e in elements.values():
        if e['tags'].get('leisure') in GROUNDS:
            continue
        points = e.get('geometry', []) or [p for m in e.get('members', []) for p in m.get('geometry', [])]
        if e['type'] == 'node':
            points = [e]
        if points:
            boxes.append({'west': min(p['lon'] for p in points) - .0004,
                          'east': max(p['lon'] for p in points) + .0004,
                          'south': min(p['lat'] for p in points) - .00025,
                          'north': max(p['lat'] for p in points) + .00025})
    for e, points in context:
        west, east = min(p['lon'] for p in points), max(p['lon'] for p in points)
        south, north = min(p['lat'] for p in points), max(p['lat'] for p in points)
        if any(west <= box['east'] and east >= box['west'] and south <= box['north']
               and north >= box['south'] for box in boxes):
            elements[(e['type'], e['id'])] = e

    result = {'version': 1, 'generator': 'import-kazan-sports.py',
              'source': {**city['extract'], 'sha256': digest, 'incompleteRelations': incomplete},
              'elements': sorted(elements.values(), key=lambda e: (e['type'], e['id']))}
    output = data / 'kazan-sports.json.gz'
    with output.open('wb') as target:
        with gzip.GzipFile(fileobj=target, mode='wb', mtime=0) as stream:
            stream.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode())
    print(f'Imported {len(elements)} sports/context records; {len(incomplete)} incomplete relations')


if __name__ == '__main__':
    main()
