import { polygonContains } from '../js/footprints.js';
import { compileHousingMaterials } from './kazan-housing.mjs';
import { compilePanelHousing } from './kazan-panel-housing.mjs';
import { compileKhrushchevHousing } from './kazan-khrushchev-housing.mjs';
import { compileStalinkas } from './kazan-stalinka.mjs';
import { compileBrickHousing } from './kazan-brick-housing.mjs';

const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;

/** One residential classification entry point separates architectural type, construction evidence and the chosen facade rule. */
export function compileResidentialHousing(elements, buildings, {dates,source,passports,observations,roads,cityGeometry,toWorld}) {
  const materials = compileHousingMaterials(elements,buildings,source,{cityGeometry,toWorld,passports});
  const dateRecords = new Map(dates.records.map((d) => [d.reference,d])), passportDateFallbacks=[];
  for(const binding of materials.bindings){
    const previous=dateRecords.get(binding.reference),years=binding.constructionYears;
    if(previous?.construction.length || years.length!==1 || !/^\d{4}$/.test(years[0]) || Number(years[0])<1000 || Number(years[0])>2100)continue;
    dateRecords.set(binding.reference,{...previous,reference:binding.reference,alterations:previous?.alterations || [],
      construction:[{field:'passport-construction',text:years[0],qualifier:'mapped',precision:'year',from:Number(years[0]),to:Number(years[0])}]});
    passportDateFallbacks.push(binding.reference);
  }
  const housingDates={...dates,records:[...dateRecords.values()]};
  const panels = compilePanelHousing(elements,buildings,housingDates,materials,observations.panelHousingStyles);
  const khrushchev = compileKhrushchevHousing(elements,buildings,housingDates,observations.khrushchevHousingStyles,materials);
  const stalinkas = compileStalinkas(elements,buildings,housingDates,observations.stalinkaStyles,roads);
  const bricks = compileBrickHousing(elements,buildings,housingDates,materials,observations.brickHousingStyles);
  const evidence = new Map(materials.bindings.map((b) => [b.reference,b]));
  const raw = new Map(elements.map((e) => [referenceOf(e),e.tags || {}]));
  const brickReferences = new Set(bricks.bindings.map((b) => b.reference));
  const choices = new Map([...panels.bindings,...khrushchev.bindings,...stalinkas.bindings,...bricks.bindings].map((b) => [b.reference,b]));
  const polygons = (cityGeometry.type === 'Polygon' ? [cityGeometry.coordinates] : cityGeometry.coordinates).map((p) => p.map((r) => r.flatMap(([lon,lat]) => toWorld({lon,lat}))));
  const bindings = new Map(), regional = {}, municipal = {};
  for (const b of buildings) {
    if (!/^(apartments|residential|dormitory)$/.test(b.kind) && !choices.has(referenceOf(b))) continue;
    const reference = referenceOf(b);
    if (bindings.has(reference)) { b.housingType=bindings.get(reference).type; continue; }
    const source = evidence.get(reference) || evidence.get(b.parent), choice = choices.get(reference);
    const type = b.housingArchetype === 'khrushchev' ? 'khrushchev' : b.architectureFamily === 'stalinka' ? 'stalinka' : b.architectureFamily === 'panel-housing' ? 'panel' : b.architectureFamily === 'brick-housing' || brickReferences.has(reference) ? 'brick' : 'unknown';
    b.housingType=type;
    let roofHeightEvidence=null;
    if(type==='unknown' && !b.model && !b.facadeCohort && b.facadeConfidence!=='reviewed' && !b.roofHeight &&
      !Object.hasOwn(raw.get(reference) || {},'roof:height') && /^(hipped|gabled|side_hipped)$/.test(b.roofShape)){
      b.roofHeight=Math.round(Math.min(observations.residentialDefaults.roofRiseLimit,(b.h-b.minHeight)*observations.residentialDefaults.roofRiseRatio)*10)/10;
      roofHeightEvidence='unmapped-residential-proportion-estimate';
    }
    const structure = source?.materialConflict ? 'conflicting' : source?.materialCategory || (/panel/.test(b.material) ? 'mapped-panel' : /brick/.test(b.material) ? 'mapped-brick-envelope' : 'unknown');
    bindings.set(reference,{reference,...(b.parent ? {parent:b.parent} : {}),type,structure,rule:choice?.rule || b.facadeFamily || null,
      confidence:choice?.confidence || 'insufficient-evidence',sourceIds:source?.sourceIds || [],seriesCandidates:source?.series || [],
      materialConflict:!!source?.materialConflict,finishEvidence:b.colourSource || 'unknown',roofHeightEvidence});
    if (b.part) continue;
    regional[type]=(regional[type] || 0)+1;
    if (polygons.some((p) => polygonContains(p[0],b.ring[0],b.ring[1]) && !p.slice(1).some((r) => polygonContains(r,b.ring[0],b.ring[1])))) municipal[type]=(municipal[type] || 0)+1;
  }
  return {materials,panels,khrushchev,stalinkas,bricks,residential:{version:1,bindings:[...bindings.values()],coverage:{regional,municipal},passportDateFallbacks,
    note:'One authoritative residential type with an independent construction-material axis. Ordered project/era/envelope rules preserve specialist and reviewed ownership. A panel Khrushchev house has Khrushchev architecture and panel construction. Unknown and conflicting facts remain explicit; period paint/feature placement is a procedural estimate, not a measured balcony or renovation inventory.'}};
}
