import * as THREE from 'three/webgpu';
import { createStaticPalette } from './static-palette.js';
import { createInstanceVisibility } from './instance-visibility.js';
import { GEO, runtime } from './kazan-runtime.js';
import { ROADS, LANDMARK_SITES, TERRAIN_MESHES, HELIPADS, SPAWN, terrainHeight, groundSurfaceHeight, groundMeshHeight, terrainVertexHeight, excavationFloor, surfaceHeight, waterAt, isOnLand, buildingAt, landcoverAt, nearestRoads, toPoints, boundsOf, pointInPoly, roadHeight, projectGroundPolygon } from './kazan-config.js';
import { createRoadSurfaceMaterial, createSidewalkMaterial, createPreWarBuildingMaterial, createCurtainWallMaterial, createWaterMaterial, createParkLampGlobeMaterial } from './tsl-materials.js';
import { createKazanVegetation } from './kazan-vegetation.js';
import { createObservedFacadeMaterial, createDistantFacadeMaterial, createDistantFacadeGeometry } from './kazan-facades.js';
import { createKazanLandmarkModels } from './kazan-landmark-models.js';
import { createKazanCampusModels } from './kazan-campus.js';
import { createKazanGates } from './kazan-gates.js';
import { createKazanParking } from './kazan-parking.js';
import { createKazanRoadStructures } from './kazan-road-structures.js';
import { createKazanMStructures } from './kazan-m-structures.js';
import { createKazanRecreation } from './kazan-recreation.js';
import { createKazanConstruction } from './kazan-construction.js';
import { createKazanAirports } from './kazan-airports.js';
import { createKazanRailways } from './kazan-railways.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createKazanStationModels } from './kazan-stations.js';
import { createKazanChurchModels } from './kazan-churches.js';
import { createKazanPalaceModels } from './kazan-palace.js';
import { createKazanTrams } from './kazan-trams.js';
import { createKazanPowerLines } from './kazan-power-lines.js';
import { createKazanPowerStationModels } from './kazan-power-stations.js';
import { createKazanAircraft } from './kazan-aircraft.js';
import { createKazanFactoryAdmin } from './kazan-factory-admin.js';
import { createKazanFuelStations } from './kazan-fuel-stations.js';
import { createKazanPedestrianStructures } from './kazan-pedestrian-structures.js';

const BATCH_SIZE = 2048;
const batches = new Map();
const boxBatches = new Map();
const staticPalette = createStaticPalette();
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const boxTransform = new THREE.Object3D();
const roofMaterials = new Map();
const facadeMaterials = new Map();
const customSites = new Set(['Kazan Family Center', 'Epiphany Bell Tower']);
let coverCanvas = null;
const reviewedLandmarks = createKazanLandmarkModels({ plainMaterial, box, solid, shapeOf, splitExtrusion, pitchedRoof, flush, emit });
const campusModels = createKazanCampusModels({ plainMaterial, box, solid, shapeOf, splitExtrusion, emit, flush, pitchedRoof, label: reviewedLandmarks.label });
const aircraftModels = createKazanAircraft({ plainMaterial, emit, flush, label: reviewedLandmarks.label, buildingCollider });
const factoryAdmin = createKazanFactoryAdmin({ plainMaterial, box, emit, flush, shapeOf, splitExtrusion, pitchedRoof, label: reviewedLandmarks.label });
const fuelStations = createKazanFuelStations({ plainMaterial, box, emit, flush, shapeOf, polygon, label: reviewedLandmarks.label, buildingCollider });
const pedestrianStructures = createKazanPedestrianStructures({ plainMaterial, box, emit, flush, buildingCollider });
const stationModels = createKazanStationModels({ plainMaterial, box, solid, shapeOf, splitExtrusion, emit, pitchedRoof, label: reviewedLandmarks.label });
const churchModels = createKazanChurchModels({ plainMaterial, box, solid, shapeOf, splitExtrusion, emit, pitchedRoof, flush, polygon, buildingCollider });
const palaceModels = createKazanPalaceModels({ plainMaterial, box, solid, shapeOf, splitExtrusion, emit, pitchedRoof, flush, label: reviewedLandmarks.label });
const powerStationModels = createKazanPowerStationModels({plainMaterial,solid,box,flush,buildingCollider,shapeOf,splitExtrusion,pitchedRoof});
const gateModels = createKazanGates({ plainMaterial, box, solid, shapeOf, splitExtrusion, polygon, emit,
  buildingCollider, pitchedRoof, buildingRoof, roofMaterial, facadeMaterial });
const constructionSites = createKazanConstruction({ plainMaterial, box, solid, shapeOf, polygon, emit });
const mStructures = createKazanMStructures({ plainMaterial, box, solid, flush });
const recreationSites = createKazanRecreation({ plainMaterial, box, solid, polygon, emit, flush });

function landcoverCanvas() {
  if (coverCanvas) return coverCanvas;
  const c = GEO.landcover;
  coverCanvas = document.createElement('canvas');
  coverCanvas.width = Math.ceil(c.cols / 2); coverCanvas.height = Math.ceil(c.rows / 2);
  const ctx = coverCanvas.getContext('2d'), data = ctx.createImageData(coverCanvas.width, coverCanvas.height);
  const palette = { 10: [56, 83, 48], 20: [103, 119, 74], 30: [116, 135, 78], 40: [152, 145, 94],
    50: [132, 130, 111], 60: [174, 164, 133], 80: [102, 126, 111], 90: [92, 119, 78] };
  for (let row = 0; row < coverCanvas.height; row++) for (let col = 0; col < coverCanvas.width; col++) {
    const shade = palette[landcoverAt(c.x0 + col * c.step * 2, c.z0 + row * c.step * 2)] || [124, 127, 105];
    data.data.set([...shade, 255], (row * coverCanvas.width + col) * 4);
  }
  ctx.putImageData(data, 0, 0);
  return coverCanvas;
}

