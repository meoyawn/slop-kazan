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
  const dormitoryBuildings=GEO.buildings.filter(b=>['kai-dormitory-classical','kai-dormitory-terraces','dormitory-brick','dormitory-glazed'].includes(b.model)), dormitoryLayouts=new WeakMap();
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

  function volume(group, b, base, material, { ring = b.ring, holes = b.holes, minHeight = b.minHeight, height = b.h - minHeight } = {}) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(ring, holes), { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base + minHeight, 0);
    splitExtrusion(group, geometry, roof, material, base);
    for (const f of faces(b, ring)) {
      const ground = NYC.terrainHeight(f.x, f.z);
      if (!minHeight && ground < base - 0.1) panel(group, f, 0, (base + ground) / 2, f.length, base - ground, 0.25, 0.03, granite);
    }
  }

  function windowBay(group, f, u, y, w, h, projecting = false, frame = light, divisions = 2) {
    panel(group, f, u, y, w, h, 0.08, 0.055, glass);
    for (const side of [-1, 1]) panel(group, f, u + side * w / 2, y, 0.085, h + 0.08, 0.12, 0.12, frame);
    for (const v of [-h / 2, h / 2]) panel(group, f, u, y + v, w + 0.17, 0.085, 0.12, 0.12, frame);
    if(divisions===3)for(const side of [-1,1])panel(group,f,u+side*w/6,y,.055,h,.12,.12,frame);
    else panel(group, f, u + w * 0.12, y, 0.055, h, 0.12, 0.12, frame);
    if (projecting) {
      panel(group, f, u, y + h / 2 + 0.2, w + 0.7, 0.35, 0.85, 0.32, stone);
      panel(group, f, u - w / 2 - 0.2, y, 0.3, h + 0.65, 0.7, 0.3, stone);
      panel(group, f, u, y - h / 2 - 0.13, w + 0.6, 0.18, 0.65, 0.27, stone);
    }
  }

  function academicLowrise(group, b, base) {
    const a = b.appearance, trim = plainMaterial(a.trimColour), cap = plainMaterial(b.roofColour);
    const roofHeight = b.roofShape === 'gabled' ? b.roofHeight : 0, eaves = b.h - roofHeight;
    const floors = b.levels || Math.max(1, Math.round(eaves / (a.floorHeight || 3.8))), pitch = (eaves - 0.5) / floors;
    const boundaries = faces(b), front = frontFace(b, boundaries);
    volume(group, b, base, createObservedFacadeMaterial(a), { height: eaves });
    for (const f of boundaries) {
      if (f.length < 3) continue;
      const count = Math.max(1, Math.round(f.length / a.bayWidth)), bay = f.length / count;
      for (let i = 0; i < count; i++) {
        const u = -f.length / 2 + (i + 0.5) * bay, width = Math.min(1.45, bay * 0.56), height = Math.min(1.95, pitch * 0.57);
        for (let floor = 0; floor < floors; floor++) {
          if(a.doorColour&&f===front&&!floor&&Math.abs(u)<1.2)continue;
          const y = base + 0.5 + pitch * (floor + 0.5);
          if (a.windowHoods) {
            for (const side of [-1, 1]) panel(group, f, u + side * (width / 2 + 0.17), y, 0.16, height + 0.64, 0.1, 0.055, trim);
            for (const side of [-1, 1]) panel(group, f, u, y + side * (height / 2 + 0.24), width + 0.5, 0.16, 0.1, 0.055, trim);
          }
          windowBay(group, f, u, y, width, height, false, trim);
        }
        if (a.pilasters && i) panel(group, f, u - bay / 2, base + eaves / 2, 0.22, eaves - 0.4, 0.18, 0.06, trim);
      }
      for (let floor = 1; floor < floors; floor++) panel(group, f, 0, base + 0.5 + floor * pitch,
        f.length, 0.15, 0.22, 0.06, trim);
      panel(group, f, 0, base + 0.24, f.length, 0.48, 0.12, 0.03, granite);
      panel(group, f, 0, base + eaves - 0.18, f.length + 0.14, 0.24, 0.3, 0.05, trim);
      panel(group, f, 0, base + eaves + 0.015, f.length + 0.3, 0.08, 0.38, 0.05, cap);
    }
    if (front && a.entrance !== false) {
      panel(group, front, 0, base + 1.15, 1.55, 2.3, 0.08, 0.15, a.doorColour?plainMaterial(a.doorColour):darkGlass);
      for (const u of a.doorColour?[-.82,.82]:[-.82,0,.82]) panel(group, front, u, base + 1.15, 0.08, 2.4, 0.12, 0.2, trim);
      panel(group, front, 0, base + 2.37, 1.75, 0.12, 0.15, 0.18, trim);
    }
    if (roofHeight) pitchedRoof(group, b, base, roofHeight, cap);
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

  function dormitoryLayout(b) {
    if (dormitoryLayouts.has(b)) return dormitoryLayouts.get(b);
    let r=b.facadeRecess;
    if(!r){
      const a=b.appearance,boundaries=faces(b),f=boundaries.find(p=>p.index===a.entranceFace)||frontFace(b,boundaries),u=a.entranceOffset||0;
      r={x:f.x+f.ux*u,z:f.z+f.uz*u,ux:f.ux,uz:f.uz,nx:f.nx,nz:f.nz,face:f.index,length:f.length,stairWidth:a.stairWidth||3.6,stairStart:a.stairStart||1.6,stairLength:a.stairLength||1.8};
    }
    const base = terrainHeight(...b.foundationAt), yaw = -Math.atan2(r.uz, r.ux);
    const offset=b.appearance.stairOffset||0;
    const start = r.stairStart || 1.05, length = r.stairLength || 1.9, bottom = groundSurfaceHeight(r.x+r.ux*offset+r.nx*(start+length),r.z+r.uz*offset+r.nz*(start+length))+.06;
    const atGrade=b.appearance.entranceAtGrade,top = atGrade ? groundSurfaceHeight(r.x+r.nx*.2,r.z+r.nz*.2)+.03 : Math.max(base + (b.appearance.entranceRise || 0.5), bottom + (b.appearance.entranceRamp ? 0.12 : 0.42)), count = Math.max(3, Math.ceil((top - bottom) / 0.16));
    const landing = { x:r.x+r.ux*offset, z:r.z+r.uz*offset, ux:r.ux, uz:r.uz, nx:r.nx, nz:r.nz, offset, width:r.stairWidth || 6.4, ramp:!!b.appearance.entranceRamp, start:atGrade?0:start, length:atGrade?0:length, bottom:atGrade?top:bottom, top, count };
    const result = { ...r, base, yaw, labelYaw:Math.atan2(r.nx,r.nz), landing };
    dormitoryLayouts.set(b, result); return result;
  }

  function dormitoryClassical(group, b, base) {
    if(b.appearance.entranceStyle==='pilastered'){pilasteredDormitory(group,b,base);return;}
    const a=b.appearance, f=dormitoryLayout(b), cream=plainMaterial(a.wallColour), ochre=plainMaterial(a.groundColour), trim=plainMaterial(a.trimColour);
    const floor=plainMaterial(a.plinthColour), door=plainMaterial(0x745748), floors=b.levels||4;
    for (const v of b.openingVolumes||[b]) for (const [low,high,material] of [[-5,0.65,floor],[0.65,f.bottom,ochre],[f.bottom,b.h,cream]]) {
      const bottom=Math.max(v.minHeight,low), top=Math.min(v.h,high);
      if (top>bottom) volume(group,b,base,material,{ring:v.ring,holes:v.holes,minHeight:bottom,height:top-bottom});
    }
    for (const face of faces(b)) {
      if (face.length<2.7) continue;
      const corner=Math.hypot(face.x-f.x,face.z-f.z)<0.2;
      for (const y of [f.bottom-0.12,f.bottom+0.1,b.h-0.85,b.h-0.58,b.h-0.08]) panel(group,face,0,base+y,face.length+0.15,0.16,0.3,0.08,trim);
      for (let y=1;y<f.bottom-0.2;y+=0.55) panel(group,face,0,base+y,face.length,0.025,0.035,0.02,stone);
      if (corner) continue;
      const count=Math.max(1,Math.round(face.length/(a.bayWidth||3.3))), bay=face.length/count;
      const streetBalconies=face.nx>0.8 && face.length>16;
      for (let i=0;i<count;i++) {
        const u=(i+0.5)*bay-face.length/2;
        windowBay(group,face,u,base+1.8,Math.min(1.25,bay*0.45),1.45,false,trim);
        for (let row=0;row<floors-1;row++) {
          const pitch=(f.top-f.bottom)/(floors-1), y=f.bottom+(row+0.5)*pitch, h=Math.min(1.65,pitch*0.7);
          windowBay(group,face,u,base+y,Math.min(1.3,bay*0.45),h,false,trim);
          if (streetBalconies && i%3===1) {
            const level=base+y-h/2-0.13;
            panel(group,face,u,level,1.9,0.12,0.9,0.42,trim);
            panel(group,face,u,level+0.42,1.9,0.75,0.1,0.84,cream);
            for (const side of [-1,1]) panel(group,face,u+side*0.9,level+0.42,0.1,0.75,0.85,0.42,cream);
            panel(group,face,u,level+0.82,1.95,0.06,0.12,0.84,trim);
          }
        }
      }
    }
    const rear={x:f.x-f.nx*f.depth,z:f.z-f.nz*f.depth,ux:f.ux,uz:f.uz,nx:f.nx,nz:f.nz,yaw:f.yaw};
    for(let row=0;row<floors-1;row++){
      const pitch=(f.top-f.bottom)/(floors-1),y=base+f.bottom+(row+0.5)*pitch;
      windowBay(group,rear,0,y,2.45,Math.min(1.9,pitch*0.79),false,trim);
      panel(group,rear,0,y+1.08,2.85,0.15,0.22,0.1,trim);
    }
    for(const u of [-2.7,2.7]) ionicColumn(group,f.x+f.ux*u,base+f.bottom,f.z+f.uz*u,f.top-f.bottom,f.yaw);
    panel(group,f,0,base+f.top+0.1,7.25,0.25,1.55,-0.55,trim);
    panel(group,f,0,f.landing.top+1.1,1.85,2.2,0.08,0.14,door);
    for(const u of [-1.02,1.02])panel(group,f,u,f.landing.top+1.1,0.12,2.35,0.15,0.16,trim);
    panel(group,f,0,f.landing.top+2.25,2.2,0.15,0.2,0.16,trim);
    panel(group,f,0,base+f.bottom-0.15,3.5,0.18,1.2,0.45,trim);
    label(group,'КАИ',f.x+f.nx*0.2,base+b.h-0.42,f.z+f.nz*0.2,2.35,0.42,f.labelYaw,'#71889a');
    const l=f.landing, ground=groundSurfaceHeight(f.x+f.nx*l.start/2,f.z+f.nz*l.start/2), height=Math.max(0.1,l.top-ground+0.12);
    panel(group,f,0,l.top-height/2,l.width,height,l.start,l.start/2,floor);
    for(let i=0;i<l.count;i++){
      const d=l.start+(i+0.5)*l.length/l.count,y=l.top-(i+1)*(l.top-l.bottom)/l.count;
      const foot=groundSurfaceHeight(f.x+f.nx*d,f.z+f.nz*d),h=Math.max(0.08,y-foot+0.12);
      panel(group,f,0,y-h/2,l.width,h,l.length/l.count+0.008,d,floor);
    }
  }

  function pilasteredDormitory(group,b,base) {
    const a=b.appearance,f=dormitoryLayout(b),wall=plainMaterial(a.wallColour),warm=plainMaterial(a.groundColour),trim=plainMaterial(a.trimColour),plinth=plainMaterial(a.plinthColour),cap=plainMaterial(b.roofColour);
    const eaves=b.h-b.roofHeight,lower=a.lowerHeight,pitch=(eaves-lower)/(b.levels-2),boundaries=faces(b);
    for(const [low,high,material] of [[-5,.65,plinth],[.65,lower,warm],[lower,eaves,wall]])volume(group,b,base,material,{minHeight:low,height:high-low});
    pitchedRoof(group,b,base,b.roofHeight,cap);
    for(const face of boundaries){
      if(face.length<3)continue;
      const street=face.nx*f.nx+face.nz*f.nz>.95,count=Math.max(1,Math.round(face.length/a.bayWidth)),bay=face.length/count;
      for(const y of [lower-.15,lower+.1,eaves-.5,eaves-.18])panel(group,face,0,base+y,face.length+.2,.16,.35,.1,trim);
      if(street)for(let y=1;y<lower-.3;y+=.6)panel(group,face,0,base+y,face.length,.025,.04,.025,stone);
      for(let i=0;i<count;i++){
        const u=(i+.5)*bay-face.length/2,x=face.x+face.ux*u,z=face.z+face.uz*u,entryU=(x-f.x)*f.ux+(z-f.z)*f.uz;
        for(let row=0;row<b.levels;row++){
          if(street&&row<2&&Math.abs(entryU)<6.4)continue;
          const y=row<2?(row+.5)*lower/2:lower+(row-1.5)*pitch;
          windowBay(group,face,u,base+y,Math.min(1.55,bay*.52),row<2?1.85:1.65,false,trim);
        }
      }
      if(street)for(const u of [-face.length/2+.75,face.length/2-.75]){
        panel(group,face,u,base+(lower+eaves)/2,.48,eaves-lower-.35,.25,.14,trim);
        panel(group,face,u,base+eaves-.48,.85,.22,.38,.18,trim);
      }
    }
    const ground=f.landing.top,door=plainMaterial(0x65483d);
    panel(group,f,0,ground+1.55,2.2,3.1,.1,.16,door);
    for(const u of [-1.22,1.22])panel(group,f,u,ground+1.63,.24,3.3,.25,.2,trim);
    panel(group,f,0,ground+3.32,2.7,.2,.32,.2,trim);
    panel(group,f,0,ground+3.65,3.35,.48,.2,.18,trim);
    label(group,'КАИ',f.x+f.nx*.32,ground+3.66,f.z+f.nz*.32,1.7,.36,f.labelYaw,'#a39c77');
    for(const u of [-3.9,3.9])for(let row=0;row<2;row++){
      windowBay(group,f,u,base+(row+.5)*lower/2,1.7,1.9,false,trim);
      if(!row){panel(group,f,u,base+lower/2,1.9,.9,.1,.08,trim);panel(group,f,u,base+lower/2,1.5,.65,.11,.1,warm);}
    }
    for(const u of [-1.1,1.1])windowBay(group,f,u,base+lower*.76,1.55,1.85,false,trim);
    panel(group,f,0,base+lower*.78,.52,2.15,.16,.19,trim);
    for(const u of [-5.4,-2.4,2.4,5.4]){
      panel(group,f,u,base+lower/2,.68,lower-.7,.3,.17,trim);
      panel(group,f,u,base+lower/2,.43,lower-.9,.08,.35,warm);
      for(const [y,width,height,depth] of [[.3,.95,.6,.65],[.68,.8,.18,.5],[lower-.48,.95,.18,.5],[lower-.26,1.1,.18,.62]])panel(group,f,u,base+y,width,height,depth,.2,trim);
    }
  }

  function dormitoryTerraces(group, b, base) {
    const a=b.appearance,f=dormitoryLayout(b),wall=plainMaterial(a.wallColour),trim=plainMaterial(a.trimColour),plinth=plainMaterial(a.plinthColour),cap=plainMaterial(b.roofColour);
    const eaves=b.h-b.roofHeight,ground=3.4,pitch=(eaves-ground)/3;
    for(const v of b.openingVolumes||[b])for(const [low,high,material] of [[-5,.65,plinth],[.65,ground,plainMaterial(a.groundColour)],[ground,eaves,wall]]){
      const bottom=Math.max(low,v.minHeight),top=Math.min(high,v.h);
      if(top>bottom)volume(group,b,base,material,{ring:v.ring,holes:v.holes,minHeight:bottom,height:top-bottom});
    }
    pitchedRoof(group,b,base,b.roofHeight,cap);
    for(const face of faces(b)){
      if(face.length<3)continue;
      const portico=face.index>=f.face&&face.index<=(f.lastFace??f.face),count=Math.max(1,Math.round(face.length/3.5)),bay=face.length/count;
      for(const y of [ground-.15,ground+.12,eaves-.55,eaves-.2])panel(group,face,0,base+y,face.length+.2,.15,.38,.1,trim);
      for(let y=1;y<ground-.3;y+=.55)panel(group,face,0,base+y,face.length,.025,.04,.025,stone);
      if(portico)continue;
      for(let i=0;i<count;i++){
        const u=(i+.5)*bay-face.length/2;
        for(let row=0;row<4;row++)windowBay(group,face,u,base+(row?ground+(row-.5)*pitch:1.9),Math.min(1.35,bay*.48),row===3?2.15:1.8,false,trim);
        if(face.length>10&&i%3===1){
          const y=base+ground+2*pitch;
          windowBay(group,face,u,y+1.25,1.25,2.5,false,trim);
          panel(group,face,u,y,2.05,.15,1.05,.52,trim);
          panel(group,face,u,y+.85,2.05,.055,.07,1.0,metal);
          for(let k=0;k<9;k++)panel(group,face,u+(k-4)*.23,y+.43,.035,.84,.035,1,metal);
          for(const side of [-1,1])panel(group,face,u+side*1,y+.43,.04,.84,1,.5,metal);
        }
        if(face.length>10){
          const disc=new THREE.CylinderGeometry(.46,.46,.08,16);disc.rotateX(Math.PI/2);disc.rotateY(face.labelYaw);
          solid(group,disc,trim,face.x+face.ux*(u+bay*.45)+face.nx*.08,base+ground+2*pitch-.18,face.z+face.uz*(u+bay*.45)+face.nz*.08);
        }
      }
    }
    const rear={x:f.x-f.nx*f.depth,z:f.z-f.nz*f.depth,ux:f.ux,uz:f.uz,nx:f.nx,nz:f.nz,yaw:f.yaw};
    for(let row=0;row<4;row++)for(const u of [-4.5,-1.5,1.5,4.5])windowBay(group,row===0?f:rear,u,base+(row?ground+(row-.5)*pitch:1.9),1.25,row===3?2.15:1.8,false,trim);
    const middle=f.middle;
    for(const y of [f.bottom,middle]){
      panel(group,f,0,base+y-.06,f.width+.5,.24,f.depth,-f.depth/2,trim);
      for(let i=0;i<29;i++)panel(group,f,(i-14)*(f.width-.7)/28,base+y+.55,.08,.9,.1,.16,y===f.bottom?trim:metal);
      panel(group,f,0,base+y+1.02,f.width,.1,.18,.16,trim);
    }
    for(const u of [-6.7,6.7])panel(group,f,u,base+(f.bottom+middle)/2,1.15,middle-f.bottom,.9,0,trim);
    for(const u of [-6.7,-2.25,2.25,6.7])ionicColumn(group,f.x+f.ux*u,base+middle,f.z+f.uz*u,f.top-middle,f.yaw);
    panel(group,f,0,base+f.top+.05,f.width+.7,.26,f.depth+.3,-f.depth/2,trim);
    const crown=new THREE.Shape([new THREE.Vector2(-7.8,0),new THREE.Vector2(-3.6,1.1),new THREE.Vector2(3.6,1.1),new THREE.Vector2(7.8,0)]);
    const crownGeometry=new THREE.ExtrudeGeometry(crown,{depth:f.depth+.2,bevelEnabled:false});crownGeometry.rotateY(f.labelYaw);
    solid(group,crownGeometry,trim,rear.x,base+f.top,rear.z);
    panel(group,f,0,base+f.top+1.12,7.3,.08,f.depth+.3,-f.depth/2,cap);
    const arch=new THREE.TorusGeometry(2.6,.1,6,32,Math.PI);arch.rotateY(f.labelYaw);
    solid(group,arch,trim,rear.x+f.nx*.12,base+f.top-2.8,rear.z+f.nz*.12);
    panel(group,f,0,f.landing.top+1.1,1.75,2.2,.1,.2,plainMaterial(0x305345));
    panel(group,f,0,f.landing.top+2.5,3.2,.16,1.5,.65,trim);
    label(group,'КАИ',f.x+f.nx*.32,base+ground-.2,f.z+f.nz*.32,2,.4,f.labelYaw,'#71889a');
    const l=f.landing,h=Math.max(.1,l.top-groundSurfaceHeight(f.x+f.nx*l.start/2,f.z+f.nz*l.start/2)+.12);
    panel(group,f,0,l.top-h/2,l.width,h,l.start,l.start/2,plinth);
    for(let i=0;i<l.count;i++){
      const d=l.start+(i+.5)*l.length/l.count,y=l.top-(i+1)*(l.top-l.bottom)/l.count,depth=Math.max(.08,y-groundSurfaceHeight(f.x+f.nx*d,f.z+f.nz*d)+.12);
      panel(group,f,0,y-depth/2,l.width,depth,l.length/l.count+.008,d,plinth);
    }
  }

  function brickDormitory(group,b,base) {
    if(b.appearance.entranceStyle==='gallery'){galleryDormitory(group,b,base);return;}
    const a=b.appearance,f=dormitoryLayout(b),trim=plainMaterial(a.trimColour),plinth=plainMaterial(a.plinthColour),brick=createObservedFacadeMaterial(a),ochre=a.groundMasonry?brick:plainMaterial(a.groundColour),cap=plainMaterial(b.roofColour);
    const eaves=b.h-b.roofHeight,ground=3.1,pitch=(eaves-ground)/(b.levels-1),boundaries=faces(b),front=boundaries.find(p=>p.index===f.face);
    for(const v of b.openingVolumes||[{ring:b.ring,holes:b.holes,minHeight:-5,h:b.h}])for(const [low,high,material] of [[-5,.6,plinth],[.6,ground,ochre],[ground,eaves,brick]]){
      const bottom=Math.max(v.minHeight,low),top=Math.min(high,v.h);
      if(top>bottom)volume(group,b,base,material,{ring:v.ring,holes:v.holes,minHeight:bottom,height:top-bottom});
    }
    const upper=b.openingVolumes?.find(v=>v.minHeight<eaves&&v.h>=eaves)||b;
    pitchedRoof(group,{ring:upper.ring,holes:upper.holes,h:b.h,roofShape:b.roofShape},base,b.roofHeight,cap);
    const tiers=b.facadeRecess?.fullFace?[{boundaries,first:0,last:0},{boundaries:faces(b,upper.ring),first:1,last:b.levels-1}]:[{boundaries,first:0,last:b.levels-1}];
    for(const tier of tiers)for(const face of tier.boundaries){
      if(face.length<4)continue;
      const count=Math.max(1,Math.round(face.length/a.bayWidth)),bay=face.length/count;
      if(tier.last===b.levels-1)panel(group,face,0,base+eaves-.08,face.length+.25,.16,.45,.05,cap);
      for(let i=0;i<count;i++){
        const u=(i+.5)*bay-face.length/2;
        for(let row=tier.first;row<=tier.last;row++){
          if(!row&&face.index===front.index&&(a.entranceStyle==='vestibule'||Math.abs(u-a.entranceOffset)<1.6||Math.abs(u-a.entranceOffset-a.sideEntranceU)<1.2))continue;
          windowBay(group,face,u,base+(row?ground+(row-.5)*pitch:1.8),Math.min(a.windowWidth||2.15,bay*.56),1.5,false,trim,a.windowDivisions||3);
          if(a.balconyStacks&&row&&face.length>18&&i%4===1){
            const floor=base+ground+(row-1)*pitch,balcony=plainMaterial(a.balconyColour||0xaeb8b2);
            windowBay(group,face,u,floor+1.15,1.2,2.3,false,trim,2);
            panel(group,face,u,floor,2,.14,1,.5,trim);
            panel(group,face,u,floor+.48,2,.95,.1,.96,balcony);
            for(const side of [-1,1])panel(group,face,u+side*.96,floor+.48,.08,.95,.95,.5,balcony);
            panel(group,face,u,floor+.98,2.05,.06,.13,.96,trim);
          }
        }
      }
    }
    if(a.entranceStyle==='vestibule'){flatDormitoryEntry(group,b,f,base,cap);return;}
    const l=f.landing,door=plainMaterial(0x40383b);
    panel(group,f,0,l.top+1.05,1.45,2.1,.1,.18,door);
    for(const u of [-1.4,1.4]){
      panel(group,f,u,l.top+.55,.45,1.1,.5,1.1,ochre);
      panel(group,f,u,l.top+1.7,.08,1.2,.08,1.1,trim);
    }
    const triangle=new THREE.Shape([new THREE.Vector2(-1.8,0),new THREE.Vector2(1.8,0),new THREE.Vector2(0,.8)]);
    const canopy=new THREE.ExtrudeGeometry(triangle,{depth:1.8,bevelEnabled:false});canopy.rotateY(f.labelYaw);canopy.translate(f.x,l.top+2.3,f.z);splitExtrusion(group,canopy,trim,cap);
    label(group,'КАИ 3',f.x+f.nx*1.82,l.top+2.62,f.z+f.nz*1.82,1.35,.3,f.labelYaw,'#537f7b');
    if(Number.isFinite(a.sideEntranceU)){
      const side=a.sideEntranceU,y=groundSurfaceHeight(f.x+f.ux*side,f.z+f.uz*side);
      panel(group,f,side,y+1.05,1.3,2.1,.1,.15,trim);
      panel(group,f,side,y+2.35,2,.12,1.35,.65,cap);
      for(const u of [-.85,.85])panel(group,f,side+u,y+1.15,.06,2.3,.06,1.2,trim);
    }
    const h=Math.max(.1,l.top-groundSurfaceHeight(f.x+f.nx*l.start/2,f.z+f.nz*l.start/2)+.12);
    panel(group,f,0,l.top-h/2,l.width,h,l.start,l.start/2,plinth);
    for(let i=0;i<l.count;i++){
      const d=l.start+(i+.5)*l.length/l.count,y=l.top-(i+1)*(l.top-l.bottom)/l.count,h=Math.max(.08,y-groundSurfaceHeight(f.x+f.nx*d,f.z+f.nz*d)+.12);
      panel(group,f,0,y-h/2,l.width,h,l.length/l.count+.008,d,plinth);
    }
  }

  function galleryDormitory(group,b,base) {
    const a=b.appearance,f=dormitoryLayout(b),trim=plainMaterial(a.trimColour),plinth=plainMaterial(a.plinthColour),steel=plainMaterial(0xa8afad),ground=a.groundHeight,pitch=(b.h-ground)/(b.levels-1);
    volume(group,b,base,plinth,{minHeight:-5,height:5.55});
    volume(group,b,base,createObservedFacadeMaterial(a),{minHeight:.55,height:b.h-.55});
    for(const face of faces(b)){
      if(face.length<3||face.index===f.face&&face.index!==a.narrowFace)continue;
      const narrow=face.index===a.narrowFace,count=narrow?1:Math.max(1,Math.round(face.length/a.bayWidth)),bay=face.length/count;
      panel(group,face,0,base+b.h-.12,face.length+.1,.18,.25,.04,trim);
      for(let i=0;i<count;i++)for(let row=0;row<b.levels;row++){
        const u=narrow?a.narrowOffset:(i+.5)*bay-face.length/2,y=row?ground+(row-.5)*pitch:1.8;
        windowBay(group,face,u,base+y,narrow ? .85 : Math.min(1.8,bay*.55),row?1.5:1.6,false,trim,narrow?2:3);
      }
    }
    const l=f.landing,door=plainMaterial(0x503a32),width=a.galleryWidth||f.length+.35;
    const vestibule=a.entryVestibule;
    if(vestibule){
      panel(group,f,vestibule.offset,base+vestibule.height/2,vestibule.width,vestibule.height,vestibule.depth,vestibule.depth/2,plainMaterial(a.groundColour));
      panel(group,f,vestibule.offset,base+vestibule.height+.08,vestibule.width+.45,.16,vestibule.depth+.5,vestibule.depth/2,steel);
    }else panel(group,f,0,base+ground/2,width-.15,ground,.08,.03,plainMaterial(a.groundColour));
    for(const entry of a.entryDoors||[-1.75,0,1.75].map(u=>({u,width:1.2,projection:.14})))panel(group,f,entry.u,l.top+1.05,entry.width,2.1,.1,entry.projection,entry.colour?plainMaterial(entry.colour):door);
    const labelU=a.entranceLabelOffset||0;
    label(group,a.entranceLabel||'КАИ',f.x+f.nx*.24+f.ux*labelU,l.top+2.25,f.z+f.nz*.24+f.uz*labelU,1.1,.25,f.labelYaw,'#71889a');
    for(let row=1;row<b.levels;row++){
      const floor=base+ground+(row-1)*pitch;
      panel(group,f,0,floor-.075,width,.15,1.8,.8,steel);
      for(const u of [-1.45,1.45])windowBay(group,f,u,floor+1.15,1.25,2.3,false,trim);
      panel(group,f,0,floor+1.02,width,.06,.08,1.6,steel);
      if(a.galleryRails==='horizontal'){
        for(const y of [.25,.5,.75])panel(group,f,0,floor+y,width,.04,.04,1.6,trim);
        for(const u of [-width/2,0,width/2])panel(group,f,u,floor+.5,.05,1,.05,1.6,trim);
      }else{
        panel(group,f,.45,floor+.52,2,.9,.06,1.6,steel);
        const bars=Math.ceil(width/.28);
        for(let i=0;i<=bars;i++){
          const u=-width/2+i*width/bars;
          if(u>-.55&&u<1.45)continue;
          panel(group,f,u,floor+.5,.035,.95,.035,1.6,steel);
        }
      }
    }
    const h=Math.max(.1,l.top-stairGroundMinimum(l,l.start/2)+.12);
    panel(group,f,l.offset,l.top-h/2,l.width,h,l.start,l.start/2,granite);
    for(let i=0;i<l.count;i++){
      const d=l.start+(i+.5)*l.length/l.count,y=l.top-(i+1)*(l.top-l.bottom)/l.count,depth=Math.max(.08,y-stairGroundMinimum(l,d)+.12);
      panel(group,f,l.offset,y-depth/2,l.width,depth,l.length/l.count+.008,d,granite);
    }
  }

  function stairGroundMinimum(l,d) {
    return Math.min(...[-.5,-.25,0,.25,.5].map(u=>groundSurfaceHeight(l.x+l.ux*l.width*u+l.nx*d,l.z+l.uz*l.width*u+l.nz*d)));
  }

  function glazedDormitory(group,b,base) {
    const a=b.appearance,f=dormitoryLayout(b),wall=createObservedFacadeMaterial(a),trim=plainMaterial(a.trimColour),pane=plainMaterial(a.glassColour,.28),mullion=plainMaterial(a.mullionColour),portal=plainMaterial(a.portalColour);
    const eaves=b.h-a.crownHeight,pitch=(eaves-.6)/b.levels,boundaries=faces(b);
    for(const v of b.openingVolumes)for(const [low,high,material] of [[-5,.6,granite],[.6,eaves,wall],[b.h-.3,b.h,wall]]){
      const bottom=Math.max(low,v.minHeight),top=Math.min(high,v.h);
      if(top>bottom)volume(group,b,base,material,{ring:v.ring,holes:v.holes,minHeight:bottom,height:top-bottom});
    }
    for(const face of boundaries){
      const end=a.endFaces.includes(face.index),count=Math.max(1,Math.round(face.length/a.bayWidth)),bay=face.length/count;
      if(end){panel(group,face,0,base+(eaves+b.h-.3)/2,face.length,b.h-.3-eaves,.35,.05,trim);continue;}
      for(let i=0;i<count;i++){
        const u=(i+.5)*bay-face.length/2,w=bay*.5;
        if(face.index===f.face&&Math.abs(u)<f.width/2+w/2)continue;
        panel(group,face,u,base+(eaves+.6)/2,w,eaves-.6,.08,.06,pane);
        for(const side of [-1,1])panel(group,face,u+side*(w/2+.12),base+(eaves+.6)/2,.16,eaves-.6,.22,.08,trim);
        panel(group,face,u,base+(eaves+.6)/2,.045,eaves-.6,.1,.12,mullion);
        for(let row=0;row<=b.levels;row++)panel(group,face,u,base+.6+row*pitch,w,.045,.1,.12,mullion);
      }
      for(let i=0;i<=count;i++){
        const u=i*bay-face.length/2;
        if(face.index===f.face&&Math.abs(u)<=f.width/2)continue;
        const width=face.index===f.face?Math.min(bay*.58,2*(Math.abs(u)-f.width/2)):bay*.58;
        panel(group,face,u,base+(eaves+b.h-.3)/2,width,b.h-.3-eaves,.4,.06,trim);
      }
      for(const row of [5,11]){
        if(face.index===f.face)continue;
        panel(group,face,0,base+.6+row*pitch,face.length,.16,.2,.08,trim);
      }
    }
    const rear={...f,x:f.x-f.nx*f.depth,z:f.z-f.nz*f.depth};
    panel(group,rear,0,base+(b.h-.3+.05)/2,f.width,b.h-.35,.08,.06,pane);
    for(let i=0;i<=4;i++)panel(group,rear,(i-2)*f.width/4,base+(b.h-.3)/2,.06,b.h-.3,.1,.13,mullion);
    for(let row=0;row<=b.levels;row++)panel(group,rear,0,base+.6+row*pitch,f.width,.05,.1,.13,mullion);
    const floor=groundSurfaceHeight(rear.x+f.nx*.2,rear.z+f.nz*.2)+.03;
    panel(group,rear,0,floor+1.3,2.6,2.6,.1,.2,plainMaterial(0x293d49));
    panel(group,rear,0,floor+1.3,.06,2.6,.12,.27,mullion);
    const canopyDepth=f.depth+.8,canopyCentre=(.8-f.depth)/2;
    panel(group,f,0,base+3.35,f.width+1.2,.2,canopyDepth,canopyCentre,portal);
    for(const u of [-f.width/2-.45,f.width/2+.45]){
      const y=groundSurfaceHeight(f.x+f.ux*u+f.nx*.55,f.z+f.uz*u+f.nz*.55),h=base+3.25-y;
      panel(group,f,u,y+h/2,.24,h,.24,.55,portal);
    }
    label(group,'КАИ · ДОМ СТУДЕНТА',f.x+f.nx*.94,base+3.35,f.z+f.nz*.94,4.8,.28,f.labelYaw,'#e1e3dc');
    const end=boundaries.find(face=>face.index===a.galleryEndFace),width=end.length-.15;
    for(let row=0;row<b.levels;row++){
      const y=base+.6+row*pitch;
      panel(group,end,0,y-.075,width,.15,1.5,.55,trim);
      windowBay(group,end,0,y+1.15,1.45,2.3,false,trim);
      panel(group,end,0,y+1,width,.06,.08,1.25,trim);
      for(let i=0,n=Math.ceil(width/.3);i<=n;i++)panel(group,end,(i/n-.5)*width,y+.5,.035,.94,.035,1.25,trim);
    }
    entranceWalk(group,b,f);
  }

  function entranceWalk(group,b,f) {
    const a=b.appearance;if(!a.entranceFootway)return;
    const via={x:f.x+f.nx*1.1,z:f.z+f.nz*1.1},start={x:f.x-f.nx*(f.depth-.25),z:f.z-f.nz*(f.depth-.25)};
    let target,distance=Infinity;
    for(const road of ROADS)if(road.id===a.entranceFootway&&road.walk)for(let i=1;i<road.pts.length;i++){
      const p=road.pts[i-1],q=road.pts[i],dx=q.x-p.x,dz=q.z-p.z,t=Math.max(0,Math.min(1,((via.x-p.x)*dx+(via.z-p.z)*dz)/(dx*dx+dz*dz||1))),x=p.x+t*dx,z=p.z+t*dz,d=Math.hypot(x-via.x,z-via.z);
      if(d<distance){distance=d;target={x,z};}
    }
    if(!target)throw new Error(`Missing entrance footway ${a.entranceFootway}`);
    const points=[start,via,target],positions=[],uvs=[],indices=[];
    for(let i=1;i<points.length;i++){
      const p=points[i-1],q=points[i],dx=q.x-p.x,dz=q.z-p.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length,count=Math.max(1,Math.ceil(length/2));
      for(let j=0;j<=(i===points.length-1?count:count-1);j++)for(const side of [-1,1]){
        const t=j/count,x=p.x+t*dx+nx*side*a.entranceWalkWidth/2,z=p.z+t*dz+nz*side*a.entranceWalkWidth/2;
        positions.push(x,groundSurfaceHeight(x,z)+.025,z);uvs.push((side+1)/2,i-1+t);
      }
    }
    for(let i=0;i<positions.length/3-2;i+=2)indices.push(i,i+1,i+2,i+1,i+3,i+2);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    emit(group,geometry,plainMaterial(0xa6ada7));
  }

  function flatDormitoryEntry(group,b,f,base,cap) {
    const l=f.landing,door=plainMaterial(0x584239),steel=plainMaterial(0x858b83),concrete=plainMaterial(0x95988f);
    for(const u of [-2.25,2.25])panel(group,f,u,l.top+1.05,1.55,2.1,.1,.18,door);
    panel(group,f,0,base+2.8,f.length+.5,.12,1.8,.7,cap);
    panel(group,f,0,base+2.75,f.length+.6,.12,.12,1.55,steel);
    label(group,'КАИ 4',f.x+f.nx*.2,l.top+1.7,f.z+f.nz*.2,1,.35,f.labelYaw,'#71889a');
    const h=Math.max(.1,l.top-groundSurfaceHeight(f.x+f.nx*l.start/2,f.z+f.nz*l.start/2)+.12);
    panel(group,f,0,l.top-h/2,l.width,h,l.start,l.start/2,concrete);
    const points=[];
    for(const [u,d,y] of [[-l.width/2,l.start,l.top],[l.width/2,l.start,l.top],[-l.width/2,l.start+l.length,l.bottom],[l.width/2,l.start+l.length,l.bottom]])points.push(f.x+f.ux*u+f.nx*d,y,f.z+f.uz*u+f.nz*d);
    for(let i=0;i<12;i+=3)points.push(points[i],Math.min(points[i+1]-.1,groundSurfaceHeight(points[i],points[i+2])-.12),points[i+2]);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1,0,0,1,0,0,1,1,1],2));
    let indices=[0,1,2,2,1,3,4,6,5,6,7,5,0,4,1,1,4,5,2,3,6,6,3,7,0,2,4,4,2,6,1,5,3,3,5,7];
    geometry.setIndex(indices);geometry.computeVertexNormals();
    if(geometry.attributes.normal.getY(0)<0){indices=indices.flatMap((v,i)=>i%3?[]:[v,indices[i+2],indices[i+1]]);geometry.setIndex(indices);geometry.computeVertexNormals();}
    emit(group,geometry,concrete);
    for(const side of [-1,1]){
      const u=side*(l.width/2-.12);
      for(const d of [l.start,l.start+l.length/2,l.start+l.length]){
        const y=l.top-Math.max(0,(d-l.start)/l.length)*(l.top-l.bottom);
        panel(group,f,u,y+.45,.05,.9,.05,d,steel);
      }
      const rail=new THREE.BoxGeometry(.055,.055,Math.hypot(l.length,l.top-l.bottom));rail.rotateX(Math.atan2(l.top-l.bottom,l.length));rail.rotateY(f.labelYaw);
      solid(group,rail,steel,f.x+f.ux*u+f.nx*(l.start+l.length/2),(l.top+l.bottom)/2+.9,f.z+f.uz*u+f.nz*(l.start+l.length/2));
    }
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
    if(!accessLayouts)accessLayouts=[...(ribbonBuilding?[{...ribbonLayout(ribbonBuilding),width:9.6}]:[]),...(airplaneBuilding?[airplaneLayout(airplaneBuilding)]:[]),...(brickBuilding?[brickLayout(brickBuilding)]:[]),...(galleryBuilding?[galleryLayout(galleryBuilding).landing,...galleryLayout(galleryBuilding).flights]:[]),...(tiledBuilding?[tiledLayout(tiledBuilding)]:[]),...dormitoryBuildings.map(b=>dormitoryLayout(b).landing)];
    for(const f of accessLayouts){
      const dx=x-f.x,dz=z-f.z,d=dx*f.nx+dz*f.nz,u=dx*f.ux+dz*f.uz;
      if(Math.abs(u)>f.width/2||d<0||d>f.start+f.length)continue;
      const step=!f.length||d<f.start?0:Math.min(f.count,Math.floor((d-f.start)*f.count/f.length)+1),candidate=f.ramp?f.top-Math.max(0,Math.min(1,(d-f.start)/f.length))*(f.top-f.bottom):f.top-step*(f.top-f.bottom)/f.count;
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
    if(b.model==='dormitory-glazed'){
      const f=dormitoryLayout(b),base=f.base,shapes=[...b.openingVolumes],canopyDepth=f.depth+.8,canopyCentre=(.8-f.depth)/2;
      shapes.push({...b,ring:campusRectangle(f,0,canopyCentre,f.width+1.2,canopyDepth),holes:[],minHeight:3.25,h:3.45});
      for(const u of [-f.width/2-.45,f.width/2+.45])shapes.push({...b,ring:campusRectangle(f,u,.55,.24,.24),holes:[],minHeight:groundSurfaceHeight(f.x+f.ux*u+f.nx*.55,f.z+f.uz*u+f.nz*.55)-base,h:3.25});
      const end=faces(b).find(face=>face.index===b.appearance.galleryEndFace),width=end.length-.15,pitch=(b.h-b.appearance.crownHeight-.6)/b.levels;
      for(let row=0;row<b.levels;row++){
        const y=.6+row*pitch;
        shapes.push({...b,ring:campusRectangle(end,0,.55,width,1.5),holes:[],minHeight:y-.15,h:y});
        shapes.push({...b,ring:campusRectangle(end,0,1.25,width,.08),holes:[],minHeight:y,h:y+1.03});
      }
      return shapes;
    }
    if(b.model==='dormitory-brick'){
      const f=dormitoryLayout(b),y=f.landing.top-f.base,shapes=[...(b.openingVolumes||[{...b,minHeight:b.minHeight||-5}])];
      if(b.appearance.entranceStyle==='gallery'){
        const ground=b.appearance.groundHeight,pitch=(b.h-ground)/(b.levels-1),width=b.appearance.galleryWidth||f.length+.35;
        const vestibule=b.appearance.entryVestibule;
        if(vestibule){
          shapes.push({...b,ring:campusRectangle(f,vestibule.offset,vestibule.depth/2,vestibule.width,vestibule.depth),holes:[],minHeight:0,h:vestibule.height});
          shapes.push({...b,ring:campusRectangle(f,vestibule.offset,vestibule.depth/2,vestibule.width+.45,vestibule.depth+.5),holes:[],minHeight:vestibule.height,h:vestibule.height+.16});
        }
        for(let row=1;row<b.levels;row++){
          const floor=ground+(row-1)*pitch;
          shapes.push({...b,ring:campusRectangle(f,0,.8,width,1.8),holes:[],minHeight:floor-.15,h:floor});
          shapes.push({...b,ring:campusRectangle(f,0,1.6,width,.08),holes:[],minHeight:floor,h:floor+1.05});
        }
        return shapes;
      }
      if(b.appearance.entranceStyle==='vestibule'){
        shapes.push({...b,ring:campusRectangle(f,0,.7,f.length+.5,1.8),holes:[],minHeight:2.74,h:2.86});
        const l=f.landing;for(const side of [-1,1])shapes.push({...b,ring:campusRectangle(f,side*(l.width/2-.12),l.start+l.length/2,.08,l.length),holes:[],minHeight:Math.min(l.top,l.bottom)-f.base,h:Math.max(l.top,l.bottom)-f.base+.95});
        return shapes;
      }
      for(const u of [-1.4,1.4]){
        shapes.push({...b,ring:campusRectangle(f,u,1.1,.45,.5),holes:[],minHeight:y,h:y+1.1});
        shapes.push({...b,ring:campusRectangle(f,u,1.1,.1,.1),holes:[],minHeight:y+1.1,h:y+2.3});
      }
      shapes.push({...b,ring:campusRectangle(f,0,.9,3.6,1.8),holes:[],minHeight:y+2.3,h:y+3.1});
      if(Number.isFinite(b.appearance.sideEntranceU)){
        const side=b.appearance.sideEntranceU,ground=groundSurfaceHeight(f.x+f.ux*side,f.z+f.uz*side)-f.base;
        for(const u of [-.85,.85])shapes.push({...b,ring:campusRectangle(f,side+u,1.2,.1,.1),holes:[],minHeight:ground,h:ground+2.3});
        shapes.push({...b,ring:campusRectangle(f,side,.65,2,1.35),holes:[],minHeight:ground+2.29,h:ground+2.41});
      }
      return shapes;
    }
    if(['kai-dormitory-classical','kai-dormitory-terraces'].includes(b.model)){
      const f=dormitoryLayout(b),shapes=[...(b.openingVolumes||[b])];
      if(b.appearance.entranceStyle==='pilastered'){
        for(const u of [-5.4,-2.4,2.4,5.4])shapes.push({...b,ring:campusRectangle(f,u,.2,1,.7),holes:[],minHeight:0,h:b.appearance.lowerHeight});
        return shapes;
      }
      if(b.model==='kai-dormitory-terraces'){
        for(const [bottom,top,positions] of [[f.bottom,f.middle,[-6.7,6.7]],[f.middle,f.top,[-6.7,-2.25,2.25,6.7]]])for(const u of positions)shapes.push({...b,ring:campusRectangle(f,u,0,1.4,1.4),holes:[],minHeight:bottom,h:top});
        for(const y of [f.bottom,f.middle])shapes.push({...b,ring:campusRectangle(f,0,-f.depth/2,f.width,f.depth),holes:[],minHeight:y-.15,h:y+.15});
      }else for(const u of [-2.7,2.7])shapes.push({...b,ring:campusRectangle(f,u,0,1.4,1.4),holes:[],minHeight:f.bottom,h:f.top});
      return shapes;
    }
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
    if(b.model==='dormitory-glazed'){
      const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;glazedDormitory(detail,b,base);flush(detail);group.add(detail);
    }
    else if(b.model==='kai-dormitory-classical'){
      const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;dormitoryClassical(detail,b,base);flush(detail);group.add(detail);
    }
    else if(b.model==='kai-dormitory-terraces'){
      const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;dormitoryTerraces(detail,b,base);flush(detail);group.add(detail);
    }
    else if(b.model==='dormitory-brick'){
      const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;brickDormitory(detail,b,base);flush(detail);group.add(detail);
    }
    else if (b.model === 'academic-lowrise') {
      const detail = new THREE.Group(); detail.name = `KazanCampus/${b.id}`;
      academicLowrise(detail, b, base); flush(detail); group.add(detail);
    }
    else if(b.model==='kai-tiled'){const detail=new THREE.Group();detail.name=`KazanCampus/${b.id}`;academicTiled(detail,b,base);flush(detail);group.add(detail);}
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

  services.campusSurfaceHeight=campusSurfaceHeight;
  return { emitBuilding, buildGrounds, collisionShapes };
}

NYC = { ...NYC, createKazanCampusModels };
})();
