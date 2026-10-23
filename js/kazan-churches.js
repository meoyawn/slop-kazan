import * as THREE from 'three/webgpu';
import { GEO, services } from './kazan-runtime.js';
import { toPoints, boundsOf, pointInPoly, roadHeight, groundSurfaceHeight, terrainHeight } from './kazan-config.js';
import { createObservedFacadeMaterial } from './kazan-facades.js';

/** Photographed church tiers use mapped bodies and shared plaster, arches, metal roofs and onion profiles. */
export function createKazanChurchModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, pitchedRoof, emit, flush } = draw;
  const white = plainMaterial(0xe8e8df), trim = plainMaterial(0xd5dad4), blue = plainMaterial(0x176fa8, 0.45);
  const roofSeam = plainMaterial(0x145778, 0.4);
  const dark = plainMaterial(0x35464a), gold = plainMaterial(0xc4a244, 0.75), bronze = plainMaterial(0x82765c, 0.5);
  const buildings = new Map(GEO.buildings.map((b) => [b.id, b]));
  const accessBuildings = GEO.buildings.filter((b) => b.model === 'paraskeva-church');
  const classicalBuildings = GEO.buildings.filter((b) => ['kazan-icon-cathedral','monastery-cross-church','monastery-nicholas-church'].includes(b.model));
  const accessLayouts = new WeakMap();

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
    let low = bottom;
    if (bottom === 0) {
      const points = toPoints(b.ring);
      for (let i = 0; i < points.length; i++) {
        const a = points[i], c = points[(i+1)%points.length], count = Math.max(1,Math.ceil(Math.hypot(c.x-a.x,c.z-a.z)/2));
        for (let j=0;j<=count;j++) low = Math.min(low,terrainHeight(a.x+(c.x-a.x)*j/count,a.z+(c.z-a.z)*j/count)-base-0.12);
      }
    }
    const g = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: top - low, bevelEnabled: false });
    g.rotateX(-Math.PI / 2).translate(0, base + low, 0); splitExtrusion(group, g, roof, wall, base);
  }
  function centre(b) {
    const bounds = boundsOf(toPoints(b.ring));
    return { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2,
      radius: Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 };
  }
  function rectangle(f, u, depth, width, length) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([a,b]) => [
      f.x + f.ux * (u + a * width / 2) + f.nx * (depth + b * length / 2),
      f.z + f.uz * (u + a * width / 2) + f.nz * (depth + b * length / 2)]);
  }
  function entranceLayout(b) {
    if (accessLayouts.has(b)) return accessLayouts.get(b);
    const hall = buildings.get(260412109), tower = centre(buildings.get(260412126));
    const face = faces(hall.ring).reduce((best,f) => f.nx < best.nx ? f : best);
    const f = { ...face, x: tower.x + face.nx * 3.5, z: tower.z + face.nz * 3.5 };
    const base = Math.max(...toPoints(b.ring).map((p) => terrainHeight(p.x,p.z))), top = base + 0.2;
    const start = 3.5, length = 6.4;
    const wall = GEO.churchSites.find((s) => s.building === `${b.osmType}/${b.id}`).barriers.find((w) => w.reference === 'way/260420745').pts;
    const span = Math.hypot(wall[2]-wall[0],wall[3]-wall[1]), nx = (wall[2]-wall[0])/span, nz = (wall[3]-wall[1])/span;
    const flight = { x:f.x+f.nx*start,z:f.z+f.nz*start,nx,nz,ux:nz,uz:-nx,yaw:-Math.atan2(-nx,nz) };
    const corners = toPoints(rectangle(f,0,(start+0.5)/2,6.3,start+0.5)), landing = [];
    for (let i=0;i<corners.length;i++) {
      const a = corners[i], c = corners[(i+1)%corners.length];
      const da = (a.x-flight.x)*nx+(a.z-flight.z)*nz, dc = (c.x-flight.x)*nx+(c.z-flight.z)*nz;
      if (da<=0) landing.push(a.x,a.z);
      if ((da<0)!==(dc<0)) landing.push(a.x+(c.x-a.x)*da/(da-dc),a.z+(c.z-a.z)*da/(da-dc));
    }
    const footX = flight.x + nx * length, footZ = flight.z + nz * length;
    const bottom = roadHeight(null,footX,footZ) + 0.06, count = Math.max(7,Math.ceil((top-bottom)/0.17));
    const columns = [-2.5,2.5].flatMap((u) => [0.2,3.3].map((depth) => ({ u, depth, ring: rectangle(f,u,depth,0.95,0.95) })));
    const layout = { frame:f, flight, landing, base, columns,
      stairs:{ start,length,count,top,bottom,width:4.2,run:length/count,rise:(top-bottom)/count } };
    accessLayouts.set(b,layout); return layout;
  }
  function collisionShapes(b) {
    if(b.model==='kazan-icon-cathedral'){
      const shapes=[{...cathedralBody(b),minHeight:0,h:21}],p=centre(buildings.get(996791714));
      shapes.push({...b,ring:circleRing(p,7.6),holes:[],minHeight:20,h:40});
      for(const [x,z] of [[319.1,-1056],[344.5,-1056.5],[319.7,-1029.1],[345,-1029.6]])shapes.push({...b,ring:circleRing({x,z},3.5),holes:[],minHeight:20,h:31});
      for(const entry of classicalEntrances(b))classicalPortico(null,entry,0,shapes,b);
      return shapes;
    }
    if (b.model !== 'paraskeva-church') return null;
    const access = entranceLayout(b), f = access.frame;
    const bodies = [[260412109,0,10.1],[260412108,0,8.6],[260412106,0,9.6],[260412129,9.4,31.6],[260412126,0,33]];
    return [...bodies.map(([id,minHeight,h]) => ({ ...b, ring:buildings.get(id).ring, holes:[], minHeight,h })),
      ...access.columns.map((p) => ({ ...b, ring:p.ring, holes:[], minHeight:0.125,h:5.225 })),
      { ...b, ring:rectangle(f,0,1.7,6.7,4.2), holes:[], minHeight:5.175,h:5.625 },
      { ...b, ring:rectangle(f,0,3.4,6.8,0.6), holes:[], minHeight:5.5,h:8.4 }];
  }
  function churchSurfaceHeight(x,z,referenceY,height) {
    for (const b of accessBuildings) {
      const { frame:f, flight, stairs:s } = entranceLayout(b), dx = x-f.x, dz = z-f.z;
      const u = dx*f.ux + dz*f.uz, d = dx*f.nx + dz*f.nz;
      const fu = (x-flight.x)*flight.ux+(z-flight.z)*flight.uz, fd = (x-flight.x)*flight.nx+(z-flight.z)*flight.nz;
      const landing = Math.abs(u)<=3.15 && d>=0 && fd<=0;
      if (!landing && (Math.abs(fu)>s.width/2 || fd<0 || fd>s.length)) continue;
      const candidate = landing ? s.top : s.top - (Math.min(s.count-1,Math.floor(fd/s.run))+1)*s.rise;
      if (!Number.isFinite(referenceY) || referenceY >= candidate-0.5 && referenceY <= candidate+2.5) return Math.max(height,candidate);
    }
    for(const b of classicalBuildings){
      const base=Math.max(...toPoints(b.ring).map(p=>terrainHeight(p.x,p.z)));
      for(const {f,depth} of classicalEntrances(b)){
        const u=(x-f.x)*f.ux+(z-f.z)*f.uz,d=(x-f.x)*f.nx+(z-f.z)*f.nz;
        if(Math.abs(u)>f.length/2+0.4||d<0||d>depth+2)continue;
        const candidate=base+0.65-(d<=depth+0.4?0:Math.min(4,Math.floor((d-depth-0.4)/0.4)+1)*0.65/4);
        if(!Number.isFinite(referenceY)||referenceY>=candidate-0.5&&referenceY<=candidate+2.5)height=Math.max(height,candidate);
      }
    }
    return height;
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
  function metalDome(group, p, y, radius, height, material = blue, round = false) {
    const profile=round?Array.from({length:17},(_,i)=>[Math.sqrt(Math.max(0,1-(i/16)**2)),i/16]):[[1,0],[0.96,0.08],[0.85,0.22],[0.75,0.52],[0.53,0.85],[0.24,1],[0,1]];
    lathe(group, p, y, profile, radius, height, material);
    for (let i = 0; i < 32; i++) {
      const a = i * Math.PI / 16;
      const points = (round?profile:profile.slice(0,-1)).map(([r,h]) =>
        new THREE.Vector3(p.x + Math.sin(a) * (radius * r + 0.035), y + height * h + 0.035, p.z + Math.cos(a) * (radius * r + 0.035)));
      const curve = new THREE.CurvePath();
      for (let j = 1; j < points.length; j++) curve.add(new THREE.LineCurve3(points[j-1], points[j]));
      const geometry = new THREE.TubeGeometry(curve, 32, 0.022, 4, false);
      emit(group, geometry.toNonIndexed(), roofSeam);
    }
  }
  function portico(group, access) {
    const { frame:f, flight, base, stairs:s } = access;
    for (const { u,depth } of access.columns) {
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
    volume(group,{ring:access.landing,holes:[]},base,-0.2,0.2,trim);
    const steps = new THREE.Group(); steps.name = 'ParaskevaEntranceSteps';
    for (let i = 0; i < s.count; i++) {
      const d = (i+0.5)*s.run, y = s.top-(i+1)*s.rise;
      const x = flight.x+flight.nx*d, z = flight.z+flight.nz*d, ground = roadHeight(null,x,z), h = Math.max(0.22,y-ground);
      panel(steps,flight,0,y-h/2,s.width,h,s.run+0.012,trim,d);
      for (const side of [-1,1]) {
        const u = side*(s.width/2-0.15), px=x+flight.ux*u, pz=z+flight.uz*u;
        if (i%4===0) box(steps,px,y+0.46,pz,0.055,0.92,0.055,dark);
        const rail = new THREE.BoxGeometry(0.05,0.05,Math.hypot(s.run,s.rise)+0.03);
        rail.rotateX(Math.atan2(s.rise,s.run)); rail.rotateY(Math.atan2(flight.nx,flight.nz));
        solid(steps,rail,dark,px,y+0.94,pz);
      }
    }
    flush(steps); group.add(steps);
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
    portico(group,entranceLayout(b));
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
  function ruinedTower(group,b,base) {
    const p = centre(b), radius = p.radius, material = createObservedFacadeMaterial(b.appearance);
    const outer = [], inner = [];
    for(let i=0;i<64;i++){const a=i*Math.PI/32;outer.push(p.x+Math.sin(a)*radius,p.z+Math.cos(a)*radius);inner.push(p.x+Math.sin(a)*(radius-0.55),p.z+Math.cos(a)*(radius-0.55));}
    volume(group,{ring:outer,holes:[inner]},base,0,8.2,material,material);
    for(let i=0;i<64;i++) {
      const a=i*Math.PI/32,c=(i+1)*Math.PI/32;
      const ring=[p.x+Math.sin(a)*radius,p.z+Math.cos(a)*radius,p.x+Math.sin(c)*radius,p.z+Math.cos(c)*radius,
        p.x+Math.sin(c)*(radius-0.55),p.z+Math.cos(c)*(radius-0.55),p.x+Math.sin(a)*(radius-0.55),p.z+Math.cos(a)*(radius-0.55)];
      if(![2,19,35,52].includes(i))volume(group,{ring,holes:[]},base,8.2,9.5,material,material);
      const broken = i>=10 && i<=14, top=broken?9.5:10.2+((i*17)%7)/10;
      if(!broken)volume(group,{ring,holes:[]},base,9.5,Math.min(b.h,top),material,material);
    }
    for(let i=0;i<32;i++) {
      const a=i*Math.PI/16,f={x:p.x+Math.sin(a)*(radius+0.025),z:p.z+Math.cos(a)*(radius+0.025),ux:Math.cos(a),uz:-Math.sin(a),nx:Math.sin(a),nz:Math.cos(a),yaw:a,faceYaw:a};
      arch(group,f,0,base+5.1,0.47,1.1,plainMaterial(0x6a5847),0.025);
      arch(group,f,0,base+5.14,0.31,0.91,material,0.055);
      for(const y of [4.94,5.04])panel(group,f,0,base+y,Math.PI*radius/16+0.03,0.1,0.12,material,0.04);
    }
  }
  function monasteryOffice(group,b,base) {
    const wall=createObservedFacadeMaterial(b.appearance), roof=plainMaterial(0x3d7567,0.35), h=b.h-b.roofHeight;
    volume(group,b,base,0,h,wall,roof);pitchedRoof(group,{ring:b.ring,holes:b.holes,h:b.h,roofShape:'hipped'},base,b.roofHeight,roof);
    for(const f of faces(b.ring)) {
      if(f.length<3)continue;
      const count=Math.max(1,Math.round(f.length/3.7));
      for(let i=0;i<count;i++) {
        const u=(i+0.5)*f.length/count-f.length/2;
        for(const [y,w,height] of [[1.1,1.15,2],[4.6,1.25,2.3],[8.2,1,1.9]])framedWindow(group,f,u,base+y,w,height,y>8);
        if(i%3===1)panel(group,f,u+0.7,base+5,0.6,0.45,0.4,trim,0.45);
      }
      for(const y of [0.4,7.5,h])panel(group,f,0,base+y,f.length+0.15,0.2,0.35,white,0.15);
    }
  }
  function panelBlock(group,b,base) {
    const wall=createObservedFacadeMaterial(b.appearance), roof=plainMaterial(0xb4bfbd,0.3), balcony=plainMaterial(0x8a9696), glass=plainMaterial(0x425b66,0.3);
    const h=b.h-3;volume(group,b,base,0,h,wall,roof);pitchedRoof(group,{ring:b.ring,holes:b.holes,h:b.h,roofShape:'gabled'},base,3,roof);
    const front=faces(b.ring).filter(f=>f.length>20).reduce((best,f)=>!best||f.nx<best.nx?f:best,null);
    if(!front)return;
    const stacks=Math.max(2,Math.round(front.length/10.5)), bay=front.length/stacks;
    for(let i=0;i<stacks;i++) {
      const u=(i+0.5)*bay-front.length/2;
      for(let floor=0;floor<5;floor++) {
        const y=base+1.6+floor*3;
        panel(group,front,u,y,2.9,2.6,1.1,balcony,0.55);
        panel(group,front,u,y+0.25,2.72,1.8,0.1,glass,1.13);
        for(const dx of [-1.4,-0.7,0,0.7,1.4])panel(group,front,u+dx,y+0.25,0.06,1.9,0.08,trim,1.21);
        panel(group,front,u,y-0.85,3,0.7,0.15,balcony,1.16);
        panel(group,front,u,y-1.4,3.1,0.13,1.3,trim,0.6);
      }
      panel(group,front,u,base+h+1.1,1.2,0.8,1.1,trim,-1.3);
      panel(group,front,u,base+h+1.1,0.75,0.5,0.08,glass,-0.7);
    }
    const p=centre(b);
    for(let i=0;i<=stacks;i++){
      const u=(i/stacks-0.5)*front.length*0.85;
      box(group,p.x+front.ux*u,base+b.h+0.6,p.z+front.uz*u,0.65,1.3,0.8,white,front.yaw);
    }
  }
  function circleRing(p, radius, count = 32) {
    return Array.from({ length: count }, (_,i) => [p.x + Math.sin(i*Math.PI*2/count)*radius,p.z + Math.cos(i*Math.PI*2/count)*radius]).flat();
  }
  function classicalFrame(x,z,nx,nz,width) {
    return { x,z,nx,nz,ux:nz,uz:-nx,length:width,yaw:Math.atan2(nx,nz),faceYaw:Math.atan2(nx,nz) };
  }
  function cathedralBody(b) {
    return { ...b, ring:[...b.ring.slice(4,-4),314.9,-1030.3,313.4,-1030], holes:[] };
  }
  function classicalEntrances(b) {
    if(b.model==='kazan-icon-cathedral')return [
      {f:classicalFrame(313.7,-1041.1,-1,0.018,21),depth:8,top:18.8,rise:4.1,count:6},
      {f:classicalFrame(333.1,-1023.1,0.02,1,21),depth:3.4,top:18.8,rise:4.1,count:6},
      {f:classicalFrame(333.1,-1062.9,-0.02,-1,21),depth:3.4,top:18.8,rise:4.1,count:6}];
    const fs=faces(b.ring).filter(f=>f.length>20), north=b.model==='monastery-cross-church';
    const f=fs.reduce((best,f)=>!best||(north?f.nz<best.nz:f.nz>best.nz)?f:best,null);
    return f?[{f:{...f,length:b.model==='monastery-nicholas-church'?22:20},depth:2.8,top:13.2,rise:3.8,count:6}]:[];
  }
  function classicalPortico(group, entry, base, colliders = null, building = null) {
    const {f,depth,top,rise,count}=entry, floor=0.65, width=f.length;
    for(let i=0;i<count;i++){
      const u=(i/(count-1)-0.5)*(width-1.9),d=depth-0.65,x=f.x+f.ux*u+f.nx*d,z=f.z+f.uz*u+f.nz*d;
      if(group){
        solid(group,new THREE.CylinderGeometry(0.43,0.57,top-floor-1,20),white,x,base+(top+floor-1)/2,z);
        box(group,x,base+floor+0.15,z,1.3,0.3,1.3,trim,f.yaw);
        box(group,x,base+top-0.65,z,1.35,0.45,1.35,white,f.yaw);
      }
      if(colliders)colliders.push({...building,ring:rectangle(f,u,d,1.35,1.35),holes:[],minHeight:0,h:top});
    }
    if(colliders)colliders.push({...building,ring:rectangle(f,0,depth/2,width,depth+0.6),holes:[],minHeight:top-0.4,h:top+rise});
    if(!group)return;
    panel(group,f,0,base+top,width+0.7,0.8,depth+0.6,white,depth/2);
    const shape=new THREE.Shape([new THREE.Vector2(-width/2-0.35,0),new THREE.Vector2(width/2+0.35,0),new THREE.Vector2(0,rise)]);
    const g=new THREE.ExtrudeGeometry(shape,{depth:0.5,bevelEnabled:false});g.rotateY(f.faceYaw);
    solid(group,g,white,f.x+f.nx*(depth+0.05),base+top+0.4,f.z+f.nz*(depth+0.05));
    for(const side of [-1,1]){
      const beam=new THREE.BoxGeometry(Math.hypot(width/2+0.35,rise),0.25,0.65);
      beam.rotateZ(-side*Math.atan2(rise,width/2+0.35));beam.rotateY(f.faceYaw);
      solid(group,beam,trim,f.x+f.ux*side*(width/4+0.17)+f.nx*(depth+0.25),base+top+0.4+rise/2,f.z+f.uz*side*(width/4+0.17)+f.nz*(depth+0.25));
    }
    for(let u=-width/2;u<=width/2;u+=0.65)panel(group,f,u,base+top-0.35,0.22,0.3,0.6,trim,depth+0.1);
    const landing=rectangle(f,0,depth/2,width+0.8,depth+0.8);volume(group,{ring:landing,holes:[]},base,0,floor,trim);
    for(let i=0;i<4;i++){
      const d=depth+0.4+(i+0.5)*0.4,y=base+floor-(i+1)*floor/4;
      const h=Math.max(0.2,y-roadHeight(null,f.x+f.nx*d,f.z+f.nz*d)+0.1);
      panel(group,f,0,y-h/2,width+0.8,h,0.41,trim,d);
    }
  }
  function classicalDrum(group,p,base,bottom,height,radius,roofHeight,material,lantern = false) {
    const ring=circleRing(p,radius,48);volume(group,{ring,holes:[]},base,bottom,bottom+height);
    for(const y of [bottom,bottom+height-0.6,bottom+height]){
      solid(group,new THREE.CylinderGeometry(radius+0.32,radius+0.32,0.22,48),white,p.x,base+y,p.z);
    }
    const count=radius>5?16:8;
    for(let i=0;i<count;i++){
      const a=i*Math.PI*2/count,f=classicalFrame(p.x+Math.sin(a)*(radius+0.03),p.z+Math.cos(a)*(radius+0.03),Math.sin(a),Math.cos(a),1);
      framedWindow(group,f,0,base+bottom+height*0.16,Math.min(1.4,radius*0.31),height*0.66,true);
      if(radius>5){
        const ca=a+Math.PI/count,x=p.x+Math.sin(ca)*(radius+0.05),z=p.z+Math.cos(ca)*(radius+0.05);
        solid(group,new THREE.CylinderGeometry(0.18,0.24,height-0.8,12),white,x,base+bottom+height/2,z);
        box(group,x,base+bottom+height-0.6,z,0.7,0.35,0.7,trim,ca);
      }
    }
    metalDome(group,p,base+bottom+height,radius+0.38,roofHeight,material,true);
    const y=bottom+height+roofHeight;
    if(lantern){
      const r=radius*0.17,lr=circleRing(p,r,8);volume(group,{ring:lr,holes:[]},base,y-0.1,y+3.1);
      for(const f of faces(lr))framedWindow(group,f,0,base+y+0.4,r*0.65,2.2,true);
      onion(group,p,base+y+3,r*1.15,1.4,3.6);
    }else{onion(group,p,base+y-0.05,0.38,0.8,1.8);}
  }
  function kazanCathedral(group,b,base) {
    const body=cathedralBody(b),cyan=plainMaterial(0x35a6c1,0.45),silver=plainMaterial(0x8c9da3,0.4);
    volume(group,body,base,0,18.5);cornice(group,body.ring,base+18.5,0.6);
    pitchedRoof(group,{ring:body.ring,holes:[],h:21,roofShape:'hipped'},base,2.5,silver);
    for(const f of faces(body.ring)){
      if(f.length<3.4)continue;
      const count=Math.max(1,Math.round(f.length/5.6));
      for(let i=0;i<count;i++){
        const u=(i+0.5)*f.length/count-f.length/2;
        framedWindow(group,f,u,base+2.4,1.65,6.4);
        panel(group,f,u,base+12.5,2.1,2.6,0.15,trim,0.12);
        panel(group,f,u,base+12.5,1.75,2.15,0.08,bronze,0.23);
        panel(group,f,u-f.length/count*0.43,base+9.2,0.45,16.8,0.3,white,0.15);
      }
      for(const y of [1,10.2,15.2,17.4])panel(group,f,0,base+y,f.length,0.16,0.35,trim,0.12);
    }
    const p=centre(buildings.get(996791714));
    classicalDrum(group,p,base,20.55,10.5,7.2,9,cyan,true);
    for(const [x,z] of [[319.1,-1056],[344.5,-1056.5],[319.7,-1029.1],[345,-1029.6]]){
      box(group,x,base+20.3,z,7.1,2.4,7.1,white,0.02);
      classicalDrum(group,{x,z},base,21.5,5.7,3.1,3.1,cyan);
    }
    for(const entry of classicalEntrances(b))classicalPortico(group,entry,base);
    const apse={x:347,z:-1041.9};metalDome(group,apse,base+18.6,6.25,3.1,silver,true);
  }
  function monasteryWing(group,b,base) {
    const wall=createObservedFacadeMaterial(b.appearance),roof=plainMaterial(new THREE.Color(b.roofColour).getHex(),0.35),h=b.h-(b.roofHeight||2.4);
    volume(group,b,base,0,h,wall,roof);pitchedRoof(group,{ring:b.ring,holes:b.holes,h:b.h,roofShape:'hipped'},base,b.roofHeight||2.4,roof);
    for(const f of faces(b.ring)){
      if(f.length<2.5)continue;
      for(const y of [0.7,h*0.5,h])panel(group,f,0,base+y,f.length+0.2,0.22,0.3,white,0.15);
      for(const u of [-f.length/2+0.25,f.length/2-0.25])panel(group,f,u,base+h/2,0.5,h,0.3,white,0.17);
    }
  }
  function monasteryChurch(group,b,base) {
    const isCross=b.model==='monastery-cross-church',roof=plainMaterial(isCross?0x4f7969:0x9ca4a8,0.4);
    const wall=createObservedFacadeMaterial(b.appearance),height=13.1,p=centre(b);
    volume(group,b,base,0,height,wall,roof);
    pitchedRoof(group,{ring:b.ring,holes:b.holes,h:16.1,roofShape:'hipped'},base,3,roof);
    for(const f of faces(b.ring)){
      if(f.length<4)continue;
      const count=Math.max(1,Math.round(f.length/4.5));
      for(let i=0;i<count;i++){
        const u=(i+0.5)*f.length/count-f.length/2;
        framedWindow(group,f,u,base+1.7,1.45,3.6);framedWindow(group,f,u,base+8.3,1.35,2.5);
      }
      for(const y of [0.6,6.7,height])panel(group,f,0,base+y,f.length+0.15,0.25,0.35,white,0.17);
      for(let y=1.3;y<6.5;y+=0.65)panel(group,f,0,base+y,f.length,0.08,0.06,trim,0.12);
    }
    const cp=isCross?centre(buildings.get(996791715)):{x:p.x,z:p.z};
    classicalDrum(group,cp,base,15.5,5.2,isCross?7.1:8,5.2,roof,true);
    for(const entry of classicalEntrances(b))classicalPortico(group,entry,base);
  }
  function emitBuilding(parent,b,base) {
    if(!['paraskeva-church','blue-tented-chapel','octagonal-shrine','parish-office','heritage-street','monastery-ruin','monastery-office','panel-balcony-block','kazan-icon-cathedral','monastery-wing','monastery-cross-church','monastery-nicholas-church'].includes(b.model))return false;
    const group=new THREE.Group();group.name=`KazanChurch/${b.id}`;group.userData.source=b.heightEvidence;
    if(b.model==='kazan-icon-cathedral')kazanCathedral(group,b,base);
    else if(b.model==='monastery-wing')monasteryWing(group,b,base);
    else if(b.model==='monastery-cross-church'||b.model==='monastery-nicholas-church')monasteryChurch(group,b,base);
    else if(b.model==='paraskeva-church')paraskeva(group,b,base);
    else if(b.model==='blue-tented-chapel'||b.model==='octagonal-shrine')chapel(group,b,base,b.model==='octagonal-shrine');
    else if(b.model==='parish-office')parish(group,b,base);
    else if(b.model==='monastery-ruin')ruinedTower(group,b,base);
    else if(b.model==='monastery-office')monasteryOffice(group,b,base);
    else if(b.model==='panel-balcony-block')panelBlock(group,b,base);
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
    const colliders = [], iron = plainMaterial(0x434b49), paving = plainMaterial(0x858982);
    for (const site of GEO.churchSites || []) {
      const group = new THREE.Group(); group.name = `KazanChurchGrounds/${site.id}`;
      group.userData.source = site.source; group.userData.geometrySource = site.geometrySource;
      const posts = new Map();
      courtyard(group,site.boundary,paving);
      for (const barrier of site.barriers) {
        const points = toPoints(barrier.pts); let distance = 0;
        for (let i = 1; i < points.length; i++) {
          const a = points[i-1], b = points[i], length = Math.hypot(b.x-a.x,b.z-a.z);
          if (length < 0.01) continue;
          const ux = (b.x-a.x)/length, uz = (b.z-a.z)/length, yaw = -Math.atan2(uz,ux);
          const gaps = barrier.openings.map(g=>({start:Math.max(0,g.start-distance),end:Math.min(length,g.end-distance)})).filter(g=>g.start<g.end);
          const ends = [...new Set([0,length,...gaps.flatMap(g=>[g.start,g.end])])].sort((a,b)=>a-b);
          for (let k=1;k<ends.length;k++) {
            const from=ends[k-1],to=ends[k];
            if(gaps.some(g=>(from+to)/2>=g.start && (from+to)/2<=g.end))continue;
            const count=Math.max(1,Math.ceil((to-from)/2.8));
            for (let j=0;j<count;j++) {
              const w=(to-from)/count,s=from+(j+0.5)*w,x=a.x+ux*s,z=a.z+uz*s;
              const levels=[-0.5,0,0.5].map(t=>roadHeight(null,x+ux*w*t,z+uz*w*t));
              const y=Math.max(...levels),low=Math.min(...levels)-0.12,wallTop=y+(barrier.kind==='fence'?0.3:1.1);
              box(group,x,(wallTop+low)/2,z,w+0.03,wallTop-low,0.3,white,yaw);
              for (const t of [-0.5,0.5]) {
                const px=x+ux*w*t,pz=z+uz*w*t;
                posts.set(`${px.toFixed(3)}/${pz.toFixed(3)}`,{x:px,z:pz,yaw});
              }
              const ring=[x-ux*w/2+uz*0.2,z-uz*w/2-ux*0.2,x+ux*w/2+uz*0.2,z+uz*w/2-ux*0.2,
                x+ux*w/2-uz*0.2,z+uz*w/2+ux*0.2,x-ux*w/2-uz*0.2,z-uz*w/2+ux*0.2];
              colliders.push(draw.buildingCollider({ring,holes:[],h:1.9,minHeight:low-y},y));
              const ironHeight=y+1.8-wallTop;
              for (let u=-w/2+0.2;u<w/2;u+=0.23) box(group,x+ux*u,wallTop+ironHeight/2,z+uz*u,0.035,ironHeight,0.035,iron,yaw);
              box(group,x,y+1.8,z,w,0.05,0.05,iron,yaw);
            }
          }
          distance += length;
        }
      }
      for(const {x,z,yaw} of posts.values()){
        const y=roadHeight(null,x,z);
        box(group,x,y+0.95,z,0.5,1.9,0.5,white,yaw);
        const cap=new THREE.ConeGeometry(0.43,0.25,4);cap.rotateY(Math.PI/4+yaw);solid(group,cap,blue,x,y+2.02,z);
      }
      flush(group);parent.add(group);
    }
    return colliders;
  }
  services.churchSurfaceHeight = churchSurfaceHeight;
  return { emitBuilding, buildGrounds, collisionShapes };
}