function colour(value, fallback) {
  if (!value || (!/^#[0-9a-f]{3,6}$/i.test(value) && !(value.toLowerCase() in THREE.Color.NAMES))) return fallback;
  return new THREE.Color(value).getHex();
}

function plainMaterial(hex, metalness = 0) {
  const key = `${hex}/${metalness}`;
  if (!roofMaterials.has(key)) roofMaterials.set(key, staticPalette.register(new THREE.MeshStandardNodeMaterial({ color: hex, metalness, roughness: metalness ? 0.38 : 0.85 })));
  return roofMaterials.get(key);
}

function facadeMaterial(b) {
  if (b.appearance && !/glass/.test(b.material)) return createObservedFacadeMaterial(b.appearance);
  const brick = /brick/.test(b.material), glass = /glass/.test(b.material);
  const base = facadeColour(b);
  if (b.kind === 'garage' || b.h < 4) return plainMaterial(base);
  const key = `${base}/${glass}`;
  if (!facadeMaterials.has(key)) {
    facadeMaterials.set(key, glass ? createCurtainWallMaterial({ glassTint: base, floorHeight: 3, windowWidth: 2.3 }) :
      createPreWarBuildingMaterial({ stoneColor: base, trimColor: brick ? 0xc5ab8b : 0xe1d8c3, floorHeight: 3,
        windowWidth: 2.8, windowRatioX: 0.44, windowRatioY: 0.55, litProbability: 0.26, seed: 49.108 }));
  }
  return facadeMaterials.get(key);
}

function facadeColour(b) {
  if (b.construction && b.construction.stage !== 'renovation') return 0x8b795d;
  const brick = /brick/.test(b.material);
  return colour(b.colour, brick ? 0xa9674c : /concrete|panel/.test(b.material) ? 0xb7b7aa : /house|detached/.test(b.kind) ? 0xd7c8aa : 0xd6cfbb);
}

const roofColour = (b) => b.construction && b.construction.stage !== 'renovation' ? 0x8b795d : colour(b.roofColour, /metal|copper/.test(b.roofMaterial) ? 0x53776d : /tile/.test(b.roofMaterial) ? 0x905f47 : 0x65645c);

function roofMaterial(b) {
  return plainMaterial(roofColour(b), /metal|copper/.test(b.roofMaterial) ? 0.45 : 0.05);
}

function emit(group, geometry, material) {
  material = staticPalette.paint(geometry, material);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const key = `${group.uuid}/${material.uuid}/${Math.floor((box.min.x + box.max.x) / (2 * BATCH_SIZE))}/${Math.floor((box.min.z + box.max.z) / (2 * BATCH_SIZE))}/${Boolean(geometry.index)}`;
  if (!batches.has(key)) batches.set(key, { group, material, geometries: [] });
  batches.get(key).geometries.push(geometry);
}

function flush(group) {
  for (const [key, batch] of boxBatches) {
    if (batch.group !== group) continue;
    if (instanceableBoxMaterial(batch.material)) {
      const mesh = new THREE.InstancedMesh(unitBox.clone(), batch.material, 0);
      mesh.name = `StaticBoxes/${group.name}`;
      mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(new Float32Array(batch.matrices), 16);
      mesh.count = batch.matrices.length / 16;
      if (batch.colours) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(batch.colours), 3);
      mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
      mesh.castShadow = group.name !== 'KazanCityGrid';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    } else {
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < batch.matrices.length; i += 16) {
        matrix.fromArray(batch.matrices, i);
        const geometry = unitBox.toNonIndexed().applyMatrix4(matrix);
        if (batch.material.userData.observedFacade) facadeUVs(geometry);
        emit(group, geometry, batch.material);
      }
    }
    boxBatches.delete(key);
  }
  for (const [key, batch] of batches) {
    if (batch.group !== group) continue;
    const geometry = mergeGeometries(batch.geometries, false);
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
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

function box(group, x, y, z, w, h, d, material, yaw = 0, orientation = null) {
  if (w > 0 && h > 0 && d > 0 && !group.name.startsWith('Tram/') && instanceableBoxMaterial(material)) {
    const palette = staticPalette.materialFor(material);
    const shared = palette || material;
    const key = `${group.uuid}/${shared.uuid}/${Math.floor(x / BATCH_SIZE)}/${Math.floor(z / BATCH_SIZE)}`;
    if (!boxBatches.has(key)) boxBatches.set(key, { group, material: shared, matrices: [], colours: palette ? [] : null });
    const batch = boxBatches.get(key);
    if (batch.colours) batch.colours.push(material.color.r, material.color.g, material.color.b);
    boxTransform.position.set(x, y, z);
    if (orientation) boxTransform.quaternion.copy(orientation);
    else boxTransform.rotation.set(0, yaw, 0);
    boxTransform.scale.set(w, h, d);
    boxTransform.updateMatrix();
    boxTransform.matrix.toArray(batch.matrices, batch.matrices.length);
    return;
  }
  const geometry = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (orientation) geometry.applyQuaternion(orientation);
  else geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  if (material.userData.observedFacade) facadeUVs(geometry);
  emit(group, geometry, material);
}

function instanceableBoxMaterial(material) {
  return material.isMeshStandardNodeMaterial && !material.userData.observedFacade &&
    !material.colorNode && !material.normalNode && !material.positionNode && !material.opacityNode &&
    !material.emissiveNode && !material.roughnessNode && !material.metalnessNode && !material.aoNode;
}

function solid(group, geometry, material, x, y, z, scale = [1, 1, 1]) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.scale(...scale).translate(x, y, z);
  if (material.userData.observedFacade) facadeUVs(g);
  emit(group, g, material);
}

function facadeUVs(geometry, base = 0) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = [];
  for (let i = 0; i < p.count; i++) uv.push(-p.getX(i) * n.getZ(i) + p.getZ(i) * n.getX(i), p.getY(i) - base);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

/** Road triangles follow the terrain facets used by vehicle heights, with extra detail only at changes of slope. */
function roadStrip(group, road, width, offset, material, innerWidth = 0) {
  const position = [], uv = [], indices = [];
  function appendTriangle(a, b, c, depth = 0) {
    if (!road.gradeSamples && depth < 7) {
      const points = [a, b, c], midpoints = [], errors = [], lengths = [];
      for (let i = 0; i < 3; i++) {
        const p = points[i], q = points[(i + 1) % 3], m = p.map((value, j) => (value + q[j]) / 2);
        m[4] = NYC.roadHeight(road, m[0], m[1]);
        midpoints.push(m); errors.push(Math.abs(m[4] - (p[4] + q[4]) / 2));
        lengths.push(Math.hypot(p[0] - q[0], p[1] - q[1]));
      }
      const centreError = Math.abs(NYC.roadHeight(road, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3) - (a[4] + b[4] + c[4]) / 3);
      if (Math.max(...errors, centreError) > 0.025 && Math.max(...lengths) > 0.5) {
        let edge = lengths.indexOf(Math.max(...lengths));
        if (Math.max(...errors) > 0.025) edge = errors.indexOf(Math.max(...errors));
        appendTriangle(points[edge], midpoints[edge], points[(edge + 2) % 3], depth + 1);
        appendTriangle(midpoints[edge], points[(edge + 1) % 3], points[(edge + 2) % 3], depth + 1);
        return;
      }
    }
    const first = position.length / 3;
    for (const p of [a, b, c]) {
      position.push(p[0], p[4] + offset, p[1]); uv.push(p[2], p[3]);
    }
    indices.push(first, first + 1, first + 2);
  }
  let travelled = 0;
  for (let i = 0; i + 1 < road.pts.length; i++) {
    const a = road.pts[i], b = road.pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.01) continue;
    const nx = (a.z - b.z) / len, nz = (b.x - a.x) / len;
    const bands = innerWidth > 0 ? [[-width / 2, -innerWidth / 2], [innerWidth / 2, width / 2]] : [[-width / 2, width / 2]];
    const steps = Math.max(1, Math.ceil(len / (road.gradeSamples || road.stepSegments ? 6 : 90)));
    for (let k = 0; k < steps; k++) {
      const x0 = a.x + (b.x - a.x) * k / steps, z0 = a.z + (b.z - a.z) * k / steps;
      const x1 = a.x + (b.x - a.x) * (k + 1) / steps, z1 = a.z + (b.z - a.z) * (k + 1) / steps;
      for (const [left, right] of bands) {
        const corners = [[x0 + nx * left, z0 + nz * left, left + width / 2, travelled + len * k / steps],
          [x0 + nx * right, z0 + nz * right, right + width / 2, travelled + len * k / steps],
          [x1 + nx * right, z1 + nz * right, right + width / 2, travelled + len * (k + 1) / steps],
          [x1 + nx * left, z1 + nz * left, left + width / 2, travelled + len * (k + 1) / steps]];
        if (!road.gradeSamples && !road.stepSegments) projectGroundPolygon(corners, appendProjectedPolygon);
        else {
          for (const p of corners) p.push(roadHeight(road, p[0], p[1]));
          appendTriangle(corners[0], corners[1], corners[2]);
          appendTriangle(corners[0], corners[2], corners[3]);
        }
      }
    }
    travelled += len;
  }
  if (!position.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  emit(group, geometry, material);

  function appendProjectedPolygon(face) {
    const first = position.length / 3;
    for (const p of face) {
      position.push(p[0], p[4] + offset, p[1]); uv.push(p[2], p[3]);
    }
    for (let i = 1; i + 1 < face.length; i++) indices.push(first, first + i, first + i + 1);
  }
}

function groundTexture(b, resolution) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7c7f69';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cover = GEO.landcover, coverImage = landcoverCanvas();
  ctx.drawImage(coverImage, (cover.x0 - b.minX) / (b.maxX - b.minX) * resolution,
    (cover.z0 - b.minZ) / (b.maxZ - b.minZ) * resolution, coverImage.width * cover.step * 2 / (b.maxX - b.minX) * resolution,
    coverImage.height * cover.step * 2 / (b.maxZ - b.minZ) * resolution);
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
  ctx.fillStyle = '#74836a';
  for (const cemetery of GEO.cemeteries || []) paint(cemetery);
  ctx.fillStyle = '#66696b';
  for (const parking of GEO.parkings || []) paint(parking);
  ctx.fillStyle = '#8b795d';
  for (const building of GEO.buildings) if (building.construction?.excavationDepth) paint({ rings: [building.ring], holes: building.holes });
  ctx.globalCompositeOperation = 'destination-out';
  for (const water of GEO.water) paint(water);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function terrainMesh(group, b, step, material, textureBounds, holes = []) {
  const geometry = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ,
    Math.ceil((b.maxX - b.minX) / step), Math.ceil((b.maxZ - b.minZ) / step));
  geometry.rotateX(-Math.PI / 2).translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const height = step === b.step ? terrainVertexHeight(b, p.getX(i), p.getZ(i)) : groundMeshHeight(p.getX(i), p.getZ(i));
    p.setY(i, height - 0.03);
    uv.setXY(i, (p.getX(i) - textureBounds.minX) / (textureBounds.maxX - textureBounds.minX),
      1 - (p.getZ(i) - textureBounds.minZ) / (textureBounds.maxZ - textureBounds.minZ));
  }
  if (holes.length) {
    const indices = [], source = geometry.index.array;
    for (let i = 0; i < source.length; i += 3) {
      const x = (p.getX(source[i]) + p.getX(source[i + 1]) + p.getX(source[i + 2])) / 3;
      const z = (p.getZ(source[i]) + p.getZ(source[i + 1]) + p.getZ(source[i + 2])) / 3;
      if (!holes.some((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ)) indices.push(source[i], source[i + 1], source[i + 2]);
    }
    geometry.setIndex(indices);
  }
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, material);
  ground.matrixAutoUpdate = ground.matrixWorldAutoUpdate = false;
  ground.name = 'FABDEM_Terrain';
  ground.receiveShadow = true;
  group.add(ground);
  return ground;
}

