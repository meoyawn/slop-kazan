/** Shared flat source rings and point outlines have the same geographic containment rules. */
export function polygonContains(poly, x, z) {
  const flat = typeof poly[0] === 'number';
  const count = flat ? poly.length / 2 : poly.length;
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const ax = flat ? poly[i * 2] : poly[i].x, az = flat ? poly[i * 2 + 1] : poly[i].z;
    const bx = flat ? poly[j * 2] : poly[j].x, bz = flat ? poly[j * 2 + 1] : poly[j].z;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

export function polygonBounds(poly) {
  const flat = typeof poly[0] === 'number';
  const count = flat ? poly.length / 2 : poly.length;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = flat ? poly[i * 2] : poly[i].x, z = flat ? poly[i * 2 + 1] : poly[i].z;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

const points = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] }));

function readPolygon() {
  if (!this.polygonPoints) this.polygonPoints = points(this.ring);
  return this.polygonPoints;
}

function readHoles() {
  if (!this.holePoints) this.holePoints = this.sourceHoles.map(points);
  return this.holePoints;
}

const OUTLINES = { poly: { enumerable: true, get: readPolygon }, holes: { enumerable: true, get: readHoles } };

/** Keep mapped coordinates shared; point objects are needed only by nearby model and collision consumers. */
export function createFootprint(ring, holes, attributes) {
  const footprint = { ...attributes, ring, sourceHoles: holes.filter((hole) => polygonContains(ring, hole[0], hole[1])), polygonPoints: null, holePoints: null };
  Object.defineProperties(footprint, OUTLINES);
  return footprint;
}
