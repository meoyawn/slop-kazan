import polygonClipping from 'polygon-clipping/dist/polygon-clipping.esm.js';
import { ShapeUtils, Vector2 } from 'three/webgpu';

const CELL = 256;

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

const points = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => [ring[i * 2], ring[i * 2 + 1]]);

function boundsOf(ring) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of ring) {
    b.minX = Math.min(b.minX, p[0]); b.maxX = Math.max(b.maxX, p[0]);
    b.minZ = Math.min(b.minZ, p[1]); b.maxZ = Math.max(b.maxZ, p[1]);
  }
  return b;
}

function insert(grid, item, b) {
  for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) {
    for (let z = Math.floor(b.minZ / CELL); z <= Math.floor(b.maxZ / CELL); z++) {
      const key = `${x},${z}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(item);
    }
  }
}

function segmentDistance(a, b, x, z) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** One horizontal surface per mapped water body; exact land edges meet that surface, including island shores. */
export function createWaterSystem(source, elevationHeight, datum = 53) {
  const bodies = [], waterRegions = [], regions = new Map(), edges = new Map(), wetCells = new Map(), waterTiles = new Map();
  for (const body of source) {
    const samples = [];
    for (const flat of body.rings) {
      const ring = points(flat);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 30));
        for (let j = 0; j < count; j++) samples.push(elevationHeight(a[0] + (b[0] - a[0]) * j / count, a[1] + (b[1] - a[1]) * j / count));
      }
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] || 0;
    const mapped = typeof body.ele === 'number' && Number.isFinite(body.ele);
    const y = mapped ? body.ele - datum : Math.abs(median) <= 3 ? 0 : Math.round(median * 10) / 10;
    const water = { ...body, y, levelSource: mapped ? 'mapped-ele' : y === 0 ? 'shore-dem-near-reservoir-datum-estimate' : 'shore-dem-median-estimate' };
    bodies.push(water);
    const holes = body.holes.map(points);
    for (const flat of body.rings) {
      const ring = points(flat), inner = holes.filter((h) => contains(ring, h[0][0], h[0][1]));
      const region = { ...boundsOf(ring), id: body.id, name: body.name, y, levelSource: water.levelSource,
        poly: ring.map(([x, z]) => ({ x, z })), holes: inner.map((h) => h.map(([x, z]) => ({ x, z }))), shape: [ring, ...inner] };
      waterRegions.push(region);
      insert(regions, region, region);
      for (const edgeRing of region.shape) for (let i = 0; i < edgeRing.length; i++) {
        const a = edgeRing[i], b = edgeRing[(i + 1) % edgeRing.length];
        const edge = { ...boundsOf([a, b]), a, b, region };
        insert(edges, edge, edge);
      }
    }
  }

  function waterAt(x, z) {
    for (const r of regions.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      if (contains(r.shape[0], x, z) && !r.shape.slice(1).some((h) => contains(h, x, z))) return r;
    }
    return null;
  }

  function isWater(x, z) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), key = `${cx},${cz}`;
    if (edges.has(key)) return Boolean(waterAt(x, z));
    if (!wetCells.has(key)) wetCells.set(key, Boolean(waterAt((cx + 0.5) * CELL, (cz + 0.5) * CELL)));
    return wetCells.get(key);
  }

  const nearShore = (x, z) => edges.has(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);

  function waterInCell(x, z, size = CELL) {
    const key = `${size}/${x},${z}`;
    if (waterTiles.has(key)) return waterTiles.get(key);
    const minX = x * size, minZ = z * size, maxX = minX + size, maxZ = minZ + size;
    const rectangle = [[[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]];
    const polygons = [];
    if (size === CELL * 16) {
      for (const r of waterRegions) {
        if (r.maxX < minX || r.minX > maxX || r.maxZ < minZ || r.minZ > maxZ) continue;
        polygons.push(...polygonClipping.intersection(rectangle, r.shape));
      }
    } else {
      const parent = waterInCell(Math.floor(x / 4), Math.floor(z / 4), size * 4);
      for (const polygon of parent) polygons.push(...polygonClipping.intersection(rectangle, polygon));
    }
    waterTiles.set(key, polygons);
    return polygons;
  }

  function terrainFaces(triangle, sampleHeights) {
    const bounds = boundsOf(triangle), nearby = new Set(), cells = [];
    for (let x = Math.floor(bounds.minX / CELL); x <= Math.floor(bounds.maxX / CELL); x++) {
      for (let z = Math.floor(bounds.minZ / CELL); z <= Math.floor(bounds.maxZ / CELL); z++) {
        cells.push([x, z]);
        for (const edge of edges.get(`${x},${z}`) || []) {
          if (edge.maxX < bounds.minX || edge.minX > bounds.maxX || edge.maxZ < bounds.minZ || edge.minZ > bounds.maxZ) continue;
          nearby.add(edge);
        }
      }
    }
    if (!nearby.size) return isWater((triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
      (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3) ? [] : null;
    const water = [];
    for (const [x, z] of cells) {
      water.push(...waterInCell(x, z));
    }
    const land = polygonClipping.difference([triangle.map((p) => p.slice(0, 2))], ...water);
    const faces = [];
    let originalHeights = null;
    for (const polygon of land) {
      const rings = polygon.map((r) => r.slice(0, -1).map((p) => new Vector2(...p)));
      const vertices = rings.flat();
      const heights = vertices.map((p) => {
        for (const edge of nearby) if (segmentDistance(edge.a, edge.b, p.x, p.y) < 1e-5) return edge.region.y;
        originalHeights ||= sampleHeights ? sampleHeights() : triangle.map((p) => p[2]);
        const a = triangle[0], b = triangle[1], c = triangle[2];
        const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        const u = ((b[1] - c[1]) * (p.x - c[0]) + (c[0] - b[0]) * (p.y - c[1])) / denominator;
        const v = ((c[1] - a[1]) * (p.x - c[0]) + (a[0] - c[0]) * (p.y - c[1])) / denominator;
        return originalHeights[0] * u + originalHeights[1] * v + originalHeights[2] * (1 - u - v);
      });
      for (const face of ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
        const vertices3D = face.map((i) => [vertices[i].x, vertices[i].y, heights[i]]);
        const [a, b, c] = vertices3D;
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) vertices3D.reverse();
        faces.push(vertices3D);
      }
    }
    return faces;
  }

  return { bodies, waterAt, terrainFaces, nearShore };
}
