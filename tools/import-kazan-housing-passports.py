#!/usr/bin/env python3
"""Import structural passport facts citywide through the public Kazan street/house index, with a resumable cache."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import gzip
import hashlib
import html
import json
from pathlib import Path
import re
import tempfile
import threading
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://prawdom.ru'
CITY = '/k_city.php?d=99092&c=401099092&f=0'


def plain(value):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', ' ', value)).split())


def links(text):
    return [(html.unescape(u).strip(), plain(t)) for u, t in re.findall(r'<a\b[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', text, re.I | re.S)]


def street_key(value):
    text = value.lower().replace('ё', 'е').replace('\u0301', '')
    kinds = [('улица', r'улица|ул\.?'), ('проспект', r'проспект|пр-кт\.?|пр-т\.?'),
             ('переулок', r'переулок|пер\.?'), ('проезд', r'проезд|пр-д\.?'), ('тракт', 'тракт'),
             ('шоссе', 'шоссе'), ('бульвар', r'бульвар|б-р\.?'), ('площадь', r'площадь|пл\.?')]
    found = []
    for kind, pattern in kinds:
        text, count = re.subn(r'(?:^|\s)(?:' + pattern + r')(?=\s|$)', ' ', text)
        if count:
            found.append(kind)
    text = ' '.join(text.split()).rstrip('. ')
    text = re.sub(r'^(.+)\s+(\d+-[яйе])$', r'\2 \1', text)
    return found[0] + ':' + text if len(found) == 1 and text else None


def house_key(value):
    value = value.lower().replace('ё', 'е').replace('корпус', 'к').replace('кор.', 'к').replace('корп.', 'к')
    value = re.sub(r'\s+', '', value).replace('–', '-').replace('—', '-')
    return value.translate(str.maketrans('abcehkmoptxy', 'авсенкмортху'))


def parse_passport(text, expected_street, expected_house):
    heading = re.search(r'<h1\b[^>]*>(.*?)</h1>', text, re.I | re.S)
    address = re.fullmatch(r'город Казань, (.+?), д\.\s*(.+?)(?: \(район .+\))?', plain(heading[1])) if heading else None
    if not address or street_key(address[1]) != expected_street or house_key(address[2]) != expected_house:
        raise ValueError('Passport identity does not match its indexed Kazan address')
    # Only passport sections are facts; navigation, comments, advertising and other houses are excluded.
    start = re.search(r'<h2\b[^>]*>\s*Паспорт дома.*?</h2>', text, re.I | re.S)
    if not start:
        raise ValueError('Missing passport section')
    end = re.search(r'<h[234]\b[^>]*>[^<]*(?:Отзывы|Добавить комментарий|Популярное|Описание улицы)', text[start.end():], re.I | re.S)
    section = text[start.end():start.end() + end.start()] if end else text[start.end():]
    fields = {}
    for item in re.findall(r'<li\b[^>]*>(.*?)</li>', section, re.I | re.S):
        item = plain(item).rstrip(' ,')
        match = re.match(r'(Этажность|Материал несущих стен|Дата \(год\) постройки|Высота потолка|Количество подъездов)\s*-\s*(.*)', item)
        if match:
            fields[match[1]] = match[2]
    rows = []
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', section, re.I | re.S):
        cells = re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>', row, re.I | re.S)
        if len(cells) == 2:
            rows.append(tuple(plain(c) for c in cells))
    for line in re.split(r'<br\s*/?>', section, flags=re.I):
        match = re.match(r'^(Несущие стены|Серия, тип постройки здания|Год ввода в эксплуатацию|Крыша|Количество балконов|Количество лоджий):?\s+(.+?)\s*$', plain(line))
        if match:
            rows.append((match[1], match[2]))
    def values(pattern):
        return sorted({v for k, v in rows if re.fullmatch(pattern, k) and v and v not in ('-', 'н/д')})
    series = []
    match = re.search(r'Серия \(типовой проект\) здания\s*-\s*(?:<a\b[^>]*>)?([^<\r\n]+)', section)
    if match and plain(match[1]) not in ('', '-', 'н/д'):
        series.append(plain(match[1]))
    return {'address': f'респ. Татарстан, г. Казань, {address[1]}, д. {address[2]}',
            'bearingWalls': sorted(set(filter(None, [fields.get('Материал несущих стен')])) | set(values(r'Несущие стены:?'))),
            'series': sorted(set(series) | set(values(r'Серия, тип постройки здания:?'))),
            'constructionYears': [fields['Дата (год) постройки']] if fields.get('Дата (год) постройки') else [],
            'commissioningYears': values(r'Год ввода в эксплуатацию:?'),
            'levels': fields.get('Этажность'), 'roof': values(r'Крыша:?'),
            'balconies': values(r'Количество балконов:?'), 'loggias': values(r'Количество лоджий:?')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=Path.home() / '.cache/kazan-data-sources/passports')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--osm', type=Path, default=ROOT / 'tools/data/kazan-osm.json.gz')
    parser.add_argument('--output', type=Path, default=ROOT / 'tools/data/kazan-housing-passports.json.gz')
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    lock, last_request = threading.Lock(), [0.0]
    pages = {}

    def fetch(url):
        url = urllib.parse.urljoin(BASE, url)
        path = args.cache_dir / (hashlib.sha256(url.encode()).hexdigest() + '.html.gz')
        if path.exists():
            raw = gzip.decompress(path.read_bytes())
        else:
            if args.offline:
                raise ValueError(f'Missing cached page: {url}')
            for attempt in range(3):
                with lock:
                    time.sleep(max(0, 0.25 - (time.monotonic() - last_request[0])))
                    last_request[0] = time.monotonic()
                try:
                    request = urllib.request.Request(url, headers={'User-Agent': 'slop-kazan structural data (+https://github.com/meoyawn/slop-kazan)'})
                    with urllib.request.urlopen(request, timeout=25) as response:
                        raw = response.read()
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(5 * (attempt + 1))
            path.write_bytes(gzip.compress(raw, mtime=0))
        pages[url] = {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(),
                      'cachedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()}
        return raw.decode('cp1251')

    def batch(urls):
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(fetch, urls))

    first = fetch(CITY)
    city_urls = sorted({u for u, _ in links(first) if re.fullmatch(r'/k_city\.php\?d=99092&c=401099092&f=\d+', u)})
    if not city_urls or not re.search(r'Список улиц г\. Казань', first):
        raise ValueError('Missing Kazan street index/pagination')
    city_pages = batch(city_urls)
    streets = {}
    for text in city_pages:
        if not re.search(r'Список улиц г\. Казань', text):
            raise ValueError('City index identity changed')
        for url, label in links(text):
            if 'nsk.php?nse=' not in url:
                continue
            key = street_key(label)
            if key:
                streets.setdefault(key, set()).add(urllib.parse.quote(url, safe='/?=&%_-'))
    osm = json.loads(gzip.decompress(args.osm.read_bytes()))
    desired = set()
    for element in osm['elements']:
        t = element.get('tags', {})
        if t.get('building') not in ('apartments', 'residential', 'dormitory') or t.get('building:part'):
            continue
        for prefix in ('addr', 'addr2', 'addr3'):
            if t.get(prefix + ':street') and t.get(prefix + ':housenumber'):
                desired.add((street_key(t[prefix + ':street']), house_key(t[prefix + ':housenumber'])))
    street_urls = sorted({u for key, _ in desired for u in streets.get(key, [])})
    street_slugs = {}
    for key, urls in streets.items():
        for url in urls:
            slug = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get('nse', [''])[0].strip()
            street_slugs.setdefault(slug, set()).add(key)
    print(json.dumps({'cityPages': len(city_pages), 'mappedAddresses': len(desired), 'streetPages': len(street_urls)}), flush=True)
    house_urls, indexed = {}, set()
    for text in batch(street_urls):
        # Street pages contain recent articles and advertisements; only their explicit house list is an index.
        block = re.search(r'Список домов,.*?(</p>|</div>)', text, re.I | re.S)
        if not block:
            continue
        for url, house in links(block[0]):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query, encoding='cp1251')
            identity = query.get('hm', [None])[0]
            if not identity or '_' not in identity:
                continue
            slug = identity.rsplit('_', 1)[0].strip()
            for key in street_slugs.get(slug, []):
                address = (key, house_key(house))
                if address in desired:
                    absolute = urllib.parse.urljoin(BASE, url)
                    house_urls[absolute] = address
                    indexed.add(address)
    records, invalid = [], []
    urls = sorted(house_urls)
    print(json.dumps({'passportPages': len(urls), 'addressesOutsideSourceIndex': len(desired - indexed)}), flush=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        for i, (url, text) in enumerate(zip(urls, pool.map(fetch, urls))):
            try:
                row = parse_passport(text, *house_urls[url])
                row.update(sourceId=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query, encoding='cp1251')['hm'][0], url=url)
                records.append(row)
            except ValueError as error:
                invalid.append({'url': url, 'reason': str(error)})
            if (i + 1) % 250 == 0:
                print(json.dumps({'fetched': i + 1, 'total': len(urls), 'valid': len(records), 'invalid': len(invalid)}), flush=True)
    result = {'version': 1, 'source': {'provider': 'Prawdom', 'url': BASE + CITY,
        'method': 'complete advertised Kazan street pagination, indexed house links intersected with mapped residential addresses; no series-page sample used as census',
        'retrievedAt': datetime.now(timezone.utc).isoformat(), 'pages': sorted(pages.values(), key=lambda p: p['url']),
        'licence': 'Source footer permits unlimited reference use; source attribution retained. Raw HTML, photographs, residents and comments are not bundled.'},
        'records': records, 'invalid': invalid,
        'unindexed': [{'streetKey': key, 'houseKey': house} for key, house in sorted(desired - indexed, key=str)],
        'coverage': {'mappedAddresses': len(desired), 'indexedAddresses': len(indexed), 'passportPages': len(urls), 'sourceCards': len(records), 'invalid': len(invalid)}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(gzip.compress(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    temporary.replace(args.output)
    print(json.dumps(result['coverage']), flush=True)


if __name__ == '__main__':
    main()
