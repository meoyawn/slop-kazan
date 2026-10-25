import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const referenceOf = (b) => `${b.osmType}/${b.id}`;
const read = (path) => JSON.parse(gunzipSync(fs.readFileSync(path)));
const payload = fs.readFileSync(new URL('../js/kazan-geodata.json.gz',import.meta.url));
const geo = JSON.parse(gunzipSync(payload)), housing = geo.residentialHousing;
assert.ok(housing,'Compile the unified residential layer first');
const buildings = new Map(geo.buildings.map((b) => [referenceOf(b),b]));
const types = new Set(['stalinka','khrushchev','panel','brick','unknown']);
const raw = new Map(read(new URL('data/kazan-osm.json.gz',import.meta.url)).elements.map((e) => [`${e.type}/${e.id}`,e.tags || {}]));
const references = new Set();
for(const binding of housing.bindings){
  assert.ok(!references.has(binding.reference)); references.add(binding.reference);
  const b = buildings.get(binding.reference);
  assert.ok(b && types.has(binding.type));
  assert.equal(b.housingType,binding.type);
  if(binding.type==='khrushchev'){
    assert.equal(b.appearance.balconyZones,false);
    assert.equal(b.appearance.balconyBands,false);
    assert.ok(b.appearance.smallBalconies);
  }
  if(binding.structure==='conflicting')assert.ok(binding.materialConflict);
  if(binding.type==='unknown')assert.equal(binding.confidence,'insufficient-evidence');
}
const roofEstimates = [], changedTypes = [];
if(process.argv[2]){
  const before=read(process.argv[2]);
  assert.equal(geo.buildings.length,before.buildings.length);
  for(let i=0;i<geo.buildings.length;i++){
    const b=geo.buildings[i],old=before.buildings[i],ref=referenceOf(b);
    assert.equal(ref,referenceOf(old));
    for(const key of ['ring','holes','h','minHeight','levels','roofShape','material','parent','part','hasParts','body','openingVolumes'])assert.deepEqual(b[key],old[key],`source ${key} changed at ${ref}`);
    if(b.roofHeight!==old.roofHeight){
      assert.equal(old.roofHeight,0);
      assert.ok(!Object.hasOwn(raw.get(ref) || {},'roof:height'));
      assert.ok(b.roofHeight>0 && b.roofHeight<=3.2);
      roofEstimates.push(ref);
    }
    if(old.facadeConfidence==='reviewed' || old.facadeCohort || old.model || /^(school|kindergarten|worship|sports)-/.test(old.facadeFamily || ''))assert.deepEqual(b.appearance,old.appearance,`reviewed/specialist paint changed at ${ref}`);
    if(old.stalinkaCrown)assert.deepEqual(b.stalinkaCrown,old.stalinkaCrown,`supported crown changed at ${ref}`);
    if(b.facadeFamily!==old.facadeFamily)changedTypes.push({reference:ref,previous:old.facadeFamily || null,current:b.facadeFamily || null});
  }
  for(const key of ['roads','water','elevation','landcover','railways','trams','power','fuel','education','sports','worship','buildingDates','pedestrianStructures','underground','churchSites','prisonSites','passages'])assert.deepEqual(geo[key],before[key],`${key} changed outside housing`);
}
const passports=read(new URL('data/kazan-housing-passports.json.gz',import.meta.url));
const byRule={},byStructure={},byStatus={};
for(const b of housing.bindings){if(b.parent)continue;byRule[b.rule || 'unknown']=(byRule[b.rule || 'unknown'] || 0)+1;byStructure[b.structure]=(byStructure[b.structure] || 0)+1;}
for(const b of geo.brickHousing.bindings)byStatus[b.status]=(byStatus[b.status] || 0)+1;
const report={version:1,geography:createHash('sha256').update(payload).digest('hex').slice(0,16),coverage:housing.coverage,
  sourceCoverage:passports.coverage,sourceIdentityGaps:passports.invalid,sourceIndexGaps:passports.unindexed,
  families:{panels:geo.panelHousing.coverage,khrushchev:geo.khrushchevHousing.coverage,stalinkas:geo.stalinkas.coverage,bricks:geo.brickHousing.coverage},
  rules:byRule,construction:byStructure,brickStatus:byStatus,roofEstimates,changedFacades:changedTypes,bindings:housing.bindings,note:housing.note};
fs.writeFileSync(new URL('data/kazan-residential-coverage.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({coverage:report.coverage,sourceCoverage:report.sourceCoverage,families:report.families,rules:byRule,construction:byStructure,brickStatus:byStatus,roofEstimates:roofEstimates.length,changedFacades:changedTypes.length},null,2));
