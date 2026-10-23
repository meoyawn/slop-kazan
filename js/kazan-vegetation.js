import * as THREE from 'three/webgpu';
import { GEO, runtime } from './kazan-runtime.js';
import { SPAWN, terrainHeight, landcoverAt, buildingAt, waterAt, nearestRoads, toPoints, boundsOf, pointInPoly, parkingAt } from './kazan-config.js';
import { createTreeField } from './trees.js';
import { airfieldAt } from './kazan-airports.js';
import { railwayAt } from './kazan-railways.js';
import { tramAt } from './kazan-trams.js';
import { powerAt } from './kazan-power-lines.js';
import { powerStationAt } from './kazan-power-stations.js';

const lite = runtime?.lite;
const CELL = 512, SPACING = lite ? 24 : 16, RADIUS = lite ? 700 : 1500, CAPACITY = lite ? 3000 : 28000;
const CANOPY_CELL = 2048;

/** Coordinate-seeded planting stays fixed across streaming, reloads and changes of viewpoint. */
function noise(x, z, salt = 0) {
  let n = Math.imul(Math.round(x), 374761393) ^ Math.imul(Math.round(z), 668265263) ^ Math.imul(salt, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** One regional pipeline supplies nearby trees and the distant forest canopy. */
export function createKazanVegetation(scene, initialPosition = SPAWN) {
  const group = new THREE.Group();
  group.name = 'KazanVegetation';
  const field = createTreeField(scene, [], { capacity: CAPACITY, canopyFill: 0.85 });
  group.add(field.group);
  const parkCells = new Map(), tiles = new Map(), farCells = new Map(), activityCells = new Map();
  for (const site of GEO.recreation || []) {
    const poly = toPoints(site.ring), b = boundsOf(poly);
    for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) {
      for (let z = Math.floor(b.minZ / CELL); z <= Math.floor(b.maxZ / CELL); z++) {
        const key = `${x},${z}`;
        if (!activityCells.has(key)) activityCells.set(key, []);
        activityCells.get(key).push(poly);
      }
    }
  }
  function onActivity(x, z) {
    if ((GEO.campusFeatures || []).some((site) => site.plazaRadius && Math.hypot(x - site.x, z - site.z) < site.plazaRadius + 6)) return true;
    const polygons = activityCells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || [];
    return polygons.some((p) => pointInPoly(p, x, z));
  }
  for (const park of GEO.parks) for (const ring of park.rings) {
    const poly = toPoints(ring), bounds = boundsOf(poly);
    for (let x = Math.floor(bounds.minX / CELL); x <= Math.floor(bounds.maxX / CELL); x++) {
      for (let z = Math.floor(bounds.minZ / CELL); z <= Math.floor(bounds.maxZ / CELL); z++) {
        const key = `${x},${z}`;
        if (!parkCells.has(key)) parkCells.set(key, []);
        parkCells.get(key).push(poly);
      }
    }
  }

  function createTile(ix, iz) {
    const points = [], parks = parkCells.get(`${ix},${iz}`) || [];
    for (let x = ix * CELL + SPACING / 2; x < (ix + 1) * CELL; x += SPACING) {
      for (let z = iz * CELL + SPACING / 2; z < (iz + 1) * CELL; z += SPACING) {
        const px = x + (noise(x, z, 1) - 0.5) * 15, pz = z + (noise(x, z, 2) - 0.5) * 15;
        const cover = landcoverAt(px, pz);
        const park = cover === 30 && parks.some((p) => pointInPoly(p, px, pz));
        const density = cover === 10 ? 0.92 : cover === 20 ? 0.2 : park ? 0.08 : 0;
        if (noise(x, z, 3) >= density || buildingAt(px, pz) || waterAt(px, pz) || parkingAt?.(px, pz) || airfieldAt?.(px, pz, 7) || railwayAt?.(px, pz, 7) || tramAt?.(px, pz, 7) || powerAt?.(px, pz, 7) || powerStationAt?.(px, pz, 7) || onActivity(px, pz)) continue;
        if (nearestRoads(px, pz, 60).some((p) => p.dist < p.road.w / 2 + 3)) continue;
        const y = terrainHeight(px, pz);
        const slope = Math.hypot(terrainHeight(px + 8, pz) - terrainHeight(px - 8, pz), terrainHeight(px, pz + 8) - terrainHeight(px, pz - 8)) / 16;
        if (slope > 1.5) continue;
        points.push({ x: px, y, z: pz, scale: (cover === 20 ? 0.45 : 1.05) + noise(x, z, 4) * (cover === 20 ? 0.65 : 0.8),
          species: noise(x, z, 5) < 0.7 ? 2 : 0, sx: 0.9 + noise(x, z, 6) * 0.4, sz: 0.9 + noise(x, z, 7) * 0.4 });
      }
    }
    return points;
  }

  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownMaterial = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1 });
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const tint = new THREE.Color();
  const bounds = GEO.bounds;
  for (let x = Math.ceil(bounds.minX / 90) * 90; x < bounds.maxX; x += 90) {
    for (let z = Math.ceil(bounds.minZ / 90) * 90; z < bounds.maxZ; z += 90) {
      if (landcoverAt(x, z) !== 10 || buildingAt(x, z) || waterAt(x, z) || parkingAt?.(x, z) || airfieldAt?.(x, z, 54) || railwayAt?.(x, z, 54) || tramAt?.(x, z, 54) || powerAt?.(x, z, 54) || powerStationAt?.(x, z, 54) || onActivity(x, z)) continue;
      const ix = Math.floor(x / CANOPY_CELL), iz = Math.floor(z / CANOPY_CELL), key = `${ix},${iz}`;
      if (!farCells.has(key)) farCells.set(key, { x: (ix + 0.5) * CANOPY_CELL, z: (iz + 0.5) * CANOPY_CELL, crowns: [] });
      farCells.get(key).crowns.push({ x, z, y: terrainHeight(x, z), radius: 42 + noise(x, z, 8) * 12, height: 6 + noise(x, z, 9) * 5 });
    }
  }
  let firstCrown = null;
  for (const cell of farCells.values()) {
    const mesh = new THREE.InstancedMesh(crownGeometry, crownMaterial, cell.crowns.length);
    mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
    mesh.name = 'ForestCanopy';
    if (firstCrown) mesh.userData.sharesPipelineWith = firstCrown;
    else firstCrown = mesh;
    for (const [i, crown] of cell.crowns.entries()) {
      position.set(crown.x, crown.y + crown.height, crown.z); scale.set(crown.radius, crown.height, crown.radius);
      matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, tint.setHex(noise(crown.x, crown.z, 10) > 0.5 ? 0x44612e : 0x526d35));
    }
    mesh.computeBoundingSphere();
    group.add(mesh); cell.mesh = mesh;
  }
  let requested = null, planted = null, worker = null, queue = [], lastCell = '';

  function updateCanopy(center) {
    for (const cell of farCells.values()) {
      if (planted && Math.hypot(cell.x - planted.x, cell.z - planted.z) > RADIUS + CANOPY_CELL * Math.SQRT1_2) {
        if (cell.modified) {
          for (const [i, crown] of cell.crowns.entries()) {
            position.set(crown.x, crown.y + crown.height, crown.z); scale.set(crown.radius, crown.height, crown.radius);
            matrix.compose(position, rotation, scale); cell.mesh.setMatrixAt(i, matrix);
          }
          cell.mesh.instanceMatrix.needsUpdate = true; cell.modified = false;
        }
        continue;
      }
      for (const [i, crown] of cell.crowns.entries()) {
        const weight = Math.max(0, Math.min(1, (Math.hypot(crown.x - center.x, crown.z - center.z) - 850) / 250));
        position.set(crown.x, crown.y + crown.height * weight, crown.z);
        scale.set(crown.radius * weight, crown.height * weight, crown.radius * weight);
        matrix.compose(position, rotation, scale); cell.mesh.setMatrixAt(i, matrix);
      }
      cell.mesh.instanceMatrix.needsUpdate = true; cell.modified = true;
    }
  }

  function commit() {
    const points = [];
    for (const key of requested.keys) for (const point of tiles.get(key) || []) {
      if (Math.hypot(point.x - requested.x, point.z - requested.z) < RADIUS) points.push(point);
    }
    points.sort((a, b) => Math.hypot(a.x - requested.x, a.z - requested.z) - Math.hypot(b.x - requested.x, b.z - requested.z));
    field.setSites(points.slice(0, CAPACITY));
    planted = { x: requested.x, z: requested.z };
    updateCanopy(planted);
    field.update(new THREE.Vector3(planted.x, terrainHeight(planted.x, planted.z) + 5, planted.z));
    for (const key of tiles.keys()) if (tiles.size > 100 && !requested.keys.has(key)) tiles.delete(key);
    group.userData.planting = { source: GEO.landcover.source, trees: field.stats.trees, x: planted.x, z: planted.z, cachedTiles: tiles.size };
  }

  function work() {
    const start = performance.now();
    while (queue.length && performance.now() - start < 12) {
      const { key, ix, iz } = queue.shift();
      if (requested.keys.has(key) && !tiles.has(key)) tiles.set(key, createTile(ix, iz));
    }
    if (queue.length) worker = setTimeout(work, 0);
    else { worker = null; commit(); }
  }

  function update(camera) {
    const p = camera.position || camera;
    const cell = `${Math.floor(p.x / 256)},${Math.floor(p.z / 256)}`;
    if (cell === lastCell) return;
    lastCell = cell;
    requested = { x: p.x, z: p.z, keys: new Set() }; queue = [];
    for (let ix = Math.floor((p.x - RADIUS) / CELL); ix <= Math.floor((p.x + RADIUS) / CELL); ix++) {
      for (let iz = Math.floor((p.z - RADIUS) / CELL); iz <= Math.floor((p.z + RADIUS) / CELL); iz++) {
        const key = `${ix},${iz}`;
        requested.keys.add(key);
        if (!tiles.has(key)) queue.push({ key, ix, iz });
      }
    }
    queue.sort((a, b) => Math.hypot((a.ix + 0.5) * CELL - p.x, (a.iz + 0.5) * CELL - p.z) - Math.hypot((b.ix + 0.5) * CELL - p.x, (b.iz + 0.5) * CELL - p.z));
    for (const key of tiles.keys()) if (tiles.size > 100 && !requested.keys.has(key)) tiles.delete(key);
    if (!worker) {
      if (queue.length) worker = setTimeout(work, 0);
      else commit();
    }
  }
  update(new THREE.Vector3(initialPosition.x, 0, initialPosition.z));
  return { group, update, treeField: field };
}

window.NYC = { ...window.NYC, createKazanVegetation };
})();
