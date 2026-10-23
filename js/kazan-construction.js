(function () {
const { THREE, terrainHeight, pointInPoly } = NYC;

/** Bounded static worksite detail shares materials and the building tile's geometry batches. */
function createKazanConstruction(draw) {
  const { plainMaterial, box, solid, polygon, emit } = draw;
  const soil = plainMaterial(0x8b795d), concrete = plainMaterial(0xadafa6), steel = plainMaterial(0x555c59, 0.3);
  const hoarding = plainMaterial(0x63796c, 0.2), yellow = plainMaterial(0xc89c38), glass = plainMaterial(0x31505b, 0.35);
  const timber = plainMaterial(0xa28a61), dark = plainMaterial(0x333b3b);
  soil.side = THREE.DoubleSide;

  function edgeDistance(poly, x, z) {
    let distance = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      distance = Math.min(distance, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return distance;
  }

  function pileRig(group, x, y, z) {
    for (const dx of [-1, 1]) {
      box(group, x + dx, y + 0.4, z, 0.65, 0.8, 4.5, dark);
      for (let s = -1.8; s <= 1.8; s += 0.6) box(group, x + dx * 1.34, y + 0.4, z + s, 0.06, 0.65, 0.12, steel);
    }
    box(group, x, y + 1.1, z, 2.3, 0.7, 3.4, yellow);
    box(group, x - 0.65, y + 2.05, z - 0.6, 1.15, 1.4, 1.5, yellow);
    box(group, x - 0.68, y + 2.22, z - 1.38, 0.94, 0.94, 0.06, glass);
    box(group, x - 1.25, y + 2.22, z - 0.65, 0.06, 0.94, 1.05, glass);
    for (const dx of [-0.4, 0.4]) box(group, x + dx, y + 9.3, z + 1.7, 0.17, 16.8, 0.25, yellow);
    for (let h = 1; h < 18; h += 1) box(group, x, y + h, z + 1.7, 0.9, 0.08, 0.2, steel);
    box(group, x, y + 11, z + 2.06, 0.06, 13, 0.06, steel);
    box(group, x, y + 8.4, z + 2.1, 0.8, 2.2, 0.8, dark);
    solid(group, new THREE.CylinderGeometry(0.22, 0.22, 6.5, 8), concrete, x, y + 3.25, z + 2.1);
    box(group, x, y + 17.65, z + 1.7, 1.05, 0.3, 0.7, yellow);
  }

  function emitBuilding(group, b, base, poly, bounds) {
    const state = b.construction, cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
    const floor = [], innerScale = Math.max(0.35, 1 - 6 / Math.max(8, Math.min(width, depth)));
    for (const p of poly) floor.push(cx + (p.x - cx) * innerScale, cz + (p.z - cz) * innerScale);
    if (state.stage !== 'renovation') polygon(state.excavationDepth ? floor : b.ring,
      state.stage === 'unknown' ? (x, z) => terrainHeight(x, z) + 0.04 : base + 0.04, soil, group, b.holes);
    if (state.excavationDepth) {
      const positions = [], uv = [];
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length, a = poly[i], c = poly[j];
        const corners = [[a.x, terrainHeight(a.x, a.z) + 0.04, a.z], [c.x, terrainHeight(c.x, c.z) + 0.04, c.z],
          [floor[j * 2], base + 0.05, floor[j * 2 + 1]], [floor[i * 2], base + 0.05, floor[i * 2 + 1]]];
        for (const k of [0, 1, 2, 0, 2, 3]) { positions.push(...corners[k]); uv.push(corners[k][0], corners[k][2]); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals(); emit(group, geometry, soil);
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], c = poly[(i + 1) % poly.length], length = Math.hypot(c.x - a.x, c.z - a.z), yaw = -Math.atan2(c.z - a.z, c.x - a.x);
      const midX = (a.x + c.x) / 2, midZ = (a.z + c.z) / 2, radius = Math.hypot(midX - cx, midZ - cz) || 1;
      const nx = (midX - cx) / radius, nz = (midZ - cz) / radius;
      const fenceOffset = state.excavationDepth ? 2 : state.stage === 'renovation' ? 1.4 : 0.4;
      const panels = Math.max(1, Math.min(32, Math.ceil(length / 4)));
      for (let j = 0; j < panels; j++) {
        const t = (j + 0.5) / panels, x = a.x + (c.x - a.x) * t + nx * fenceOffset, z = a.z + (c.z - a.z) * t + nz * fenceOffset;
        const y = terrainHeight(x, z);
        box(group, x, y + 1.05, z, length / panels + 0.04, 2.1, 0.12, hoarding, yaw);
        box(group, x, y + 1.05, z, 0.08, 2.3, 0.2, steel, yaw);
      }
      if (state.stage === 'renovation') {
        const y = terrainHeight(midX, midZ), h = Math.min(18, b.h + 1.2);
        for (let s = 0; s < length; s += 4) {
          const t = s / (length || 1), x = a.x + (c.x - a.x) * t + nx, z = a.z + (c.z - a.z) * t + nz;
          box(group, x, y + h / 2, z, 0.07, h, 0.07, steel);
        }
        for (let h0 = 2; h0 < h; h0 += 2) box(group, midX + nx, y + h0, midZ + nz, length, 0.12, 1.4, timber, yaw);
      }
    }
    if (state.stage === 'piling' || state.stage === 'foundation') {
      let count = 0;
      const limit = NYC.runtime?.lite ? 48 : 96, spacing = Math.max(5, Math.sqrt(width * depth / limit));
      for (let x = bounds.minX + 5; x < bounds.maxX - 3 && count < limit; x += spacing) for (let z = bounds.minZ + 5; z < bounds.maxZ - 3 && count < limit; z += spacing) {
        if (!pointInPoly(poly, x, z) || edgeDistance(poly, x, z) < 4 || b.holes.some((h) => pointInPoly(NYC.toPoints(h), x, z))) continue;
        const h = 0.35 + ((Math.round(x * 7 + z * 11) ^ b.id) & 7) * 0.035;
        solid(group, new THREE.CylinderGeometry(0.32, 0.34, h, 8), concrete, x, base + h / 2, z); count++;
      }
      if (state.stage === 'piling') pileRig(group, cx, base, cz);
    } else if (state.stage === 'frame') {
      const height = state.currentHeight;
      for (let x = bounds.minX + 3; x < bounds.maxX; x += 7) for (let z = bounds.minZ + 3; z < bounds.maxZ; z += 7) {
        if (pointInPoly(poly, x, z)) box(group, x, base + height / 2, z, 0.45, height, 0.45, concrete);
      }
      for (let y = 3; y <= height; y += 3) polygon(b.ring, base + y, concrete, group, b.holes);
    }
    const x = cx - width * 0.22, z = cz + depth * 0.2;
    for (let i = 0; i < 3; i++) box(group, x + i * 1.8, base + 0.4, z, 1.3, 0.8, 2, state.stage === 'renovation' ? timber : concrete);
  }
  return { emitBuilding };
}

NYC.createKazanConstruction = createKazanConstruction;
})();
