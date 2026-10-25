import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { polygonContains } from '../js/footprints.js';

const payload = fs.readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url));
const geo = JSON.parse(gunzipSync(payload)), family = geo.panelHousing;
assert.ok(family, 'Compile the shared panel housing layer first');
const reference = (b) => `${b.osmType}/${b.id}`;
const buildings = new Map(geo.buildings.map((b) => [reference(b), b]));
const principals = family.bindings.filter((b) => !b.parent), references = new Set(family.bindings.map((b) => b.reference));
assert.equal(references.size, family.bindings.length);
const outlines = geo.buildings.filter((b) => b.architectureFamily === 'panel-housing');
assert.equal(outlines.length, family.coverage.renderedOutlines);
for (const binding of family.bindings) {
  const b = buildings.get(binding.reference);
  assert.equal(b?.architectureFamily, 'panel-housing');
  assert.ok(!b.model && !b.construction && !b.facadeCohort);
  assert.ok(binding.sourceIds.length || binding.seriesCandidates?.length || /panel/.test(b.material) || binding.parent, 'Structural admission requires material/project evidence');
  if (binding.parent) assert.ok(references.has(binding.parent));
  assert.ok(Object.values(b.appearance).every((v) => typeof v !== 'number' || Number.isFinite(v)));
  if (binding.finishEvidence === 'beauty-biased-painted-estimate') assert.equal(b.appearance.joints, 'none');
}
const source = JSON.parse(fs.readFileSync(new URL('data/kazan-housing-coverage.json', import.meta.url)));
const candidates = new Set(source.bindings.filter((b) => b.materialCategory==='panel-bearing').map((b) => b.reference)), excluded = new Set(family.exclusions.map((b) => b.reference));
for (const ref of candidates) assert.ok(references.has(ref) || excluded.has(ref), `Unexplained source omission ${ref}`);
const changedOwners = [], inheritedColourMetadataChanges = [], roofEstimates = [];
const rawTags = new Map(JSON.parse(gunzipSync(fs.readFileSync(new URL('data/kazan-osm.json.gz', import.meta.url)))).elements.map((e) => [`${e.type}/${e.id}`, e.tags || {}]));
if (process.argv[2]) {
  const before = JSON.parse(gunzipSync(fs.readFileSync(process.argv[2])));
  assert.equal(geo.buildings.length, before.buildings.length);
  const appearanceFields = new Set(['architectureFamily','appearance','colour','colourSource','facadeFamily','facadeConfidence','facadeCohort','facadeReference','mappedColour','roofHeight']);
  const preserved = (b) => Object.fromEntries(Object.entries(b).filter(([k]) => !appearanceFields.has(k)));
  for (let i = 0; i < geo.buildings.length; i++) {
    const b = geo.buildings[i], old = before.buildings[i];
    if (b.roofHeight !== old.roofHeight) {
      assert.equal(b.architectureFamily, 'panel-housing');
      assert.equal(old.roofHeight, 0);
      assert.ok(!Object.hasOwn(rawTags.get(reference(b)) || {}, 'roof:height'));
      assert.ok(b.roofHeight > 0 && b.roofHeight <= 3.2);
      roofEstimates.push(reference(b));
    }
    if (b.mappedColour !== old.mappedColour) {
      const tags = rawTags.get(reference(b)) || {};
      assert.ok(!tags['building:colour'] && !tags.colour, 'Literal mapped colours cannot be lost during inheritance');
      inheritedColourMetadataChanges.push(reference(b));
    }
    assert.deepEqual(preserved(b), preserved(old), `Source geometry/heights/parts/openings changed at ${reference(b)}`);
    if (b.architectureFamily !== old.architectureFamily) changedOwners.push({ reference: reference(b), previous: old.architectureFamily || null, current: b.architectureFamily || null });
  }
  const systems = ['roads','water','elevation','landcover','railways','trams','power','fuel','education','sports','worship','buildingDates','pedestrianStructures','underground','churchSites','prisonSites','passages'];
  for (const key of systems) {
    const current = structuredClone(geo[key]), previous = structuredClone(before[key]);
    if (key === 'education') for (let i = 0; i < current.sites.length; i++) for (let j = 0; j < current.sites[i].bodies.length; j++) {
      const b = current.sites[i].bodies[j], old = previous.sites[i].bodies[j];
      if (b.facadeProfile !== old.facadeProfile) {
        assert.deepEqual([old.facadeProfile,b.facadeProfile], ['panel-light','mineral-neutral']);
        assert.deepEqual([old.colourSource,b.colourSource], ['procedural-era','procedural-unknown']);
        delete b.facadeProfile; delete old.facadeProfile; delete b.colourSource; delete old.colourSource;
      }
    }
    assert.deepEqual(current, previous, `${key} source/ownership must remain unchanged`);
  }
}
const boundary = JSON.parse(fs.readFileSync(new URL('data/kazan-city-boundary.geojson', import.meta.url))).geometry;
const phi = 55.79 * Math.PI / 180, e2 = 6.69437999014e-3, divisor = 1 - e2 * Math.sin(phi) ** 2;
const kx = Math.PI / 180 * 6378137 / Math.sqrt(divisor) * Math.cos(phi), kz = Math.PI / 180 * 6378137 * (1 - e2) / divisor ** 1.5;
const city = (boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates).map((p) => p.map((r) => r.flatMap(([lon,lat]) => [(lon - 49.108) * kx,(55.79 - lat) * kz])));
const inCity = (b) => city.some((p) => polygonContains(p[0], b.ring[0], b.ring[1]) && !p.slice(1).some((r) => polygonContains(r, b.ring[0], b.ring[1])));
function counts(rows, field) {
  const result = {};
  for (const b of rows) result[b[field] ?? 'unknown'] = (result[b[field] ?? 'unknown'] || 0) + 1;
  return result;
}
const report = { geography: createHash('sha256').update(payload).digest('hex').slice(0,16), coverage: family.coverage,
  municipalPrincipals: principals.filter((r) => inCity(buildings.get(r.reference))).length,
  variants: counts(principals, 'variant'), levels: counts(principals, 'levels'), palettes: counts(principals, 'palette'),
  structuralEvidence: counts(principals, 'confidence'), dateStatus: counts(principals, 'dateStatus'),
  materialVariants: new Set(outlines.map((b) => JSON.stringify(b.appearance))).size,
  retiredIndividualFacades: family.catalogue.retiredIndividualReferences, changedOwners, inheritedColourMetadataChanges, roofEstimates,
  sourceCoverage: source.coverage, unresolved: source.unresolved, exclusions: family.exclusions, bindings: family.bindings,
  note: family.note + ' Finish estimates prefer attractive modern district palettes; unknown repair/seam visibility is not claimed as classified. No per-address facade assignments remain.' };
fs.writeFileSync(new URL('data/kazan-panel-housing-coverage.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, bindings: report.bindings.length, unresolved: report.unresolved.length, changedOwners: counts(changedOwners,'previous'), inheritedColourMetadataChanges: inheritedColourMetadataChanges.length }, null, 2));
