import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';
import { ROADS, toPoints, pointInPoly, terrainHeight, roadHeight, surfaceHeight } from './kazan-config.js';

/** Repeated academic facade components follow mapped building parts; ornament dimensions are photographic estimates. */
export function createKazanCampusModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, emit, flush, label, pitchedRoof } = draw;
  const stone = plainMaterial(0xb7b5a8), light = plainMaterial(0xd4d6cc), white = plainMaterial(0xe5e4da);
  const glass = plainMaterial(0x52717c, 0.28), darkGlass = plainMaterial(0x344d56, 0.2);
  const roof = plainMaterial(0x747e78), metal = plainMaterial(0x7a8580, 0.45), granite = plainMaterial(0x95978c);
  const classicalLayouts = new WeakMap();

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
      const ground = NYC.terrainHeight(f.x, f.z);
      if (!minHeight && ground < base - 0.1) panel(group, f, 0, (base + ground) / 2, f.length, base - ground, 0.25, 0.03, granite);
    }
  }

  function windowBay(group, f, u, y, w, h, projecting = false) {
    panel(group, f, u, y, w, h, 0.08, 0.055, glass);
    for (const side of [-1, 1]) panel(group, f, u + side * w / 2, y, 0.085, h + 0.08, 0.12, 0.12, light);
    for (const v of [-h / 2, h / 2]) panel(group, f, u, y + v, w + 0.17, 0.085, 0.12, 0.12, light);
    panel(group, f, u + w * 0.12, y, 0.055, h, 0.12, 0.12, light);
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
  function collisionShapes(b) {
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
    if(b.model==='kai-main'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;kaiMain(detail,b,base);flush(detail);group.add(detail);}
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
      NYC.roadHeight(road, (a.x + b.x) / 2, (a.z + b.z) / 2);
      const count = road.stepSegments[i - 1].treadCount, nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
      const yaw = -Math.atan2(b.z - a.z, b.x - a.x), run = length / count;
      for (let j = 0; j < count; j++) {
        const x = a.x + (b.x - a.x) * (j + 0.5) / count, z = a.z + (b.z - a.z) * (j + 0.5) / count;
        const y = NYC.roadHeight(road, x, z);
        box(group, x, y - 0.16, z, run + 0.015, 0.32, road.w, granite, yaw);
      }
      if (!road.handrail) continue;
      for (const side of [-1, 1]) {
        let previous = null;
        for (let j = 0; j <= Math.ceil(length / 1.8); j++) {
          const t = j / Math.ceil(length / 1.8), x = a.x + (b.x - a.x) * t + nx * side * (road.w / 2 - 0.15);
          const z = a.z + (b.z - a.z) * t + nz * side * (road.w / 2 - 0.15), y = NYC.roadHeight(road, x, z);
          box(group, x, y + 0.47, z, 0.055, 0.94, 0.055, metal);
          const p = { x, y: y + 0.94, z };
          if (previous) link(group, previous, p, 0.04, metal);
          previous = p;
        }
      }
    }
  }

  function studentMonument(group, site, colliders) {
    const { x, z, yaw } = site, base = NYC.surfaceHeight(x, z), pedestal = site.pedestalHeightEstimate;
    const bronze = plainMaterial(0x35443b, 0.55), polished = plainMaterial(0x666a63, 0.3), r = 1.15;
    const paving = [], radius = Math.min(8, site.plazaRadius);
    for (let ring = 0; ring < 5; ring++) for (let i = 0; i < 48; i++) {
      const corners = [];
      for (const [radial, angle] of [[ring, i], [ring + 1, i], [ring + 1, i + 1], [ring, i + 1]]) {
        const px = x + Math.sin(angle / 24 * Math.PI) * radial * radius / 5;
        const pz = z + Math.cos(angle / 24 * Math.PI) * radial * radius / 5;
        corners.push([px, NYC.roadHeight(null, px, pz) + 0.07, pz]);
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
      const y = NYC.surfaceHeight(px, pz);
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

  return { emitBuilding, buildGrounds, collisionShapes };
}

NYC = { ...NYC, createKazanCampusModels };
})();
