import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { polygonContains } from '../js/footprints.js';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(name)=>JSON.parse(gunzipSync(fs.readFileSync(root+name)));
const g=read('js/kazan-geodata.json.gz'),base=read('tools/data/kazan-osm.json.gz'),extra=read('tools/data/kazan-worship.json.gz');
if(base.extract.sha256!==extra.source.sha256 || g.worship.source.sha256!==extra.source.sha256)throw new Error('Worship audit sources differ');
const raw=new Map([...base.elements,...extra.elements].map(e=>[`${e.type}/${e.id}`,e]));
const geometry=JSON.parse(fs.readFileSync(root+'tools/data/kazan-city-boundary.geojson')).geometry;
const phi=55.79*Math.PI/180,e2=6.69437999014e-3,d=1-e2*Math.sin(phi)**2;
const kx=Math.PI/180*6378137/Math.sqrt(d)*Math.cos(phi),kz=Math.PI/180*6378137*(1-e2)/d**1.5;
const city=(geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates).map(p=>p.map(r=>r.map(([lon,lat])=>({x:(lon-49.108)*kx,z:(55.79-lat)*kz}))));
const inCity=(x,z)=>city.some(p=>polygonContains(p[0],x,z)&&!p.slice(1).some(r=>polygonContains(r,x,z)));
const buildings=new Map(g.buildings.filter(b=>!b.part).map(b=>[`${b.osmType}/${b.id}`,b])),places=[];
for(const v of g.worship.bindings){
  if(v.parent || v.role!=='principal')continue;
  const b=buildings.get(v.reference);if(!b || !inCity(b.ring[0],b.ring[1]))continue;
  const t=raw.get(v.reference)?.tags || {};
  places.push({reference:v.reference,faith:v.faith,kind:b.kind==='chapel'||/часовн|chapel/i.test(v.name||b.localName||b.name)?'chapel':'worship-building',
    name:v.name||b.localName||b.name,model:b.model||null,parts:g.worship.bindings.filter(p=>p.parent===v.reference).length,
    denomination:v.denomination,identityPoints:v.identityPoints,identity:t.wikidata||t.wikipedia||t['ref:temples.ru']||t['ref:sobory.ru']});
}
const duplicates=[];
for(const p of places){
  if(!p.identity)continue;
  const match=places.find(q=>q!==p&&q.reference<p.reference&&q.identity===p.identity);
  if(match)duplicates.push({reference:p.reference,aliasOf:match.reference,identity:p.identity});
}
const aliases=new Set(duplicates.map(d=>d.reference)),unique=places.filter(p=>!aliases.has(p.reference));
const points=g.worship.points.filter(p=>inCity(p.x,p.z)),worshipPoints=points.filter(p=>p.kind==='place-of-worship');
const propertyIds=new Set(g.worship.sites.filter(s=>s.kind==='monastery'&&inCity(s.ring[0],s.ring[1])).map(s=>s.reference));
const report={
  note:'Mapped source buildings and deduplicated contained POIs inside the municipal boundary, not a congregation census or official coverage percentage. Point-only records, shared prayer rooms, conflicting identity and unknown denominations remain separate; no point manufactures a footprint. Exact source-identity aliases are reported below.',
  source:extra.source,
  officialBaseline:{source:'https://data.kzn.ru/dataset/230',year:2025,updated:'2026-04-15',mosques:81,orthodoxChurches:51,oldBelieverObjects:6},
  sourceWorshipPoints:[...raw.values()].filter(e=>e.type==='node'&&e.tags?.amenity==='place_of_worship').length,
  municipalWorshipPoints:worshipPoints.length,
  mosqueBuildings:unique.filter(p=>p.faith==='mosque').length,
  orthodoxChurches:unique.filter(p=>p.faith==='orthodox'&&p.kind!=='chapel'&&p.denomination!=='old_believers').length,
  oldBelieverBuildings:unique.filter(p=>p.denomination==='old_believers').length,
  orthodoxChapels:unique.filter(p=>p.faith==='orthodox'&&p.kind==='chapel').length,
  mappedMonasteryProperties:propertyIds.size,
  duplicates,
  matchedWorshipPoints:worshipPoints.filter(p=>p.status==='matched-worship-building').length,
  mappedTowerPoints:points.filter(p=>p.status==='mapped-tower-point'),
  sharedPrayerRooms:worshipPoints.filter(p=>p.status==='shared-envelope'),
  pointOnly:worshipPoints.filter(p=>p.status==='point-only'),
  conflictingPoints:worshipPoints.filter(p=>p.status==='conflicting-source-identity'),
  unresolvedPoints:worshipPoints.filter(p=>!['matched-worship-building','shared-envelope','point-only','conflicting-source-identity'].includes(p.status)),
  places:unique
};
fs.writeFileSync(root+'tools/data/kazan-worship-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,places:report.places.length,mappedTowerPoints:report.mappedTowerPoints.length,
  sharedPrayerRooms:report.sharedPrayerRooms.length,pointOnly:report.pointOnly.length,conflictingPoints:report.conflictingPoints.length,unresolvedPoints:report.unresolvedPoints.length},null,2));
