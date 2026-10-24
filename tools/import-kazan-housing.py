#!/usr/bin/env python3
"""Import the complete public panel-wall catalogue, with resumable 10-second-spaced page requests."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
MATERIAL = 'Панельные'
NEGATIVE = '__slop_material_absent__'
BASE = 'https://domivita.ru/poisk?'


def filter_value(text):
    for tag in re.findall(r'<input\b[^>]*>', text, re.I):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', tag))
        if attrs.get('name') == 'wall_material':
            return html.unescape(attrs.get('value', ''))
    raise ValueError('Missing wall-material filter: response is not a catalogue page')


def parse_page(text):
    if filter_value(text) != MATERIAL:
        raise ValueError('Catalogue response changed or lost its material filter')
    table = re.search(r'<table\b[^>]*class="[^"]*\bviews-table\b[^"]*"[^>]*>(.*?)</table>', text, re.S)
    if not table:
        raise ValueError('Missing housing table')
    records = []
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table[1], re.S):
        number = re.search(r'<td[^>]*views-field-counter[^>]*>\s*(\d+)\s*</td>', row, re.S)
        if not number:
            continue
        house = re.search(r'<a\b[^>]*href="/dom/(\d+(?:-\d+)*)"[^>]*>(.*?)</a>', row, re.S)
        if not house:
            raise ValueError(f'Missing source identity at row {number[1]}')
        address = ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', house[2])).split())
        records.append({'ordinal': int(number[1]), 'sourceId': house[1], 'address': address,
                        'materialCategory': 'panel-bearing', 'evidence': 'catalogue-wall-material-filter'})
    plain = html.unescape(re.sub(r'<[^>]*>', ' ', text))
    shown = re.search(r'Показано\s+(\d+)\s*-\s*(\d+)\s+из\s+(\d+)\s+дом', plain)
    if not shown:
        raise ValueError('Missing catalogue total and page interval')
    return records, tuple(map(int, shown.groups()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path.home() / '.cache/slop-kazan/housing')
    parser.add_argument('--offline', action='store_true', help='Validate and replay saved pages without network access')
    parser.add_argument('--output', type=Path, default=ROOT / 'tools/data/kazan-housing-materials.json.gz')
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    last_request = 0.0

    def page_file(name, url):
        nonlocal last_request
        path = args.cache_dir / name
        if not path.exists():
            if args.offline:
                raise ValueError(f'Missing cached catalogue page: {name}')
            time.sleep(max(0, 10 - (time.monotonic() - last_request)))
            last_request = time.monotonic()
            request = urllib.request.Request(url, headers={'User-Agent': 'slop-kazan source research (+https://github.com/meoyawn/slop-kazan)'})
            with urllib.request.urlopen(request, timeout=40) as response:
                if response.status != 200:
                    raise ValueError(f'Catalogue HTTP {response.status}')
                payload = response.read()
            temporary = path.with_suffix('.tmp')
            temporary.write_bytes(payload)
            temporary.replace(path)
        return path

    base = BASE + urllib.parse.urlencode({'wall_material': MATERIAL})
    negative_url = BASE + urllib.parse.urlencode({'wall_material': NEGATIVE})
    negative = page_file('domivita-negative.html', negative_url)
    negative_text = negative.read_text()
    if filter_value(negative_text) != NEGATIVE or re.search(r'<table\b[^>]*views-table', negative_text):
        raise ValueError('Negative filter control failed; refuse to infer material from an ignored query')
    records, pages, total, page = [], [], None, 0
    while total is None or page * 50 < total:
        url = base + (f'&page={page}' if page else '')
        path = page_file(f'domivita-panel-page{page}.html', url)
        rows, (start, end, count) = parse_page(path.read_text())
        if total is None:
            total = count
        if count != total or (start, end) != (page * 50 + 1, min((page + 1) * 50, total)):
            raise ValueError(f'Changing or incomplete catalogue interval at page {page}')
        if [r['ordinal'] for r in rows] != list(range(start, end + 1)):
            raise ValueError(f'Missing or repeated row at page {page}')
        records.extend(rows)
        pages.append({'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'records': len(rows),
                      'cachedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()})
        page += 1
    if len(records) != total or len({r['sourceId'] for r in records}) != total:
        raise ValueError('Incomplete or duplicate catalogue source identities')
    result = {'version': 1, 'source': {'provider': 'Domivita', 'url': base, 'wallMaterialQuery': MATERIAL,
        'licence': 'not-stated', 'attribution': 'Domivita; individual passport footer identifies FRT as a source',
        'retrievedAt': datetime.now(timezone.utc).isoformat(), 'pages': pages,
        'negativeControl': {'url': negative_url, 'sha256': hashlib.sha256(negative.read_bytes()).hexdigest(), 'rows': 0}},
        'records': records, 'coverage': {'sourceCards': total, 'pages': len(pages)},
        'note': 'Complete observed catalogue filter, not a census of all city buildings. The filter establishes a panel-bearing category, not exact wall subtype, exterior cladding, series, dates or measured facade colours. Raw HTML/scripts and personal records are not bundled.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as raw:
        temporary = Path(raw.name)
        with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0) as stream:
            stream.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode())
    temporary.replace(args.output)
    print(json.dumps(result['coverage']))


if __name__ == '__main__':
    main()
