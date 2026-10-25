import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { compileBuildingDates } from '../tools/kazan-building-dates.mjs';
import { compileKhrushchevHousing } from '../tools/kazan-khrushchev-housing.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../tools/data/kazan-building-observations.json',import.meta.url))).khrushchevHousingStyles;
const helpers = { cityGeometry:{ type:'Polygon',coordinates:[[[-1000,-1000],[1000,-1000],[1000,1000],[-1000,1000],[-1000,-1000]]] },toWorld:(p)=>[p.lon,p.lat],source:{sha256:'fixture'} };
const body = (id, properties={}) => ({ id,osmType:'way',kind:'apartments',levels:5,h:15,minHeight:0,roofShape:'flat',roofHeight:0,material:'',holes:[],ring:[0,0,48,0,48,12,0,12],...properties });

describe('Compact first-generation housing archetype',()=>{
  test('combines era, use, plan and proportions without relabelling structural panels or guessing a series',()=>{
    const cases=[
      [{},{start_date:'1964'},true],
      [{architectureFamily:'panel-housing',appearance:{wallColour:'#dbe5d2',panelEndColour:'#9ac4aa',accentColour:'#74b19c'}},{start_date:'1974'},true],
      [{material:'brick',roofShape:'hipped'},{start_date:'1961','building:colour':'#ddccbb'},true],
      [{levels:3,h:9},{'building:series':'1-447-1'},true],
      [{levels:9,h:27},{start_date:'1967','building:series':'1-447C-47'},false],
      [{kind:'office'},{start_date:'1961'},false],
      [{kind:'dormitory'},{start_date:'1961'},false],
      [{architectureFamily:'stalinka'},{start_date:'1958'},false],
      [{facadeConfidence:'reviewed',appearance:{wallColour:'#112233'}},{start_date:'1961'},false],
      [{ring:[0,0,48,0,48,48,0,48]},{start_date:'1961'},false],
      [{holes:[[10,3,20,3,20,9,10,9]]},{start_date:'1961'},false],
      [{h:21},{start_date:'1961'},false],
      [{},{start_date:'1998'},false],
      [{},{start_date:'~1961'},false],
      [{},{start_date:'1961','building:year':'1980'},false],
      [{},{start_date:'1961','building:series':'121-014'},false],
      [{},{start_date:'1961',heritage:'yes'},false],
      [{},{start_date:'unknown'},false],
      [{},{},false],
      [{},{start_date:'1971'},true,['1605-АМ/5','II-07']],
      [{},{start_date:'1962'},true,['121']],
      [{},{start_date:'1980'},false,['121']]
    ];
    const buildings=cases.map(([props],i)=>body(i+1,props)),saved=structuredClone(buildings);
    const elements=cases.map(([,tags],i)=>({type:'way',id:i+1,tags:{building:buildings[i].kind,...tags}}));
    const materials={bindings:cases.flatMap((row,i)=>row[3]?[{reference:`way/${i+1}`,sourceIds:[`passport-${i+1}`],series:row[3]}]:[])};
    const dates=compileBuildingDates(elements,buildings,helpers),result=compileKhrushchevHousing(elements,buildings,dates,catalogue,materials);
    for(const [i,[,,accepted]] of cases.entries()){
      assert.equal(result.bindings.some(b=>b.reference===`way/${i+1}`),accepted,`archetype admission ${i+1}`);
      if(!accepted)assert.deepEqual(buildings[i],saved[i],'ambiguous or differently owned bodies remain intact');
      for(const key of ['h','levels','minHeight','ring','holes','material'])assert.deepEqual(buildings[i][key],saved[i][key],'the visual family cannot rewrite source geometry or construction');
    }
    assert.equal(buildings[1].architectureFamily,'panel-housing');
    assert.equal(buildings[1].housingArchetype,'khrushchev');
    assert.equal(buildings[1].appearance.wallColour,'#dbe5d2');
    assert.equal(buildings[1].appearance.balconyZones,false,'compact balconies cannot inherit continuous glazed loggia strips');
    assert.equal(buildings[2].appearance.masonry,'brick');
    assert.equal(buildings[2].appearance.wallColour,'#ddccbb');
    assert.equal(result.bindings[0].series,null,'morphology must not manufacture a precise construction series');
    assert.ok(result.bindings[0].confidence.includes('estimate'));
    assert.equal(result.bindings[3].series,'1-447-1');
    assert.deepEqual(result.bindings.find(b=>b.reference==='way/20').seriesCandidates,['1605-АМ/5','II-07'],'two reported early projects share an archetype without asserting one exact series');
    assert.deepEqual(result.bindings.find(b=>b.reference==='way/21').rejectedProjectEvidence,['121'],'an impossible later passport project remains explicit instead of imposing high-rise loggias on an early compact house');
  });
});
