#!/usr/bin/env python3
"""Import educational identities, mapped properties and nearby yard features from the city PBF.

uv run --python 3.13 --with osmium tools/import-kazan-education.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium

EDUCATION = {'school', 'kindergarten', 'college', 'university', 'music_school', 'driving_school'}
YARDS = {'pitch', 'track', 'sports_centre', 'sports_hall', 'playground', 'fitness_station', 'swimming_pool'}


def educational(tags):
    return tags.get('amenity') in EDUCATION or tags.get('landuse') == 'education'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    args = parser.parse_args()
    data = Path(__file__).resolve().parent / 'data'
    with gzip.open(data / 'kazan-osm.json.gz', 'rt') as stream:
        city = json.load(stream)
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != city['extract']['sha256']:
        raise ValueError('Education and city geometry must use the same regional extract')
    bounds = city['coverage']['bounds']

    def overlaps(points, box=bounds):
        return (bool(points) and min(p['lon'] for p in points) <= box['east']
                and max(p['lon'] for p in points) >= box['west']
                and min(p['lat'] for p in points) <= box['north']
                and max(p['lat'] for p in points) >= box['south'])

    relations, required = [], set()
    for obj in osmium.FileProcessor(str(args.source), osmium.osm.RELATION):
        tags = dict(obj.tags)
        if not educational(tags) or tags.get('type') not in ('multipolygon', 'site'):
            continue
        members = [{'type': {'w': 'way', 'n': 'node', 'r': 'relation'}[m.type], 'ref': m.ref, 'role': m.role}
                   for m in obj.members]
        relations.append({'type': 'relation', 'id': obj.id, 'tags': tags, 'members': members})
        required.update(m['ref'] for m in members if m['type'] == 'way')
    elements, context, ways = {}, [], {}
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    for obj in processor.with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY)):
        tags = dict(obj.tags)
        identity = educational(tags)
        feature = bool(tags.get('entrance') and tags['entrance'] != 'no' or tags.get('barrier')
                       or tags.get('leisure') in YARDS)
        if not identity and not feature and (obj.is_node() or obj.id not in required):
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
        elif feature:
            context.append((element, points))
    incomplete = []
    for relation in relations:
        members = [{**m, 'geometry': ways[m['ref']]['geometry']} if m['type'] == 'way' and m['ref'] in ways else m
                   for m in relation['members']]
        if not any(overlaps(m.get('geometry', [])) for m in members):
            continue
        missing = [m['ref'] for m in members if m['type'] == 'way' and 'geometry' not in m]
        if missing:
            incomplete.append({'id': relation['id'], 'missingWays': missing})
            continue
        relation['members'] = members
        elements[('relation', relation['id'])] = relation
    boxes = []
    for e in [*elements.values(), *(e for e in city['elements'] if e.get('tags', {}).get('building') in ('school', 'kindergarten'))]:
        if e['tags'].get('amenity') not in ('school', 'kindergarten') and e['tags'].get('landuse') != 'education' and e['tags'].get('building') not in ('school', 'kindergarten'):
            continue
        points = e.get('geometry', []) or [p for m in e.get('members', []) for p in m.get('geometry', [])]
        if e['type'] == 'node':
            points = [e]
        if points:
            boxes.append({'west': min(p['lon'] for p in points) - .00015,
                          'east': max(p['lon'] for p in points) + .00015,
                          'south': min(p['lat'] for p in points) - .0001,
                          'north': max(p['lat'] for p in points) + .0001})
    for e, points in context:
        if any(overlaps(points, box) for box in boxes):
            elements[(e['type'], e['id'])] = e
    result = {'source': city['extract'], 'bounds': bounds, 'incompleteRelations': incomplete,
              'contextNote': 'Nearby source features are candidates only; compilation binds features by actual mapped property/footprint membership.',
              'elements': sorted(elements.values(), key=lambda e: (e['type'], e['id']))}
    payload = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    (data / 'kazan-education.json.gz').write_bytes(gzip.compress(payload, mtime=0))
    print(f'Imported {len(elements)} education identities, property and candidate yard records; {len(incomplete)} incomplete relations')


if __name__ == '__main__':
    main()
