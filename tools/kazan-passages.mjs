import polygonClipping from 'polygon-clipping';

const area = (ring) => Math.abs(ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0) / 2);
const points = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => [ring[i * 2], ring[i * 2 + 1]]);
function rounded(ring) {
  const closed = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  return (closed ? ring.slice(0, -1) : ring).flatMap((p) => p.map((n) => Math.round(n * 100) / 100));
}

/** Mapped building passages supply a continuous corridor; widths and arch heights retain their source/estimate labels. */
export function passageCorridor(passage, width = passage.width) {
  const shapes = [], p = points(passage.pts), half = width / 2;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) continue;
    const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length, nx = -uz * half, nz = ux * half;
    const extensionA = i === 1 ? 3 : 0, extensionB = i === p.length - 1 ? 3 : 0;
    shapes.push([[[a[0] - ux * extensionA + nx, a[1] - uz * extensionA + nz],
      [b[0] + ux * extensionB + nx, b[1] + uz * extensionB + nz],
      [b[0] + ux * extensionB - nx, b[1] + uz * extensionB - nz],
      [a[0] - ux * extensionA - nx, a[1] - uz * extensionA - nz]]]);
  }
  for (const [x, z] of p.slice(1, -1)) shapes.push([Array.from({ length: 16 }, (_, i) =>
    [x + Math.cos(i * Math.PI / 8) * half, z + Math.sin(i * Math.PI / 8) * half])]);
  return shapes.length ? polygonClipping.union(...shapes) : [];
}

/** Horizontal masonry bands form an actual arch; render meshes and collision polygons consume the same volumes. */
export function passageVolumes(ring, holes, minHeight, height, passages) {
  const body = [points(ring), ...holes.map(points)];
  const xs = ring.filter((_, i) => i % 2 === 0), zs = ring.filter((_, i) => i % 2 === 1);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  const candidates = passages.filter((p) => minHeight < p.height && bounds.maxX >= p.bounds.minX && bounds.minX <= p.bounds.maxX &&
    bounds.maxZ >= p.bounds.minZ && bounds.minZ <= p.bounds.maxZ && polygonClipping.intersection(body, p.corridor).length)
    .map((p) => ({ ...p, height: Math.min(p.height, height - 0.25), spring: Math.min(p.spring, height - 0.5) }));
  if (!candidates.length) return undefined;
  const levels = new Set([minHeight, height]);
  for (const p of candidates) for (let i = 0; i <= 12; i++) {
    const y = p.spring + (p.height - p.spring) * i / 12;
    if (y > minHeight && y < height) levels.add(y);
  }
  const boundaries = [...levels].sort((a, b) => a - b), result = [];
  for (let i = 1; i < boundaries.length; i++) {
    const low = boundaries[i - 1], high = boundaries[i], middle = (low + high) / 2, corridors = [];
    for (const p of candidates) {
      if (middle >= p.height) continue;
      const v = Math.max(0, (middle - p.spring) / (p.height - p.spring));
      const width = p.width * Math.sqrt(Math.max(0, 1 - v * v));
      if (width > 0.01) corridors.push(passageCorridor(p, width));
    }
    const polygons = corridors.length ? polygonClipping.difference(body, ...corridors) : [body];
    for (const poly of polygons) if (area(poly[0]) > 0.04) result.push({ ring: rounded(poly[0]), holes: poly.slice(1).map(rounded),
      minHeight: Math.round(low * 1000) / 1000, h: Math.round(high * 1000) / 1000 });
  }
  return result;
}

/** A facade recess removes only its own elevation band, preserving ground rooms, existing passages and the overhead body. */
export function recessVolumes(volumes, { ring, bottom, top }) {
  const opening = [points(ring)], result = [];
  for (const volume of volumes) {
    const low = Math.max(volume.minHeight, bottom), high = Math.min(volume.h, top);
    const body = [points(volume.ring), ...volume.holes.map(points)];
    if (high <= low || !polygonClipping.intersection(body, opening).length) { result.push(volume); continue; }
    if (volume.minHeight < low) result.push({ ...volume, h: low });
    for (const polygon of polygonClipping.difference(body, opening)) if (area(polygon[0]) > 0.01) {
      result.push({ ring: rounded(polygon[0]), holes: polygon.slice(1).map(rounded), minHeight: low, h: high });
    }
    if (volume.h > high) result.push({ ...volume, minHeight: high });
  }
  return result;
}
