#!/usr/bin/env python3
"""Audit raw roof evidence: uv run --python 3.13 --with osmium tools/audit-kazan-roof-source.py."""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path
import re
import tempfile

import osmium

ROOT = Path(__file__).resolve().parent.parent


def relevant(tags):
    return (tags.get('man_made') in ('tower', 'spire')
            or tags.get('building:part') in ('spire', 'tower', 'roof')
            or tags.get('roof:shape') in ('spire', 'pyramidal')
            or tags.get('architectural:element') in ('spire', 'belvedere', 'lantern'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/tmp/slop-kazan-region/tatarstan.osm.pbf'))
    parser.add_argument('--output', type=Path, default=ROOT / 'tools/data/kazan-roof-evidence.json.gz')
    args = parser.parse_args()
    bounds = json.loads((ROOT / 'tools/data/kazan-coverage.json').read_text())['bounds']
    relations, features, counts = [], [], collections.Counter()
    for relation in osmium.FileProcessor(str(args.source), osmium.osm.RELATION):
        if relation.tags.get('type') == 'building':
            relations.append({'id': relation.id, 'tags': dict(relation.tags), 'members': [
                {'type': m.type, 'ref': m.ref, 'role': m.role} for m in relation.members]})
    processor = osmium.FileProcessor(str(args.source)).with_locations()
    for obj in processor.with_filter(osmium.filter.EntityFilter(osmium.osm.WAY | osmium.osm.NODE)):
        tags = dict(obj.tags)
        if not relevant(tags):
            continue
        if obj.is_node():
            points, kind = [{'lon': obj.lon, 'lat': obj.lat}], 'node'
        else:
            if not all(n.location.valid() for n in obj.nodes):
                continue
            points, kind = [{'lon': n.lon, 'lat': n.lat} for n in obj.nodes], 'way'
        if (not points or min(p['lon'] for p in points) > bounds['east']
                or max(p['lon'] for p in points) < bounds['west']
                or min(p['lat'] for p in points) > bounds['north']
                or max(p['lat'] for p in points) < bounds['south']):
            continue
        features.append({'type': kind, 'id': obj.id, 'tags': tags, 'geometry': points})
        counts[tags.get('man_made') or tags.get('building:part') or tags.get('roof:shape')] += 1
    references = {b['reference'] for b in json.loads((ROOT / 'tools/data/kazan-stalinka-coverage.json').read_text())['bindings']}
    types = {'w': 'way', 'r': 'relation', 'n': 'node'}
    linked = [r['id'] for r in relations if any(f"{types[m['type']]}/{m['ref']}" in references for m in r['members'])]
    reader = osmium.io.Reader(str(args.source))
    timestamp = reader.header().get('osmosis_replication_timestamp')
    reader.close()
    result = {
        'version': 1,
        'source': {
            'url': 'https://download.openstreetmap.fr/extracts/russia/volga_federal_district/tatarstan_republic-latest.osm.pbf',
            'sha256': hashlib.sha256(args.source.read_bytes()).hexdigest(), 'timestamp': timestamp, 'licence': 'ODbL-1.0'},
        'bounds': bounds, 'counts': dict(counts), 'features': features,
        'regionalBuildingRelations': relations, 'linkedStalinkaRelations': linked,
        'matchedStalinkaFeatures': [f"{f['type']}/{f['id']}" for f in features if f"{f['type']}/{f['id']}" in references],
        'explicitSpireReferences': [f"{f['type']}/{f['id']}" for f in features if any(re.search('spire|шпил', v, re.I) for v in f['tags'].values())],
        'note': 'Raw-source coverage audit; nearby communication/minaret/bell towers do not establish residential roof crowns. Explicit ownership/use/height evidence takes precedence; photographs supplement missing geometry.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as raw:
        temporary = Path(raw.name)
        with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as stream:
            stream.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode())
    temporary.replace(args.output)
    print(json.dumps({k: v for k, v in result.items() if k not in ('features', 'regionalBuildingRelations')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
