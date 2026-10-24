import fs from 'node:fs';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileHousingMaterials } from './kazan-housing.mjs';

const read = (name) => JSON.parse(gunzipSync(fs.readFileSync(new URL(name, import.meta.url))));
const geo = read('../js/kazan-geodata.json.gz'), osm = read('data/kazan-osm.json.gz'), source = read('data/kazan-housing-materials.json.gz');
const cityGeometry = JSON.parse(fs.readFileSync(new URL('data/kazan-city-boundary.geojson', import.meta.url))).geometry;
const phi = 55.79 * Math.PI / 180, e2 = 6.69437999014e-3, divisor = 1 - e2 * Math.sin(phi) ** 2;
const kx = Math.PI / 180 * 6378137 / Math.sqrt(divisor) * Math.cos(phi), kz = Math.PI / 180 * 6378137 * (1 - e2) / divisor ** 1.5;
const result = compileHousingMaterials(osm.elements, geo.buildings, source, { cityGeometry, toWorld: ({ lon, lat }) => [(lon - 49.108) * kx, (55.79 - lat) * kz] });
assert.equal(result.coverage.linkedSourceCards + result.coverage.unresolvedSourceCards, source.coverage.sourceCards);
assert.equal(new Set(result.bindings.map((r) => r.reference)).size, result.bindings.length);
assert.ok(result.bindings.some((r) => r.reference === 'way/82960346' && r.sourceIds.includes('6850527')), 'Chistopolskaya51 must join through the same address mechanism');
const report = { ...result, geography: createHash('sha256').update(fs.readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url))).digest('hex').slice(0,16),
  osmSource: geo.source.extract, unresolvedReasons: {} };
for (const r of report.unresolved) report.unresolvedReasons[r.reason] = (report.unresolvedReasons[r.reason] || 0) + 1;
fs.writeFileSync(new URL('data/kazan-housing-coverage.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ coverage: report.coverage, unresolvedReasons: report.unresolvedReasons }, null, 2));
