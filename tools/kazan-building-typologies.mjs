function contains(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function signature(ring) {
  if (ring.length < 3) return null;
  let length = 0, yaw = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span > length) { length = span; yaw = Math.atan2(b[1] - a[1], b[0] - a[0]); }
  }
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const points = ring.map(([x, y]) => [x * cs + y * sn, -x * sn + y * cs]);
  const minX = Math.min(...points.map((p) => p[0])), minY = Math.min(...points.map((p) => p[1]));
  const width = Math.max(...points.map((p) => p[0])) - minX, depth = Math.max(...points.map((p) => p[1])) - minY;
  if (width < 1 || depth < 1) return null;
  const normalized = points.map(([x, y]) => [(x - minX) / width, (y - minY) / depth]);
  const cells = new Set();
  for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
    if (contains(normalized, (x + 0.5) / 32, (y + 0.5) / 32)) cells.add(x * 32 + y);
  }
  return { width, depth, cells };
}

/** The template refers to a real mapped school; no architectural catalogue number is inferred from its age. */
export function createBuildingTypologies(specs, elements, toWorld) {
  return specs.map((spec) => {
    const source = elements.find((e) => `${e.type}/${e.id}` === spec.reference);
    if (!source?.geometry) throw new Error(`Missing typology reference: ${spec.reference}`);
    return { ...spec, shape: signature(source.geometry.map(toWorld)) };
  });
}

/** Rotation, reflection, physical size and occupancy distinguish repeated plans from unrelated school buildings. */
export function matchBuildingTypology(tags, ring, templates) {
  if (tags.building !== 'school' || ![3, 4].includes(Number(tags['building:levels'])) || !['flat', undefined].includes(tags['roof:shape'])) return null;
  const candidate = signature(ring);
  if (!candidate) return null;
  let best = null;
  for (const template of templates) {
    const ratioLong = Math.max(candidate.width, candidate.depth) / Math.max(template.shape.width, template.shape.depth);
    const ratioShort = Math.min(candidate.width, candidate.depth) / Math.min(template.shape.width, template.shape.depth);
    const tolerance = template.sizeTolerance;
    if (Math.abs(ratioLong - 1) > tolerance || Math.abs(ratioShort - 1) > tolerance) continue;
    for (const swap of [false, true]) for (const reflectX of [false, true]) for (const reflectY of [false, true]) {
      let intersection = 0;
      for (const cell of candidate.cells) {
        const x = Math.floor(cell / 32), y = cell % 32;
        const u = swap ? y : x, v = swap ? x : y;
        if (template.shape.cells.has((reflectX ? 31 - u : u) * 32 + (reflectY ? 31 - v : v))) intersection++;
      }
      const score = intersection / (candidate.cells.size + template.shape.cells.size - intersection);
      if (score >= template.minSimilarity && (!best || score > best.score)) best = {
        id: template.id, reference: template.reference, facadeProfile: template.facadeProfile, score: Math.round(score * 1000) / 1000
      };
    }
  }
  return best;
}

/** Small untyped outlines without height evidence represent low-rise outbuildings, not a default four-storey tower. */
export function smallBuildingFallback(tags, footprintArea, observation) {
  if (Number.parseFloat(tags.min_height) > 0 || Number.parseFloat(tags['building:min_level']) > 0) return null;
  if (observation?.typology === 'retail-pavilion' || tags.building === 'kiosk' || tags.shop === 'kiosk') {
    return { typology: 'retail-pavilion', height: 3.5 };
  }
  if (['yes', 'retail'].includes(tags.building) && !tags['building:part'] && footprintArea < 250) return { typology: 'small-building', height: footprintArea < 60 ? 3.5 : 4 };
  return null;
}
