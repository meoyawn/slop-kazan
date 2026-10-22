(function () {
const { THREE, GEO, ROADS, LANDMARK_SITES, terrainHeight, surfaceHeight, waterAt, isOnLand, buildingAt,
  toPoints, boundsOf, pointInPoly, createRoadSurfaceMaterial, createSidewalkMaterial, createPreWarBuildingMaterial,
  createCurtainWallMaterial, createWaterMaterial, createParkLampGlobeMaterial, createTreeField } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;
const batches = new Map();
const roofMaterials = new Map();
const facadeMaterials = new Map();
const customSites = new Set(['Kazan Family Center', 'Epiphany Bell Tower']);

function colour(value, fallback) {
  if (!value || (!/^#[0-9a-f]{3,6}$/i.test(value) && !(value.toLowerCase() in THREE.Color.NAMES))) return fallback;
  return new THREE.Color(value).getHex();
}

function plainMaterial(hex, metalness = 0) {
  const key = `${hex}/${metalness}`;
  if (!roofMaterials.has(key)) roofMaterials.set(key, new THREE.MeshStandardNodeMaterial({ color: hex, metalness, roughness: metalness ? 0.38 : 0.85 }));
  return roofMaterials.get(key);
}

function facadeMaterial(b) {
  const brick = /brick/.test(b.material), glass = /glass/.test(b.material);
  const base = colour(b.colour, brick ? 0xa9674c : /concrete|panel/.test(b.material) ? 0xb7b7aa : /house|detached/.test(b.kind) ? 0xd7c8aa : 0xd6cfbb);
  const key = `${base}/${glass}/${b.kind === 'garage'}`;
  if (!facadeMaterials.has(key)) {
    facadeMaterials.set(key, b.kind === 'garage' || b.h < 4 ? plainMaterial(base) : glass ? createCurtainWallMaterial({ glassTint: base, floorHeight: 3, windowWidth: 2.3 }) :
      createPreWarBuildingMaterial({ stoneColor: base, trimColor: brick ? 0xc5ab8b : 0xe1d8c3, floorHeight: 3,
        windowWidth: 2.8, windowRatioX: 0.44, windowRatioY: 0.55, litProbability: 0.26, seed: 49.108 }));
  }
  return facadeMaterials.get(key);
}

function roofMaterial(b) {
  return plainMaterial(colour(b.roofColour, /metal|copper/.test(b.roofMaterial) ? 0x53776d : /tile/.test(b.roofMaterial) ? 0x905f47 : 0x65645c), /metal|copper/.test(b.roofMaterial) ? 0.45 : 0.05);
}

function emit(group, geometry, material) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const key = `${group.uuid}/${material.uuid}/${Math.floor((box.min.x + box.max.x) / 768)}/${Math.floor((box.min.z + box.max.z) / 768)}`;
  if (!batches.has(key)) batches.set(key, { group, material, geometries: [] });
  batches.get(key).geometries.push(geometry);
}

function flush(group) {
  for (const [key, batch] of batches) {
    if (batch.group !== group) continue;
    const geometry = mergeGeometries(batch.geometries, false);
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.castShadow = group.name !== 'KazanCityGrid';
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of batch.geometries) g.dispose();
    batches.delete(key);
  }
}

function shapeOf(ring, holes = []) {
  const p = toPoints(ring);
  const shape = new THREE.Shape(p.map((v) => new THREE.Vector2(v.x, -v.z)));
  for (const hole of holes) {
    if (pointInPoly(p, hole[0], hole[1])) shape.holes.push(new THREE.Path(toPoints(hole).map((v) => new THREE.Vector2(v.x, -v.z))));
  }
  return shape;
}

function polygon(ring, y, material, group, holes = []) {
  const geometry = new THREE.ShapeGeometry(shapeOf(ring, holes));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setY(i, typeof y === 'number' ? y : y(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  emit(group, geometry.toNonIndexed(), material);
}

function box(group, x, y, z, w, h, d, material, yaw = 0) {
  const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geometry.rotateY(yaw).translate(x, y, z);
  emit(group, geometry, material);
}

function solid(group, geometry, material, x, y, z, scale = [1, 1, 1]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.scale(...scale).translate(x, y, z);
  emit(group, g, material);
}

/** Curved street strips sampled every six metres to follow the same ground as the vehicles. */
function roadStrip(group, road, width, offset, material) {
  const position = [], uv = [];
  let travelled = 0;
  for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i], b = road.pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const nx = (a.z - b.z) / len * width / 2, nz = (b.x - a.x) / len * width / 2;
    const steps = Math.max(1, Math.ceil(len / 6));
    for (let k = 0; k < steps; k++) {
      const x0 = a.x + (b.x - a.x) * k / steps, z0 = a.z + (b.z - a.z) * k / steps;
      const x1 = a.x + (b.x - a.x) * (k + 1) / steps, z1 = a.z + (b.z - a.z) * (k + 1) / steps;
      const corners = [[x0 - nx, z0 - nz, 0, travelled + len * k / steps], [x0 + nx, z0 + nz, width, travelled + len * k / steps],
        [x1 + nx, z1 + nz, width, travelled + len * (k + 1) / steps], [x1 - nx, z1 - nz, 0, travelled + len * (k + 1) / steps]];
      for (const j of [0, 1, 2, 0, 2, 3]) {
        const [x, z, u, v] = corners[j];
        position.push(x, surfaceHeight(x, z) + offset, z);
        uv.push(u, v);
      }
    }
    travelled += len;
  }
  if (!position.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  emit(group, geometry, material);
}

function groundTexture(b, resolution) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7c7f69';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  function paint(body) {
    ctx.beginPath();
    for (const ring of [...body.rings, ...(body.holes || [])]) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = (ring[i] - b.minX) / (b.maxX - b.minX) * canvas.width;
        const y = (ring[i + 1] - b.minZ) / (b.maxZ - b.minZ) * canvas.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  ctx.fillStyle = '#526b39';
  for (const park of GEO.parks) paint(park);
  ctx.fillStyle = '#455b3b';
  for (const forest of GEO.forests || []) paint(forest);
  ctx.globalCompositeOperation = 'destination-out';
  for (const water of GEO.water) paint(water);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function terrainMesh(group, b, step, material, textureBounds) {
  const geometry = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ,
    Math.ceil((b.maxX - b.minX) / step), Math.ceil((b.maxZ - b.minZ) / step));
  geometry.rotateX(-Math.PI / 2).translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - 0.03);
    uv.setXY(i, (p.getX(i) - textureBounds.minX) / (textureBounds.maxX - textureBounds.minX),
      1 - (p.getZ(i) - textureBounds.minZ) / (textureBounds.maxZ - textureBounds.minZ));
  }
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'FABDEM_Terrain';
  ground.receiveShadow = true;
  group.add(ground);
}