export function buildCityGrid(scene, initialPosition = SPAWN) {
  let phase = performance.now();
  function markPhase(name) {
    const end = performance.now();
    performance.measure(`city-grid/${name}`, { start: phase, end });
    phase = end;
  }
  const group = new THREE.Group();
  group.name = 'KazanCityGrid';
  const near = GEO.nearTerrainBounds, far = GEO.terrainBounds;
  const nearMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.98, map: groundTexture(near, runtime.lite ? 2048 : 4096), alphaTest: 0.5 });
  const farMaterial = new THREE.MeshStandardNodeMaterial({ roughness: 0.98, map: groundTexture(far, runtime.lite ? 1024 : 2048), alphaTest: 0.5 });
  markPhase('textures');
  const terrainTiles = [];
  for (const grid of TERRAIN_MESHES) {
    const detail = grid.coarse ? null : terrainMesh(group, grid, grid.step, grid.far ? farMaterial : nearMaterial, grid.far ? far : near, grid.holes);
    if (!grid.tile) continue;
    const coarse = grid.coarse ? terrainMesh(group, grid, 90, nearMaterial, near) : null;
    terrainTiles.push({ x: (grid.minX + grid.maxX) / 2, z: (grid.minZ + grid.maxZ) / 2, grid, detail, coarse });
  }
  markPhase('terrain');
  const water = createWaterMaterial();
  for (const body of GEO.water) for (const ring of body.rings) polygon(ring, 0, water, group, body.holes);
  markPhase('water');
  const roadMaterial = createRoadSurfaceMaterial(), pavement = createSidewalkMaterial();
  for (const r of ROADS) {
    if (r.pedestrianStructure) continue;
    if (r.parking) roadStrip(group, r, r.w, 0.09, roadMaterial);
    else if (r.kind === 'steps' && r.campus) continue;
    else if (r.campusAccess) roadStrip(group, r, r.w, 0.055, pavement);
    else if (r.walk) roadStrip(group, r, r.w, 0.055, pavement);
    else {
      roadStrip(group, r, r.w + (r.bridge ? 2 : 5), 0.045, pavement, r.w);
      roadStrip(group, r, r.w, 0.065, roadMaterial);
    }
  }
  markPhase('roads');
  createKazanAirports({ roadStrip, shapeOf, emit, plainMaterial }).build(group);
  flush(group);
  markPhase('merge');
  const structures = createKazanRoadStructures({ plainMaterial, box, emit, flush });
  group.add(structures.group);
  markPhase('road-structures');
  const railways = createKazanRailways({ plainMaterial, box, emit, flush, shapeOf });
  group.add(railways.group);
  markPhase('railways');
  const trams = createKazanTrams(scene, { plainMaterial, box, emit, flush, shapeOf, label: reviewedLandmarks.label });
  markPhase('trams');
  const power = createKazanPowerLines({plainMaterial,buildingCollider});
  group.add(power.group);
  markPhase('power-lines');
  const stationGrounds = powerStationModels.buildGrounds();
  group.add(stationGrounds.group);
  markPhase('infrastructure');
  scene.add(group);
  function update(x, z) {
    railways.update(x, z);
    power.update(x, z);
    for (const tile of terrainTiles) {
      const near = !tile.coarse || Math.hypot(x - tile.x, z - tile.z) < 6500;
      if (near && !tile.detail) tile.detail = terrainMesh(group, tile.grid, tile.grid.step, nearMaterial, GEO.nearTerrainBounds, tile.grid.holes);
      if (tile.detail) tile.detail.visible = near;
      if (tile.coarse) tile.coarse.visible = !near;
    }
  }
  update(initialPosition.x, initialPosition.z);
  markPhase('initial-terrain-detail');
  return { group, sidewalks: [], footprints: [], colliders: [...structures.colliders,...power.colliders,...stationGrounds.colliders], highwayLanes: [], update, trams };
}

