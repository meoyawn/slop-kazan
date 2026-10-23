import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, boundsOf } from './kazan-config.js';

/** Existing mapped industrial bodies retain their own photographed materials and equipment. */
export function createKazanPowerStationModels(draw) {
  const {plainMaterial,solid,box,flush}=draw;
  const red=plainMaterial(0x91483c),white=plainMaterial(0xd6d7cf),metal=plainMaterial(0x65716e,0.5),inside=plainMaterial(0x303633);
  const parts=new Map();
  for(const b of GEO.buildings) if(b.parent) {if(!parts.has(b.parent))parts.set(b.parent,[]);parts.get(b.parent).push(b);}
  function chimney(group,b,base) {
    const poly=toPoints(b.ring),bounds=boundsOf(poly),x=(bounds.minX+bounds.maxX)/2,z=(bounds.minZ+bounds.maxZ)/2;
    const radius=Math.min(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/2,topRadius=radius*.54;
    const bands=(parts.get(`${b.osmType}/${b.id}`)||[]).filter(p=>p.minHeight<b.h).sort((a,b)=>a.minHeight-b.minHeight);
    if(!bands.length)bands.push({minHeight:0,colour:'red'});
    function radiusAt(y) { const fraction=y/b.h; return radius+(topRadius-radius)*fraction; }
    for(let i=0;i<bands.length;i++) {
      const low=bands[i].minHeight,high=i+1<bands.length?bands[i+1].minHeight:b.h;
      const geometry=new THREE.CylinderGeometry(radiusAt(high),radiusAt(low),high-low,48,1,true);
      solid(group,geometry,bands[i].colour==='white'?white:red,x,base+(low+high)/2,z);
    }
    const cap=new THREE.RingGeometry(topRadius*.76,topRadius,48);cap.rotateX(-Math.PI/2);solid(group,cap,white,x,base+b.h,z);
    const lining=new THREE.CylinderGeometry(topRadius*.76,topRadius*.76,2.4,48,1,true);lining.scale(-1,1,1);solid(group,lining,inside,x,base+b.h-1.2,z);
    const mouth=new THREE.CircleGeometry(topRadius*.76,48);mouth.rotateX(-Math.PI/2);solid(group,mouth,inside,x,base+b.h-2.4,z);
    for(const y of [44,87,129]) {
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
  }
  function emitBuilding(parent,b,base) {
    if(b.model!=='thermal-chimney')return false;
    const group=new THREE.Group();group.name=`KazanPowerStation/${b.id}`;group.userData.source=b.heightEvidence;
    chimney(group,b,base);flush(group);parent.add(group);return true;
  }
  return {emitBuilding};
}