function buildCityGrid(scene) {
  const group = new THREE.Group();
  group.name = 'KazanCityGrid';
  const near = GEO.nearTerrainBounds, far = GEO.terrainBounds;
  const nearMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.98, map: groundTexture(near, 4096), alphaTest: 0.5 });
  const farMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.98, map: groundTexture(far, 2048), alphaTest: 0.5 });
  terrainMesh(group, near, GEO.elevation.step, nearMaterial, near);
  for (const bounds of [
    { minX: far.minX, maxX: near.minX, minZ: far.minZ, maxZ: far.maxZ },
    { minX: near.maxX, maxX: far.maxX, minZ: far.minZ, maxZ: far.maxZ },
    { minX: near.minX, maxX: near.maxX, minZ: far.minZ, maxZ: near.minZ },
    { minX: near.minX, maxX: near.maxX, minZ: near.maxZ, maxZ: far.maxZ }
  ]) terrainMesh(group, bounds, GEO.elevation.far.step, farMaterial, far);

  const water = createWaterMaterial();
  for (const body of GEO.water) for (const ring of body.rings) polygon(ring, 0, water, group, body.holes);
  const roadMaterial = createRoadSurfaceMaterial(), pavement = createSidewalkMaterial();
  for (const r of ROADS) {
    if (r.walk) roadStrip(group, r, r.w, 0.055, pavement);
    else {
      roadStrip(group, r, r.w + (r.bridge ? 2 : 5), 0.045, pavement);
      roadStrip(group, r, r.w, 0.065, roadMaterial);
    }
  }
  flush(group);
  scene.add(group);
  return { group, sidewalks: [], footprints: [], colliders: [], highwayLanes: [] };
}

