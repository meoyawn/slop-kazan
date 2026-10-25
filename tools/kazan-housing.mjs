import { polygonContains } from '../js/footprints.js';

const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;
const normalized = (s) => String(s || '').normalize('NFKC').toLowerCase().replaceAll('ё', 'е').replace(/[«»"“”]/g, '').trim();
const types = [['улица', /(?:^|\s)(?:улица|ул\.?)(?=\s|$)/g], ['проспект', /(?:^|\s)(?:проспект|пр-кт\.?|пр-т\.?)(?=\s|$)/g],
  ['переулок', /(?:^|\s)(?:переулок|пер\.?)(?=\s|$)/g], ['проезд', /(?:^|\s)(?:проезд|пр-д\.?)(?=\s|$)/g],
  ['тракт', /(?:^|\s)тракт(?=\s|$)/g], ['шоссе', /(?:^|\s)шоссе(?=\s|$)/g],
  ['бульвар', /(?:^|\s)(?:бульвар|б-р\.?)(?=\s|$)/g], ['площадь', /(?:^|\s)(?:площадь|пл\.?)(?=\s|$)/g]];

function streetKey(value) {
  let text = normalized(value).replace(/^ул\.\s+(?=.+\s+(?:тракт|шоссе|проспект|переулок|бульвар|площадь)$)/, ''), kind = '';
  for (const [type, pattern] of types) {
    const stripped = text.replace(pattern, ' ');
    if (stripped === text) continue;
    if (kind && kind !== type) return null;
    kind = type; text = stripped;
  }
  text = text.replace(/\s+/g, ' ').trim().replace(/^(.+)\s+(\d+-[яйе])$/, '$2 $1');
  return kind && text ? `${kind}:${text}` : null;
}
function houseKey(value) {
  const latin = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
  const text = normalized(value).replace(/^д(?:ом)?\.?\s*(?=\d)/, '').replace(/корпус|корп\.?|кор\.(?=\s*\d)/g, 'к').replace(/строение|стр\.?/g, 'стр')
    .replace(/к\.(?=\s*\d)/g, 'к').replace(/[–—]/g, '-').replace(/[abcehkmoptxy]/g, (letter) => latin[letter]).replace(/\s+/g, '');
  return /^\d+[а-я]?(?:[/-]\d+[а-я]?)?(?:к\d+[а-я]?)?(?:стр\d+[а-я]?)?$/.test(text) ? text : null;
}
function addressKey(street, house) {
  const s = streetKey(street), h = houseKey(house);
  return s && h ? `${s}|${h}` : null;
}
function catalogueKey(address) {
  const match = /(?:^|,\s*)г\.?\s*Казань\s*,\s*(.+?),\s*д(?:ом)?\.?\s*(.+)$/i.exec(address);
  return match ? addressKey(match[1], match[2].replace(/,\s*/g, ' ')) : null;
}

/** Join a complete structural-material batch by unique typed municipal addresses; never guess a nearby footprint or facade colour. */
export function compileHousingMaterials(elements, buildings, source, { cityGeometry, toWorld, passports = null }) {
  const polygons = (cityGeometry.type === 'Polygon' ? [cityGeometry.coordinates] : cityGeometry.coordinates)
    .map((p) => p.map((r) => r.flatMap(([lon, lat]) => toWorld({ lon, lat }))));
  const tags = new Map(elements.map((e) => [referenceOf(e), e.tags || {}])), index = new Map(), principals = new Map();
  for (const b of buildings) {
    if (b.part || !polygons.some((p) => polygonContains(p[0], b.ring[0], b.ring[1]) && !p.slice(1).some((r) => polygonContains(r, b.ring[0], b.ring[1])))) continue;
    const reference = referenceOf(b); principals.set(reference, b);
    const t = tags.get(reference) || {};
    for (const prefix of ['addr', 'addr2', 'addr3']) {
      const key = addressKey(t[`${prefix}:street`], t[`${prefix}:housenumber`]);
      if (!key) continue;
      if (!index.has(key)) index.set(key, new Set()); index.get(key).add(reference);
    }
  }
  const bindings = new Map(), unresolved = [], linkedCards = [];
  const records = [...source.records, ...(passports?.records || []).map((r) => ({ ...r, sourceId: `prawdom:${r.sourceId}` }))];
  for (const record of records) {
    const key = catalogueKey(record.address), candidates = key ? [...(index.get(key) || [])] : [];
    if (candidates.length !== 1) {
      unresolved.push({ sourceId: record.sourceId, address: record.address,
        reason: !key ? 'unsupported-address' : candidates.length ? 'ambiguous-mapped-address' : 'no-mapped-address', candidates }); continue;
    }
    const reference = candidates[0], b = principals.get(reference);
    if (!/^(apartments|residential|dormitory|yes)$/.test(b.kind)) {
      unresolved.push({ sourceId: record.sourceId, address: record.address, reason: 'mapped-use-conflict', candidates, kind: b.kind }); continue;
    }
    const binding = bindings.get(reference) || { reference, sourceIds: [], materialCategories: [], series: [], constructionYears: [], commissioningYears: [], passportFacts: [],
      evidence: 'unique-municipal-address-and-structural-source', mappedMaterial: b.material, kind: b.kind };
    const categories = record.materialCategory ? [record.materialCategory] : (record.bearingWalls || []).flatMap((wall) =>
      /панел/i.test(wall) ? ['panel-bearing'] : /кирпич/i.test(wall) ? ['brick-bearing'] : /блоч|блок/i.test(wall) ? ['block-bearing'] : []);
    binding.materialCategories = [...new Set([...binding.materialCategories, ...categories])].sort();
    binding.materialCategory = binding.materialCategories.length === 1 ? binding.materialCategories[0] : null;
    binding.materialConflict = binding.materialCategories.length > 1;
    for (const field of ['series','constructionYears','commissioningYears']) binding[field] = [...new Set([...binding[field], ...(record[field] || [])])].sort();
    if (record.bearingWalls) binding.passportFacts.push({ sourceId: record.sourceId, url: record.url, bearingWalls: record.bearingWalls,
      series: record.series, constructionYears: record.constructionYears, commissioningYears: record.commissioningYears,
      levels: record.levels, roof: record.roof, balconies: record.balconies, loggias: record.loggias });
    binding.materialAgreement = binding.materialConflict ? 'conflicting-structural-sources' : !b.material ? 'mapped-material-unknown' :
      b.material === 'plaster' ? 'compatible-layered-material' :
        /panel|concrete/.test(b.material) && binding.materialCategory === 'panel-bearing' || /brick/.test(b.material) && binding.materialCategory === 'brick-bearing' ? 'compatible' :
          binding.materialCategory ? 'different-cladding-or-source-conflict' : 'structural-material-unknown';
    binding.sourceIds.push(record.sourceId); bindings.set(reference, binding); linkedCards.push(record.sourceId);
  }
  const passportSource = passports ? {provider:passports.source.provider,url:passports.source.url,retrievedAt:passports.source.retrievedAt,coverage:passports.coverage} : null;
  return { version: 2, source: { materials: source.source, passports: passportSource }, bindings: [...bindings.values()], unresolved,
    coverage: { sourceCards: records.length, linkedSourceCards: linkedCards.length, uniqueMappedReferences: bindings.size,
      unresolvedSourceCards: unresolved.length, materialDisagreements: [...bindings.values()].filter((b) => b.materialAgreement === 'different-cladding-or-source-conflict').length },
    note: 'Structural material, project and passport evidence, not measured facade or balcony positions. Exact unique addresses preserve street types, named qualifiers, house letters, corpus and typed OSM identity; ambiguous/unmatched records and contradictory passport sections remain explicit. Mapped cladding, dates, geometry and reviewed appearances are unchanged.' };
}
