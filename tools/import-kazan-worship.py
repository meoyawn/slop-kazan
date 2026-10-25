#!/usr/bin/env python3
"""Retain citywide worship identities/properties/towers from the city's exact PBF.

uv run --python 3.13 --with osmium tools/import-kazan-worship.py
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium


def religious(tags):
    return (tags.get('amenity') in {'place_of_worship', 'monastery'}
            or tags.get('landuse') == 'religious'
            or tags.get('building') in {'church', 'cathedral', 'chapel', 'mosque', 'religious', 'bell_tower', 'synagogue'}
            or tags.get('tower:type') in {'minaret', 'bell_tower'}
            or tags.get('disused:amenity') == 'place_of_worship')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    args = parser.parse_args()
    data = Path(__file__).resolve().parent / 'data'
    with gzip.open(data / 'kazan-osm.json.gz', 'rt') as stream:
        city = json.load(stream)
    digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if digest != city['extract']['sha256']:
        raise ValueError('Worship and city geometry must use the same regional extract')
    bounds = city['coverage']['bounds']

    def overlaps(points):
        return (bool(points) and min(p['lon'] for p in points) <= bounds['east']
                and max(p['lon'] for p in points) >= bounds['west']
                and min(p['lat'] for p in points) <= bounds['north']
                and max(p['lat'] for p in points) >= bounds['south'])

    relations, required = [], set()
    for obj in osmium.FileProcessor(str(args.source), osmium.osm.RELATION):
        tags = dict(obj.tags)
        if not religious(tags) or tags.get('type') not in {'multipolygon', 'site'}:
            continue
        members = [{'type': {'w': 'way', 'n': 'node', 'r': 'relation'}[m.type],
                    'ref': m.ref, 'role': m.role} for m in obj.members]
        relations.append({'type': 'relation', 'id': obj.id, 'tags': tags, 'members': members})
        required.update(m['ref'] for m in members if m['type'] == 'way')

    elements, ways = {}, {}
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    for obj in processor.with_filter(osmium.filter.EntityFilter(osmium.osm.NODE | osmium.osm.WAY)):
        tags = dict(obj.tags)
        identity = religious(tags)
        if not identity and (obj.is_node() or obj.id not in required):
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
        if identity and overlaps(points):
            elements[(element['type'], element['id'])] = element

    incomplete, context_relations = [], []
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
        if relation['tags']['type'] == 'site':
            context_relations.append(relation['id'])
        elements[('relation', relation['id'])] = relation

    result = {'version': 1, 'generator': 'import-kazan-worship.py',
              'source': {**city['extract'], 'sha256': digest}, 'bounds': bounds,
              'incompleteRelations': incomplete, 'nonPolygonRelations': context_relations,
              'note': 'Source identities only. Site relations are not invented property polygons; no base city geometry is replaced.',
              'elements': sorted(elements.values(), key=lambda e: (e['type'], e['id']))}
    payload = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    (data / 'kazan-worship.json.gz').write_bytes(gzip.compress(payload, mtime=0))
    print(f'Imported {len(elements)} worship records, including '
          f'{sum(e[0] == "node" for e in elements)} nodes; {len(incomplete)} incomplete relations')


if __name__ == '__main__':
    main()