function buildBoroughs() {
  return { colliders: [] };
}

function buildingBase(ring) {
  let top = -Infinity;
  for (let i = 0; i < ring.length; i += 2) top = Math.max(top, terrainHeight(ring[i], ring[i + 1]));
  return top;
}

function buildingCollider(b, base) {
  const poly = toPoints(b.ring), bounds = boundsOf(poly);
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const angle = Math.atan2(c.z - a.z, c.x - a.x), cs = Math.cos(angle), sn = -Math.sin(angle);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of poly) {
      const x = v.x * cs - v.z * sn, z = v.x * sn + v.z * cs;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    const area = (x1 - x0) * (z1 - z0);
    if (!best || area < best.area) best = { area, cs, sn, x0, x1, z0, z1 };
  }
  const cx = (best.x0 + best.x1) / 2, cz = (best.z0 + best.z1) / 2;
  const bottom = b.minHeight ? base + b.minHeight : Math.min(...poly.map((p) => terrainHeight(p.x, p.z))) - 0.2;
  return { ...bounds, poly, holes: b.holes.map(toPoints).filter((h) => pointInPoly(poly, h[0].x, h[0].z)), minY: bottom, maxY: base + b.h,
    obb: { cx: cx * best.cs + cz * best.sn, cz: -cx * best.sn + cz * best.cs,
      hx: (best.x1 - best.x0) / 2, hz: (best.z1 - best.z0) / 2, cs: best.cs, sn: best.sn } };
}

function splitExtrusion(group, geometry, cap, facade) {
  for (const part of geometry.groups) {
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      g.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(part.start * attr.itemSize, (part.start + part.count) * attr.itemSize), attr.itemSize));
    }
    emit(group, g, part.materialIndex === 0 ? cap : facade);
  }
  geometry.dispose();
}

