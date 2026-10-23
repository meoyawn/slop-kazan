import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, boundsOf, pointInPoly, roadHeight, groundSurfaceHeight } from './kazan-config.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';

/** Photographed church tiers use mapped bodies and shared plaster, arches, metal roofs and onion profiles. */
export function createKazanChurchModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, pitchedRoof, emit, flush } = draw;
  const white = plainMaterial(0xe8e8df), trim = plainMaterial(0xd5dad4), blue = plainMaterial(0x176fa8, 0.45);
  const roofSeam = plainMaterial(0x145778, 0.4);
  const dark = plainMaterial(0x35464a), gold = plainMaterial(0xc4a244, 0.75), bronze = plainMaterial(0x82765c, 0.5);
  const buildings = new Map(GEO.buildings.map((b) => [b.id, b]));

  function faces(ring) {
    const poly = toPoints(ring), result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.2) continue;
      const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length, x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      let nx = -uz, nz = ux;
      if (pointInPoly(poly, x + nx * 0.1, z + nz * 0.1)) { nx = -nx; nz = -nz; }
      result.push({ x, z, ux, uz, nx, nz, length, yaw: -Math.atan2(uz, ux), faceYaw: Math.atan2(nx, nz) });
    }
    return result;
  }
  function panel(group, f, u, y, w, h, depth, material, projection = 0.1) {
    box(group, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection, w, h, depth, material, f.yaw);
  }
  function volume(group, b, base, bottom, top, wall = white, roof = wall) {
    const g = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: top - bottom, bevelEnabled: false });
    g.rotateX(-Math.PI / 2).translate(0, base + bottom, 0); splitExtrusion(group, g, roof, wall, base);
  }
  function centre(b) {
    const bounds = boundsOf(toPoints(b.ring));
    return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2,
      radius: Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 };
  }
  function lathe(group, p, y, profile, radius, height, material, segments = 32) {
    const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r * radius, h * height)), segments);
    solid(group, g, material, p.x, y, p.z);
  }
  function cross(group, p, y, size) {
    box(group, p.x, y + size / 2, p.z, 0.07 * size, size, 0.06 * size, gold);
    box(group, p.x, y + size * 0.7, p.z, size * 0.55, 0.07 * size, 0.06 * size, gold);
    box(group, p.x, y + size * 0.87, p.z, size * 0.3, 0.05 * size, 0.06 * size, gold);
    const foot = new THREE.BoxGeometry(size * 0.36, size * 0.045, size * 0.06); foot.rotateZ(-0.25);
    solid(group, foot, gold, p.x, y + size * 0.28, p.z);
  }
  function onion(group, p, y, radius, height, crossHeight) {
    lathe(group, p, y, [[0.48,0],[0.8,0.12],[1,0.35],[0.96,0.52],[0.66,0.74],[0.18,0.94],[0,1]], radius, height, gold);
    cross(group, p, y + height - 0.05, crossHeight);
  }
  function archShape(width, height) {
    const shape = new THREE.Shape(), r = width / 2;
    shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, height - r);
    shape.absarc(0, height - r, r, 0, Math.PI, false); shape.closePath(); return shape;
  }
  function arch(group, f, u, y, width, height, material, projection = 0.15) {
    const g = new THREE.ShapeGeometry(archShape(width, height)).toNonIndexed(); g.rotateY(f.faceYaw);
    solid(group, g, material, f.x + f.ux * u + f.nx * projection, y, f.z + f.uz * u + f.nz * projection);
  }
  function framedWindow(group, f, u, y, width, height, arched = false) {
    if (arched) {
      arch(group, f, u, y - 0.1, width + 0.3, height + 0.3, trim);
      arch(group, f, u, y, width, height, dark, 0.18);
    } else {
      panel(group, f, u, y + height / 2, width + 0.38, height + 0.38, 0.22, trim);
      panel(group, f, u, y + height / 2, width, height, 0.12, dark, 0.24);
      panel(group, f, u, y + height + 0.3, width + 0.55, 0.14, 0.4, white, 0.2);
    }
    panel(group, f, u, y + height / 2, 0.05, height, 0.08, white, 0.28);
    panel(group, f, u, y - 0.1, width + 0.3, 0.14, 0.34, white, 0.2);
  }
  function cornice(group, ring, y, width = 0.35) {
    for (const f of faces(ring)) for (const [dy, h, reach] of [[-0.18,0.12,0.1],[0,0.18,width],[0.16,0.09,width + 0.1]]) {
      panel(group, f, 0, y + dy, f.length + 0.15, h, reach, white, reach / 2);
    }
  }
  function metalDome(group, p, y, radius, height) {
    lathe(group, p, y, [[1,0],[0.96,0.08],[0.85,0.22],[0.75,0.52],[0.53,0.85],[0.24,1],[0,1]], radius, height, blue);
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      const points = [[1,0],[0.96,0.08],[0.85,0.22],[0.75,0.52],[0.53,0.85],[0.24,1]].map(([r,h]) =>
        new THREE.Vector3(p.x + Math.sin(a) * (radius * r + 0.035), y + height * h + 0.035, p.z + Math.cos(a) * (radius * r + 0.035)));
      const curve = new THREE.CurvePath();
      for (let j = 1; j < points.length; j++) curve.add(new THREE.LineCurve3(points[j-1], points[j]));
      const geometry = new THREE.TubeGeometry(curve, 32, 0.022, 4, false);
      emit(group, geometry.toNonIndexed(), roofSeam);
    }
  }
  function portico(group, f, base) {
    for (const u of [-2.5, 2.5]) for (const depth of [0.2, 3.3]) {
      const x = f.x + f.ux * u + f.nx * depth, z = f.z + f.uz * u + f.nz * depth;
      solid(group, new THREE.CylinderGeometry(0.28, 0.36, 4.8, 16), white, x, base + 2.6, z);
      box(group, x, base + 0.3, z, 0.9, 0.35, 0.9, trim, f.yaw);
      box(group, x, base + 5, z, 0.95, 0.45, 0.95, white, f.yaw);
    }
    panel(group, f, 0, base + 5.4, 6.7, 0.45, 4.2, white, 1.7);
    const shape = new THREE.Shape(); shape.moveTo(-3.4,0); shape.lineTo(3.4,0); shape.lineTo(3.4,0.65); shape.lineTo(2.2,0.65);
    shape.absarc(0,0.65,2.2,0,Math.PI,false); shape.lineTo(-3.4,0.65); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false }); geometry.rotateY(f.faceYaw);
    solid(group, geometry, white, f.x + f.nx * 3.4, base + 5.5, f.z + f.nz * 3.4);
    arch(group, { ...f, x: f.x + f.nx * 3.9, z: f.z + f.nz * 3.9 }, 0, base + 5.9, 3.9, 2.05, trim);
    framedWindow(group, f, 0, base + 0.3, 2.1, 4.3, true);
    for (let i = 0; i < 7; i++) panel(group, f, 0, base - i * 0.16, 6.3, 0.18, 0.5, trim, 3.5 + i * 0.42);
  }
  function paraskeva(group, b, base) {
    const hall = buildings.get(260412109), nave = buildings.get(260412106), upper = buildings.get(260412129);
    const apse = buildings.get(260412108), tower = buildings.get(260412126), cp = centre(upper), tp = centre(tower);
    volume(group, hall, base, 0, 6.4); volume(group, apse, base, 0, 6.9); volume(group, nave, base, 0, 9.6);
    pitchedRoof(group, { ring: hall.ring, holes: [], h: 10.1, roofShape: 'hipped' }, base, 3.7, blue);
    metalDome(group, centre(apse), base + 6.9, centre(apse).radius + 0.25, 1.7);
    cornice(group, hall.ring, base + 6.4, 0.25);
    for (const f of faces(hall.ring)) {
      if (f.length < 4) continue;
      const count = Math.max(1, Math.floor(f.length / 5.2));
      for (let i = 0; i < count; i++) framedWindow(group, f, (i + 0.5) * f.length / count - f.length / 2, base + 1.4, 0.8, 2.6, true);
    }
    volume(group, upper, base, 9.4, 20.1);
    for (const f of faces(upper.ring)) {
      framedWindow(group, f, 0, base + 10.3, 1.2, 3.5);
      for (const u of [-f.length * 0.28, 0, f.length * 0.28]) arch(group, f, u, base + 17.6, Math.min(1.1, f.length * 0.27), 1.5, trim, 0.1);
      panel(group, f, -f.length / 2 + 0.2, base + 14.7, 0.34, 10.3, 0.2, white, 0.2);
    }
    for (const y of [9.6,17,20.1]) cornice(group, upper.ring, base + y);
    metalDome(group, cp, base + 20.3, cp.radius + 0.55, 3.3);
    lathe(group, cp, base + 23.6, [[1,0],[1,1]], 0.92, 2.1, white, 8);
    metalDome(group, cp, base + 25.7, 1.2, 1.65);
    lathe(group, cp, base + 27.2, [[1,0],[1,1]], 0.62, 0.8, white, 16);
    onion(group, cp, base + 28, 1.15, 2, 1.6);
    volume(group, tower, base, 0, 14.5);
    const belfry = new THREE.Group(); belfry.name = 'ParaskevaOpenBelfry';
    for (const f of faces(tower.ring)) {
      const w = f.length + 0.05, height = 5.3, hole = archShape(w * 0.63, 4.6);
      const shape = new THREE.Shape([new THREE.Vector2(-w/2,0),new THREE.Vector2(w/2,0),new THREE.Vector2(w/2,height),new THREE.Vector2(-w/2,height)]);
      const opening = new THREE.Path(hole.getPoints()); shape.holes.push(opening);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }); g.translate(0,0,-0.25); g.rotateY(f.faceYaw);
      solid(belfry, g, white, f.x, base + 14.5, f.z);
      panel(group, f, 0, base + 11.8, f.length - 0.7, 4.5, 0.1, trim, 0.06);
    }
    flush(belfry); group.add(belfry);
    for (const y of [8.8,14.4,19.8]) cornice(group, tower.ring, base + y);
    const bell = new THREE.LatheGeometry([[0.75,0],[0.9,0.12],[0.65,0.4],[0.45,1],[0.2,1.3],[0,1.3]].map(([r,y])=>new THREE.Vector2(r,y)), 20);
    solid(group, bell, bronze, tp.x, base + 15.4, tp.z); box(group,tp.x,base+17.6,tp.z,0.1,2.1,0.1,dark);
    metalDome(group, tp, base + 20, tp.radius + 0.3, 1.4);
    const drumRing = [];
    for (let i=0;i<8;i++){const a=i*Math.PI/4;drumRing.push(tp.x+Math.cos(a)*2.5,tp.z+Math.sin(a)*2.5);}
    volume(group, { ring: drumRing, holes: [] }, base, 21.3, 26.3);
    for (const f of faces(drumRing)) framedWindow(group, f, 0, base + 21.9, 0.55, 3.7, true);
    cornice(group, drumRing, base + 26.3); metalDome(group,tp,base+26.5,2.8,1.5);
    lathe(group,tp,base+27.9,[[1,0],[1,1]],0.65,1,white,16); onion(group,tp,base+28.9,1.2,2.2,1.7);
    const front = faces(hall.ring).reduce((best,f)=>f.nx<best.nx?f:best);
    portico(group, { ...front, x: tp.x + front.nx * 3.5, z: tp.z + front.nz * 3.5 }, base);
    const side = { x: cp.x, z: cp.z - 6, radius: 0.55 };
    lathe(group,side,base+9.6,[[1,0],[1,1]],0.45,1.4,white,12); onion(group,side,base+11,0.55,1,0.8);
  }
  function chapel(group, b, base, small) {
    const p = centre(b), h = small ? 3.4 : 6.4;
    volume(group,b,base,0,h); cornice(group,b.ring,base+h);
    for(const f of faces(b.ring)){
      if(f.length<1.8)continue;
      framedWindow(group,f,0,base+0.7,small?0.7:0.85,small?1.8:3.7,true);
      if(!small)arch(group,f,0,base+h-0.1,f.length*0.84,2.3,white);
    }
    if(small){metalDome(group,p,base+h,p.radius+0.3,1.5);lathe(group,p,base+h+1.4,[[1,0],[1,1]],0.35,0.9,white,12);onion(group,p,base+h+2.3,0.38,0.7,0.6);}
    else {solid(group,new THREE.ConeGeometry(p.radius*0.88,5,8),blue,p.x,base+h+3,p.z);lathe(group,p,base+h+5.4,[[1,0],[1,1]],0.45,0.7,white,16);onion(group,p,base+h+6.1,0.8,1.4,1.2);}
  }
  function parish(group,b,base) {
    const material=createObservedFacadeMaterial(b.appearance);volume(group,b,base,0,b.h,material,trim);
    cornice(group,b.ring,base+b.h,0.2);
    for(const f of faces(b.ring))panel(group,f,0,base+b.h+0.25,f.length+0.3,0.2,0.5,blue,0.15);
    const front=faces(b.ring).reduce((best,f)=>f.nx<best.nx?f:best);
    panel(group,front,0,base+4.9,5.3,2.7,0.8,dark,0.4);
    for(const u of [-2.6,-1.3,0,1.3,2.6])panel(group,front,u,base+4.9,0.1,2.8,0.1,white,0.85);
    for(const y of [3.45,6.35])panel(group,front,0,base+y,5.6,0.2,1.1,white,0.45);
    arch(group,front,3.5,base,2.8,3.8,white,0.2);
    arch(group,front,3.5,base,2,3.2,dark,0.25);
    const p=centre(b);for(const x of [-3,3]){box(group,p.x+x,base+b.h+0.8,p.z,0.65,1.4,0.65,white);box(group,p.x+x,base+b.h+1.5,p.z,0.9,0.1,0.9,trim);}
  }
  function heritage(group,b,base) {
    const roof=plainMaterial(new THREE.Color(b.roofColour).getHex(),0.3),wall=createObservedFacadeMaterial(b.appearance), h=b.h-(b.roofHeight||2.3);
    volume(group,b,base,0,h,wall,roof);pitchedRoof(group,{ring:b.ring,holes:b.holes,h:b.h,roofShape:'hipped'},base,b.roofHeight||2.3,roof);
    for(const f of faces(b.ring)){
      if(f.length<2)continue;
      for(const y of [0.5,h/2,h])panel(group,f,0,base+y,f.length+0.15,0.22,0.3,trim,0.12);
      for(const u of [-f.length/2+0.25,f.length/2-0.25])panel(group,f,u,base+h/2,0.45,h,0.2,trim,0.15);
    }
  }
  function emitBuilding(parent,b,base) {
    if(!['paraskeva-church','blue-tented-chapel','octagonal-shrine','parish-office','heritage-street'].includes(b.model))return false;
    const group=new THREE.Group();group.name=`KazanChurch/${b.id}`;group.userData.source=b.heightEvidence;
    if(b.model==='paraskeva-church')paraskeva(group,b,base);
    else if(b.model==='blue-tented-chapel'||b.model==='octagonal-shrine')chapel(group,b,base,b.model==='octagonal-shrine');
    else if(b.model==='parish-office')parish(group,b,base);
    else heritage(group,b,base);
    flush(group);parent.add(group);return true;
  }
  function courtyard(group, ring, material) {
    const source = new THREE.ShapeGeometry(shapeOf(ring)).toNonIndexed(), p = source.attributes.position, pending = [], positions = [], uvs = [];
    source.rotateX(-Math.PI/2);
    for (let i = 0; i < p.count; i += 3) pending.push([0,1,2].map(j=>[p.getX(i+j),p.getZ(i+j)]));
    while(pending.length) {
      const triangle = pending.pop(); let edge = 0, longest = 0;
      for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],length=(a[0]-b[0])**2+(a[1]-b[1])**2;if(length>longest){longest=length;edge=i;}}
      const a=triangle[edge],b=triangle[(edge+1)%3],c=triangle[(edge+2)%3];
      if(longest>4){const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];pending.push([a,mid,c],[mid,b,c]);}
      else for(const [x,z] of triangle){positions.push(x,roadHeight(null,x,z)+0.06,z);uvs.push(x,z);}
    }
    source.dispose();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();emit(group,geometry,material);
  }
  function buildGrounds(parent) {
    const colliders = [], iron = plainMaterial(0x434b49), paving = plainMaterial(0xb4b4a7);
    for (const site of GEO.churchSites || []) {
      const group = new THREE.Group(); group.name = `KazanChurchGrounds/${site.id}`;
      group.userData.source = site.source; group.userData.geometrySource = site.geometrySource;
      const points = toPoints(site.boundary);
      courtyard(group,site.boundary,paving);
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i+1)%points.length], length = Math.hypot(b.x-a.x,b.z-a.z), ux = (b.x-a.x)/length, uz = (b.z-a.z)/length;
        const count = Math.max(1,Math.ceil(length/2.8)), yaw = -Math.atan2(uz,ux);
        for (let j=0;j<count;j++) {
          const s = (j+0.5)*length/count;
          if(site.gates.some(g => g.edge === i && s >= g.start && s <= g.end)) continue;
          const x=a.x+ux*s,z=a.z+uz*s,w=length/count,y=groundSurfaceHeight(x,z);
          box(group,x,y+0.55,z,w+0.03,1.1,0.3,white,yaw);
          for (const t of [-0.5,0.5]) {
            const px=x+ux*w*t,pz=z+uz*w*t;
            box(group,px,y+0.95,pz,0.5,1.9,0.5,white,yaw);
            const cap=new THREE.ConeGeometry(0.43,0.25,4);cap.rotateY(Math.PI/4+yaw);solid(group,cap,blue,px,y+2.02,pz);
          }
          const ring=[x-ux*w/2+uz*0.2,z-uz*w/2-ux*0.2,x+ux*w/2+uz*0.2,z+uz*w/2-ux*0.2,
            x+ux*w/2-uz*0.2,z+uz*w/2+ux*0.2,x-ux*w/2-uz*0.2,z-uz*w/2+ux*0.2];
          colliders.push(draw.buildingCollider({ring,holes:[],h:1.9,minHeight:0},y));
          for (let u=-w/2+0.2;u<w/2;u+=0.23) box(group,x+ux*u,y+1.45,z+uz*u,0.035,0.7,0.035,iron,yaw);
          box(group,x,y+1.8,z,w,0.05,0.05,iron,yaw);
        }
      }
      flush(group);parent.add(group);
    }
    return colliders;
  }
  return { emitBuilding, buildGrounds };
}