function buildBoroughs() {
  return { colliders: [] };
}

function buildingBase(ring, excavationDepth = 0) {
  if (excavationDepth) return excavationFloor(ring, excavationDepth);
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
  const bottom = b.construction ? base - 0.2 : b.minHeight ? base + b.minHeight : Math.min(...poly.map((p) => terrainHeight(p.x, p.z))) - 0.2;
  return { ...bounds, poly, holes: b.holes.map(toPoints).filter((h) => pointInPoly(poly, h[0].x, h[0].z)), minY: bottom, maxY: base + b.h,
    obb: { cx: cx * best.cs + cz * best.sn, cz: -cx * best.sn + cz * best.cs,
      hx: (best.x1 - best.x0) / 2, hz: (best.z1 - best.z0) / 2, cs: best.cs, sn: best.sn } };
}

function splitExtrusion(group, geometry, cap, facade, base = 0, omitTop = false) {
  for (const part of geometry.groups) {
    const g = new THREE.BufferGeometry();
    let retained = null;
    if (omitTop && part.materialIndex === 0) {
      retained = [];
      for (let i = part.start; i < part.start + part.count; i += 3) {
        if (geometry.attributes.normal.getY(i) < 0.5) retained.push(i, i + 1, i + 2);
      }
      if (!retained.length) continue;
    }
    for (const [name, attr] of Object.entries(geometry.attributes)) {
      const values = retained ? new Float32Array(retained.flatMap((i) => Array.from(attr.array.subarray(i * attr.itemSize, (i + 1) * attr.itemSize)))) :
        attr.array.slice(part.start * attr.itemSize, (part.start + part.count) * attr.itemSize);
      g.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
    }
    if (part.materialIndex !== 0 && facade.userData.observedFacade) {
      facadeUVs(g, base);
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

function churchWalls(group, b, base, height, cap) {
  const wall = plainMaterial(colour(b.colour, 0xeeeadd)), glass = plainMaterial(0x263e43, 0.1);
  glass.side = THREE.DoubleSide;
  const body = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: height, bevelEnabled: false });
  body.rotateX(-Math.PI / 2).translate(0, base, 0);
  splitExtrusion(group, body, cap, wall);
  const poly = toPoints(b.ring);
  let area = 0;
  for (let i = 0; i < poly.length; i++) area += poly[i].x * poly[(i + 1) % poly.length].z - poly[(i + 1) % poly.length].x * poly[i].z;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length], dx = c.x - a.x, dz = c.z - a.z, length = Math.hypot(dx, dz);
    const yaw = -Math.atan2(dz, dx), side = area > 0 ? 1 : -1, nx = dz / length * side, nz = -dx / length * side;
    const ground = Math.min(terrainHeight(a.x, a.z), terrainHeight(c.x, c.z));
    if (base > ground + 0.1) box(group, (a.x + c.x) / 2, (base + ground) / 2, (a.z + c.z) / 2, length, base - ground, 0.3, wall, yaw);
    for (let s = 1.4; s < length - 1.2; s += 4.8) {
      const x = a.x + dx * s / length, z = a.z + dz * s / length;
      const arch = new THREE.Shape();
      arch.moveTo(-0.65, 0); arch.lineTo(0.65, 0); arch.lineTo(0.65, 2.1);
      arch.absarc(0, 2.1, 0.65, 0, Math.PI, false); arch.closePath();
      const window = new THREE.ShapeGeometry(arch);
      window.rotateY(yaw).translate(x + nx * 0.04, base + Math.max(1.5, height * 0.35), z + nz * 0.04);
      emit(group, window.toNonIndexed(), glass);
      box(group, x + dx * 1.2 / length + nx * 0.15, base + height / 2, z + dz * 1.2 / length + nz * 0.15, 0.28, height, 0.3, wall, yaw);
    }
  }
}