function pitchedRoof(group, b, base, height, material) {
  const poly = toPoints(b.ring);
  const rings = [poly, ...b.holes.map(toPoints).filter((h) => pointInPoly(poly, h[0].x, h[0].z))];
  const source = new THREE.ShapeGeometry(shapeOf(b.ring, b.holes)).toNonIndexed();
  source.rotateX(-Math.PI / 2);
  const p = source.attributes.position, pending = [], triangles = [];
  for (let i = 0; i < p.count; i += 3) pending.push([0, 1, 2].map((j) => [p.getX(i + j), p.getZ(i + j)]));
  while (pending.length) {
    const t = pending.pop();
    let edge = 0, longest = 0;
    for (let i = 0; i < 3; i++) {
      const a = t[i], c = t[(i + 1) % 3], d = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2;
      if (d > longest) { longest = d; edge = i; }
    }
    const a = t[edge], c = t[(edge + 1) % 3], d = t[(edge + 2) % 3];
    if (longest > 16) {
      const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      pending.push([a, mid, d], [mid, c, d]);
    } else {
      const center = [(a[0] + c[0] + d[0]) / 3, (a[1] + c[1] + d[1]) / 3];
      triangles.push([a, c, center], [c, d, center], [d, a, center]);
    }
  }
  source.dispose();
  const distances = new Map();
  function boundaryDistance(point) {
    const key = `${point[0]},${point[1]}`;
    if (distances.has(key)) return distances.get(key);
    let best = Infinity;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], c = ring[i], dx = c.x - a.x, dz = c.z - a.z;
      const t = Math.max(0, Math.min(1, ((point[0] - a.x) * dx + (point[1] - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(point[0] - a.x - dx * t, point[1] - a.z - dz * t));
    }
    distances.set(key, best);
    return best;
  }
  let maxDistance = 0.001;
  for (const triangle of triangles) for (const point of triangle) maxDistance = Math.max(maxDistance, boundaryDistance(point));
  const obb = buildingCollider(b, base).obb, useX = obb.hx < obb.hz;
  function roofY(point) {
    const dx = point[0] - obb.cx, dz = point[1] - obb.cz;
    const across = useX ? dx * obb.cs - dz * obb.sn : dx * obb.sn + dz * obb.cs;
    const fraction = b.roofShape === 'gabled' ? Math.max(0, 1 - Math.abs(across) / (useX ? obb.hx : obb.hz)) : boundaryDistance(point) / maxDistance;
    return base + b.h - height + height * fraction;
  }
  const vertices = [], uvs = [];
  for (const triangle of triangles) for (const point of triangle) {
    vertices.push(point[0], roofY(point), point[1]);
    uvs.push(point[0] / 3, point[1] / 3);
  }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roof.computeVertexNormals();
  emit(group, roof, material);
  if (b.roofShape === 'gabled') {
    const walls = [], wallUVs = [], eaves = base + b.h - height;
    for (const [index, ring] of rings.entries()) {
      let area = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j], c = ring[i];
        const corners = [[a.x, eaves, a.z], [c.x, eaves, c.z], [c.x, roofY([c.x, c.z]), c.z], [a.x, roofY([a.x, a.z]), a.z]];
        const order = (area > 0) !== (index > 0) ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const n of order) { walls.push(...corners[n]); wallUVs.push(corners[n][0] / 3, corners[n][1] / 3); }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(wallUVs, 2));
    geometry.computeVertexNormals();
    emit(group, geometry, plainMaterial(colour(b.colour, 0xd6cfbb)));
  }
}

function buildingRoof(group, b, base, bounds, roofHeight, material) {
  if (roofHeight <= 0) return;
  const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
  const w = bounds.maxX - bounds.minX, d = bounds.maxZ - bounds.minZ;
  if (/dome|round/.test(b.roofShape)) {
    solid(group, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material, x, base + b.h - roofHeight, z, [w / 2, roofHeight, d / 2]);
  } else if (b.roofShape === 'onion') {
    const profile = [[0.72, 0], [0.96, 0.2], [1, 0.4], [0.82, 0.62], [0.44, 0.82], [0.08, 0.98], [0, 1]];
    solid(group, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), 20), material, x, base + b.h - roofHeight, z, [w / 2, roofHeight, d / 2]);
  } else {
    pitchedRoof(group, b, base, roofHeight, material);
  }
}

