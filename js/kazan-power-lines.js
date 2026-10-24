import * as THREE from 'three/webgpu';
import { GEO, runtime } from './kazan-runtime.js';
import { groundSurfaceHeight, surfaceHeight } from './kazan-config.js';
import { nearestRailway } from './kazan-railways.js';
import { nearestTram } from './kazan-trams.js';

/** Shared attachments and span curves keep every incident wire fixed to the same mapped support. */
function createPowerNetwork(data) {
  const supports=data.supports.map((s)=>{
    const voltage=Math.max(0,...s.voltage),pole=s.kind==='pole',portal=s.kind==='portal';
    const estimate=pole?10.5:portal?14:voltage>=400000?48:voltage>=200000?36:voltage>=100000?28:voltage>=35000?20:26;
    return {...s,base:groundSurfaceHeight(s.x,s.z),height:s.height || estimate,estimatedHeight:!s.height,
      width:pole?1.5:portal?6:voltage>=400000?11:voltage>=200000?7:5,angle:0,correction:0};
  });
  const nodes=data.graph.nodes.map((n)=>({ ...n,base:groundSurfaceHeight(n.x,n.z),height:0,correction:0,incident:[] }));
  const spans=data.graph.links.filter((l)=>!data.lines[l.line].underground).map((s)=>({...s,sag:Math.min(18,Math.max(0.12,s.length*0.022))}));
  const layouts=data.lines.map((line)=>{
    const voltage=Math.max(0,...line.voltage),pole=line.kind==='minor_line',count=line.cables || (line.circuits || 1)*(voltage && voltage<1000?4:3);
    const width=pole?1.3:voltage>=400000?10:voltage>=200000?6.5:4.5;
    const levels=pole?1:count<=3?1:Math.ceil(count/2),gap=pole?0:voltage>=200000?4.7:3.7;
    const phases=Array.from({length:count},(_,i)=>({lateral:pole?(i-(count-1)/2)*0.8:count<=3?(i-(count-1)/2)*width:(i<levels?-1:1)*width,
      below:pole?0.7:count<=3?(i===1?2.2:6.5):2.5+(i%levels)*gap}));
    const bundles={single:1,double:2,triple:3,quad:4},bundle=bundles[line.wires] || Math.max(1,parseInt(line.wires,10) || 1);
    return {phases,bundle,clearance:pole?6:voltage>=200000?11:9,estimated:!line.cables || !line.wires};
  });
  for (const span of spans) for (const id of [span.a,span.b]) nodes[id].incident.push(span);
  for (const n of nodes) {
    const s=n.support===undefined?null:supports[n.support];
    n.height=s?.height || Math.max(12,...n.incident.map((l)=>Math.max(0,...data.lines[l.line].voltage)>=200000?36:28));
    if (!s || !n.incident.length) continue;
    let x=0,z=0;
    for (const l of n.incident) {
      const a=nodes[l.a],b=nodes[l.b],angle=Math.atan2(b.z-a.z,b.x-a.x);x+=Math.cos(angle*2)*l.length;z+=Math.sin(angle*2)*l.length;
    }
    s.angle=Math.atan2(z,x)/2;
  }
  const frames=data.lines.map((line)=>{
    const result=new Map();
    for (let i=0;i<line.nodes.length;i++) {
      const a=nodes[line.nodes[Math.max(0,i-1)]],b=nodes[line.nodes[Math.min(line.nodes.length-1,i+1)]],length=Math.hypot(b.x-a.x,b.z-a.z) || 1;
      result.set(line.nodes[i],{nx:-(b.z-a.z)/length,nz:(b.x-a.x)/length});
    }
    return result;
  });
  function attachment(node,line,phase) {
    const n=nodes[node],f=frames[line].get(node),p=layouts[line].phases[phase];
    return {x:n.x+f.nx*p.lateral,y:n.base+n.height-p.below,z:n.z+f.nz*p.lateral};
  }
  function conductorPoint(span,phase,t,bundle=0) {
    const a=attachment(span.a,span.line,phase),b=attachment(span.b,span.line,phase),count=layouts[span.line].bundle;
    const angle=bundle*Math.PI*2/count,offset=count>1?0.18:0,fa=frames[span.line].get(span.a),fb=frames[span.line].get(span.b);
    const nx=fa.nx*(1-t)+fb.nx*t,nz=fa.nz*(1-t)+fb.nz*t,length=Math.hypot(nx,nz) || 1;
    return {x:a.x+(b.x-a.x)*t+nx/length*Math.cos(angle)*offset,y:a.y+(b.y-a.y)*t-4*span.sag*t*(1-t)+Math.sin(angle)*offset,
      z:a.z+(b.z-a.z)*t+nz/length*Math.cos(angle)*offset};
  }
  function obstacleHeight(x,z) {
    let y=surfaceHeight(x,z);
    const rail=nearestRailway(x,z);
    if (rail && !rail.track.tunnel && rail.distance<(rail.track.tracks-1)*2.5+3) y=Math.max(y,rail.y+(rail.track.electrified==='no'?1:6.5));
    const tram=nearestTram(x,z);
    if (tram && !tram.track.tunnel && tram.distance<3) y=Math.max(y,tram.y+6.5);
    return y;
  }
  for (const span of spans) {
    let deficit=0;
    const count=Math.max(2,Math.ceil(span.length/10)),layout=layouts[span.line];
    for (let phase=0;phase<layout.phases.length;phase++) for (let i=0;i<=count;i++) {
      const p=conductorPoint(span,phase,i/count);deficit=Math.max(deficit,obstacleHeight(p.x,p.z)+layout.clearance-p.y+0.18);
    }
    if (deficit<=0) continue;
    for (const id of [span.a,span.b]) {
      const n=nodes[id],s=n.support===undefined?null:supports[n.support];
      if (s && !s.estimatedHeight) continue;
      n.height+=deficit;n.correction+=deficit;
      if (s) {s.height=n.height;s.correction=n.correction;}
    }
  }
  return {data,supports,nodes,spans,layouts,attachment,conductorPoint,obstacleHeight};
}
export const POWER_NETWORK=createPowerNetwork(GEO.power);
const corridorCells=new Map(),corridorSize=256;
for(const span of POWER_NETWORK.spans) {
  const a=POWER_NETWORK.nodes[span.a],b=POWER_NETWORK.nodes[span.b],width=Math.max(...POWER_NETWORK.layouts[span.line].phases.map(p=>Math.abs(p.lateral)))+4;
  for(let x=Math.floor((Math.min(a.x,b.x)-width-60)/corridorSize);x<=Math.floor((Math.max(a.x,b.x)+width+60)/corridorSize);x++) {
    for(let z=Math.floor((Math.min(a.z,b.z)-width-60)/corridorSize);z<=Math.floor((Math.max(a.z,b.z)+width+60)/corridorSize);z++) {
      const key=`${x}/${z}`;if(!corridorCells.has(key))corridorCells.set(key,[]);corridorCells.get(key).push({a,b,width});
    }
  }
}
/** Clear only overhead corridors; buried cables do not cut the forest canopy. */
export function powerAt(x,z,clearance=0) {
  for(const {a,b,width} of corridorCells.get(`${Math.floor(x/corridorSize)}/${Math.floor(z/corridorSize)}`) || []) {
    const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1)));
    if(Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<width+clearance)return true;
  }
  return false;
}

