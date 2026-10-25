import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { compilePanelHousing } from '../tools/kazan-panel-housing.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../tools/data/kazan-building-observations.json', import.meta.url))).panelHousingStyles;

describe('Citywide panel housing family', () => {
  test('requires material evidence, preserves source geometry and reviewed paint, and carries one finish across mapped sections', () => {
    const base = { osmType: 'way', kind: 'apartments', h: 30, minHeight: 0, levels: 10, holes: [], roofShape: 'flat', roofHeight: 0, material: '',
      ring: [0,0,90,0,90,13,0,13] };
    const painted = { ...base, id: 1, facadeConfidence: 'reviewed', facadeFamily: 'panel-light', appearance: { wallColour: '#d8e7c8', accentColour: '#58bba6', joints: 'none' } };
    const part = { ...base, id: 2, kind: 'yes', part: true, parent: 'way/1', h: 27, levels: 9, ring: [0,0,15,0,15,13,0,13] };
    const missingMaterial = { ...base, id: 3 };
    const brick = { ...base, id: 4, material: 'brick' };
    const lowRise = { ...base, id: 5, h: 15, levels: 5, roofShape: 'hipped' };
    const modern = { ...base, id: 6, roofShape: 'hipped' };
    const specialist = { ...base, id: 7, architectureFamily: 'stalinka' };
    const tower = { ...base, id: 8, ring: [300,0,322,0,322,24,300,24], levels: 16, h: 48 };
    const ordinary = { ...base, id: 9 };
    const domePart = { ...base, id: 10, kind: 'roof', part: true, parent: 'way/1' };
    const buildings = [painted, part, missingMaterial, brick, lowRise, modern, specialist, tower, ordinary, domePart];
    const original = structuredClone(buildings);
    const dates = { source: { extract: 'fixture' }, records: buildings.filter((b) => !b.part).map((b) => ({ reference: `way/${b.id}`, construction: [{ qualifier: 'mapped', from: b.id === 6 ? 2022 : 1994, to: b.id === 6 ? 2022 : 1994, text: b.id === 6 ? '2022' : '1994' }] })) };
    const materials = { source: { url: 'catalogue' }, bindings: buildings.filter((b) => ![2,3,10].includes(b.id)).map((b) => ({ reference: `way/${b.id}`, sourceIds: [`source-${b.id}`], materialCategory:'panel-bearing' })) };
    const result = compilePanelHousing([{ type: 'way', id: 6, tags: { 'roof:height': '0' } }], buildings, dates, materials, catalogue);
    assert.deepEqual(result.bindings.filter((r) => !r.parent).map((r) => r.reference), ['way/1','way/5','way/6','way/8','way/9']);
    assert.equal(lowRise.roofHeight, 2.1, 'pitched low panels share a restrained estimated roof within their mapped total height');
    assert.equal(modern.roofHeight, 0, 'an explicit mapped roof rise cannot be replaced by a procedural estimate');
    assert.equal(lowRise.architectureFamily, 'panel-housing', 'a source-confirmed low panel house is not excluded by a guessed floor threshold');
    assert.equal(modern.architectureFamily, 'panel-housing', 'source-confirmed recent panels are not excluded by a guessed year cutoff');
    assert.equal(tower.facadeFamily, 'panel-housing-tower');
    assert.equal(painted.facadeFamily, 'panel-housing-slab');
    assert.equal(painted.appearance.wallColour, '#d8e7c8');
    assert.equal(part.appearance.wallColour, painted.appearance.wallColour);
    assert.equal(part.appearance.accentColour, painted.appearance.accentColour, 'part identity cannot randomly recolour a single house');
    assert.equal(ordinary.appearance.joints, 'none', 'unknown renovation data uses a clean painted finish, not guessed exposed seams');
    assert.equal(ordinary.colourSource, 'post-2020-district-palette-estimate');
    assert.ok(result.bindings.find((r) => r.reference === 'way/9').finishEvidence.includes('estimate'));
    for (const [i,b] of buildings.entries()) {
      for (const key of ['ring','holes','h','minHeight','levels','roofShape','material','parent']) assert.deepEqual(b[key], original[i][key]);
      if ([3,4,7,10].includes(b.id)) assert.deepEqual(b, original[i], 'ineligible buildings and nonresidential parts remain intact');
    }
    const repeat = structuredClone(original);
    compilePanelHousing([{ type: 'way', id: 6, tags: { 'roof:height': '0' } }], repeat, dates, materials, catalogue);
    assert.deepEqual(repeat.map((b) => b.appearance), buildings.map((b) => b.appearance), 'visual estimates stay stable across rebuilds');
  });

  test('project evidence fills material-filter gaps without turning unknown or contradictory passports into panels',()=>{
    const buildings=Array.from({length:4},(_,i)=>({id:i+1,osmType:'way',kind:'apartments',h:30,minHeight:0,levels:10,holes:[],roofShape:'flat',roofHeight:0,material:'',ring:[0,0,90,0,90,13,0,13]}));
    const materials={source:{provider:'passports'},bindings:[
      {reference:'way/1',sourceIds:['passport-1'],series:['121'],materialCategory:null,materialCategories:[]},
      {reference:'way/2',sourceIds:['passport-2'],series:['121','125'],materialCategory:null,materialCategories:[]},
      {reference:'way/3',sourceIds:['passport-3'],series:[],materialCategory:null,materialCategories:[]},
      {reference:'way/4',sourceIds:['passport-4'],series:['121'],materialCategory:null,materialCategories:['panel-bearing','brick-bearing'],materialConflict:true}
    ]};
    const dates={source:{extract:'fixture'},records:[]},saved=structuredClone(buildings);
    const result=compilePanelHousing([],buildings,dates,materials,catalogue);
    assert.deepEqual(result.bindings.map(b=>b.reference),['way/1','way/2']);
    assert.equal(result.bindings[0].series,'121');
    assert.equal(result.bindings[1].series,null,'two panel-compatible projects establish the family, not an exact series');
    assert.deepEqual(result.bindings[1].seriesCandidates,['121','125']);
    assert.deepEqual(buildings.slice(2),saved.slice(2),'unknown or conflicting construction cannot be promoted by presence in a catalogue alone');
  });
});