function onion(group, x, y, z, radius, height, material) {
  const profile = [[0.65, 0], [1, 0.25], [0.9, 0.52], [0.45, 0.8], [0, 1]];
  solid(group, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), 24), material, x, y, z, [radius, height, radius]);
  box(group, x, y + height + 0.9, z, 0.12, 1.8, 0.12, material);
  box(group, x, y + height + 1.15, z, 1.1, 0.12, 0.12, material);
}

/** One-storey retail fronts face the nearest public road; unknown tenant names are left unbranded. */
function retailPavilion(group, b, base, poly, bounds) {
  const wall = plainMaterial(colour(b.colour, 0x929792)), roof = roofMaterial(b), frame = plainMaterial(0x48514d, 0.25);
  const glass = plainMaterial(0x354c50, 0.38), fascia = plainMaterial(0x626e67);
  const geometry = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: b.h - 0.15, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2).translate(0, base, 0); splitExtrusion(group, geometry, roof, wall);
  const o = bounds.obb, cx = o.cx, cz = o.cz;
  box(group, cx, base + b.h - 0.08, cz, o.hx * 2 + 0.3, 0.16, o.hz * 2 + 0.3, roof, Math.atan2(o.sn, o.cs));
  let front = null, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], q = poly[(i + 1) % poly.length], length = Math.hypot(q.x - a.x, q.z - a.z);
    if (length < 1.4) continue;
    const x = (a.x + q.x) / 2, z = (a.z + q.z) / 2;
    let nx = -(q.z - a.z) / length, nz = (q.x - a.x) / length;
    if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const road = nearestRoads(x, z, 70).find((p) => !p.road.walk && !p.road.parking && !p.road.bridge && !p.road.tunnel && (p.x - x) * nx + (p.z - z) * nz > 0);
    if (road && road.dist < best) { best = road.dist; front = { x, z, nx, nz, length, yaw: -Math.atan2(q.z - a.z, q.x - a.x), ux: (q.x - a.x) / length, uz: (q.z - a.z) / length }; }
  }
  if (!front) return;
  const f = front, height = Math.min(2.3, b.h - 0.9), width = f.length - 0.35;
  box(group, f.x + f.nx * 0.06, base + height / 2 + 0.25, f.z + f.nz * 0.06, width, height, 0.12, glass, f.yaw);
  box(group, f.x + f.nx * 0.1, base + b.h - 0.45, f.z + f.nz * 0.1, f.length, 0.55, 0.2, fascia, f.yaw);
  box(group, f.x + f.nx * 0.36, base + b.h - 0.17, f.z + f.nz * 0.36, f.length + 0.2, 0.1, 0.8, roof, f.yaw);
  for (const offset of [-width / 2, width * 0.13, width / 2]) {
    box(group, f.x + f.ux * offset + f.nx * 0.14, base + height / 2 + 0.25,
      f.z + f.uz * offset + f.nz * 0.14, 0.07, height + 0.1, 0.07, frame, f.yaw);
  }
  box(group, f.x + f.nx * 0.14, base + height + 0.26, f.z + f.nz * 0.14, width, 0.07, 0.07, frame, f.yaw);
}