/** Regional instanced steel/concrete members and thin conductor strips share the topology's attachment positions. */
export function createKazanPowerLines(draw) {
  const network=POWER_NETWORK,group=new THREE.Group(),cells=new Map(),colliders=[],size=1024;
  group.name='KazanPowerLines';
  const steel=draw.plainMaterial(0x747e7d,0.55),concrete=draw.plainMaterial(0xaaa99d),wood=draw.plainMaterial(0x725d43),ceramic=draw.plainMaterial(0x706b55,0.15);
  const wireMaterial=new THREE.LineBasicNodeMaterial({color:0x343d3e}),cube=new THREE.BoxGeometry(1,1,1);
  const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),delta=new THREE.Vector3(),position=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  function cell(x,z) {
    const ix=Math.floor(x/size),iz=Math.floor(z/size),key=`${ix}/${iz}`;
    if (!cells.has(key)) {const g=new THREE.Group();g.name=`PowerCell/${key}`;group.add(g);cells.set(key,{group:g,x:(ix+.5)*size,z:(iz+.5)*size,batches:new Map(),wires:[]});}
    return cells.get(key);
  }
  function beam(target,a,b,width,material,depth=width) {
    delta.set(b.x-a.x,b.y-a.y,b.z-a.z);const length=delta.length();if(length<0.001)return;
    rotation.setFromUnitVectors(up,delta.multiplyScalar(1/length));position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);scale.set(width,length,depth);matrix.compose(position,rotation,scale);
    if(!target.batches.has(material))target.batches.set(material,[]);target.batches.get(material).push(...matrix.elements);
  }
  function local(s,u,y,v=0) {
    return {x:s.x-Math.sin(s.angle)*u+Math.cos(s.angle)*v,y:s.base+y,z:s.z+Math.cos(s.angle)*u+Math.sin(s.angle)*v};
  }
  for (const s of network.supports) {
    const target=cell(s.x,s.z),pole=s.kind==='pole' || s.structure==='solid' || s.material==='concrete' || s.material==='wood';
    if (s.kind==='portal' || s.design==='h-frame') {
      for(const side of [-1,1])beam(target,local(s,side*s.width/2,0),local(s,side*s.width/2,s.height),0.35,steel);
      beam(target,local(s,-s.width/2,s.height),local(s,s.width/2,s.height),0.3,steel);
    } else if (pole) {
      beam(target,local(s,0,0),local(s,0,s.height),s.kind==='pole'?0.28:0.55,s.material==='wood'?wood:s.material==='metal'||s.material==='steel'?steel:concrete);
      beam(target,local(s,-s.width,s.height-.6),local(s,s.width,s.height-.6),0.14,steel);
    } else {
      const tiers=6,body=s.height-3,foot=s.width*.55;
      for(let i=0;i<tiers;i++) {
        const y0=body*i/tiers,y1=body*(i+1)/tiers,r0=foot*(1-i/tiers*.82),r1=foot*(1-(i+1)/tiers*.82);
        for(let side=0;side<4;side++) {
          const a=side*Math.PI/2+Math.PI/4,b=a+Math.PI/2;
          const p=local(s,Math.cos(a)*r0,y0,Math.sin(a)*r0),q=local(s,Math.cos(a)*r1,y1,Math.sin(a)*r1);
          beam(target,p,q,0.15,steel);beam(target,p,local(s,Math.cos(b)*r1,y1,Math.sin(b)*r1),0.075,steel);
          beam(target,local(s,Math.cos(b)*r0,y0,Math.sin(b)*r0),q,0.075,steel);
          beam(target,q,local(s,Math.cos(b)*r1,y1,Math.sin(b)*r1),0.08,steel);
          if(i===0){const base=local(s,Math.cos(a)*r0,.25,Math.sin(a)*r0);beam(target,{...base,y:base.y-.6},{...base,y:base.y+.6},0.75,concrete);}
        }
      }
      beam(target,local(s,0,body),local(s,0,s.height),0.18,steel);
    }
    const poly=[s.x-.4,s.z-.4,s.x+.4,s.z-.4,s.x+.4,s.z+.4,s.x-.4,s.z+.4];
    colliders.push(draw.buildingCollider({ring:poly,holes:[],h:s.height,minHeight:0},s.base));
  }
  const attached=new Set();
  for (const span of network.spans) {
    const layout=network.layouts[span.line],count=Math.max(4,Math.ceil(span.length/12));
    for(const id of [span.a,span.b]) {
      const n=network.nodes[id];if(n.support===undefined)continue;
      for(let phase=0;phase<layout.phases.length;phase++) {
        const p=network.attachment(id,span.line,phase),key=`${id}/${p.x.toFixed(2)}/${p.y.toFixed(2)}/${p.z.toFixed(2)}`;
        if(attached.has(key))continue;attached.add(key);const target=cell(n.x,n.z),arm={x:p.x,y:p.y+1.2,z:p.z};
        beam(target,{x:n.x,y:arm.y,z:n.z},arm,0.16,steel);beam(target,{x:n.x,y:arm.y+1.5,z:n.z},arm,0.075,steel);
        beam(target,p,arm,0.11,ceramic);
        for(let j=0;j<5;j++){const y=p.y+.1+j*.2;beam(target,{x:p.x,y:y-.035,z:p.z},{x:p.x,y:y+.035,z:p.z},.24,ceramic);}
      }
    }
    for(let phase=0;phase<layout.phases.length;phase++) for(let bundle=0;bundle<layout.bundle;bundle++) {
      let previous=network.conductorPoint(span,phase,0,bundle);
      for(let i=1;i<=count;i++) {
        const p=network.conductorPoint(span,phase,i/count,bundle),target=cell((p.x+previous.x)/2,(p.z+previous.z)/2);
        target.wires.push(previous.x,previous.y,previous.z,p.x,p.y,p.z);previous=p;
      }
    }
  }
  for(const target of cells.values()) {
    for(const [material,values] of target.batches) {
      const mesh=new THREE.InstancedMesh(cube,material,0);mesh.name='PowerSupportMembers';
      mesh.instanceMatrix=new THREE.StorageInstancedBufferAttribute(new Float32Array(values),16);mesh.count=values.length/16;
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();target.group.add(mesh);
    }
    if(target.wires.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(target.wires,3));geometry.computeBoundingSphere();const wires=new THREE.LineSegments(geometry,wireMaterial);wires.name='PowerConductors';target.group.add(wires);}
    target.batches.clear();target.wires=[];
  }
  function update(x,z) {for(const target of cells.values())target.group.visible=Math.hypot(target.x-x,target.z-z)<(runtime.lite?5000:7500);}
  return {group,colliders,update};
}
