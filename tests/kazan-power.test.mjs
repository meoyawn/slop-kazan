import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { runCityModule } from './helpers/module.js';
import { compilePower } from '../tools/kazan-power.mjs';

const geometry = {
  toWorld: ({lon,lat}) => [lon,lat],
  clipRoad: (pts,nodes) => [{pts,nodes}],
  closedRing: (pts) => pts?.map(({lon,lat})=>[lon,lat]) || [],
  joinMembers: () => []
};

const way = (id,nodes,points,tags) => ({type:'way',id,nodes,geometry:points.map(([lon,lat])=>({lon,lat})),tags});

describe('Regional power network', () => {
  test('branches share their mapped pylon, while geometric crossings and buried cables keep independent identities', () => {
    const data=compilePower([
      {type:'node',id:2,lon:10,lat:0,tags:{power:'tower',height:'31',material:'metal'}},
      way(10,[1,2,3],[[0,0],[10,0],[20,0]],{power:'line',voltage:'110000',circuits:'2',cables:'6',wires:'double'}),
      way(11,[2,4],[[10,0],[10,10]],{power:'line',voltage:'35000',circuits:'1',cables:'3'}),
      way(12,[5,6],[[10,-10],[10,10]],{power:'minor_line',voltage:'10000'}),
      way(13,[4,7],[[10,10],[20,10]],{power:'cable',voltage:'35000',location:'underground'})
    ],geometry);
    const shared=data.graph.nodes.findIndex(n=>n.id===2),support=data.supports.find(s=>s.id===2);
    assert.equal(data.graph.links.filter(l=>l.a===shared || l.b===shared).length,3,'three physical spans meet at the actual shared support');
    assert.equal(data.supports.filter(s=>s.id===2).length,1,'the branching tower is emitted once');
    assert.deepEqual(support.voltage,[35000,110000]);
    assert.equal(support.height,31);
    assert.equal(data.graph.nodes.some(n=>n.x===10 && n.z===0 && n.id!==2),false,'crossing wires do not manufacture an electrical junction');
    assert.equal(data.lines.find(l=>l.id===13).underground,true,'buried topology is separate from overhead rendering');
    assert.equal(data.lines[0].cables,6);
    assert.equal(data.lines[0].wires,'double','bundle size stays distinct from circuit and phase counts');
  });

  test('explicitly removed, proposed and disused source features cannot become overhead lines, supports or yards', () => {
    const data=compilePower([
      way(20,[1,2],[[0,0],[10,0]],{power:'line',note:'снесли'}),
      way(21,[1,2],[[0,0],[10,0]],{'proposed:power':'line'}),
      {type:'node',id:2,lon:10,lat:0,tags:{power:'tower','disused:power':'tower'}},
      way(22,[1,2,3,1],[[0,0],[10,0],[10,10],[0,0]],{power:'substation',demolished:'yes'})
    ],geometry);
    assert.equal(data.lines.length,0);
    assert.equal(data.supports.length,0);
    assert.equal(data.substations.length,0);
    assert.equal(data.inactive.length,4,'source evidence remains available for accuracy follow-ups');
  });

  test('the compiled city includes continuous overhead corridors at both user-requested inspection areas', () => {
    const geo=JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz',import.meta.url))));
    assert.ok(geo.power?.lines.length,'the regional power network must reach the runtime geography');
    for (const bounds of [[49.15,55.80,49.18,55.82],[49.18,55.82,49.21,55.84]]) {
      const west=(bounds[0]-geo.frame.origin.lon)*geo.frame.kx,east=(bounds[2]-geo.frame.origin.lon)*geo.frame.kx;
      const north=(geo.frame.origin.lat-bounds[3])*geo.frame.kz,south=(geo.frame.origin.lat-bounds[1])*geo.frame.kz;
      const spans=geo.power.graph.links.filter(l=>{
        if(geo.power.lines[l.line].underground)return false;
        const a=geo.power.graph.nodes[l.a],b=geo.power.graph.nodes[l.b];
        return Math.max(a.x,b.x)>=west && Math.min(a.x,b.x)<=east && Math.max(a.z,b.z)>=north && Math.min(a.z,b.z)<=south;
      });
      assert.ok(spans.length>2,'a real multi-span corridor crosses the requested district');
      assert.ok(spans.some(l=>geo.power.graph.nodes[l.a].support!==undefined && geo.power.graph.nodes[l.b].support!==undefined),'mapped supports anchor the corridor');
    }
  });

  test('rendered span profiles join every bundle at shared pylons and clear the city surface', () => {
    const geo=JSON.parse(gunzipSync(readFileSync(new URL('../js/kazan-geodata.json.gz',import.meta.url))));
    geo.power.lines.find(l=>!l.underground && l.nodes.length>3).wires='double';
    const context=vm.createContext({window:{NYC:{GEO:geo}}});
    for(const name of ['kazan-config','kazan-railways','kazan-trams','kazan-power-lines']) {
      context.NYC=context.window.NYC;
      vm.runInContext(readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8'),context);
    }
    const city=context.NYC,network=city.POWER_NETWORK,ends=new Map();
    assert.ok(network.spans.length);
    for(const span of network.spans) {
      assert.equal(geo.power.lines[span.line].underground,false,'cables do not acquire overhead conductor geometry');
      for(let phase=0;phase<network.layouts[span.line].phases.length;phase++) {
        for(let bundle=0;bundle<network.layouts[span.line].bundle;bundle++) for(const [id,t] of [[span.a,0],[span.b,1]]) {
          const p=network.conductorPoint(span,phase,t,bundle),key=`${span.line}/${id}/${phase}/${bundle}`,previous=ends.get(key);
          if(previous)assert.ok(Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)<0.000001,'each bundled wire terminates at the same point on a shared support');
          ends.set(key,p);
        }
        for(let j=0;j<=20;j++) {
          const p=network.conductorPoint(span,phase,j/20);
          assert.ok(Number.isFinite(p.x+p.y+p.z));
          assert.ok(p.y-city.surfaceHeight(p.x,p.z)>=6,'conductors stay above terrain and rendered road decks, including between support nodes');
          for(const nearest of [city.nearestRailway(p.x,p.z),city.nearestTram(p.x,p.z)]) {
            if(nearest && !nearest.track.tunnel && nearest.distance<3)assert.ok(p.y-nearest.y>=6,'overhead conductors clear mapped above-ground tracks');
          }
        }
      }
    }
  });

});