function emitBuilding(group, b, base, poly, bounds) {
    if (b.construction) {
      constructionSites.emitBuilding(group, b, base, poly, bounds);
      if (b.construction.stage !== 'renovation') return;
    }
    if (factoryAdmin.emitBuilding(group, b, base) || aircraftModels.emitBuilding(group, b, base) || campusModels.emitBuilding(group, b, base)) return;
    if (stationModels.emitBuilding(group, b, base)) return;
    if (churchModels.emitBuilding(group, b, base)) return;
    if (palaceModels.emitBuilding(group, b, base)) return;
    if (powerStationModels.emitBuilding(group, b, base)) return;
    if (gateModels.emitBuilding(group, b, base, bounds)) return;
    if (reviewedLandmarks.emitBuilding(group, b, base, bounds)) return;
    if (b.typology === 'retail-pavilion' && b.h <= 6) { retailPavilion(group, b, base, poly, bounds); return; }
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const small = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    if (b.model === 'taif-office') {
      const stone = plainMaterial(0xabb1af), cap = roofMaterial(b), glass = createCurtainWallMaterial({ glassTint: colour(b.colour, 0x48758f), floorHeight: 3.7, windowWidth: 1.8 });
      const bodyHeight = b.h * 0.69;
      const body = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: bodyHeight, bevelEnabled: false });
      body.rotateX(-Math.PI / 2).translate(0, base, 0);
      splitExtrusion(group, body, cap, glass);
      const pad = HELIPADS.find((p) => p.building === `${b.osmType}/${b.id}`);
      const x = pad?.x ?? cx, z = pad?.z ?? cz;
      const upperRing = [x - 17, z - 20, x + 17, z - 20, x + 17, z + 20, x - 17, z + 20];
      const upper = new THREE.ExtrudeGeometry(shapeOf(upperRing), { depth: b.h * 0.23, bevelEnabled: false });
      upper.rotateX(-Math.PI / 2).translate(0, base + bodyHeight, 0);
      splitExtrusion(group, upper, cap, glass);
      for (const side of [-1, 1]) {
        box(group, x + side * 21, base + bodyHeight / 2, z, 3.5, bodyHeight + 1.3, 15, stone);
        for (let y = 2; y < bodyHeight; y += 0.6) box(group, x + side * 23, base + y, z, 0.18, 0.1, 14, cap);
      }
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length], y = Math.min(terrainHeight(a.x, a.z), terrainHeight(c.x, c.z));
        box(group, (a.x + c.x) / 2, (base + y) / 2 + 0.7, (a.z + c.z) / 2,
          Math.hypot(c.x - a.x, c.z - a.z), base - y + 1.4, 0.45, stone, -Math.atan2(c.z - a.z, c.x - a.x));
      }
      return;
    }
    if (b.model === 'gate-belltower') {
      const white = plainMaterial(colour(b.colour, 0xeeeadd)), blue = roofMaterial(b), gold = plainMaterial(0xcba94c, 0.65);
      const radius = small / 2, step = b.h / 52;
      for (const [y, h, r] of [[0, 15, 1], [15, 8, 0.78], [23, 11, 0.7], [35, 6, 0.4], [41, 3.5, 0.25]]) {
        solid(group, new THREE.CylinderGeometry(radius * r, radius * r, h * step, 8), white, cx, base + (y + h / 2) * step, cz);
        solid(group, new THREE.CylinderGeometry(radius * (r + 0.1), radius * (r + 0.1), 0.45, 8), y > 20 ? gold : blue, cx, base + (y + h) * step, cz);
      }
      const dark = plainMaterial(0x293433);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        box(group, cx + Math.sin(a) * radius * 0.72, base + 28.5 * step, cz + Math.cos(a) * radius * 0.72,
          radius * 0.7, 6 * step, 0.08, dark, a);
      }
      onion(group, cx, base + 44.5 * step, cz, radius * 0.31, 5.5 * step, gold);
      return;
    }
    if (b.model === 'blue-roof-church' || b.model === 'tented-chapel' || b.model === 'chapel-wing') {
      const blue = roofMaterial(b), white = plainMaterial(colour(b.colour, 0xeeeadd)), gold = plainMaterial(0xcba94c, 0.65);
      const bodyHeight = b.model === 'chapel-wing' ? 7.5 : b.model === 'tented-chapel' ? 8 : 10;
      churchWalls(group, b, base, bodyHeight, blue);
      const roofHeight = b.model === 'chapel-wing' ? 3 : 5;
      pitchedRoof(group, { ...b, h: bodyHeight + roofHeight, roofShape: 'hipped' }, base, roofHeight, blue);
      if (b.model === 'blue-roof-church') {
        solid(group, new THREE.CylinderGeometry(2.8, 3.4, 4, 8), white, cx, base + 16, cz);
        solid(group, new THREE.ConeGeometry(4.5, 5, 8), blue, cx, base + 20, cz);
        for (const [dx, dz] of [[-0.3, -0.3], [-0.3, 0.3], [0.3, -0.3], [0.3, 0.3]]) {
          const x = cx + dx * (bounds.maxX - bounds.minX), z = cz + dz * (bounds.maxZ - bounds.minZ);
          solid(group, new THREE.CylinderGeometry(0.5, 0.65, 2, 12), white, x, base + 14, z);
          onion(group, x, base + 15, z, 0.7, 1.3, gold);
        }
        onion(group, cx, base + 22.5, cz, 0.65, 1.2, gold);
      } else if (b.model === 'tented-chapel') {
        solid(group, new THREE.CylinderGeometry(small * 0.35, small * 0.45, 3, 8), white, cx, base + 10, cz);
        solid(group, new THREE.ConeGeometry(small * 0.6, 7, 8), blue, cx, base + 15, cz);
        onion(group, cx, base + 18.5, cz, 0.7, 1.6, gold);
      } else {
        const x = bounds.maxX - small * 0.5;
        solid(group, new THREE.CylinderGeometry(3, 3.5, 5, 20), white, x, base + 12, cz);
        onion(group, x, base + 14.5, cz, 3.1, 3.5, gold);
      }
      return;
    }
    if (b.model === 'single-dome-church') {
      const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
      const radius = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.2;
      const wall = plainMaterial(0xe7e2d5), gold = plainMaterial(0xcba94c, 0.65);
      churchWalls(group, b, base, b.h * 0.53, gold);
      for (const dx of [-0.32, 0, 0.32]) {
        const vault = new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, bounds.maxZ - bounds.minZ, 20, 1, false, Math.PI / 2, Math.PI);
        vault.rotateX(Math.PI / 2);
        solid(group, vault, gold, x + dx * (bounds.maxX - bounds.minX), base + b.h * 0.53, z);
      }
      solid(group, new THREE.CylinderGeometry(radius * 0.85, radius, b.h * 0.23, 24), wall, x, base + b.h * 0.645, z);
      const profile = [[0.7, 0], [1, 0.25], [0.9, 0.52], [0.45, 0.8], [0, 1]];
      solid(group, new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24), gold, x, base + b.h * 0.76, z, [radius * 1.12, b.h * 0.18, radius * 1.12]);
      box(group, x, base + b.h * 0.96, z, 0.16, b.h * 0.08, 0.16, gold);
      box(group, x, base + b.h * 0.97, z, radius * 0.55, 0.16, 0.16, gold);
      return;
    }
    if (b.towerType === 'minaret') {
      const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
      const radius = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
      const spire = Math.min(10, b.h * 0.18), shaft = b.h - spire;
      const white = plainMaterial(0xe9e5d8), turquoise = plainMaterial(0x287d8c, 0.3);
      solid(group, new THREE.CylinderGeometry(radius * 0.72, radius, shaft, 8), white, x, base + shaft / 2, z);
      for (const y of [shaft * 0.62, shaft * 0.84]) solid(group, new THREE.CylinderGeometry(radius * 1.22, radius * 1.22, 0.8, 8), white, x, base + y, z);
      solid(group, new THREE.ConeGeometry(radius * 0.85, spire, 12), turquoise, x, base + shaft + spire / 2, z);
      return;
    }
    const cap = roofMaterial(b), facade = facadeMaterial(b);
    const curved = /dome|onion|round|pyramidal|hipped|gabled/.test(b.roofShape);
    const roofHeight = curved ? Math.min(b.h - b.minHeight, b.roofHeight || Math.min(6, (b.h - b.minHeight) * 0.3)) : 0;
    const wallHeight = Math.max(0.1, b.h - b.minHeight - roofHeight);
    const geometry = new THREE.ExtrudeGeometry(shapeOf(b.ring, b.holes), { depth: wallHeight, steps: 1, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base + b.minHeight, 0);
    splitExtrusion(group, geometry, cap, facade, base);
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
}

