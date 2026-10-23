import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, boundsOf, terrainHeight, pointInPoly } from './kazan-config.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';

const stationSites=(GEO.power.stationStructures || []).filter(s=>s.model && s.ring).map(s=>{
  const poly=toPoints(s.ring);
  return {...boundsOf(poly),poly};
});
/** Standalone cooling structures reserve their mapped grounds and the caller's crown margin. */
export function powerStationAt(x,z,clearance=0) {
  for(const s of stationSites) {
    if(x<s.minX-clearance || x>s.maxX+clearance || z<s.minZ-clearance || z>s.maxZ+clearance)continue;
    if(pointInPoly(s.poly,x,z))return true;
    for(let i=0;i<s.poly.length;i++) {
      const a=s.poly[i],b=s.poly[(i+1)%s.poly.length],dx=b.x-a.x,dz=b.z-a.z;
      const u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1)));
      if(Math.hypot(x-a.x-dx*u,z-a.z-dz*u)<=clearance)return true;
    }
  }
  return false;
}

/** Existing mapped industrial bodies retain their own photographed materials and equipment. */
export function createKazanPowerStationModels(draw) {
  const {plainMaterial,solid,box,flush,shapeOf,splitExtrusion}=draw;
  const red=plainMaterial(0x91483c),white=plainMaterial(0xd6d7cf),metal=plainMaterial(0x65716e,0.5),inside=plainMaterial(0x303633);
  const parts=new Map();
  for(const b of GEO.buildings) if(b.parent) {if(!parts.has(b.parent))parts.set(b.parent,[]);parts.get(b.parent).push(b);}
  function chimney(group,b,base) {
    const poly=toPoints(b.ring),bounds=boundsOf(poly),x=(bounds.minX+bounds.maxX)/2,z=(bounds.minZ+bounds.maxZ)/2;
    const radius=Math.min(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/2,topRadius=radius*(b.taper || .54);
    const bands=(parts.get(`${b.osmType}/${b.id}`)||[]).filter(p=>p.minHeight<b.h).sort((a,b)=>a.minHeight-b.minHeight);
    if(!bands.length)for(let i=0;i<5;i++)bands.push({minHeight:b.h*i/5,colour:i%2?'white':'red'});
    function radiusAt(y) { const fraction=y/b.h; return radius+(topRadius-radius)*fraction; }
    for(let i=0;i<bands.length;i++) {
      const low=bands[i].minHeight,high=i+1<bands.length?bands[i+1].minHeight:b.h;
      const geometry=new THREE.CylinderGeometry(radiusAt(high),radiusAt(low),high-low,48,1,true);
      solid(group,geometry,bands[i].colour==='white'?white:red,x,base+(low+high)/2,z);
    }
    const cap=new THREE.RingGeometry(topRadius*.76,topRadius,48);cap.rotateX(-Math.PI/2);solid(group,cap,white,x,base+b.h,z);
    const lining=new THREE.CylinderGeometry(topRadius*.76,topRadius*.76,2.4,48,1,true);lining.scale(-1,1,1);solid(group,lining,inside,x,base+b.h-1.2,z);
    const mouth=new THREE.CircleGeometry(topRadius*.76,48);mouth.rotateX(-Math.PI/2);solid(group,mouth,inside,x,base+b.h-2.4,z);
    for(const y of b.h>100?[44,87,129]:[b.h*.5,b.h*.86]) {
      const r=radiusAt(y)+.45,deck=new THREE.RingGeometry(r-.55,r+.25,48);deck.rotateX(-Math.PI/2);solid(group,deck,metal,x,base+y,z);
      for(const dy of [.5,1]) {const rail=new THREE.TorusGeometry(r+.22,.045,4,48);rail.rotateX(-Math.PI/2);solid(group,rail,metal,x,base+y+dy,z);}
      for(let i=0;i<24;i++) {const a=i*Math.PI/12;box(group,x+Math.cos(a)*(r+.22),base+y+.5,z+Math.sin(a)*(r+.22),.045,1,.045,metal);}
    }
    for(let y=3;y<b.h-1;y+=.38) {
      const r=radiusAt(y)+.23;box(group,x,base+y,z+r,.7,.045,.06,metal);
    }
    for(const side of [-1,1]) {
      const points=[0,b.h].map(y=>new THREE.Vector3(x+side*.38,base+y,z+radiusAt(y)+.25));
      const ladder=new THREE.TubeGeometry(new THREE.LineCurve3(...points),1,.045,4,false);solid(group,ladder,metal,0,0,0);
    }
    if(b.latticeFrame) {
      const r=radius+1.5;
      for(let side=0;side<4;side++) {
        const a=side*Math.PI/2+Math.PI/4,c=a+Math.PI/2;
        const ax=x+Math.cos(a)*r,az=z+Math.sin(a)*r,bx=x+Math.cos(c)*r,bz=z+Math.sin(c)*r;
        beam(group,{x:ax,y:base,z:az},{x:ax,y:base+b.h*.9,z:az},.13,metal);
        for(let y=0;y<b.h*.9-1;y+=8) {
          const top=Math.min(b.h*.9,y+8);
          beam(group,{x:ax,y:base+y,z:az},{x:bx,y:base+top,z:bz},.07,metal);
          beam(group,{x:bx,y:base+y,z:bz},{x:ax,y:base+top,z:az},.07,metal);
        }
      }
    }
  }
  function beam(group,a,b,width,material) {
    const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),length=delta.length();
    const geometry=new THREE.BoxGeometry(width,length,width);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.multiplyScalar(1/length)));
    solid(group,geometry,material,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
  }
  function circle(x,z,radius) {
    const ring=[];
    for(let i=0;i<48;i++){const a=i*Math.PI/24;ring.push(x+Math.cos(a)*radius,z+Math.sin(a)*radius);}
    return ring;
  }
  function coolingTower(group,b,base,colliders) {
    const bounds=boundsOf(toPoints(b.ring)),radius=Math.min(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/2;
    const shell=plainMaterial(0xd8ddd6),water=plainMaterial(0x365350),x=b.x,z=b.z;
    function radiusAt(y) {
      const u=(y/b.h-.72)/.72;
      return radius*(.55+.45*u*u);
    }
    for(let i=0;i<24;i++) {
      const low=8+(b.h-8)*i/24,high=8+(b.h-8)*(i+1)/24;
      const profile=[low,(low+high)/2,high].map(y=>new THREE.Vector2(radiusAt(y),y));
      const fraction=(low+high)/2/b.h;
      const painted=[[.58,.66],[.76,.84],[.94,1]].some(([a,b])=>fraction>=a && fraction<=b),material=painted?red:shell;
      solid(group,new THREE.LatheGeometry(profile,48),material,x,base,z);
      const lining=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(p.x-.32,p.y)),48);lining.scale(-1,1,1);solid(group,lining,material,x,base,z);
    }
    const basin=new THREE.CircleGeometry(radius*.91,48);basin.rotateX(-Math.PI/2);solid(group,basin,water,x,base+.15,z);
    const surround=new THREE.RingGeometry(radius*.91,radius*1.04,48);surround.rotateX(-Math.PI/2);solid(group,surround,shell,x,base+.35,z);
    for(let y=8;y<=b.h;y=Math.min(b.h,y+8)) {
      const hoop=new THREE.TorusGeometry(radiusAt(y)+.2,.12,4,48);hoop.rotateX(-Math.PI/2);solid(group,hoop,white,x,base+y,z);
      if(y===b.h)break;
    }
    for(let i=0;i<24;i++) {
      const a=i*Math.PI/12,c=(i+1)*Math.PI/12;
      const foot={x:x+Math.cos(a)*radius,z:z+Math.sin(a)*radius},top={x:x+Math.cos(a)*radiusAt(8),z:z+Math.sin(a)*radiusAt(8)};
      beam(group,{...foot,y:terrainHeight(foot.x,foot.z)-.2},{...top,y:base+8},.55,white);
      colliders.push(draw.buildingCollider({ring:circle(foot.x,foot.z,.42),holes:[],h:8,minHeight:0},base));
      for(let y=8;y<b.h-1;y+=8) {
        const high=Math.min(b.h,y+8),r0=radiusAt(y)+.2,r1=radiusAt(high)+.2;
        beam(group,{x:x+Math.cos(a)*r0,y:base+y,z:z+Math.sin(a)*r0},{x:x+Math.cos(c)*r1,y:base+high,z:z+Math.sin(c)*r1},.15,white);
        beam(group,{x:x+Math.cos(c)*r0,y:base+y,z:z+Math.sin(c)*r0},{x:x+Math.cos(a)*r1,y:base+high,z:z+Math.sin(a)*r1},.15,white);
      }
    }
    for(let y=8;y<b.h;y+=8) {
      const high=Math.min(b.h,y+8),outer=Math.max(radiusAt(y),radiusAt(high)),inner=Math.min(radiusAt(y),radiusAt(high))-.35;
      colliders.push(draw.buildingCollider({ring:circle(x,z,outer),holes:[circle(x,z,inner)],minHeight:y,h:high},base));
    }
  }
  function panelHall(group,b,base) {
    const poly=toPoints(b.ring),wall=createObservedFacadeMaterial(b.appearance),roof=plainMaterial(0xb4beb9);
    const bottom=Math.min(...poly.map(p=>terrainHeight(p.x,p.z)))-.2;
    const body=new THREE.ExtrudeGeometry(shapeOf(b.ring,b.holes),{depth:base+b.h-bottom,bevelEnabled:false});
    body.rotateX(-Math.PI/2).translate(0,bottom,0);splitExtrusion(group,body,roof,wall,base);
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],c=poly[(i+1)%poly.length],length=Math.hypot(c.x-a.x,c.z-a.z);
      if(length<30)continue;
      const ux=(c.x-a.x)/length,uz=(c.z-a.z)/length,x=(a.x+c.x)/2,z=(a.z+c.z)/2,yaw=-Math.atan2(uz,ux);
      let nx=-uz,nz=ux;if(pointInPoly(poly,x+nx*.2,z+nz*.2)){nx=-nx;nz=-nz;}
      for(const u of [-length*.3,0,length*.3]) {
        const px=x+ux*u,pz=z+uz*u;
        box(group,px-nx*2,base+b.h+.5,pz-nz*2,2.2,1,1.8,roof,yaw);
        box(group,px+nx*.25,base+2,pz+nz*.25,3.8,4,.4,metal,yaw);
        box(group,px+nx*.5,base+4.2,pz+nz*.5,4.3,.2,1.3,white,yaw);
      }
      box(group,x+nx*.08,base+b.h-.25,z+nz*.08,length,.45,.2,white,yaw);
      box(group,x+nx*.08,base+b.h*.88,z+nz*.08,length,b.h*.20,.2,plainMaterial(b.appearance.accentColour),yaw);
    }
  }
  function emitBuilding(parent,b,base) {
    if(!['thermal-chimney','thermal-panel-hall'].includes(b.model))return false;
    const group=new THREE.Group();group.name=`KazanPowerStation/${b.id}`;group.userData.source=b.heightEvidence;
    if(b.model==='thermal-chimney')chimney(group,b,base);
    else panelHall(group,b,base);
    flush(group);parent.add(group);return true;
  }
  function buildGrounds() {
    const group=new THREE.Group(),colliders=[];group.name='KazanPowerStationGrounds';
    for(const source of GEO.power.stationStructures || []) {
      if(!source.model || source.building || !source.h)continue;
      const b={...source,ring:source.ring || circle(source.x,source.z,source.radiusEstimate)},root=new THREE.Group();
      root.name=`KazanPowerStationStructure/${b.osmType}/${b.id}`;root.userData.source=b.source;
      const base=Math.max(...toPoints(b.ring).map(p=>terrainHeight(p.x,p.z)));
      if(b.model==='thermal-cooling-tower')coolingTower(root,b,base,colliders);
      else if(b.model==='thermal-exhaust') {
        chimney(root,b,base);colliders.push(draw.buildingCollider({ring:b.ring,holes:[],h:b.h,minHeight:0},base));
      }
      flush(root);group.add(root);
    }
    return {group,colliders};
  }
  return {emitBuilding,buildGrounds};
}
