import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { polygonContains } from '../js/footprints.js';
import { createKazanStalinkas } from '../js/kazan-stalinka.js';
import { createKazanPassageFrames } from '../js/kazan-passage-frames.js';

const payload = fs.readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url));
const geo = JSON.parse(gunzipSync(payload)), family = geo.stalinkas;
assert.ok(family, 'Compile the Stalinka layer first');
const keyOf = (b) => `${b.osmType}/${b.id}`;
const buildings = new Map(geo.buildings.map((b) => [keyOf(b), b]));
const allBuildings = geo.buildings;
const geometry = JSON.parse(fs.readFileSync(new URL('data/kazan-city-boundary.geojson', import.meta.url))).geometry;
const phi = 55.79 * Math.PI / 180, e2 = 6.69437999014e-3, divisor = 1 - e2 * Math.sin(phi) ** 2;
const kx = Math.PI / 180 * 6378137 / Math.sqrt(divisor) * Math.cos(phi), kz = Math.PI / 180 * 6378137 * (1 - e2) / divisor ** 1.5;
const city = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates)
  .map((p) => p.map((r) => r.flatMap(([lon, lat]) => [(lon - 49.108) * kx, (55.79 - lat) * kz])));
const inCity = (b) => city.some((p) => polygonContains(p[0], b.ring[0], b.ring[1]) && !p.slice(1).some((r) => polygonContains(r, b.ring[0], b.ring[1])));
const principals = family.bindings.filter((b) => !b.parent), references = new Set(family.bindings.map((b) => b.reference));
assert.equal(references.size, family.bindings.length, 'Multi-outer source identities must stay deduplicated');
for (const binding of family.bindings) {
  assert.ok(buildings.has(binding.reference));
  if (binding.parent) assert.ok(references.has(binding.parent), 'Parts inherit only an explicitly classified mapped parent');
}
for (const b of geo.buildings.filter((b) => b.architectureFamily === 'stalinka')) {
  assert.ok(references.has(keyOf(b)));
  assert.ok(!b.model && !b.facadeCohort && !b.construction, 'Reviewed/specialist owners take precedence');
  assert.ok(!b.appearance.balconyZones && b.appearance.joints !== 'panels', 'Historic families cannot inherit modern panel/balcony strips');
}
if (process.argv[2]) {
  const before = JSON.parse(gunzipSync(fs.readFileSync(process.argv[2]))), allowed = new Set([
    'architectureFamily', 'appearance', 'colour', 'colourSource', 'facadeFamily', 'facadeConfidence', 'roofHeight']);
  assert.equal(geo.buildings.length, before.buildings.length);
  for (let i = 0; i < geo.buildings.length; i++) {
    const b = geo.buildings[i], old = before.buildings[i];
    if (b.architectureFamily !== 'stalinka') assert.deepEqual(b, old, `Unclassified building ${keyOf(b)} must be unchanged`);
    else {
      const unchanged = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !allowed.has(key)));
      assert.deepEqual(unchanged(b), unchanged(old), `Source geometry/height/ownership changed at ${keyOf(b)}`);
      if (b.roofHeight !== old.roofHeight) assert.equal(old.roofHeight, 0, 'An explicit existing roof rise must be retained');
    }
  }
  delete geo.stalinkas; delete geo.buildings; delete before.buildings;
  assert.deepEqual(geo, before, 'All other source systems, including shared dates, must remain unchanged');
}
let accents = 0, activeBody;
let portalFrames = 0, portalInstances = 0;
const portals = createKazanPassageFrames({ plainMaterial: (colour) => colour,
  box(group, x, y, z, w, h, d, material, yaw, orientation) {
    assert.ok([x, y, z, w, h, d, yaw, ...(orientation?.toArray() || [])].every(Number.isFinite), 'Portal transforms stay finite');
    portalInstances++;
  } }, geo.passages);
const materials = new Set(), generator = createKazanStalinkas({ plainMaterial: (colour) => colour,
  box(group, x, y, z, w, h, d, material, yaw) {
    assert.ok([x, y, z, w, h, d, yaw].every(Number.isFinite), `Nonfinite accent at ${keyOf(activeBody)}`);
    assert.ok(w > 0 && h > 0 && d > 0);
    assert.ok(y - h / 2 >= activeBody.minHeight - 0.001 && y + h / 2 <= activeBody.h + 0.001, 'Cornices/pilasters stay inside the source vertical extent');
    assert.ok(d <= 1.1, 'Facade accents must not become oversized full-building plates');
    materials.add(material); accents++;
  } });
for (const b of allBuildings) {
  if (b.architectureFamily !== 'stalinka') continue;
  for (const part of b.hasParts ? b.body || [] : [b]) {
    activeBody = { ...b, ...part };
    const rise = /dome|onion|round|pyramidal|hipped|gabled/.test(b.roofShape) ? Math.min(b.h - b.minHeight, b.roofHeight || Math.min(6, (b.h - b.minHeight) * 0.3)) : 0;
    generator.decorate(null, activeBody, 0, Math.max(0.1, b.h - b.minHeight - rise));
    portalFrames += portals.build(null, activeBody, 0);
  }
}
function counts(bindings) {
  const variants = {}, uses = {}, confidence = {};
  for (const b of bindings) {
    variants[b.variant] = (variants[b.variant] || 0) + 1;
    uses[b.use] = (uses[b.use] || 0) + 1;
    confidence[b.confidence] = (confidence[b.confidence] || 0) + 1;
  }
  return { principalReferences: bindings.length, variants, uses, confidence };
}
const exclusions = {};
for (const b of family.exclusions) exclusions[b.reason] = (exclusions[b.reason] || 0) + 1;
const report = { geography: createHash('sha256').update(payload).digest('hex').slice(0, 16), source: family.note,
  regional: counts(principals), municipal: counts(principals.filter((b) => inCity(buildings.get(b.reference)))),
  mappedPartReferences: family.bindings.filter((b) => b.parent).length,
  mappedRoofOrSpireReferences: family.bindings.filter((b) => b.role === 'mapped-roof-or-spire').length,
  renderedOutlines: family.coverage.renderedOutlines,
  facadeMaterialVariants: new Set(allBuildings.filter((b) => b.architectureFamily === 'stalinka').map((b) => JSON.stringify(b.appearance))).size,
  accentInstances: accents, accentMatrixBytes: accents * 16 * 4, accentTriangles: accents * 12, sharedTrimColours: materials.size,
  portalFrames, portalInstances, portalMatrixBytes: portalInstances * 16 * 4,
  excludedEraReferences: family.exclusions.length, exclusions,
  bindings: family.bindings, excluded: family.exclusions };
fs.writeFileSync(new URL('data/kazan-stalinka-coverage.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, bindings: report.bindings.length, excluded: report.excluded.length }, null, 2));