/** Nearby tiles use mapped polygons; distant instances retain filtered windows, facade colours and separate roofs. */
export function buildCityBlocks(scene, initialPosition = SPAWN) {
  const group = new THREE.Group();
  group.name = 'KazanCityBlocks';
  const colliders = [], allBlocks = [], tiles = new Map(), tileSize = runtime.lite ? 512 : 1024;
  const bases = new Map(GEO.buildings.filter((b) => !b.part).map((b) => [`${b.osmType}/${b.id}`,
    b.foundationAt ? terrainHeight(...b.foundationAt) : buildingBase(b.ring, b.construction?.excavationDepth)]));
  const customParents = new Set(GEO.buildings.filter((b) => customSites.has(GEO.landmarks.find((l) => l.osmId === b.id)?.name)).map((b) => `${b.osmType}/${b.id}`));
  const modeledParents = new Set(GEO.buildings.filter((b) => (b.model || b.construction) && b.hasParts).map((b) => `${b.osmType}/${b.id}`));
  const renderedBuildings = [];
  for (const b of GEO.buildings) {
    if (b.hasParts && !b.model && !b.construction) {
      for (const body of b.body || []) renderedBuildings.push({ ...b, ring: body.ring, holes: body.holes, openingVolumes: body.openingVolumes });
    } else renderedBuildings.push(b);
  }
  for (const b of renderedBuildings) {
    if (b.fuelRole) continue;
    if (modeledParents.has(b.parent) || customParents.has(`${b.osmType}/${b.id}`) || customParents.has(b.parent)) continue;
    const base = b.construction || b.localFoundation ? buildingBase(b.ring, b.construction?.excavationDepth) :
      bases.get(b.parent || `${b.osmType}/${b.id}`) ?? buildingBase(b.ring), collider = buildingCollider(b, base);
    const collisionShapes = factoryAdmin.collisionShapes(b) || aircraftModels.collisionShapes(b) || (['kai-main','kai-ribbon','kai-airplane','kai-church-lab','kai-square','kai-brick-academic','kai-gallery','kai-tiled'].includes(b.model) ? campusModels.collisionShapes(b) : b.openingVolumes || palaceModels.collisionShapes(b) || churchModels.collisionShapes(b) || campusModels.collisionShapes(b));
    colliders.push(...collisionShapes.map((shape) => shape === b ? collider : buildingCollider(shape, base)));
    allBlocks.push({ footprints: [{ pts: collider.poly, h: b.h }] });
    const x = (collider.minX + collider.maxX) / 2, z = (collider.minZ + collider.maxZ) / 2;
    const key = `${Math.floor(x / tileSize)},${Math.floor(z / tileSize)}`;
    if (!tiles.has(key)) tiles.set(key, { key, x: Math.floor(x / tileSize) * tileSize + tileSize / 2,
      z: Math.floor(z / tileSize) * tileSize + tileSize / 2, records: [], detail: null, queued: false });
    tiles.get(key).records.push({ b, base, collider });
  }
  const massingMaterial = createDistantFacadeMaterial();
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  const regions = new Map();
  for (const tile of tiles.values()) {
    const key = `${Math.floor(tile.x / 4096)},${Math.floor(tile.z / 4096)}`;
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(tile);
  }
  let firstMassing = null;
  for (const [key, regionTiles] of regions) {
    const records = [], owners = [];
    for (const tile of regionTiles) {
      owners.push({ key: tile.key, start: records.length, count: tile.records.length });
      records.push(...tile.records);
    }
    const geometry = createDistantFacadeGeometry(records.map((r) => ({ b: r.b, collider: r.collider,
      wallColour: facadeColour(r.b), roofColour: roofColour(r.b) })));
    const far = new THREE.InstancedMesh(geometry, massingMaterial, 0);
    far.instanceMatrix = new THREE.StorageInstancedBufferAttribute(new Float32Array(records.length * 16), 16);
    far.count = records.length;
    far.matrixAutoUpdate = far.matrixWorldAutoUpdate = false;
    far.name = `KazanMassingRegion/${key}`;
    if (firstMassing) far.userData.sharesPipelineWith = firstMassing;
    else firstMassing = far;
    far.receiveShadow = true;
    for (const [i, { b, base, collider }] of records.entries()) {
      const o = collider.obb;
      position.set(o.cx, base + (b.h + b.minHeight) / 2, o.cz);
      scale.set(o.hx * 2, b.h - b.minHeight, o.hz * 2);
      rotation.setFromAxisAngle(axis, Math.atan2(o.sn, o.cs));
      matrix.compose(position, rotation, scale);
      far.setMatrixAt(i, matrix);
    }
    far.computeBoundingSphere();
    const visibility = createInstanceVisibility(far, owners);
    for (const tile of regionTiles) tile.far = visibility;
    group.add(far);
  }
  let lastCell = '', worker = null, queue = [], pending = null;
  function disposeDetail(tile) {
    group.remove(tile.detail);
    tile.detail.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); } });
    tile.detail = null;
    tile.far.setVisible(tile.key, true);
  }
  function work() {
    const deadline = performance.now() + (runtime.lite ? 4 : 12);
    while (performance.now() < deadline) {
      if (!pending) {
        const tile = queue.shift();
        if (!tile) { worker = null; return; }
        tile.queued = false;
        if (tile.detail || !tile.wanted) continue;
        const detail = new THREE.Group();
        detail.name = `KazanDetail/${tile.key}`;
        pending = { tile, detail, index: 0 };
      }
      const { tile, detail } = pending;
      if (!tile.wanted) {
        for (const [key, batch] of boxBatches) if (batch.group === detail) boxBatches.delete(key);
        for (const [key, batch] of batches) if (batch.group === detail) {
          for (const geometry of batch.geometries) geometry.dispose();
          batches.delete(key);
        }
        pending = null;
        continue;
      }
      const record = tile.records[pending.index++];
      emitBuilding(detail, record.b, record.base, record.collider.poly, record.collider);
      if (pending.index === tile.records.length) {
        flush(detail);
        group.add(detail);
        tile.detail = detail;
        tile.far.setVisible(tile.key, false);
        pending = null;
      }
    }
    worker = setTimeout(work, 0);
  }
  function update(x, z) {
    const cell = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    if (cell === lastCell) return;
    lastCell = cell;
    for (const tile of tiles.values()) {
      const distance = Math.hypot(Math.max(0, Math.abs(x - tile.x) - tileSize / 2), Math.max(0, Math.abs(z - tile.z) - tileSize / 2));
      tile.distance = distance;
      tile.wanted = distance < (runtime.lite ? 550 : 1600);
      if (tile.detail && distance > (runtime.lite ? 900 : 2300)) disposeDetail(tile);
      if (runtime.lite) tile.far.setVisible(tile.key, !tile.detail && distance < 6000);
      if (tile.wanted && !tile.detail && !tile.queued && pending?.tile !== tile) { tile.queued = true; queue.push(tile); }
    }
    queue.sort((a, b) => a.distance - b.distance);
    if (!worker && queue.length) worker = setTimeout(work, 0);
  }
  scene.add(group);
  update(initialPosition.x, initialPosition.z);
  return { group, colliders, allBlocks, quadtree: null, update };
}

