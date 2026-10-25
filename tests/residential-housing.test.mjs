import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { compileBuildingDates } from '../tools/kazan-building-dates.mjs';
import { compileResidentialHousing } from '../tools/kazan-residential.mjs';

const observations = JSON.parse(readFileSync(new URL('../tools/data/kazan-building-observations.json',import.meta.url)));

describe('Unified residential classification',()=>{
  test('architectural type wins independently of wall construction, period rules differ and reviewed paint/source envelopes survive',()=>{
    const compound=[0,0,60,0,60,12,54,12,54,14,48,14,48,12,42,12,42,14,36,14,36,12,30,12,30,14,24,14,24,12,18,12,18,14,12,14,12,12,0,12];
    const cases=[
      [{h:18,levels:5},'1952',null,'stalinka'],
      [{},'1994','Панельные','panel'],
      [{h:15,levels:5,roofShape:'hipped'},'1971','Панельные','khrushchev'],
      [{},'2002','кирпичный','brick'],
      [{},'2015','кирпичный','brick'],
      [{},'2023','кирпичный','brick'],
      [{facadeConfidence:'reviewed',appearance:{wallColour:'#ece4d8',accentColour:'#aa4433',zoneWidth:0.42}},'2002','кирпичный','brick'],
      [{},null,null,'unknown'],
      [{kind:'mosque'},'2002','кирпичный',null],
      [{},'1895','кирпичный','brick'],
      [{h:18,levels:5},null,'кирпичный','stalinka','1952'],
      [{ring:compound},'2002','кирпичный','brick'],
      [{ring:compound,material:'brick'},'2002','кирпичный','brick'],
      [{ring:[...Array.from({length:20},(_,i)=>[i*3,0]).flat(),60,0,60,13,0,13]},'2002','кирпичный','brick']
    ];
    const buildings=cases.map(([properties],i)=>({id:i+1,osmType:'way',kind:'apartments',h:30,levels:10,minHeight:0,material:'',roofShape:'flat',roofHeight:0,ring:[0,0,70,0,70,13,0,13],holes:[],...properties}));
    buildings.push({...structuredClone(buildings[3]),id:100,part:true,parent:'way/4',h:12,levels:4});
    const saved=structuredClone(buildings),elements=cases.map(([,year],i)=>({type:'way',id:i+1,tags:{building:buildings[i].kind,'addr:street':'Тестовая улица','addr:housenumber':String(i+1),...(year?{start_date:year}:{})}}));
    const helpers={cityGeometry:{type:'Polygon',coordinates:[[[-1000,-1000],[1000,-1000],[1000,1000],[-1000,1000],[-1000,-1000]]]},toWorld:(p)=>[p.lon,p.lat],source:{sha256:'fixture'}};
    const passports={source:{provider:'passport-source'},records:cases.flatMap(([,year,wall,,passportYear],i)=>wall?[{sourceId:`house_${i+1}`,address:`респ. Татарстан, г. Казань, ул. Тестовая, д. ${i+1}`,bearingWalls:[wall],series:[],constructionYears:passportYear || year?[passportYear || year]:[],commissioningYears:[]}]:[])};
    passports.records.find(r=>r.sourceId==='house_3').constructionYears=['1972'];
    passports.records.find(r=>r.sourceId==='house_4').constructionYears=['2003'];
    const dates=compileBuildingDates(elements,buildings,helpers);
    const result=compileResidentialHousing(elements,buildings,{...helpers,dates,source:{source:{provider:'material-catalogue'},records:[]},passports,observations,roads:[]});
    for(const [i,[,,,type]] of cases.entries())assert.equal(result.residential.bindings.find(b=>b.reference===`way/${i+1}`)?.type ?? null,type,`house type ${i+1}`);
    const early=result.residential.bindings.find(b=>b.reference==='way/3');
    assert.equal(early.structure,'panel-bearing');
    assert.equal(result.khrushchev.bindings.find(b=>b.reference==='way/3').conflictingDates,true,'different source years inside the same architectural period stay explicit without forcing a high-rise facade');
    assert.equal(buildings[2].appearance.balconyZones,false,'early panel architecture cannot retain continuous high-rise loggias');
    assert.equal(buildings[2].appearance.smallBalconies,true);
    assert.equal(new Set(buildings.slice(3,6).map(b=>b.facadeFamily)).size,3,'2000s, 2010s and 2020s share rendering primitives but select distinct period rules');
    assert.equal(buildings[3].facadeFamily,'brick-2000s-white-red','different exact source years inside one decade must not discard its supported period rule');
    assert.equal(buildings[11].facadeFamily,'brick-2000s-composed-bays','compound unmapped envelopes can select a modern broad-glazing estimate without changing their bearing structure');
    assert.equal(buildings[12].facadeFamily,'brick-2000s-white-red','a plan estimate cannot override mapped exposed brick');
    assert.equal(buildings[13].facadeFamily,'brick-2000s-white-red','extra collinear source nodes do not establish a different architecture');
    assert.equal(result.bricks.bindings.find(b=>b.reference==='way/4').year,null,'a compatible decade does not resolve the conflicting exact construction year');
    assert.deepEqual(buildings[6].appearance,saved[6].appearance,'reviewed white/red zones survive the unified migration');
    assert.deepEqual(buildings[9].appearance,saved[9].appearance,'a historic brick body stays available for its queued architectural family');
    assert.equal(buildings.at(-1).appearance.wallColour,buildings[3].appearance.wallColour,'one compound cannot acquire unrelated part paint');
    assert.equal(buildings.at(-1).housingType,'brick');
    for(const [i,b] of buildings.entries())for(const key of ['ring','holes','h','levels','minHeight','roofShape','parent','material'])assert.deepEqual(b[key],saved[i][key],`${key} at house ${i+1}`);
    assert.equal(new Set(result.residential.bindings.map(b=>b.reference)).size,result.residential.bindings.length,'one source identity has exactly one final residential type');
  });
});
