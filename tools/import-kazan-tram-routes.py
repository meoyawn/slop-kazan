#!/usr/bin/env python3
"""Save mapped Kazan tram route membership from the same regional PBF as city geometry.

uv run --python 3.13 --with osmium tools/import-kazan-tram-routes.py
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
    digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if digest != city['extract']['sha256']:
        raise ValueError('Import city and tram routes from the same regional extract')
    tracks = {e['id'] for e in city['elements'] if e['type'] == 'way' and e.get('tags', {}).get('railway') == 'tram'}
    routes = []
    for relation in osmium.FileProcessor(str(args.source), osmium.osm.RELATION):
        tags = dict(relation.tags)
        if tags.get('type') != 'route' or tags.get('route') != 'tram':
            continue
        members = [{'type': {'w': 'way', 'n': 'node', 'r': 'relation'}[m.type], 'ref': m.ref, 'role': m.role}
                   for m in relation.members]
        if not any(m['type'] == 'way' and m['ref'] in tracks for m in members):
            continue
        routes.append({'id': relation.id, 'tags': tags, 'members': members})
    result = {'source': city['extract'], 'routes': sorted(routes, key=lambda r: r['id'])}
    (data / 'kazan-tram-routes.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(routes)} tram route relations from {city["extract"]["timestamp"]}')


if __name__ == '__main__':
    main()