export function buildLandmarks(scene, initialPosition = SPAWN) {
  const group = new THREE.Group();
  group.name = 'KazanLandmarks';
  const white = plainMaterial(0xe8dfc8), brick = plainMaterial(0xa95335), green = plainMaterial(0x356a66, 0.4), copper = plainMaterial(0xb88745, 0.65);
  const colliders = mStructures.build(group);
  colliders.push(...campusModels.buildGrounds(group));
  colliders.push(...aircraftModels.build(group));
  const fuel = fuelStations.build(group, initialPosition);
  colliders.push(...fuel.colliders);
  const pedestrian = pedestrianStructures.build(group, initialPosition);
  colliders.push(...pedestrian.colliders);
  colliders.push(...churchModels.buildGrounds(group));
  recreationSites.build(group);
  reviewedLandmarks.buildAttractions(group);
  for (const wall of GEO.walls) {
    if (wall.envelope) continue;
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
        const opening = gateModels.emitWall(group, wall, `${i}/${k}`, low, top, colliders);
        if (!opening) box(group, (a.x + b.x) / 2, (low + top) / 2, (a.z + b.z) / 2, len, top - low, 2.7, white, yaw);
        for (let s = 1; s < len; s += 3) box(group, a.x + (b.x - a.x) * s / len, top + 0.5, a.z + (b.z - a.z) * s / len, 1.2, 1, 2.8, white, yaw);
        if (!opening) colliders.push({ minX: Math.min(a.x, b.x) - 1.5, maxX: Math.max(a.x, b.x) + 1.5, minZ: Math.min(a.z, b.z) - 1.5, maxZ: Math.max(a.z, b.z) + 1.5, minY: low - 0.2, maxY: top + 1,
          obb: { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, hx: len / 2, hz: 1.5, cs: Math.cos(yaw), sn: Math.sin(yaw) } });
      }
    }
  }
  for (const site of GEO.siteBoundaries || []) for (const ring of site.rings) {
    const poly = toPoints(ring);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      const pieces = Math.ceil(length / 5), yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      for (let j = 0; j < pieces; j++) {
        const x = a.x + (b.x - a.x) * (j + 0.5) / pieces, z = a.z + (b.z - a.z) * (j + 0.5) / pieces;
        if (nearestRoads(x, z, 6).some((p) => p.dist < p.road.w / 2 + 2.5)) continue;
        const y = terrainHeight(x, z);
        box(group, x, y + 1.3, z, length / pieces + 0.1, 2.6, 0.65, white, yaw);
        box(group, x, y + 2.67, z, length / pieces + 0.2, 0.18, 0.8, plainMaterial(0x59768e), yaw);
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
  function update(x, z) { fuel.update(x, z); pedestrian.update(x, z); }
  return { group, colliders, update };
}

export function buildStreetDetails(scene, initialPosition = SPAWN) {
  const group = new THREE.Group();
  group.name = 'KazanStreetDetails';
  const pole = plainMaterial(0x333e3a), lamp = createParkLampGlobeMaterial();
  for (const pad of HELIPADS) {
    const deck = plainMaterial(colour(pad.colour, 0x64685e)), white = plainMaterial(0xece9d8), marking = plainMaterial(colour(pad.markingColour, 0xece9d8));
    polygon(pad.ring, pad.y, deck, group);
    const radius = Math.min(pad.maxX - pad.minX, pad.maxZ - pad.minZ) * 0.37;
    const circle = new THREE.RingGeometry(radius - 0.25, radius + 0.25, 64);
    circle.rotateX(-Math.PI / 2);
    solid(group, circle, marking, pad.x, pad.y + 0.025, pad.z);
    for (const dx of [-1.5, 1.5]) box(group, pad.x + dx, pad.y + 0.025, pad.z, 0.55, 0.03, 5, white);
    box(group, pad.x, pad.y + 0.025, pad.z, 3, 0.03, 0.55, white);
    if (pad.onRoof) {
      for (let i = 0; i < pad.poly.length; i++) {
        const a = pad.poly[i], c = pad.poly[(i + 1) % pad.poly.length];
        box(group, (a.x + c.x) / 2, pad.y - 0.15, (a.z + c.z) / 2,
          Math.hypot(c.x - a.x, c.z - a.z), 0.3, 0.45, deck, -Math.atan2(c.z - a.z, c.x - a.x));
        box(group, a.x, pad.y - 1.4, a.z, 0.35, 2.8, 0.35, pole);
      }
    }
  }
  for (const r of ROADS.filter((r) => !r.walk && r.w >= 10 && !r.bridge)) {
    let along = 0;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i], b = r.pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      const spacing = runtime.lite ? 144 : 48;
      for (let s = 20 - along % spacing; s < len; s += spacing) {
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
  flush(group);
  scene.add(group);
  const vegetation = createKazanVegetation(scene, initialPosition);
  group.add(vegetation.group);
  const parking = createKazanParking(initialPosition);
  group.add(parking.group);
  function update(camera) { vegetation.update(camera); parking.update(camera); }
  return { group, footprints: [], signalClock: { value: 0 }, treeField: vegetation.treeField, update };
}

window.NYC = { ...window.NYC, buildCityGrid, buildBoroughs, buildCityBlocks, buildLandmarks, buildStreetDetails };
})();