function buildCityBlocks(scene) {
  const group = new THREE.Group();
  group.name = 'KazanCityBlocks';
  const colliders = [], allBlocks = [];
  const bases = new Map(GEO.buildings.filter((b) => !b.part).map((b) => [`${b.osmType}/${b.id}`, buildingBase(b.ring)]));
  const customParents = new Set(GEO.buildings.filter((b) => customSites.has(GEO.landmarks.find((l) => l.osmId === b.id)?.name)).map((b) => `${b.osmType}/${b.id}`));
  for (const b of GEO.buildings) {
    if (b.hasParts || customParents.has(`${b.osmType}/${b.id}`) || customParents.has(b.parent)) continue;
    const base = bases.get(b.parent) ?? buildingBase(b.ring), poly = toPoints(b.ring), bounds = boundsOf(poly);
    if (b.towerType === 'minaret') {
      const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
      const radius = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
      const spire = Math.min(10, b.h * 0.18), shaft = b.h - spire;
      const white = plainMaterial(0xe9e5d8), turquoise = plainMaterial(0x287d8c, 0.3);
      solid(group, new THREE.CylinderGeometry(radius * 0.72, radius, shaft, 8), white, x, base + shaft / 2, z);
      for (const y of [shaft * 0.62, shaft * 0.84]) solid(group, new THREE.CylinderGeometry(radius * 1.22, radius * 1.22, 0.8, 8), white, x, base + y, z);
      solid(group, new THREE.ConeGeometry(radius * 0.85, spire, 12), turquoise, x, base + shaft + spire / 2, z);
      colliders.push(buildingCollider(b, base));
      continue;
    }
    const cap = roofMaterial(b), facade = facadeMaterial(b);
    const curved = /dome|onion|round|pyramidal|hipped|gabled/.test(b.roofShape);
    const roofHeight = curved ? Math.min(b.h - b.minHeight, b.roofHeight || Math.min(6, (b.h - b.minHeight) * 0.3)) : 0;
    const wallHeight = Math.max(0.1, b.h - b.minHeight - roofHeight);
    const geometry = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: wallHeight, steps: 1, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base + b.minHeight, 0);
    splitExtrusion(group, geometry, cap, facade);
    buildingRoof(group, b, base, bounds, roofHeight, cap);
    if (!b.minHeight) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length];
        const y = Math.min(terrainHeight(a.x, a.z), terrainHeight(c.x, c.z));
        if (base - y < 0.15) continue;
        const length = Math.hypot(c.x - a.x, c.z - a.z);
        box(group, (a.x + c.x) / 2, (y + base) / 2, (a.z + c.z) / 2, length, base - y, 0.16, plainMaterial(0xaaa393), -Math.atan2(c.z - a.z, c.x - a.x));
      }
    }
    colliders.push(buildingCollider(b, base));
    allBlocks.push({ footprints: [{ pts: poly, h: b.h }] });
  }
  flush(group);
  scene.add(group);
  return { group, colliders, allBlocks, quadtree: null, update() {} };
}

function buildLandmarks(scene) {
  const group = new THREE.Group();
  group.name = 'KazanLandmarks';
  const white = plainMaterial(0xe8dfc8), brick = plainMaterial(0xa95335), green = plainMaterial(0x356a66, 0.4), copper = plainMaterial(0xb88745, 0.65);
  const colliders = [];
  for (const wall of GEO.walls) {
    const pts = toPoints(wall.pts);
    for (let i = 0; i + 1 < pts.length; i++) {
      const start = pts[i], end = pts[i + 1], length = Math.hypot(end.x - start.x, end.z - start.z);
      const steps = Math.max(1, Math.ceil(length / 6));
      for (let k = 0; k < steps; k++) {
        const a = { x: start.x + (end.x - start.x) * k / steps, z: start.z + (end.z - start.z) * k / steps };
        const b = { x: start.x + (end.x - start.x) * (k + 1) / steps, z: start.z + (end.z - start.z) * (k + 1) / steps };
        const len = length / steps, yaw = -Math.atan2(b.z - a.z, b.x - a.x);
        const low = Math.min(terrainHeight(a.x, a.z), terrainHeight(b.x, b.z));
        const top = Math.max(terrainHeight(a.x, a.z), terrainHeight(b.x, b.z)) + 8;
        box(group, (a.x + b.x) / 2, (low + top) / 2, (a.z + b.z) / 2, len, top - low, 2.7, white, yaw);
        for (let s = 1; s < len; s += 3) box(group, a.x + (b.x - a.x) * s / len, top + 0.5, a.z + (b.z - a.z) * s / len, 1.2, 1, 2.8, white, yaw);
        colliders.push({ minX: Math.min(a.x, b.x) - 1.5, maxX: Math.max(a.x, b.x) + 1.5, minZ: Math.min(a.z, b.z) - 1.5, maxZ: Math.max(a.z, b.z) + 1.5, minY: low - 0.2, maxY: top + 1,
          obb: { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, hx: len / 2, hz: 1.5, cs: Math.cos(yaw), sn: Math.sin(yaw) } });
      }
    }
  }
  for (const name of customSites) {
    const s = LANDMARK_SITES[name], b = GEO.buildings.find((b) => b.id === s.osmId), base = buildingBase(b.ring);
    if (name === 'Kazan Family Center') {
      const profile = [[0.58, 0], [0.68, 0.15], [0.82, 0.25], [0.78, 0.34], [0.65, 0.4], [0.72, 0.45], [0.9, 0.65], [1, 0.86], [1, 1], [0.88, 1]];
      solid(group, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), 48), copper, s.x, base, s.z, [s.w / 2, 32, s.d / 2]);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        box(group, s.x + Math.sin(a) * s.w * 0.26, base + 7, s.z + Math.cos(a) * s.d * 0.26, 1.6, 14, 1.6, white);
      }
    } else {
      const height = name === 'Suyumbike Tower' ? 58 : 74;
      const w = Math.min(s.w, s.d);
      let y = base;
      for (const [scale, ratio] of [[1, 0.29], [0.84, 0.2], [0.68, 0.14], [0.52, 0.12], [0.4, 0.09]]) {
        const h = height * ratio;
        box(group, s.x, y + h / 2, s.z, w * scale, h, w * scale, brick);
        box(group, s.x, y + h, s.z, w * scale + 0.4, 0.55, w * scale + 0.4, white);
        y += h;
      }
      solid(group, new THREE.ConeGeometry(w * 0.2, height * 0.16, 8), green, s.x, y + height * 0.08, s.z);
    }
    colliders.push(buildingCollider({ ...b, h: name === 'Kazan Family Center' ? 32 : name === 'Suyumbike Tower' ? 58 : 74 }, base));
  }
  flush(group);
  scene.add(group);
  return { group, colliders };
}

