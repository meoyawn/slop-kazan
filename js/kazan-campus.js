import * as THREE from 'three/webgpu';
import { GEO, services } from './kazan-runtime.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';
import { ROADS, toPoints, boundsOf, pointInPoly, terrainHeight, groundSurfaceHeight, roadHeight, surfaceHeight } from './kazan-config.js';

/** Repeated academic facade components follow mapped building parts; ornament dimensions are photographic estimates. */
export function createKazanCampusModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, emit, flush, label, pitchedRoof } = draw;
  const stone = plainMaterial(0xb7b5a8), light = plainMaterial(0xd4d6cc), white = plainMaterial(0xe5e4da);
  const glass = plainMaterial(0x52717c, 0.28), darkGlass = plainMaterial(0x344d56, 0.2);
  const roof = plainMaterial(0x747e78), metal = plainMaterial(0x7a8580, 0.45), granite = plainMaterial(0x95978c);
  const classicalLayouts = new WeakMap(), ribbonLayouts = new WeakMap(), airplaneLayouts = new WeakMap(), squareLayouts = new WeakMap(), brickLayouts = new WeakMap(), galleryLayouts = new WeakMap(), tiledLayouts = new WeakMap();
  const ribbonBuilding=GEO.buildings.find(b=>b.model==='kai-ribbon');
  const airplaneBuilding=GEO.buildings.find(b=>b.model==='kai-airplane');
  const brickBuilding=GEO.buildings.find(b=>b.model==='kai-brick-academic');
  const galleryBuilding=GEO.buildings.find(b=>b.model==='kai-gallery');
  const tiledBuilding=GEO.buildings.find(b=>b.model==='kai-tiled');
  let accessLayouts;

  function faces(b, ring = b.ring) {
    const poly = toPoints(ring), result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length], length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 1) continue;
      const ux = (c.x - a.x) / length, uz = (c.z - a.z) / length, x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
      let nx = -uz, nz = ux;
      if (pointInPoly(poly, x + nx * 0.2, z + nz * 0.2)) { nx = -nx; nz = -nz; }
      result.push({ index: i, x, z, ux, uz, nx, nz, length, yaw: -Math.atan2(uz, ux), labelYaw: Math.atan2(nx, nz) });
    }
    return result;
  }

  function panel(group, f, u, y, width, height, depth, projection, material) {
    box(group, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection,
      width, height, depth, material, f.yaw);
  }

  function frontFace(b, boundaries) {
    const target = b.frontTowards;
    return boundaries.filter((f) => f.length > 9).sort((a, c) => {
      const da = target ? ((target[0] - a.x) * a.nx + (target[1] - a.z) * a.nz) / Math.hypot(target[0] - a.x, target[1] - a.z) : 1;
      const dc = target ? ((target[0] - c.x) * c.nx + (target[1] - c.z) * c.nz) / Math.hypot(target[0] - c.x, target[1] - c.z) : 1;
      return dc * Math.sqrt(c.length) - da * Math.sqrt(a.length);
    })[0];
  }

  function volume(group, b, base, material, { ring = b.ring, minHeight = b.minHeight, height = b.h - minHeight } = {}) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(ring, b.holes), { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base + minHeight, 0);
    splitExtrusion(group, geometry, roof, material, base);
    for (const f of faces(b, ring)) {
      const ground = terrainHeight(f.x, f.z);
      if (!minHeight && ground < base - 0.1) panel(group, f, 0, (base + ground) / 2, f.length, base - ground, 0.25, 0.03, granite);
    }
  }

  function windowBay(group, f, u, y, w, h, projecting = false, frame = light) {
    panel(group, f, u, y, w, h, 0.08, 0.055, glass);
    for (const side of [-1, 1]) panel(group, f, u + side * w / 2, y, 0.085, h + 0.08, 0.12, 0.12, frame);
    for (const v of [-h / 2, h / 2]) panel(group, f, u, y + v, w + 0.17, 0.085, 0.12, 0.12, frame);
    panel(group, f, u + w * 0.12, y, 0.055, h, 0.12, 0.12, frame);
    if (projecting) {
      panel(group, f, u, y + h / 2 + 0.2, w + 0.7, 0.35, 0.85, 0.32, stone);
      panel(group, f, u - w / 2 - 0.2, y, 0.3, h + 0.65, 0.7, 0.3, stone);
      panel(group, f, u, y - h / 2 - 0.13, w + 0.6, 0.18, 0.65, 0.27, stone);
    }
  }

  function academicTower(group, b, base) {
    volume(group, b, base, stone);
    const boundaries = faces(b), front = frontFace(b, boundaries), second = b.campusRole === 'second';
    const floors = second ? 16 : 14, bottom = second ? 2.7 : 3.8, pitch = (b.h - bottom - 2.5) / floors;
    for (const f of boundaries) {
      if (f.length < 7) continue;
      const isFront = f === front, core = second && isFront ? Math.min(8, f.length * 0.2) : 0;
      const n = Math.max(1, Math.round((f.length - core) / 2.55)), bay = (f.length - core) / n;
      for (let i = 0; i < n; i++) {
        const u = -f.length / 2 + core + (i + 0.5) * bay;
        if (!second) panel(group, f, u - bay / 2, base + b.h / 2, 0.23, b.h - 1, 0.52, 0.2, stone);
        for (let floor = 0; floor < floors; floor++) {
          const y = base + bottom + pitch * (floor + 0.5), h = pitch * 0.72;
          windowBay(group, f, u, y, bay * 0.76, h, second);
          if ((i * 7 + floor * 11 + b.id) % 37 === 0) {
            panel(group, f, u + bay * 0.3, y - h * 0.45, 0.65, 0.48, 0.4, 0.48, light);
            panel(group, f, u + bay * 0.3, y - h * 0.45, 0.46, 0.29, 0.05, 0.71, metal);
          }
        }
      }
      if (core) {
        for (let floor = 1; floor < floors - 1; floor++) windowBay(group, f, -f.length / 2 + core * 0.48,
          base + bottom + pitch * (floor + 0.5), 1.05, 1.15);
        label(group, 'КФУ', f.x + f.ux * (-f.length / 2 + core * 0.48) + f.nx * 0.22, base + b.h - 3,
          f.z + f.uz * (-f.length / 2 + core * 0.48) + f.nz * 0.22, core * 0.8, 1.8, f.labelYaw, '#78b0c9');
      }
      panel(group, f, 0, base + b.h - 0.2, f.length + 0.3, 0.45, 0.55, 0.12, stone);
      for (let u = -f.length / 2 + 1.5; u < f.length / 2; u += 4) {
        panel(group, f, u, base + b.h + 0.5, 0.06, 1.2, 0.06, -0.1, metal);
      }
    }
  }

  function academicLibrary(group, b, base) {
    volume(group, b, base, stone);
    const boundaries = faces(b), front = frontFace(b, boundaries), physics = b.campusRole === 'physics-podium';
    for (const f of boundaries) {
      if (f.length < 4) continue;
      const n = Math.max(1, Math.round(f.length / 3.3)), bay = f.length / n;
      for (let i = 0; i < n; i++) {
        const u = -f.length / 2 + (i + 0.5) * bay;
        if (physics) {
          if (f === front && u < -f.length * 0.13) continue;
          for (const y of [1.9, 5.5]) windowBay(group, f, u, base + y, bay * 0.92, 2);
        } else {
          for (const y of [2, 5.4]) windowBay(group, f, u, base + y, bay * 0.94, 1.7);
          for (const y of [9, 12.1]) windowBay(group, f, u, base + y, bay * 0.72, 2.6);
          panel(group, f, u - bay / 2, base + 10.7, 0.28, 6.6, 0.8, 0.3, stone);
          panel(group, f, u, base + 13.8, bay + 0.1, 0.55, 0.9, 0.3, stone);
        }
      }
    }
    if (!front) return;
    const entranceWidth = Math.min(12, front.length * 0.48), entrance = front.length * 0.2;
    panel(group, front, entrance, base + 1.6, entranceWidth, 3.1, 0.16, 0.21, darkGlass);
    panel(group, front, entrance, base + 3.5, entranceWidth + 1, 0.4, 4, 1.9, metal);
    for (const u of [-entranceWidth / 2, 0, entranceWidth / 2]) panel(group, front, entrance + u, base + 1.65, 0.09, 3.3, 0.18, 0.33, light);
    const text = physics ? 'ИНСТИТУТ ФИЗИКИ' : 'БИБЛИОТЕКА ИМ. Н. И. ЛОБАЧЕВСКОГО';
    label(group, text, front.x + front.ux * entrance + front.nx * 4, base + 3.6,
      front.z + front.uz * entrance + front.nz * 4, entranceWidth, 0.7, front.labelYaw, '#d7c493');
    if (!physics) {
      const u = front.length / 2 - 1.4;
      panel(group, front, u, base + b.h / 2, 1.9, b.h - 0.8, 0.12, 0.12, darkGlass);
      for (let y = 1; y < b.h; y += 1.8) panel(group, front, u, base + y, 2, 0.1, 0.16, 0.2, light);
    }
    if (physics) {
      const f = front;
      if (f) {
        const x = f.x - f.ux * f.length * 0.3, z = f.z - f.uz * f.length * 0.3;
        const p = new THREE.TorusGeometry(2.2, 0.18, 6, 32); p.rotateY(f.labelYaw);
        solid(group, p, metal, x + f.nx * 0.35, base + 4.3, z + f.nz * 0.35);
        for (const angle of [-0.7, 0.7]) {
          const orbit = new THREE.TorusGeometry(2.8, 0.08, 5, 28); orbit.rotateZ(angle); orbit.scale(1, 0.4, 1); orbit.rotateY(f.labelYaw);
          solid(group, orbit, metal, x + f.nx * 0.6, base + 4.3, z + f.nz * 0.6);
        }
        label(group, 'E = mc²', x + f.nx * 0.8, base + 3.8, z + f.nz * 0.8, 3.2, 0.8, f.labelYaw, '#c6d0cd');
      }
    }
  }

  function ionicColumn(group, x, y, z, height, yaw) {
    solid(group, new THREE.CylinderGeometry(0.42, 0.53, height - 0.7, 16), white, x, y + height / 2, z);
    for (const [v, radius, h] of [[0.14, 0.7, 0.27], [0.38, 0.58, 0.18], [height - 0.24, 0.66, 0.2]]) {
      solid(group, new THREE.CylinderGeometry(radius, radius, h, 16), white, x, y + v, z);
    }
    box(group, x, y + height - 0.03, z, 1.35, 0.22, 1.2, white, yaw);
    for (const side of [-1, 1]) {
      const curl = new THREE.TorusGeometry(0.22, 0.095, 6, 12); curl.rotateY(yaw);
      solid(group, curl, white, x + side * Math.cos(yaw) * 0.47, y + height - 0.26, z - side * Math.sin(yaw) * 0.47);
    }
  }

  function classicalLayout(b) {
    if (classicalLayouts.has(b)) return classicalLayouts.get(b);
    const boundaries = faces(b), front = frontFace(b, boundaries);
    const porticos = front ? boundaries.filter((f) => f.length > 16 && f.length < 39 && f.nx * front.nx + f.nz * front.nz > 0.98)
      .sort((a, c) => (c.x * front.nx + c.z * front.nz) - (a.x * front.nx + a.z * front.nz)).slice(0, 3) : [];
    const wallRing = b.ring.slice();
    for (const f of porticos) for (const index of [f.index * 2, ((f.index + 1) * 2) % wallRing.length]) {
      wallRing[index] -= f.nx * 3; wallRing[index + 1] -= f.nz * 3;
    }
    const result = { wallRing, porticos };
    classicalLayouts.set(b, result);
    return result;
  }

  function kaiFront(b) {
    return frontFace(b,faces(b));
  }
  function kaiWallRing(b,ring) {
    const f=kaiFront(b),poly=toPoints(ring),result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],c=poly[(i+1)%poly.length],ua=(a.x-f.x)*f.ux+(a.z-f.z)*f.uz,uc=(c.x-f.x)*f.ux+(c.z-f.z)*f.uz;
      const da=(a.x-f.x)*f.nx+(a.z-f.z)*f.nz,dc=(c.x-f.x)*f.nx+(c.z-f.z)*f.nz;
      if(Math.abs(da)>0.3||Math.abs(dc)>0.3||Math.abs(uc-ua)<0.01){result.push(a.x,a.z);continue;}
      const ts=[0,1,...[-13.5,13.5].map(u=>(u-ua)/(uc-ua)).filter(t=>t>0&&t<1)].sort((a,b)=>a-b);
      for(let j=1;j<ts.length;j++){
        const inset=Math.abs(ua+(uc-ua)*(ts[j-1]+ts[j])/2)<13.5?2.7:0;
        for(const t of [ts[j-1],ts[j]])result.push(a.x+(c.x-a.x)*t-f.nx*inset,a.z+(c.z-a.z)*t-f.nz*inset);
      }
    }
    const clean=[];
    for(let i=0;i<result.length;i+=2)if(!clean.length||result[i]!==clean.at(-2)||result[i+1]!==clean.at(-1))clean.push(result[i],result[i+1]);
    if(clean[0]===clean.at(-2)&&clean[1]===clean.at(-1))clean.splice(-2);
    return clean;
  }
  function kaiColumnRing(f,u,width=1.5) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([a,b])=>[f.x+f.ux*(u+a*width/2)+f.nx*(0.15+b*width/2),f.z+f.uz*(u+a*width/2)+f.nz*(0.15+b*width/2)]);
  }
  function kaiMain(group,b,base) {
    const wall=createObservedFacadeMaterial(b.appearance),f=kaiFront(b),ring=kaiWallRing(b,b.ring),door=plainMaterial(0x75583a);
    for(const v of b.openingVolumes||[b]){
      const bottom=Math.max(-5,v.minHeight),top=Math.min(14.4,v.h);if(top<=bottom)continue;
      volume(group,b,base,wall,{ring:kaiWallRing(b,v.ring),minHeight:bottom,height:top-bottom});
    }
    pitchedRoof(group,{ring,holes:b.holes,h:16.6,roofShape:'hipped'},base,2.2,roof);
    for(const face of faces(b,ring)){
      if(face.length<2)continue;
      const isPortico=Math.abs((face.x-f.x)*f.nx+(face.z-f.z)*f.nz+2.7)<0.15&&face.length>26&&face.length<28;
      const count=isPortico?5:Math.max(1,Math.round(face.length/4.2)),bay=face.length/count;
      for(let i=0;i<count;i++){
        const u=(i+0.5)*bay-face.length/2;
        for(const [y,w,h] of [[2.1,1.6,2.7],[7.4,1.6,3.7],[11.9,1.45,2.25]]){
          windowBay(group,face,u,base+y,w,h);
          panel(group,face,u,base+y+h/2+0.22,w+0.55,0.17,0.35,0.16,white);
        }
      }
      for(const y of [0.5,4.8,10.25,13.8,14.35])panel(group,face,0,base+y,face.length+0.2,y>13?0.3:0.17,0.38,0.16,white);
      if(face.nx*f.nx+face.nz*f.nz>.98&&!isPortico){
        for(let u=-face.length/2+0.3;u<face.length/2;u+=4.2){
          panel(group,face,u,base+7.7,0.5,12.3,0.4,0.2,white);
          panel(group,face,u,base+13.7,0.95,0.3,0.55,0.22,light);
        }
      }
    }
    for(let i=0;i<6;i++)ionicColumn(group,f.x+f.ux*(i-2.5)*4.8+f.nx*.15,base+.2,f.z+f.uz*(i-2.5)*4.8+f.nz*.15,13.8,f.yaw);
    for(const y of [14.15,14.5])panel(group,f,0,base+y,28,0.4,3.9,-1.15,white);
    const triangle=new THREE.Shape([new THREE.Vector2(-14.2,0),new THREE.Vector2(14.2,0),new THREE.Vector2(0,3.1)]);
    const g=new THREE.ExtrudeGeometry(triangle,{depth:0.45,bevelEnabled:false});g.rotateY(f.labelYaw);solid(group,g,wall,f.x+f.nx*0.55,base+14.7,f.z+f.nz*0.55);
    for(const side of [-1,1]){
      const beam=new THREE.BoxGeometry(Math.hypot(14.2,3.1),0.25,0.7);beam.rotateZ(-side*Math.atan2(3.1,14.2));beam.rotateY(f.labelYaw);
      solid(group,beam,white,f.x+f.ux*side*7.1+f.nx*.7,base+16.25,f.z+f.uz*side*7.1+f.nz*.7);
    }
    for(const u of [-4.8,0,4.8]){
      panel(group,f,u,base+1.6,2.1,3.2,0.12,-2.48,door);
      for(const side of [-1,1])panel(group,f,u+side*.5,base+2.2,.65,1.2,.08,-2.38,glass);
    }
    label(group,'ТЕХНИЧЕСКИЙ УНИВЕРСИТЕТ',f.x+f.nx*.9,base+14.35,f.z+f.nz*.9,25.7,.55,f.labelYaw,'#9a8657');
    label(group,'КАИ',f.x+f.nx*1.2,base+15.6,f.z+f.nz*1.2,4.7,1.2,f.labelYaw,'#5e7681');
  }
  function clipCampusX(ring,edge,sign=-1) {
    const poly=toPoints(ring),result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=(a.x-edge)*sign,db=(b.x-edge)*sign;
      if(da>=0)result.push(a.x,a.z);
      if((da<0)!==(db<0)){const t=da/(da-db);result.push(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);}
    }
    return result;
  }
  function ribbonLayout(b) {
    if(ribbonLayouts.has(b))return ribbonLayouts.get(b);
    const part=GEO.buildings.find(p=>p.id===79107249),bounds=boundsOf(toPoints(part.ring));
    const x=bounds.maxX-11.6,z=(bounds.minZ+bounds.maxZ)/2,base=b.foundationAt?terrainHeight(...b.foundationAt):Math.max(...toPoints(b.ring).map(p=>terrainHeight(p.x,p.z)));
    const start=11.6,length=5.4,top=base+.85,bottom=Math.min(top-.6,groundSurfaceHeight(x+start+length,z)+.06),count=Math.max(5,Math.ceil((top-bottom)/.17));
    const layout={x,z,ux:0,uz:-1,nx:1,nz:0,yaw:Math.PI/2,labelYaw:Math.PI/2,base,start,length,top,bottom,count,part};
    ribbonLayouts.set(b,layout);return layout;
  }
  function ribbonRectangle(f,u,d,w,length) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([a,b])=>[f.x+d+b*length/2,f.z-u-a*w/2]);
  }
  function ribbonShapes(b) {
    const f=ribbonLayout(b),rear=GEO.buildings.find(p=>p.id===79107257);
    return [...(b.body||[]).map(body=>({...b,ring:body.ring,holes:body.holes,minHeight:0,h:20.3})),
      {...b,ring:rear.ring,holes:[],minHeight:0,h:12.6},
      {...b,ring:clipCampusX(f.part.ring,f.x-1.4),holes:[],minHeight:0,h:4.1},
      {...b,ring:clipCampusX(f.part.ring,f.x),holes:[],minHeight:4.1,h:17.5},
      ...[-3683.8,-3592.1].map(z=>({...b,ring:[1774.3,z-3.05,1778.7,z-3.05,1778.7,z+3.05,1774.3,z+3.05],holes:[],minHeight:0,h:22.6}))];
  }
  function academicRibbon(group,b,base) {
    const f=ribbonLayout(b),wall=createObservedFacadeMaterial(b.appearance),cream=plainMaterial(0xdad4b3),brick=plainMaterial(0x935b48);
    for(const shape of ribbonShapes(b).filter(p=>p.h<22))volume(group,b,base,shape.minHeight===4.1?cream:shape.h===4.1?darkGlass:wall,{ring:shape.ring,minHeight:shape.minHeight,height:shape.h-shape.minHeight});
    for(const shape of ribbonShapes(b).filter(p=>p.h===20.3||p.h===12.6)){
      for(const face of faces(b,shape.ring)){
        if(face.length<3)continue;
        const count=Math.max(1,Math.round(face.length/4.3)),bay=face.length/count;
        const rows=shape.h>19?[[2.35,2.35],[6.25,2.25],[10.05,2.25],[13.85,2.25],[17.75,1.45]]:[[2.2,2.25],[6.1,2.25],[10,2.1]];
        for(let i=0;i<count;i++){
          const u=(i+.5)*bay-face.length/2;
          for(const [y,h] of rows){windowBay(group,face,u,base+y,Math.min(3.1,bay*.83),h);panel(group,face,u-bay*.24,base+y,.05,h,.1,.14,white);}
        }
        for(const y of [4.2,8,11.8,15.6,19.6,20.3].filter(y=>y<shape.h+.1))panel(group,face,0,base+y,face.length+.15,.2,.3,.12,white);
        for(let u=-face.length/2+.6;u<face.length/2;u+=1.8)panel(group,face,u,base+1.3,.08,2.2,.05,.06,brick);
      }
    }
    for(const z of [-3683.8,-3592.1]){
      box(group,1776.5,base+11.1,z,4.4,22.2,6.1,cream);
      for(const dz of [-2.3,0,2.3])box(group,1778.8,base+11.3,z+dz,.22,22.6,.34,light);
      box(group,1778.85,base+11.5,z,0.12,19.5,.6,darkGlass);
    }
    const arch=new THREE.Shape();arch.moveTo(-2.25,0);arch.lineTo(2.25,0);arch.lineTo(2.25,13);arch.absarc(0,13,2.25,0,Math.PI,false);arch.closePath();
    const glazing=new THREE.ShapeGeometry(arch,24);glazing.rotateY(Math.PI/2);solid(group,glazing,darkGlass,f.x+.06,base+3.8,f.z);
    for(const u of [-1.5,0,1.5])panel(group,f,u,base+10.8,.07,14,.08,.14,metal);
    for(let y=4.5;y<18.2;y+=1.7)panel(group,f,0,base+y,4.45,.07,.08,.15,metal);
    for(const u of [-14.5,-7.2,7.2,14.5])panel(group,f,u,base+2.08,.48,4.16,.55,.4,white);
    panel(group,f,0,base+3.9,8.5,.4,10.3,4.8,granite);
    for(const u of [-3.9,3.9])panel(group,f,u,base+1.9,.23,3.8,.23,9.1,white);
    for(const u of [-1.8,0,1.8]){
      panel(group,f,u,base+1.75,1.6,2.9,.1,-1.32,glass);
      panel(group,f,u-.8,base+1.75,.07,3,.12,-1.22,white);
    }
    volume(group,b,base,granite,{ring:ribbonRectangle(f,0,5.8,9.6,11.6),minHeight:-.15,height:1});
    for(let i=0;i<f.count;i++){
      const d=f.start+(i+.5)*f.length/f.count,y=f.top-(i+1)*(f.top-f.bottom)/f.count,h=Math.max(.2,y-groundSurfaceHeight(f.x+d,f.z)+.1);
      panel(group,f,0,y-h/2,9.6,h,f.length/f.count+.01,d,granite);
    }
    const sign={...f,x:1779};
    for(const [text,u,w] of [['ТЕХНИЧЕСКИЙ',-31,35],['УНИВЕРСИТЕТ',31,35],['КАИ',0,7]])label(group,text,sign.x,base+21.15,sign.z-u,w,1.2,Math.PI/2,text==='КАИ'?'#b43d39':'#39617f');
  }
  function campusRectangle(f,u,d,width,depth) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([a,b])=>[
      f.x+f.ux*(u+a*width/2)+f.nx*(d+b*depth/2),f.z+f.uz*(u+a*width/2)+f.nz*(d+b*depth/2)]);
  }
  function airplaneLayout(b) {
    if(airplaneLayouts.has(b))return airplaneLayouts.get(b);
    const boundaries=faces(b),direction=frontFace(b,boundaries);
    const f=boundaries.filter(face=>face.length>12&&face.nx*direction.nx+face.nz*direction.nz>.98)
      .sort((a,c)=>(c.x*direction.nx+c.z*direction.nz)-(a.x*direction.nx+a.z*direction.nz))[0];
    const base=terrainHeight(...b.foundationAt),start=1.5,length=2.4,top=base+.42;
    const bottom=Math.min(top-.3,groundSurfaceHeight(f.x+f.nx*(start+length),f.z+f.nz*(start+length))+.04);
    const ring=b.ring.slice();
    for(const i of [f.index*2,((f.index+1)*2)%ring.length]){ring[i]-=f.nx*2.6;ring[i+1]-=f.nz*2.6;}
    const layout={...f,faceLength:f.length,base,start,length,top,bottom,count:Math.max(3,Math.ceil((top-bottom)/.17)),wallRing:ring,width:12.2};
    airplaneLayouts.set(b,layout);return layout;
  }
  function airplaneShapes(b) {
    const f=airplaneLayout(b);
    const shapes=[{...b,h:4.2},{...b,ring:f.wallRing,minHeight:4.2,h:18.4},
      {...b,ring:campusRectangle(f,0,-6.2,f.faceLength,12.4),holes:[],minHeight:17.3,h:b.h}];
    for(let i=0;i<6;i++)shapes.push({...b,ring:campusRectangle(f,(i-2.5)*(f.faceLength-1.7)/5,.08,1.15,1.15),holes:[],minHeight:4.2,h:17.3});
    return shapes;
  }
  function academicAirplane(group,b,base) {
    const f=airplaneLayout(b),wall=createObservedFacadeMaterial(b.appearance),door=plainMaterial(0x694a33);
    volume(group,b,base,wall,{height:4.2});
    volume(group,b,base,wall,{ring:f.wallRing,minHeight:4.2,height:14.2});
    volume(group,b,base,wall,{ring:campusRectangle(f,0,-6.2,f.faceLength,12.4),minHeight:17.3,height:3.6});
    for(const face of faces(b,f.wallRing)){
      if(face.length<3||face.index===f.index)continue;
      const n=Math.max(1,Math.round(face.length/3.4)),bay=face.length/n;
      for(let i=0;i<n;i++)for(const y of [2,5.6,9.2,12.8,16.4])windowBay(group,face,(i+.5)*bay-face.length/2,base+y,Math.min(1.85,bay*.6),2.25);
      for(const y of [4.2,7.8,11.4,15,18.2])panel(group,face,0,base+y,face.length+.2,y===18.2?.35:.16,.36,.15,white);
      panel(group,face,0,base+18.48,face.length+.4,.18,.75,.18,roof);
    }
    for(let i=0;i<6;i++){
      const u=(i-2.5)*(f.faceLength-1.7)/5;
      panel(group,f,u,base+10.75,.92,12.6,.92,.08,white);
      for(const [y,w,h] of [[4.35,1.3,.3],[4.6,1.12,.2],[17.02,1.2,.22],[17.23,1.38,.2]])panel(group,f,u,base+y,w,h,1.18,.08,white);
      for(let y=6.4;y<16.8;y+=2.25)panel(group,f,u,base+y,.94,.035,.95,.08,light);
    }
    for(let i=0;i<5;i++){
      const u=(i-2)*(f.faceLength-1.7)/5;
      // Glazing sits on the recessed auditorium wall, behind the square columns.
      windowBay(group,{...f,x:f.x-f.nx*2.6,z:f.z-f.nz*2.6},u,base+9.35,1.8,7.7);
      for(const y of [8.1,10.7])panel(group,f,u,base+y,1.8,.08,.12,-2.42,white);
      const circle=new THREE.TorusGeometry(.48,.055,5,24);circle.rotateY(f.labelYaw);
      solid(group,circle,white,f.x+f.ux*u-f.nx*2.45,base+14.85,f.z+f.uz*u-f.nz*2.45);
      windowBay(group,f,u,base+19.05,1.8,2.05);
    }
    for(const y of [4.12,17.4,17.7,20.75,21])panel(group,f,0,base+y,f.faceLength+.5,y===17.4?.36:.23,3.25,-1.05,white);
    for(let u=-f.faceLength/2+.7;u<f.faceLength/2;u+=1.4)panel(group,f,u,base+20.55,.16,.35,.42,.35,white);
    const triangle=new THREE.Shape([new THREE.Vector2(-f.faceLength/2-.25,0),new THREE.Vector2(f.faceLength/2+.25,0),new THREE.Vector2(0,2.8)]);
    const pediment=new THREE.ExtrudeGeometry(triangle,{depth:.4,bevelEnabled:false});pediment.rotateY(f.labelYaw);
    solid(group,pediment,wall,f.x+f.nx*.25,base+21,f.z+f.nz*.25);
    for(const side of [-1,1]){
      const half=f.faceLength/2+.25,beam=new THREE.BoxGeometry(Math.hypot(half,2.8),.22,.7);beam.rotateZ(-side*Math.atan2(2.8,half));beam.rotateY(f.yaw);
      solid(group,beam,white,f.x+f.ux*side*half/2+f.nx*.4,base+22.4,f.z+f.uz*side*half/2+f.nz*.4);
    }
    for(const u of [-3.6,0,3.6]){
      panel(group,f,u,base+1.93,2.1,3.02,.1,.07,door);
      panel(group,f,u,base+2.2,.12,2.5,.12,.15,metal);
      for(const side of [-1,1])panel(group,f,u+side*.5,base+2.25,.5,1.25,.12,.15,darkGlass);
    }
    for(let y=.6;y<4.1;y+=.7)panel(group,f,0,base+y,f.faceLength,.035,.04,.07,stone);
    label(group,'КАИ',f.x+f.nx*.8,base+22,f.z+f.nz*.8,2,.65,f.labelYaw,'#829599');
    for(const side of [-1,1])for(let i=0;i<3;i++)panel(group,f,side*(1.2+i*.35),base+22.1-i*.1,.8,.1,.08,.65,metal);
    volume(group,b,base,granite,{ring:campusRectangle(f,0,.75,f.width,1.5),minHeight:-.2,height:.62});
    for(let i=0;i<f.count;i++){
      const d=f.start+(i+.5)*f.length/f.count,y=f.top-(i+1)*(f.top-f.bottom)/f.count;
      const h=Math.max(.2,y-groundSurfaceHeight(f.x+f.nx*d,f.z+f.nz*d)+.1);
      panel(group,f,0,y-h/2,f.width,h,f.length/f.count+.01,d,granite);
    }
  }
  function campusSurfaceHeight(x,z,referenceY,height) {
    if(!accessLayouts)accessLayouts=[...(ribbonBuilding?[{...ribbonLayout(ribbonBuilding),width:9.6}]:[]),...(airplaneBuilding?[airplaneLayout(airplaneBuilding)]:[]),...(brickBuilding?[brickLayout(brickBuilding)]:[]),...(galleryBuilding?[galleryLayout(galleryBuilding).landing,...galleryLayout(galleryBuilding).flights]:[]),...(tiledBuilding?[tiledLayout(tiledBuilding)]:[])];
    for(const f of accessLayouts){
      const dx=x-f.x,dz=z-f.z,d=dx*f.nx+dz*f.nz,u=dx*f.ux+dz*f.uz;
      if(Math.abs(u)>f.width/2||d<0||d>f.start+f.length)continue;
      const step=!f.length||d<f.start?0:Math.min(f.count,Math.floor((d-f.start)*f.count/f.length)+1),candidate=f.top-step*(f.top-f.bottom)/f.count;
      if(!Number.isFinite(referenceY)||referenceY>=candidate-.5&&referenceY<=candidate+2.5)height=Math.max(height,candidate);
    }
    return height;
  }
  function brickLayout(b) {
    if(brickLayouts.has(b))return brickLayouts.get(b);
    const boundaries=faces(b),direction=frontFace(b,boundaries);
    const f=boundaries.filter(face=>face.length>10&&face.nx*direction.nx+face.nz*direction.nz>.98)
      .sort((a,c)=>(c.x*direction.nx+c.z*direction.nz)-(a.x*direction.nx+a.z*direction.nz))[0];
    const base=terrainHeight(...b.foundationAt),start=3.6,length=2.4;
    const foot=groundSurfaceHeight(f.x+f.nx*(start+length),f.z+f.nz*(start+length)),top=Math.max(base+.35,foot+.4),bottom=foot+.06;
    const local=b.ring.flatMap((v,i)=>i%2?[]:[(v-f.x)*f.ux+(b.ring[i+1]-f.z)*f.uz,(v-f.x)*f.nx+(b.ring[i+1]-f.z)*f.nz]);
    const side=clipCampusX(local,-f.length/2).flatMap((v,i,ring)=>i%2?[]:[f.x+f.ux*v+f.nx*ring[i+1],f.z+f.uz*v+f.nz*ring[i+1]]);
    const result={...f,frontWidth:f.length,base,start,length,top,bottom,count:Math.max(3,Math.ceil((top-bottom)/.17)),width:5.4,side};
    brickLayouts.set(b,result);return result;
  }
  function brickAcademic(group,b,base) {
    const f=brickLayout(b),wall=createObservedFacadeMaterial(b.appearance),sill=plainMaterial(0xa3a496),floor=f.top-base;
    volume(group,b,base,wall,{height:10.6});
    pitchedRoof(group,{ring:campusRectangle(f,0,-19.85,f.frontWidth,39.7),holes:[],h:12.3,roofShape:'gabled'},base,1.7,roof);
    if(f.side.length>=6)pitchedRoof(group,{ring:f.side,holes:[],h:11.8,roofShape:'hipped'},base,1.2,roof);
    for(const face of faces(b)){
      if(face.length<3||face.index===f.index)continue;
      const count=Math.max(1,Math.round(face.length/3.6)),bay=face.length/count;
      for(let i=0;i<count;i++)for(const y of [1.7,5.05,8.5])windowBay(group,face,(i+.5)*bay-face.length/2,base+y,Math.min(1.8,bay*.58),2.25);
      for(const y of [.7,3.6,7.05,10.55])panel(group,face,0,base+y,face.length+.15,.15,.3,.12,sill);
    }
    for(const u of [-3.8,0,3.8]){
      windowBay(group,f,u,base+5.15,2,2.55);
      archWindow(group,f,u,7.35,2.05,2.7,base);
    }
    for(const side of [-1,1])for(const u of [3.2,4.5,5.8])windowBay(group,f,u*side,base+1.6,.92,1.45);
    for(const y of [.7,3.65,7.05,10.55])panel(group,f,0,base+y,f.frontWidth+.15,.15,.3,.12,sill);
    const triangle=new THREE.Shape([new THREE.Vector2(-f.frontWidth/2,0),new THREE.Vector2(f.frontWidth/2,0),new THREE.Vector2(0,1.7)]);
    const pediment=new THREE.ExtrudeGeometry(triangle,{depth:.28,bevelEnabled:false});pediment.rotateY(f.labelYaw);
    solid(group,pediment,wall,f.x+f.nx*.05,base+10.6,f.z+f.nz*.05);
    for(const side of [-1,1]){
      const half=f.frontWidth/2,cap=new THREE.BoxGeometry(Math.hypot(half,1.7),.17,.5);cap.rotateZ(-side*Math.atan2(1.7,half));cap.rotateY(f.yaw);
      solid(group,cap,roof,f.x+f.ux*side*half/2+f.nx*.13,base+11.45,f.z+f.uz*side*half/2+f.nz*.13);
    }
    for(let u=-f.frontWidth/2+.4;u<f.frontWidth/2;u+=.6)panel(group,f,u,base+10.65,.18,.18,.18,.22,sill);
    panel(group,f,0,base+floor+1.35,4.2,2.7,2,1,glass);
    for(const u of [-2,-.65,.65,2])panel(group,f,u,base+floor+1.35,.1,2.7,.13,2.08,white);
    for(const y of [floor+.06,floor+2.2,floor+2.7])panel(group,f,0,base+y,4.2,.12,.14,2.08,white);
    panel(group,f,0,base+floor+2.85,4.6,.22,2.3,1,metal);
    volume(group,b,base,granite,{ring:campusRectangle(f,0,2.8,5.4,1.6),minHeight:-.2,height:floor+.2});
    for(let i=0;i<f.count;i++){
      const d=f.start+(i+.5)*f.length/f.count,y=f.top-(i+1)*(f.top-f.bottom)/f.count;
      const h=Math.max(.2,y-groundSurfaceHeight(f.x+f.nx*d,f.z+f.nz*d)+.1);
      panel(group,f,0,y-h/2,5.4,h,f.length/f.count+.01,d,granite);
    }
  }
  function brickAcademicShapes(b) {
    const f=brickLayout(b);
    return [b,{...b,ring:campusRectangle(f,0,1,4.2,2),holes:[],minHeight:f.top-f.base,h:f.top-f.base+3}];
  }
  function galleryLayout(b) {
    if(galleryLayouts.has(b))return galleryLayouts.get(b);
    const f=frontFace(b,faces(b)),base=terrainHeight(...b.foundationAt),top=base+2.6;
    const flights=[-1,1].map(side=>{
      const x=f.x+f.ux*side*14.4+f.nx*4.9,z=f.z+f.uz*side*14.4+f.nz*4.9,length=12.4;
      const nx=f.ux*side,nz=f.uz*side,bottom=Math.min(top-.4,groundSurfaceHeight(x+nx*length,z+nz*length)+.06);
      return{x,z,ux:f.nx,uz:f.nz,nx,nz,yaw:-Math.atan2(f.nz,f.nx),base,top,bottom,start:0,length,width:2.4,count:Math.max(4,Math.ceil((top-bottom)/.17))};
    });
    const landing={...f,width:28.8,start:6.3,length:0,top,bottom:top,count:1};
    const result={...f,base,top,flights,landing};galleryLayouts.set(b,result);return result;
  }
  function galleryShapes(b) {
    const f=galleryLayout(b),shapes=[{...b,h:19.2},
      {...b,ring:campusRectangle(f,0,.9,28,1.8),holes:[],minHeight:12.1,h:21.4},
      {...b,ring:campusRectangle(f,0,1.65,28,3.3),holes:[],minHeight:2.6,h:5.6},
      {...b,ring:campusRectangle(f,0,2,30,4.2),holes:[],minHeight:5.6,h:5.95}];
    for(const u of [-12.8,12.8])shapes.push({...b,ring:campusRectangle(f,u,3.2,.28,.3),holes:[],minHeight:2.6,h:7.25});
    for(const flight of f.flights)for(let i=0;i<flight.count;i++){
      const d=(i+.5)*flight.length/flight.count,y=flight.top-(i+1)*(flight.top-flight.bottom)/flight.count;
      for(const side of [-1,1])shapes.push({...b,ring:campusRectangle(flight,side*1.4,d,.18,flight.length/flight.count+.015),holes:[],minHeight:Math.min(-.5,y-f.base-1),h:y-f.base+.85});
    }
    return shapes;
  }
  function academicGallery(group,b,base) {
    const f=galleryLayout(b),wall=createObservedFacadeMaterial(b.appearance),frame=plainMaterial(0x514d49),cream=plainMaterial(0xded9cc),coping=plainMaterial(0x8d9795);
    const shapes=galleryShapes(b);for(const shape of shapes)volume(group,b,base,shape===shapes[0]||shape.minHeight>=12?wall:cream,{ring:shape.ring,minHeight:shape.minHeight,height:shape.h-shape.minHeight});
    for(const face of faces(b)){
      if(face.length<3)continue;
      const count=Math.max(1,Math.round(face.length/3.5)),bay=face.length/count,front=face.index===f.index;
      for(let i=0;i<count;i++)for(const y of [3.6,7.1,10.6,14.1,17.6]){
        const u=(i+.5)*bay-face.length/2;if(front&&y>12&&Math.abs(u)<14.5)continue;
        windowBay(group,face,u,base+y,Math.min(2.9,bay*.84),2.55,false,frame);
        panel(group,face,u,base+y-.55,Math.min(2.9,bay*.84),.065,.12,.15,frame);
      }
      for(const y of [2,5.5,9,12.5,16,19.15]){
        if(front&&y>12){for(const side of [-1,1]){const width=face.length/2-14.5;panel(group,face,side*(14.5+width/2),base+y,width,.22,.35,.14,white);}}
        else panel(group,face,0,base+y,face.length+.1,.22,.35,.14,white);
      }
      panel(group,face,0,base+19.35,face.length+.25,.25,.55,.16,coping);
    }
    // The two-storey curtain wall projects in front of the regular classroom rows.
    panel(group,f,0,base+16.25,25.6,6.1,.08,1.85,glass);
    for(let u=-12.8;u<12.9;u+=2.56)panel(group,f,u,base+16.25,.075,6.15,.13,1.93,frame);
    for(const y of [13.2,15.23,17.26,19.3])panel(group,f,0,base+y,25.7,.075,.13,1.93,frame);
    for(const side of [-1,1])panel(group,f,side*13.4,base+16.25,1.1,6.35,.2,1.94,white);
    label(group,'ТЕХНИЧЕСКИЙ',f.x-f.ux*8.5+f.nx*1.97,base+20.45,f.z-f.uz*8.5+f.nz*1.97,7.5,.55,f.labelYaw,'#4e7387');
    label(group,'КАИ',f.x+f.nx*1.98,base+20.6,f.z+f.nz*1.98,4.1,.9,f.labelYaw,'#4e7387');
    label(group,'УНИВЕРСИТЕТ',f.x+f.ux*8.4+f.nx*1.97,base+20.45,f.z+f.uz*8.4+f.nz*1.97,8,.55,f.labelYaw,'#4e7387');
    for(const side of [-1,1]){
      panel(group,f,side*3.2,base+20.55,2.5,.15,.12,2,plainMaterial(0x5a7f93));
      panel(group,f,side*3,base+20.35,2,.12,.12,2,plainMaterial(0x9d6f6b));
    }
    // Raised glazed entrance, central landing and two transverse stair flights share their surface layout.
    panel(group,f,0,base+4.1,27.5,2.8,.08,3.36,glass);
    for(let u=-13.5;u<=13.6;u+=2.7)panel(group,f,u,base+4.1,.085,2.8,.13,3.44,frame);
    for(const y of [2.7,4.75,5.5])panel(group,f,0,base+y,27.6,.085,.13,3.44,frame);
    for(const side of [-1,1])panel(group,f,side*14.06,base+4.2,.1,2.8,3.3,1.65,glass);
    for(const u of [-.85,.85]){
      panel(group,f,u,base+3.95,1.55,2.65,.12,3.47,frame);
      panel(group,f,u,base+4.15,1.3,2.1,.08,3.56,darkGlass);
    }
    for(const y of [5.7,5.8,5.9])panel(group,f,0,base+y,30,.055,.16,4.15,coping);
    volume(group,b,base,granite,{ring:campusRectangle(f,0,4.9,28.8,2.8),minHeight:-.5,height:3.1});
    for(const flight of f.flights)for(let i=0;i<flight.count;i++){
      const d=(i+.5)*flight.length/flight.count,y=flight.top-(i+1)*(flight.top-flight.bottom)/flight.count;
      const ground=groundSurfaceHeight(flight.x+flight.nx*d,flight.z+flight.nz*d),h=Math.max(.2,y-ground+.1);
      panel(group,flight,0,y-h/2,flight.width,h,flight.length/flight.count+.015,d,granite);
    }
    for(const u of [-11,0,11]){
      panel(group,f,u,base+22.35,.075,1.9,.08,-1,coping);
      for(const d of [-.25,.25])panel(group,f,u,base+22.3,.24,1.1,.18,-1+d,white);
    }
  }
  function tiledLayout(b) {
    if(tiledLayouts.has(b))return tiledLayouts.get(b);
    const part=GEO.buildings.find(p=>p.id===85247055),rear=GEO.buildings.find(p=>p.id===85247057);
    const base=terrainHeight(...b.foundationAt),x=1713,z=-3434.3,start=5.2,length=3.6,top=base+.9;
    const bottom=Math.min(top-.6,groundSurfaceHeight(x-start-length,z)+.06);
    let lower=clipCampusX(part.ring,x,1);
    const swap=ring=>ring.flatMap((v,i)=>i%2?[]:[ring[i+1],v]);
    lower=swap(clipCampusX(clipCampusX(swap(lower),-3442,1),-3427));
    // The photographed upper hall overhangs the narrower mapped lower-entry facets.
    const upper=[1709.6,z,1714.7,-3444.3,1714.7,-3447.2,...part.ring.slice(0,32),1714.7,-3421.7,1714.7,-3424.8];
    const result={x,z,ux:0,uz:1,nx:-1,nz:0,yaw:-Math.PI/2,labelYaw:-Math.PI/2,base,start,length,top,bottom,width:8.2,count:Math.max(4,Math.ceil((top-bottom)/.17)),part,rear,lower,upper,
      columns:[[1712.8,z-2.85],[1712.8,z+2.85],[1719.5,-3444],[1719.3,-3425.2],[1714.9,-3445.7],[1714.9,-3423.2]],
      cores:[{x:1755.9,z:-3481.75},{x:1756,z:-3387.6}],
      poles:[-12,-15,-18,-21].map(u=>({x:1705.5,z:z+u})),
      lamps:[[-10,10],[10,10],[-26,18],[26,18]].map(([u,d])=>({x:x-d,z:z+u})),
      benches:[{x:1693,z:z-13},{x:1693,z:z+13}]};
    tiledLayouts.set(b,result);return result;
  }
  function tiledShapes(b) {
    const f=tiledLayout(b),shapes=[...(b.body||[]).map(body=>({...b,ring:body.ring,holes:body.holes,h:19.7})),
      {...b,ring:f.rear.ring,holes:[],h:3.2},
      {...b,ring:f.lower,holes:[],minHeight:0,h:4.1},
      {...b,ring:f.upper,holes:[],minHeight:4.1,h:19.4}];
    for(const [x,z] of f.columns)shapes.push({...b,ring:[x-.32,z-.32,x+.32,z-.32,x+.32,z+.32,x-.32,z+.32],holes:[],minHeight:0,h:4.1});
    for(const c of f.cores)shapes.push({...b,ring:[c.x-1.45,c.z-3.45,c.x+1.45,c.z-3.45,c.x+1.45,c.z+3.45,c.x-1.45,c.z+3.45],holes:[],minHeight:0,h:21.2});
    for(const p of [...f.poles,...f.lamps]){
      const ground=groundSurfaceHeight(p.x,p.z)-f.base;
      shapes.push({...b,ring:[p.x-.09,p.z-.09,p.x+.09,p.z-.09,p.x+.09,p.z+.09,p.x-.09,p.z+.09],holes:[],minHeight:ground,h:ground+(f.poles.includes(p)?11.5:4.5)});
    }
    for(const p of f.benches){const ground=groundSurfaceHeight(p.x,p.z)-f.base;shapes.push({...b,ring:[p.x-.32,p.z-1.1,p.x+.32,p.z-1.1,p.x+.32,p.z+1.1,p.x-.32,p.z+1.1],holes:[],minHeight:ground,h:ground+1});}
    for(const z of [-3445.75,-3423.25])shapes.push({...b,ring:[1714.6,z-1.4,1714.8,z-1.4,1714.8,z+1.4,1714.6,z+1.4],holes:[],minHeight:1.05,h:19.25});
    return shapes;
  }
  function academicTiled(group,b,base) {
    const f=tiledLayout(b),wall=createObservedFacadeMaterial(b.appearance),blue=plainMaterial(0x23576e),steel=plainMaterial(0xb1b7b0,.45),wood=plainMaterial(0x66503b);
    const shapes=tiledShapes(b),bodyCount=(b.body||[]).length;
    const paving=[];
    for(let u=-24;u<16;u+=1)for(let d=0;d<31;d+=1){
      const corners=[[u,d],[u+1,d],[u+1,d+1],[u,d+1]].map(([u,d])=>{const x=f.x-d,z=f.z+u;return[x,groundSurfaceHeight(x,z)+.035,z];});
      for(const i of [0,2,1,0,3,2])paving.push(...corners[i]);
    }
    const apron=new THREE.BufferGeometry();apron.setAttribute('position',new THREE.Float32BufferAttribute(paving,3));apron.setAttribute('uv',new THREE.Float32BufferAttribute(paving.filter((v,i)=>i%3!==1),2));apron.computeVertexNormals();emit(group,apron,stone);
    for(let i=0;i<bodyCount+3+f.columns.length+f.cores.length;i++){
      const shape=shapes[i];if(!shape)continue;
      const material=i===bodyCount+1?glass:i>bodyCount+2&&i<bodyCount+3+f.columns.length?blue:i>=bodyCount+3+f.columns.length?white:wall;
      volume(group,b,base,material,{ring:shape.ring,minHeight:shape.minHeight,height:shape.h-shape.minHeight});
    }
    for(const shape of shapes.slice(-2))volume(group,b,base,glass,{ring:shape.ring,minHeight:shape.minHeight,height:shape.h-shape.minHeight});
    for(const shape of shapes.slice(0,bodyCount+1))for(const face of faces(b,shape.ring)){
      if(face.length<3)continue;
      const count=Math.max(1,Math.round(face.length/3.4)),bay=face.length/count;
      const rows=shape.h>10?[2.5,6.1,9.7,13.3,16.9]:[1.6];
      if(face.nx<-.95&&shape.h>10)for(const z of [-3495.5,-3374]){
        const u=(z-face.z)/face.uz;
        if(Math.abs(u)<face.length/2-2)panel(group,face,u,base+9.9,4.3,16,.06,.025,blue);
      }
      for(let i=0;i<count;i++)for(const y of rows)windowBay(group,face,(i+.5)*bay-face.length/2,base+y,Math.min(2.35,bay*.7),2.05,false,white);
      for(const y of [.8,19.65].filter(y=>y<shape.h+.1))panel(group,face,0,base+y,face.length+.1,.16,.25,.12,white);
    }
    for(const c of f.cores){
      const front={x:c.x-1.46,z:c.z,ux:0,uz:1,nx:-1,nz:0,yaw:-Math.PI/2};
      panel(group,front,0,base+11.8,1.45,17.4,.1,.03,darkGlass);
      for(const u of [-2.6,-1.9,1.9,2.6])panel(group,front,u,base+10.6,.18,21.2,.35,.12,white);
      for(let y=3.5;y<20.8;y+=3.6)panel(group,front,0,base+y,1.55,.08,.12,.14,white);
    }
    for(const z of [-3445.75,-3423.25]){
      const face={x:1714.7,z,ux:0,uz:1,nx:-1,nz:0,yaw:-Math.PI/2},width=2.8;
      panel(group,face,0,base+10.15,width,18.2,.1,.08,glass);
      for(const u of [-width/2,0,width/2])panel(group,face,u,base+10.15,.08,18.3,.14,.17,white);
      for(let y=1.05;y<19.4;y+=2.1)panel(group,face,0,base+y,width+.1,.08,.14,.17,white);
    }
    const hallFaces=faces(b,f.upper);
    for(const [index,text,sign] of [[0,'К',-1],[20,'И',1]]){
      const face=hallFaces.find(p=>p.index===index),u=sign*(face.length/2-1.2);
      // The shared sign atlas is wide; allow enough transparent plane width for a full-size single letter.
      label(group,text,face.x+face.ux*u+face.nx*.12,base+17.55,face.z+face.uz*u+face.nz*.12,14,1.15,face.labelYaw,'#aa2834');
      for(const y of [16.8,17.05,17.3])panel(group,face,u-sign*2,base+y,2.6,.13,.13,.17,plainMaterial(0x25538a));
    }
    label(group,'А',1709.38,base+17.65,f.z,14,1.35,-Math.PI/2,'#aa2834');
    for(const u of [-.9,.9]){
      panel(group,f,u,base+2.3,1.7,2.8,.13,-.03,white);
      panel(group,f,u,base+2.45,1.4,2.3,.1,.08,darkGlass);
    }
    for(const u of [-2.6,0,2.6])panel(group,f,u,base+2.5,.065,3.1,.1,.1,white);
    volume(group,b,base,granite,{ring:campusRectangle(f,0,f.start/2,f.width,f.start),minHeight:-.2,height:f.top-base+.2});
    for(let i=0;i<f.count;i++){
      const d=f.start+(i+.5)*f.length/f.count,y=f.top-(i+1)*(f.top-f.bottom)/f.count,ground=groundSurfaceHeight(f.x+f.nx*d,f.z),h=Math.max(.2,y-ground+.1);
      panel(group,f,0,y-h/2,f.width,h,f.length/f.count+.015,d,granite);
    }
    for(const u of [-4.25,4.25]){
      let previous;
      for(let i=0;i<=f.count;i++){
        const d=f.start+i*f.length/f.count,y=f.top-i*(f.top-f.bottom)/f.count,x=f.x+f.nx*d,z=f.z+u;
        panel(group,f,u,y+.46,.05,.92,.05,d,steel);
        const next={x,y:y+.92,z};if(previous)link(group,previous,next,.035,steel);previous=next;
      }
    }
    for(const [z,text,width] of [[-3470,'ГЕРМАНО-РОССИЙСКИЙ ИНСТИТУТ НОВЫХ ТЕХНОЛОГИЙ',51],[-3398,'INSTITUTE OF ADVANCED TECHNOLOGIES',49]])label(group,text,1756.9,base+20.45,z,width,.62,-Math.PI/2,'#39617f');
    for(const p of f.poles){const y=groundSurfaceHeight(p.x,p.z);solid(group,new THREE.CylinderGeometry(.045,.07,11.5,8),steel,p.x,y+5.75,p.z);box(group,p.x,y+.15,p.z,.55,.3,.55,granite);}
    for(const p of f.lamps){
      const y=groundSurfaceHeight(p.x,p.z);solid(group,new THREE.CylinderGeometry(.065,.11,3.7,8),metal,p.x,y+1.85,p.z);
      for(const [dz,h] of [[-.6,3.7],[0,4.2],[.6,3.7]]){link(group,{x:p.x,y:y+3,z:p.z},{x:p.x,y:y+h-.2,z:p.z+dz},.055,metal);solid(group,new THREE.SphereGeometry(.28,10,7),white,p.x,y+h,p.z+dz);}
    }
    for(const p of f.benches){const y=groundSurfaceHeight(p.x,p.z);for(const dz of [-.8,.8])box(group,p.x,y+.23,p.z+dz,.5,.46,.09,metal);box(group,p.x,y+.5,p.z,.62,.12,2.2,wood);box(group,p.x+.26,y+.8,p.z,.1,.5,2.2,wood);}
  }
  function churchLabLayout(b) {
    const boundaries=faces(b),direction=frontFace(b,boundaries);
    const f=boundaries.filter(face=>face.nx*direction.nx+face.nz*direction.nz>.98)
      .sort((a,c)=>(c.x*direction.nx+c.z*direction.nz)-(a.x*direction.nx+a.z*direction.nz))[0];
    return {...f,towers:[-9.3,9.3].map(u=>({x:f.x+f.ux*u-f.nx*20.7,z:f.z+f.uz*u-f.nz*20.7}))};
  }
  function squareLayout(b) {
    if(squareLayouts.has(b))return squareLayouts.get(b);
    const poly=toPoints(b.ring),ring=[];
    for(let i=0;i<poly.length;i++){
      const p=poly[i];
      if(i!==5){ring.push(p.x,p.z);continue;}
      for(const adjacent of [poly[i-1],poly[i+1]]){
        const length=Math.hypot(adjacent.x-p.x,adjacent.z-p.z);
        ring.push(p.x+(adjacent.x-p.x)*3.8/length,p.z+(adjacent.z-p.z)*3.8/length);
      }
    }
    const boundaries=faces(b,ring),front=frontFace(b,boundaries),gray=clipCampusX(ring,978),classical=clipCampusX(ring,978,1);
    const corner=boundaries.find(f=>f.x>1000&&f.z>-725&&f.length<8),grayFront=faces(b,gray).find(f=>f.nz>.9&&f.length>20);
    const result={ring,front,corner,gray,classical,grayFront};squareLayouts.set(b,result);return result;
  }
  function squarePilaster(group,f,u,base) {
    panel(group,f,u,base+12.8,.62,15.2,.45,.18,white);
    for(const [y,w,h] of [[5.45,.9,.3],[20.05,1.1,.36],[20.35,1.3,.2]])panel(group,f,u,base+y,w,h,.65,.24,white);
    for(const side of [-1,1]){
      const scroll=new THREE.TorusGeometry(.16,.06,5,12);scroll.rotateY(f.labelYaw);
      solid(group,scroll,white,f.x+f.ux*(u+side*.42)+f.nx*.4,base+20.03,f.z+f.uz*(u+side*.42)+f.nz*.4);
    }
  }
  function squareBalustrade(group,f,u,y,width,base) {
    for(const v of [-.35,.35])panel(group,f,u,base+y+v,width,.12,.33,.23,white);
    const count=Math.max(3,Math.round(width/.26));
    for(let i=0;i<count;i++)panel(group,f,u+(i+.5)*width/count-width/2,base+y,.08,.6,.16,.23,white);
  }
  function academicSquare(group,b,base) {
    const f=squareLayout(b),wall=createObservedFacadeMaterial(b.appearance),gray=plainMaterial(0xb1b6b2),wood=plainMaterial(0x765a43),rose=plainMaterial(0xbaa59d);
    volume(group,b,base,wall,{ring:f.classical,height:20.9});
    volume(group,b,base,gray,{ring:f.gray,height:20.9});
    pitchedRoof(group,{ring:f.classical,holes:[],h:21.7,roofShape:'hipped'},base,.8,roof);
    pitchedRoof(group,{ring:f.gray,holes:[],h:21.5,roofShape:'hipped'},base,.6,roof);
    for(const face of faces(b,f.classical)){
      if(face.length<3||Math.abs(face.x-978)<.01&&Math.abs(face.ux)<.01)continue;
      const corner=Math.hypot(face.x-f.corner.x,face.z-f.corner.z)<1,street=face.nz>.8||face.nx>.8||corner;
      const count=corner?1:Math.max(1,Math.round(face.length/3.9)),bay=face.length/count;
      panel(group,face,0,base+2.65,face.length,5.3,.06,.01,rose);
      for(let y=.65;y<5.3;y+=.7){
        let cursor=-face.length/2;
        if(y>1.4&&y<3.9){
          const half=Math.min(1.85,bay*.52)/2+.13;
          for(let i=0;i<count;i++){
            const u=(i+.5)*bay-face.length/2,left=u-half;
            if(left>cursor)panel(group,face,(cursor+left)/2,base+y,left-cursor,.035,.05,.13,stone);
            cursor=u+half;
          }
        }
        if(cursor<face.length/2)panel(group,face,(cursor+face.length/2)/2,base+y,face.length/2-cursor,.035,.05,.13,stone);
      }
      for(let u=-face.length/2+bay;u<face.length/2-.1;u+=bay)panel(group,face,u,base+2.65,.035,5.1,.05,.13,stone);
      for(let i=0;i<count;i++){
        const u=(i+.5)*bay-face.length/2;
        for(const [y,h] of [[2.65,2.25],[7.4,2.7],[13.1,face.nz>.8?4.7:2.8],[18.8,2.1]]){
          windowBay(group,face,u,base+y,Math.min(1.85,bay*.52),h,false,wood);
          if(y>5)panel(group,face,u,base+y+h/2+.17,2.25,.18,.45,.19,white);
          panel(group,face,u,base+y,1.8,.065,.12,.17,wood);
        }
        if(street){
          squarePilaster(group,face,u-bay/2+.18,base);
          const swag=new THREE.TorusGeometry(.42,.05,5,16,Math.PI);swag.rotateZ(Math.PI);swag.scale(1.7,.65,1);swag.rotateY(face.labelYaw);
          solid(group,swag,white,face.x+face.ux*u+face.nx*.2,base+9.6,face.z+face.uz*u+face.nz*.2);
          if(corner||face.nz>.8)squareBalustrade(group,face,u,5.85,2.1,base);
          squareBalustrade(group,face,u,17.05,2.05,base);
        }
      }
      if(street)squarePilaster(group,face,face.length/2-.18,base);
      for(const [y,h,d] of [[5.25,.3,.65],[20.55,.38,.75],[20.95,.22,1]])panel(group,face,0,base+y,face.length+.2,h,d,d/2,white);
      if(street){
        for(let u=-face.length/2+.3;u<face.length/2;u+=.65)panel(group,face,u,base+20.68,.15,.2,.2,.52,white);
        squareBalustrade(group,face,0,21.9,face.length,base);
        for(let u=-face.length/2+.4;u<face.length/2;u+=4.2)panel(group,face,u,base+21.9,.45,1.05,.55,.23,white);
      }
    }
    for(const face of faces(b,f.gray)){
      if(face.length<3||Math.abs(face.x-978)<.01&&Math.abs(face.ux)<.01)continue;
      const n=Math.max(1,Math.round(face.length/3.5)),bay=face.length/n;
      for(let i=0;i<n;i++)for(const y of [2.4,6.6,10.8,15,19.1])windowBay(group,face,(i+.5)*bay-face.length/2,base+y,Math.min(2.4,bay*.74),2.45);
      for(const y of [4.5,8.7,12.9,17.1,20.9])panel(group,face,0,base+y,face.length+.1,.25,.45,.18,granite);
    }
    for(const y of [5.35,9.55,13.75]){
      const face=f.grayFront,u=face.length/2-2.1;
      panel(group,face,u,base+y,2.7,.22,1.8,.85,granite);
      panel(group,face,u,base+y+.85,2.7,.08,.08,1.7,metal);
      for(let du=-1.2;du<1.3;du+=.3)panel(group,face,u+du,base+y+.45,.04,.8,.04,1.7,metal);
    }
    const face=f.front;
    for(const distance of [8,16,24]){
      const u=-face.length/2+distance;
      panel(group,face,u,base+2.05,2.25,4.1,.12,.12,wood);
      for(const side of [-1,1])panel(group,face,u+side*1.22,base+2.1,.23,4.2,.4,.2,white);
      panel(group,face,u,base+4.35,2.9,.35,.6,.25,white);
      for(const side of [-1,1])panel(group,face,u+side*.52,base+2.3,.75,2.7,.1,.21,glass);
    }
    const panelFace={...face,x:face.x+face.ux*(-face.length/2+11),z:face.z+face.uz*(-face.length/2+11)};
    panel(group,panelFace,0,base+22.6,23,1.4,.4,.15,white);
    for(let u=-8;u<=8;u+=4){
      const swag=new THREE.TorusGeometry(.65,.065,5,16,Math.PI);swag.rotateZ(Math.PI);swag.scale(1.8,.8,1);swag.rotateY(face.labelYaw);
      solid(group,swag,light,panelFace.x+face.ux*u+face.nx*.4,base+22.95,panelFace.z+face.uz*u+face.nz*.4);
    }
    panel(group,panelFace,0,base+23.4,7.8,.4,.5,.15,white);
    label(group,'КАИ',f.corner.x+f.corner.nx*.5,base+22.3,f.corner.z+f.corner.nz*.5,2,.55,f.corner.labelYaw,'#7b8c91');
  }
  function squareShapes(b) {
    const f=squareLayout(b),shapes=[{...b,ring:f.ring}];
    for(const y of [5.35,9.55,13.75])shapes.push({...b,ring:campusRectangle(f.grayFront,f.grayFront.length/2-2.1,.85,2.7,1.8),holes:[],minHeight:y-.15,h:y+1});
    return shapes;
  }
  function archWindow(group,f,u,sill,width,height,base,projection=.08) {
    const rise=width/2,shape=new THREE.Shape();
    shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,height-rise);
    shape.absarc(0,height-rise,rise,0,Math.PI,false);shape.closePath();
    const pane=new THREE.ShapeGeometry(shape,20);pane.rotateY(f.labelYaw);
    solid(group,pane,darkGlass,f.x+f.ux*u+f.nx*projection,base+sill,f.z+f.uz*u+f.nz*projection);
    for(const side of [-1,1])panel(group,f,u+side*(width/2+.07),base+sill+(height-rise)/2,.14,height-rise,.14,projection+.06,white);
    const arch=new THREE.TorusGeometry(rise+.07,.09,6,24,Math.PI);arch.rotateY(f.labelYaw);
    solid(group,arch,white,f.x+f.ux*u+f.nx*(projection+.08),base+sill+height-rise,f.z+f.uz*u+f.nz*(projection+.08));
    panel(group,f,u,base+sill-.1,width+.4,.2,.45,projection+.12,white);
    panel(group,f,u,base+sill+(height-rise)/2,.07,height-rise,.12,projection+.07,metal);
    for(let y=sill+1.2;y<sill+height-rise;y+=1.45)panel(group,f,u,base+y,width,.06,.12,projection+.07,metal);
  }
  function churchLabShapes(b) {
    const f=churchLabLayout(b),shapes=[{...b,h:12.7}],entrance=churchLabEntrance(b,f);
    for(const tower of f.towers)shapes.push({...b,ring:campusRectangle({...f,...tower},0,0,4.3,4.3),holes:[],minHeight:12.7,h:b.h});
    if(entrance)shapes.push({...b,ring:campusRectangle(entrance,-entrance.length*.24,.58,1.8,1.2),holes:[],minHeight:2.3,h:2.5});
    return shapes;
  }
  function churchLabEntrance(b,f) {
    return faces(b).filter(face=>face.length>12&&Math.abs(face.nx*f.nx+face.nz*f.nz)<.2)
      .sort((a,c)=>((c.x-f.x)*f.nx+(c.z-f.z)*f.nz)-((a.x-f.x)*f.nx+(a.z-f.z)*f.nz))[0];
  }
  function churchLaboratory(group,b,base) {
    const f=churchLabLayout(b),wall=createObservedFacadeMaterial(b.appearance),spire=plainMaterial(0x6c5c50,.45);
    volume(group,b,base,wall,{height:10.5});
    for(const face of faces(b)){
      if(face.length<3)continue;
      const isFront=face.index===f.index,d=(face.x-f.x)*f.nx+(face.z-f.z)*f.nz,isNave=d>-17;
      const count=isFront?2:Math.max(1,Math.round(face.length/(isNave?4.4:3.8))),bay=face.length/count;
      for(let i=0;i<count;i++){
        const u=(i+.5)*bay-face.length/2;
        if(isNave)archWindow(group,face,u,2.8,Math.min(1.7,bay*.5),6.2,base);
        else for(const y of [3,7.1])windowBay(group,face,u,base+y,Math.min(1.8,bay*.6),2.6);
        panel(group,face,u-bay/2,base+5.8,.45,8.8,.45,.18,white);
        panel(group,face,u,base+9.4,Math.min(2.8,bay*.8),.23,.5,.2,white);
      }
      for(const [y,h,depth] of [[1.3,.2,.28],[2.15,.22,.35],[9.8,.28,.55],[10.3,.38,.85]])panel(group,face,0,base+y,face.length+.25,h,depth,depth/2,white);
      for(let u=-face.length/2+.5;u<face.length/2;u+=.85)panel(group,face,u,base+10,.14,.17,.2,.38,white);
    }
    const nave=campusRectangle(f,0,-8.8,f.length,17.6),rear=campusRectangle(f,0,-26.3,26.6,16.7);
    pitchedRoof(group,{ring:nave,holes:[],h:12.1,roofShape:'gabled'},base,1.6,roof);
    pitchedRoof(group,{ring:rear,holes:[],h:11.7,roofShape:'hipped'},base,1.2,roof);
    for(const tower of f.towers){
      const ring=campusRectangle({...f,...tower},0,0,4.3,4.3);
      volume(group,b,base,wall,{ring,minHeight:10.3,height:5.7});
      for(const face of faces(b,ring)){
        archWindow(group,face,0,11.05,1.65,3.65,base,.09);
        for(const u of [-1.95,1.95])panel(group,face,u,base+13.1,.28,5.2,.35,.16,white);
        for(const [y,h,w] of [[10.6,.27,4.6],[15.2,.28,4.7],[15.7,.45,5],[16,.18,5.3]])panel(group,face,0,base+y,w,h,.55,.15,white);
        for(let u=-1.7;u<2;u+=.65)panel(group,face,u,base+15.48,.17,.22,.3,.3,white);
      }
      const pyramid=new THREE.ConeGeometry(3.05,6.7,4);pyramid.rotateY(f.yaw+Math.PI/4);
      solid(group,pyramid,spire,tower.x,base+19.45,tower.z);
      solid(group,new THREE.SphereGeometry(.2,10,8),spire,tower.x,base+22.97,tower.z);
      solid(group,new THREE.CylinderGeometry(.065,.09,.45,8),spire,tower.x,base+23.175,tower.z);
    }
    const triangle=new THREE.Shape([new THREE.Vector2(-f.length/2-.2,0),new THREE.Vector2(f.length/2+.2,0),new THREE.Vector2(0,2.1)]);
    const pediment=new THREE.ExtrudeGeometry(triangle,{depth:.35,bevelEnabled:false});pediment.rotateY(f.labelYaw);
    solid(group,pediment,wall,f.x+f.nx*.2,base+10.55,f.z+f.nz*.2);
    for(const side of [-1,1]){
      const half=f.length/2+.2,beam=new THREE.BoxGeometry(Math.hypot(half,2.1),.18,.6);beam.rotateZ(-side*Math.atan2(2.1,half));beam.rotateY(f.yaw);
      solid(group,beam,white,f.x+f.ux*side*half/2+f.nx*.3,base+11.6,f.z+f.uz*side*half/2+f.nz*.3);
    }
    const entrance=churchLabEntrance(b,f);
    if(entrance){
      const u=-entrance.length*.24;
      panel(group,entrance,u,base+1.08,1.25,2.15,.1,.12,plainMaterial(0x624b39));
      panel(group,entrance,u,base+2.4,1.8,.14,1.2,.58,metal);
    }
  }
  function collisionShapes(b) {
    if(b.model==='kai-tiled')return tiledShapes(b);
    if(b.model==='kai-gallery')return galleryShapes(b);
    if(b.model==='kai-brick-academic')return brickAcademicShapes(b);
    if(b.model==='kai-square')return squareShapes(b);
    if(b.model==='kai-church-lab')return churchLabShapes(b);
    if(b.model==='kai-airplane')return airplaneShapes(b);
    if(b.model==='kai-ribbon'){
      const f=ribbonLayout(b),shapes=ribbonShapes(b);
      for(const u of [-14.5,-7.2,7.2,14.5])shapes.push({...b,ring:ribbonRectangle(f,u,.4,.55,.55),holes:[],minHeight:0,h:4.2});
      for(const u of [-3.9,3.9])shapes.push({...b,ring:ribbonRectangle(f,u,9.1,.3,.3),holes:[],minHeight:0,h:3.9});
      shapes.push({...b,ring:ribbonRectangle(f,0,4.8,8.5,10.3),holes:[],minHeight:3.7,h:4.1});
      return shapes;
    }
    if(b.model==='kai-main'){
      const f=kaiFront(b),shapes=(b.openingVolumes||[b]).filter(v=>v.minHeight<14.4).map(v=>({...b,ring:kaiWallRing(b,v.ring),minHeight:Math.max(-5,v.minHeight),h:Math.min(14.4,v.h)}));
      shapes.push({...b,minHeight:13.95,h:b.h});
      for(let i=0;i<6;i++)shapes.push({...b,ring:kaiColumnRing(f,(i-2.5)*4.8),minHeight:0,h:14.4});
      return shapes;
    }
    if (b.model !== 'kfu-main') return [b];
    return [{ ...b, ring: classicalLayout(b).wallRing, h: 10.2 }, { ...b, minHeight: 10.2 }];
  }

  function mainBuilding(group, b, base) {
    const { wallRing, porticos } = classicalLayout(b);
    volume(group, b, base, white, { ring: wallRing, height: 10.2 });
    volume(group, b, base, white, { minHeight: 10.2 });
    for (const f of faces(b, wallRing)) {
      if (f.length < 3) continue;
      const n = Math.max(1, Math.round(f.length / 4)), bay = f.length / n;
      for (let i = 0; i < n; i++) {
        const u = -f.length / 2 + (i + 0.5) * bay;
        for (const [y, h] of [[2.6, 2.7], [7.5, 3.9]]) {
          windowBay(group, f, u, base + y, Math.min(1.8, bay * 0.5), h);
          panel(group, f, u, base + y + h / 2 + 0.22, Math.min(2.25, bay * 0.65), 0.23, 0.45, 0.22, light);
        }
      }
      for (const [y, h, projection] of [[0.4, 0.5, 0.22], [4.9, 0.32, 0.22], [10.5, 0.45, 0.38], [11.3, 0.3, 0.58]]) {
        panel(group, f, 0, base + y, f.length + 0.2, h, projection, projection / 2, light);
      }
    }
    for (const f of porticos) {
      const columns = f.length > 28 ? 12 : 6, h = 9.8, width = f.length + 0.5, depth = 4;
      for (let i = 0; i < columns; i++) {
        const u = (i / (columns - 1) - 0.5) * (f.length - 1.5);
        ionicColumn(group, f.x + f.ux * u + f.nx * 0.7, base + 0.5, f.z + f.uz * u + f.nz * 0.7, h, f.yaw);
      }
      for (const [y, h, d] of [[0.16, 0.28, depth + 1], [10.5, 0.6, depth], [11.1, 0.25, depth + 0.65], [11.9, 1.3, depth - 0.4]]) {
        panel(group, f, 0, base + y, width, h, d, -0.6, white);
      }
      if (columns === 12) {
        label(group, 'КАЗАНСКИЙ ПРИВОЛЖСКИЙ ФЕДЕРАЛЬНЫЙ УНИВЕРСИТЕТ', f.x + f.nx * 1.35, base + 11.9,
          f.z + f.nz * 1.35, width - 2, 0.7, f.labelYaw, '#81734e');
        for (const u of [-4.2, 0, 4.2]) panel(group, f, u, base + 1.9, 1.8, 3.1, 0.18, -1.5, darkGlass);
      }
    }
  }

  function emitBuilding(group, b, base) {
    if(b.model==='kai-tiled'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;academicTiled(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-gallery'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;academicGallery(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-brick-academic'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;brickAcademic(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-square'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;academicSquare(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-church-lab'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;churchLaboratory(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-airplane'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;academicAirplane(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-ribbon'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;academicRibbon(detail,b,base);flush(detail);group.add(detail);}
    else if(b.model==='kai-main'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;kaiMain(detail,b,base);flush(detail);group.add(detail);}
    else if (b.model === 'academic-tower') academicTower(group, b, base);
    else if (b.model === 'academic-library') academicLibrary(group, b, base);
    else if (b.model === 'kfu-main') mainBuilding(group, b, base);
    else return false;
    return true;
  }

  function link(group, a, b, radius, material) {
    const direction = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 7);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
    solid(group, geometry, material, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }

  function steps(group, road) {
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.1) continue;
      roadHeight(road, (a.x + b.x) / 2, (a.z + b.z) / 2);
      const count = road.stepSegments[i - 1].treadCount, nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x), run = length / count;
      for (let j = 0; j < count; j++) {
        const x = a.x + (b.x - a.x) * (j + 0.5) / count, z = a.z + (b.z - a.z) * (j + 0.5) / count;
        const y = roadHeight(road, x, z);
        box(group, x, y - 0.16, z, run + 0.015, 0.32, road.w, granite, yaw);
      }
      if (!road.handrail) continue;
      for (const side of [-1, 1]) {
        let previous = null;
        for (let j = 0; j <= Math.ceil(length / 1.8); j++) {
          const t = j / Math.ceil(length / 1.8), x = a.x + (b.x - a.x) * t + nx * side * (road.w / 2 - 0.15);
          const z = a.z + (b.z - a.z) * t + nz * side * (road.w / 2 - 0.15), y = roadHeight(road, x, z);
          box(group, x, y + 0.47, z, 0.055, 0.94, 0.055, metal);
          const p = { x, y: y + 0.94, z };
          if (previous) link(group, previous, p, 0.04, metal);
          previous = p;
        }
      }
    }
  }

  function studentMonument(group, site, colliders) {
    const { x, z, yaw } = site, base = surfaceHeight(x, z), pedestal = site.pedestalHeightEstimate;
    const bronze = plainMaterial(0x35443b, 0.55), polished = plainMaterial(0x666a63, 0.3), r = 1.15;
    const paving = [], radius = Math.min(8, site.plazaRadius);
    for (let ring = 0; ring < 5; ring++) for (let i = 0; i < 48; i++) {
      const corners = [];
      for (const [radial, angle] of [[ring, i], [ring + 1, i], [ring + 1, i + 1], [ring, i + 1]]) {
        const px = x + Math.sin(angle / 24 * Math.PI) * radial * radius / 5;
        const pz = z + Math.cos(angle / 24 * Math.PI) * radial * radius / 5;
        corners.push([px, roadHeight(null, px, pz) + 0.07, pz]);
      }
      for (const index of [0, 1, 2, 0, 2, 3]) paving.push(...corners[index]);
    }
    const floor = new THREE.BufferGeometry(); floor.setAttribute('position', new THREE.Float32BufferAttribute(paving, 3));
    floor.setAttribute('uv', new THREE.Float32BufferAttribute(paving.flatMap((v, i) => i % 3 === 1 ? [] : [v]), 2));
    floor.computeVertexNormals(); emit(group, floor, light);
    for (const [y, radius, h] of [[0.16, 1.7, 0.32], [0.42, 1.4, 0.22], [pedestal / 2 + 0.5, r, pedestal - 0.8], [pedestal, 1.27, 0.25]]) {
      solid(group, new THREE.CylinderGeometry(radius, radius, h, 32), polished, x, base + y, z);
    }
    const s = site.statueHeightEstimate / 3.3;
    function part(geometry, u, y, v) {
      geometry.rotateY(yaw); solid(group, geometry, bronze, x + (u * Math.cos(yaw) + v * Math.sin(yaw)) * s,
        base + pedestal + y * s, z + (-u * Math.sin(yaw) + v * Math.cos(yaw)) * s, [s, s, s]);
    }
    for (const side of [-1, 1]) {
      part(new THREE.CylinderGeometry(0.13, 0.17, 1.25, 9), side * 0.18, 0.77, 0);
      part(new THREE.BoxGeometry(0.26, 0.17, 0.48), side * 0.18, 0.13, 0.13);
    }
    part(new THREE.CylinderGeometry(0.4, 0.31, 1.1, 12), 0, 1.92, 0);
    part(new THREE.SphereGeometry(0.18, 12, 8), 0, 2.58, 0);
    const head = new THREE.SphereGeometry(0.27, 16, 12); head.scale(0.85, 1.2, 0.95); part(head, 0, 2.92, 0.04);
    part(new THREE.ConeGeometry(0.085, 0.15, 8).rotateX(Math.PI / 2), 0, 2.94, 0.31);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6; part(new THREE.SphereGeometry(0.105, 7, 5), Math.sin(a) * 0.2, 3.1 + (i % 3) * 0.035, Math.cos(a) * 0.17);
    }
    part(new THREE.CylinderGeometry(0.14, 0.11, 1, 9).rotateZ(0.13), -0.47, 1.95, 0.05);
    part(new THREE.BoxGeometry(0.28, 0.48, 0.12).rotateZ(-0.12), -0.49, 1.3, 0.13);
    part(new THREE.CylinderGeometry(0.14, 0.1, 0.8, 9).rotateZ(-0.55), 0.44, 2.13, 0.04);
    const coat = new THREE.CylinderGeometry(0.36, 0.47, 1.5, 10, 1, false, 0, Math.PI * 1.3);
    coat.rotateZ(-0.12); part(coat, 0.39, 1.88, -0.1);
    label(group, 'В. УЛЬЯНОВ', x + Math.sin(yaw) * 1.17, base + pedestal * 0.58, z + Math.cos(yaw) * 1.17, 1.55, 0.23, yaw, '#babbb0');
    for (let i = 0; i < 34; i++) {
      const a = yaw + Math.PI / 2 + i / 33 * Math.PI, px = x + Math.sin(a) * 6.4, pz = z + Math.cos(a) * 6.4;
      const y = surfaceHeight(px, pz);
      box(group, px, y + 0.38, pz, 0.7, 0.65, 0.8, granite, a);
      box(group, px, y + 0.75, pz, 0.72, 0.13, 1.05, light, a);
    }
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, minY: base, maxY: base + pedestal,
      obb: { cx: x, cz: z, hx: r, hz: r, cs: 1, sn: 0 } });
  }

  function buildGrounds(parent) {
    const group = new THREE.Group(); group.name = 'KazanCampuses';
    const colliders = [];
    for (const road of ROADS) if (road.kind === 'steps' && road.campus) steps(group, road);
    for (const site of GEO.campusFeatures || []) if (site.kind === 'student-monument') studentMonument(group, site, colliders);
    flush(group); parent.add(group);
    return colliders;
  }

  services.campusSurfaceHeight=campusSurfaceHeight;
  return { emitBuilding, buildGrounds, collisionShapes };
}
