import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { GEO, services } from './kazan-runtime.js';
import { toPoints, boundsOf, pointInPoly, terrainHeight, groundSurfaceHeight } from './kazan-config.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';
import { cityUniforms } from './tsl-materials.js';

/** Photographed palace exterior retains the mapped footprint, roof centres and vehicle passages. */
export function createKazanPalaceModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, emit, flush, pitchedRoof, label } = draw;
  const palace=GEO.buildings.find(b=>b.model==='farmers-palace');
  const parts=GEO.buildings.filter(b=>b.parent==='way/90251771');
  const cream=plainMaterial(0xdcd8cb),trim=plainMaterial(0xe9e5da),stone=plainMaterial(0xaaa99e),glass=plainMaterial(0x537582,0.3),metal=plainMaterial(0x525b61,0.4);
  const layouts=new WeakMap();
  function layout(b) {
    if(layouts.has(b))return layouts.get(b);
    const r=parts.find(p=>p.id===295851849).ring,bb=boundsOf(toPoints(r));
    const length=Math.hypot(r[4]-r[2],r[5]-r[3]),ux=(r[4]-r[2])/length,uz=(r[5]-r[3])/length;
    const x=(bb.minX+bb.maxX)/2,z=(bb.minZ+bb.maxZ)/2,nx=uz,nz=-ux;
    const base=b.foundationAt?terrainHeight(...b.foundationAt):Math.max(...toPoints(b.ring).map(p=>terrainHeight(p.x,p.z)));
    const foot={x:x+nx*18,z:z+nz*18},top=base+0.85,bottom=groundSurfaceHeight(foot.x,foot.z)+0.08,count=Math.max(6,Math.ceil((top-bottom)/0.17));
    const frame={x,z,ux,uz,nx,nz,yaw:-Math.atan2(uz,ux),faceYaw:Math.atan2(nx,nz),base,top,bottom,count,start:9.5,length:8.5};
    layouts.set(b,frame);return frame;
  }
  function point(f,u,v) {return {x:f.x+f.ux*u+f.nx*v,z:f.z+f.uz*u+f.nz*v};}
  function rectangle(f,u,v,w,d) {return [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([a,b])=>{const p=point(f,u+a*w/2,v+b*d/2);return [p.x,p.z];});}
  function clip(ring,f,edge,sign,depth = false) {
    const points=toPoints(ring),result=[],ux=depth?f.nx:f.ux,uz=depth?f.nz:f.uz;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],da=((a.x-f.x)*ux+(a.z-f.z)*uz-edge)*sign,db=((b.x-f.x)*ux+(b.z-f.z)*uz-edge)*sign;
      if(da>=0)result.push(a.x,a.z);
      if((da<0)!==(db<0)){const t=da/(da-db);result.push(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);}
    }
    return result;
  }
  function bodies(b) {
    const f=layout(b),result=[],offset=Math.max(...toPoints(b.ring).map(p=>terrainHeight(p.x,p.z)))-f.base;
    for(const source of b.body?.[0]?.openingVolumes||[b]){
      const bottom=source.minHeight>0?source.minHeight+offset:Math.max(-5,source.minHeight),top=Math.min(24.7,source.h+offset);if(top<=bottom)continue;
      for(const [edge,sign] of [[-8.8,-1],[8.8,1]]){
        const ring=clip(source.ring,f,edge,sign);if(ring.length>=6)result.push({...b,ring,holes:[],minHeight:bottom,h:top});
      }
      const ring=clip(clip(clip(source.ring,f,-8.8,1),f,8.8,-1),f,3.8,-1,true);
      if(ring.length>=6)result.push({...b,ring,holes:[],minHeight:bottom,h:top});
    }
    return result;
  }
  function volume(group,ring,base,bottom,top,wall,roof = cream) {
    const g=new THREE.ExtrudeGeometry(shapeOf(ring),{depth:top-bottom,bevelEnabled:false});g.rotateX(-Math.PI/2).translate(0,base+bottom,0);splitExtrusion(group,g,roof,wall,base);
  }
  function block(group,f,u,y,v,w,h,d,material) {const p=point(f,u,v);box(group,p.x,f.base+y,p.z,w,h,d,material,f.yaw);}
  function archShape(width,height) {
    const r=width/2,s=new THREE.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,height-r);s.absarc(0,height-r,r,0,Math.PI,false);s.closePath();return s;
  }
  function arch(group,f,u,v,y,width,height,material,thickness = 0) {
    const shape=archShape(width+2*thickness,height+2*thickness);
    if(thickness)shape.holes.push(new THREE.Path(archShape(width,height).getPoints(24).map(p=>new THREE.Vector2(p.x,p.y+thickness))));
    const g=thickness?new THREE.ExtrudeGeometry(shape,{depth:0.3,bevelEnabled:false,curveSegments:24}):new THREE.ShapeGeometry(shape,24),p=point(f,u,v);
    g.rotateY(f.faceYaw);solid(group,g,material,p.x,f.base+y-thickness,p.z);
  }
  function limb(group,f,a,b,r0,r1,material) {
    const p=point(f,a[0],a[2]),q=point(f,b[0],b[2]),start=new THREE.Vector3(p.x,f.base+a[1],p.z),end=new THREE.Vector3(q.x,f.base+b[1],q.z),delta=end.clone().sub(start);
    const g=new THREE.CylinderGeometry(r1,r0,delta.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));solid(group,g,material,(start.x+end.x)/2,(start.y+end.y)/2,(start.z+end.z)/2);
  }
  function bronzeTree(group,f) {
    const bronze=new THREE.MeshStandardNodeMaterial({color:0x6b5945,metalness:0.55,roughness:0.62});bronze.emissiveNode=TSL.color(0x328546).mul(cityUniforms.uInteriorGlow).mul(0.45);
    const root=0.85,v=9;
    for(let i=-3;i<=3;i++)limb(group,f,[i,root,v+Math.abs(i)*0.12],[0,root+2,v],0.2,0.65,bronze);
    limb(group,f,[0,root,v],[0.4,root+6,v],1.05,0.75,bronze);limb(group,f,[0.4,root+6,v],[-0.5,root+12,v],0.75,0.38,bronze);
    function crown(a,b,depth,seed) {
      limb(group,f,a,b,0.11*(depth+1),Math.max(0.025,0.085*depth),bronze);if(!depth)return;
      for(const side of [-1,1]){
        const spread=0.42*depth,up=1.1+depth*0.18,next=[Math.max(-8,Math.min(8,b[0]+side*spread)),Math.min(root+20,b[1]+up),v+((seed*13)%7-3)*0.09];
        crown(b,next,depth-1,seed*3+side+2);
      }
    }
    for(let i=-3;i<=3;i++){
      const start=[0.3,root+5+Math.abs(i)*0.5,v],elbow=[i*1.5,root+11.5-Math.abs(i)*0.4,v+(i%2)*0.15],tip=[i*2,root+15.2-Math.abs(i)*0.5,v];
      limb(group,f,start,elbow,0.5,0.32,bronze);crown(elbow,tip,3,i+5);
    }
  }
  function roofLantern(group,p,y,radius,spire) {
    solid(group,new THREE.CylinderGeometry(radius*1.25,radius*1.25,0.25,24),metal,p.x,y,p.z);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;solid(group,new THREE.CylinderGeometry(0.09,0.14,2.3,10),trim,p.x+Math.sin(a)*radius,y+1.2,p.z+Math.cos(a)*radius);}
    solid(group,new THREE.ConeGeometry(radius*1.35,1.5,24),metal,p.x,y+3.1,p.z);
    solid(group,new THREE.ConeGeometry(0.18,spire,12),metal,p.x,y+3.85+spire/2,p.z);
  }
  function dome(group,p,y,radius,height,lattice) {
    if(!lattice){const profile=Array.from({length:17},(_,i)=>new THREE.Vector2(radius*Math.sqrt(Math.max(0,1-(i/16)**2)),i/16*height));solid(group,new THREE.LatheGeometry(profile,32),metal,p.x,y,p.z);}
    const count=lattice?32:16;
    for(let i=0;i<count;i++){
      const points=[];
      for(let j=0;j<=24;j++){
        const t=j/24,r=radius*Math.sqrt(Math.max(0,1-t*t))+0.025,a=i*Math.PI*2/count+(lattice?t*0.75:0);
        points.push(new THREE.Vector3(p.x+Math.sin(a)*r,y+t*height,p.z+Math.cos(a)*r));
      }
      emit(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,lattice?0.11:0.055,5,false).toNonIndexed(),trim);
    }
    if(lattice)for(let j=1;j<=8;j++){
      const t=j/9,r=radius*Math.sqrt(1-t*t),ring=new THREE.TorusGeometry(r,0.065,5,96);ring.rotateX(Math.PI/2);solid(group,ring,metal,p.x,y+t*height,p.z);
    }
  }
  function facade(group,b,f) {
    const poly=toPoints(b.ring),body=bodies(b);
    function wallAt(x,z,y) {return body.some(v=>y>=v.minHeight&&y<=v.h&&pointInPoly(toPoints(v.ring),x,z));}
    for(let i=0;i<poly.length;i++){
      const a=poly[i],c=poly[(i+1)%poly.length],length=Math.hypot(c.x-a.x,c.z-a.z);if(length<2)continue;
      const ux=(c.x-a.x)/length,uz=(c.z-a.z)/length,x=(a.x+c.x)/2,z=(a.z+c.z)/2;let nx=-uz,nz=ux;
      if(pointInPoly(poly,x+nx*0.1,z+nz*0.1)){nx=-nx;nz=-nz;}
      const face={x,z,ux,uz,nx,nz,base:f.base,yaw:-Math.atan2(uz,ux),faceYaw:Math.atan2(nx,nz)};
      for(const y of [6.4,7.3,22.8,23.5,24.7])block(group,face,0,y,0.15,length+0.2,y>22?0.25:0.16,0.45,trim);
      const bays=Math.max(1,Math.round(length/4.5));
      for(let j=0;j<bays;j++){
        const u=(j+0.5)*length/bays-length/2,p=point(face,u,-0.2);if(!wallAt(p.x,p.z,12))continue;
        for(const [y,h,w] of [[1.6,3.6,1.6],[8.5,4.6,1.6],[15.4,4.5,1.6]]){
          if(!wallAt(p.x,p.z,y+0.1))continue;
          arch(group,face,u,0.08,y,w+0.3,h+0.3,trim);arch(group,face,u,0.27,y+0.15,w,h,glass);
          block(group,face,u,y+h*0.47,0.34,0.06,h*0.85,0.08,cream);
          block(group,face,u,y+h*0.5,0.35,w,0.06,0.08,cream);
        }
        const px=point(face,u+length/bays*0.43,0.45);
        solid(group,new THREE.CylinderGeometry(0.26,0.36,13.5,16),trim,px.x,f.base+15,px.z);
        box(group,px.x,f.base+21.9,px.z,1.15,0.45,1.15,cream,face.yaw);
        box(group,px.x,f.base+8.1,px.z,0.95,0.35,0.95,cream,face.yaw);
      }
      for(let y=0.5;y<6.2;y+=0.7)for(let u=-length/2+0.65;u<length/2;u+=1.4){const p=point(face,u,-0.15);if(wallAt(p.x,p.z,y))block(group,face,u,y,0.06,1.28,0.58,0.14,stone);}
      block(group,face,0,25.9,0.1,length,0.16,0.55,trim);
      for(let u=-length/2+0.3;u<length/2;u+=0.8)block(group,face,u,25.3,0.1,0.15,1.1,0.18,cream);
    }
  }
  function emitBuilding(parent,b,base) {
    if(b.model!=='farmers-palace')return false;
    const group=new THREE.Group();group.name='KazanLandmark/palace';group.userData.source=b.heightEvidence;
    const f=layout(b),wall=createObservedFacadeMaterial(b.appearance);
    for(const v of bodies(b))volume(group,v.ring,base,v.minHeight,v.h,wall,cream);
    pitchedRoof(group,{ring:b.ring,holes:[],h:25.2,roofShape:'hipped'},base,0.5,metal);
    facade(group,b,f);
    block(group,f,0,28.5,7.4,25,6.8,5.6,cream);
    for(const y of [25.4,30.6,31.8])block(group,f,0,y,10.35,26,0.25,0.6,trim);
    for(let y=26;y<30.5;y+=0.65)block(group,f,0,y,10.23,24.9,0.06,0.05,stone);
    arch(group,f,0,10.28,27.1,1.6,2.5,trim,0.25);arch(group,f,0,10.6,27.2,1.45,2.3,glass);
    arch(group,f,0,7.5,0.85,17.6,23.5,cream,1.2);arch(group,f,0,4.1,0.85,17.3,23.3,glass);
    for(let u=-7.8;u<8.3;u+=1.7){const h=23.3-8.65+Math.sqrt(Math.max(0,8.65**2-u*u));block(group,f,u,0.85+h/2,4.25,0.07,h,0.08,trim);}
    for(let y=2.8;y<22;y+=2.7){const w=y>15.5?2*Math.sqrt(Math.max(0,8.65**2-(y-15.5)**2)):17.3;block(group,f,0,y,4.26,w,0.07,0.08,trim);}
    for(const u of [-11.3,11.3])for(const dx of [-0.65,0.65]){
      const p=point(f,u+dx,9.05);solid(group,new THREE.CylinderGeometry(0.37,0.52,22.4,20),trim,p.x,base+12.05,p.z);
      block(group,f,u+dx,23.35,9.05,1.25,0.6,1.25,cream);
    }
    for(const u of [-16.5,16.5])arch(group,f,u,8.05,0.85,3.7,9.4,glass,0.3);
    bronzeTree(group,f);
    for(const part of parts.filter(p=>p.id!==295851849)){
      const bb=boundsOf(toPoints(part.ring)),p={x:(bb.minX+bb.maxX)/2,z:(bb.minZ+bb.maxZ)/2};
      volume(group,part.ring,base,24.7,26,cream);dome(group,p,base+26,5.5,5.5,false);roofLantern(group,p,base+31.5,0.95,1.5);
    }
    const cp={x:f.x,z:f.z};volume(group,parts.find(p=>p.id===295851849).ring,base,25.2,30.4,cream);
    dome(group,cp,base+30.4,8.1,11.2,true);roofLantern(group,cp,base+41.6,1.05,2.55);
    for(const [text,u,width] of [['ДВОРЕЦ ЗЕМЛЕДЕЛЬЦЕВ',-36,38],['ИГЕНЧЕЛӘР САРАЕ',36,33]]){
      const p=point(f,u,10);label(group,text,p.x,base+23.8,p.z,width,1.1,f.faceYaw,'#494b46');
    }
    volume(group,rectangle(f,0,8.6,39,1.8),base,-0.15,0.85,stone);
    for(let i=0;i<f.count;i++){
      const d=f.start+(i+0.5)*f.length/f.count,y=f.top-(i+1)*(f.top-f.bottom)/f.count,p=point(f,0,d),h=Math.max(0.18,y-groundSurfaceHeight(p.x,p.z)+0.12);
      block(group,f,0,y-base-h/2,d,39,h,f.length/f.count+0.01,stone);
    }
    flush(group);parent.add(group);return true;
  }
  function collisionShapes(b) {
    if(b.model!=='farmers-palace')return null;
    const f=layout(b),result=bodies(b);
    result.push({...b,ring:rectangle(f,0,7.4,25,5.6),holes:[],minHeight:25.1,h:31.9});
    return result;
  }
  function surfaceHeight(x,z,referenceY,height) {
    if(!palace)return height;
    const f=layout(palace),u=(x-f.x)*f.ux+(z-f.z)*f.uz,d=(x-f.x)*f.nx+(z-f.z)*f.nz;
    if(Math.abs(u)>19.5||d<7.7||d>f.start+f.length)return height;
    const step=d<f.start?0:Math.min(f.count,Math.floor((d-f.start)*f.count/f.length)+1),candidate=f.top-step*(f.top-f.bottom)/f.count;
    return !Number.isFinite(referenceY)||referenceY>=candidate-0.5&&referenceY<=candidate+2.5?Math.max(height,candidate):height;
  }
  services.landmarkSurfaceHeight=surfaceHeight;
  return {emitBuilding,collisionShapes};
}