function buildStreetDetails(scene) {
  const group = new THREE.Group();
  group.name = 'KazanStreetDetails';
  const trees = [], pole = plainMaterial(0x333e3a), lamp = createParkLampGlobeMaterial();
  for (const r of ROADS.filter((r) => !r.walk && r.w >= 10 && !r.bridge)) {
    let along = 0;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 20 - along % 48; s < len; s += 48) {
        if (s < 0) continue;
        const x = a.x + (b.x - a.x) * s / len - (b.z - a.z) / len * (r.w / 2 + 1.5);
        const z = a.z + (b.z - a.z) * s / len + (b.x - a.x) / len * (r.w / 2 + 1.5);
        if (!isOnLand(x, z) || buildingAt(x, z)) continue;
        const y = surfaceHeight(x, z);
        box(group, x, y + 4, z, 0.14, 8, 0.14, pole);
        box(group, x, y + 8, z, 1.1, 0.18, 0.6, lamp);
      }
      along += len;
    }
  }
  let seed = 49108;
  function random() { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }
  for (const park of GEO.parks) for (const ring of park.rings) {
    const poly = toPoints(ring), b = boundsOf(poly), count = Math.min(35, Math.ceil((b.maxX - b.minX) * (b.maxZ - b.minZ) / 1100));
    for (let i = 0; i < count; i++) {
      const x = b.minX + random() * (b.maxX - b.minX), z = b.minZ + random() * (b.maxZ - b.minZ);
      if (!pointInPoly(poly, x, z) || waterAt(x, z) || buildingAt(x, z)) continue;
      trees.push({ x, z, y: terrainHeight(x, z), scale: 0.65 + random() * 0.35, species: i % 3 });
    }
  }
  flush(group);
  scene.add(group);
  const treeField = createTreeField(scene, trees);
  return { group, footprints: [], signalClock: { value: 0 }, treeField };
}

window.NYC = { ...window.NYC, buildCityGrid, buildBoroughs, buildCityBlocks, buildLandmarks, buildStreetDetails };
})();
