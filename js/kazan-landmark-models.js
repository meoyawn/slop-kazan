(function () {
const { THREE, TSL } = NYC;

/** Geometry reviewed against completed-building photographs, on the mapped footprint. */
function createKazanLandmarkModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, flush } = draw;
  let arenaSign = null;

  function volume(group, ring, y, h, roof, wall) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(ring), { depth: h, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, y, 0);
    splitExtrusion(group, geometry, roof, wall, y);
  }

  function ellipse(cx, cz, rx, rz) {
    const ring = [];
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2;
      ring.push(cx + Math.cos(a) * rx, cz + Math.sin(a) * rz);
    }
    return ring;
  }

  function cladding(hex) {
    const { uv, fract, abs, fwidth, smoothstep, max, float, color, mix, vec2 } = TSL;
    const cell = fract(uv().div(vec2(3.2, 1.35))), edge = abs(cell.sub(0.5));
    const aa = fwidth(cell).max(vec2(0.001));
    const joint = max(smoothstep(float(0.49).sub(aa.x), float(0.49).add(aa.x), edge.x),
      smoothstep(float(0.49).sub(aa.y), float(0.49).add(aa.y), edge.y));
    const material = new THREE.MeshStandardNodeMaterial({ metalness: 0.2, roughness: 0.64 });
    material.colorNode = mix(color(hex), color(0x8d9699), joint.mul(0.4));
    material.userData.observedFacade = true;
    return material;
  }

  function rim(group, cx, cz, rx, rz, y, width, height, material) {
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2, c = (i + 1) / 96 * Math.PI * 2;
      const x0 = cx + Math.cos(a) * rx, z0 = cz + Math.sin(a) * rz;
      const x1 = cx + Math.cos(c) * rx, z1 = cz + Math.sin(c) * rz;
      box(group, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) + 0.03, height, width, material, -Math.atan2(z1 - z0, x1 - x0));
    }
  }

  function arenaLetters(group, cx, cz, rx, rz, y, angle) {
    if (!arenaSign) {
      const canvas = document.createElement('canvas');
      canvas.width = 2048; canvas.height = 144;
      const context = canvas.getContext('2d');
      context.font = '900 140px sans-serif'; context.textBaseline = 'alphabetic';
      const words = [['ТАТ', '#cc353b'], ['НЕФТЬ ', '#258247'], ['АРЕНА', '#cc353b']];
      const scale = 2000 / context.measureText('ТАТНЕФТЬ АРЕНА').width;
      context.scale(scale, 1);
      let offset = 10;
      for (const [word, hex] of words) {
        context.fillStyle = hex; context.fillText(word, offset, 132); offset += context.measureText(word).width;
      }
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      arenaSign = new THREE.MeshStandardNodeMaterial({ map, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.6 });
    }
    const vertices = [], uvs = [], width = 47, half = width / ((rx + rz) / 2) / 2;
    for (let i = 0; i < 40; i++) {
      const a = angle - half + half * 2 * i / 40, c = angle - half + half * 2 * (i + 1) / 40;
      const corners = [[cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz], [cx + Math.cos(c) * rx, y, cz + Math.sin(c) * rz],
        [cx + Math.cos(c) * rx, y + 3, cz + Math.sin(c) * rz], [cx + Math.cos(a) * rx, y + 3, cz + Math.sin(a) * rz]];
      for (const j of [0, 1, 2, 0, 2, 3]) {
        vertices.push(...corners[j]); uvs.push(1 - (j === 0 || j === 3 ? i : i + 1) / 40, j < 2 ? 0 : 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals();
    draw.emit(group, geometry, arenaSign);
  }

  function tatneftArena(group, b, base, bounds) {
    const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
    const cx = bounds.minX + width * 0.43, cz = (bounds.minZ + bounds.maxZ) / 2;
    const rx = width * 0.389, rz = depth * 0.435, h = b.h;
    const white = cladding(0xd7dcdd), trim = plainMaterial(0xe3e5e3, 0.25), roof = plainMaterial(0x8f9694, 0.22);
    const blue = plainMaterial(0x20465d, 0.62), rail = plainMaterial(0x668396, 0.5), dark = plainMaterial(0x445059);
    const glazing = NYC.createCurtainWallMaterial({ glassTint: 0x25677c, frameTint: 0xa5bdc3, floorHeight: 3.4, windowWidth: 1.7, spandrelRatio: 0.06 });
    const ring = ellipse(cx, cz, rx, rz);
    volume(group, b.ring, base, 3.1, trim, white);
    const terrace = new THREE.ExtrudeGeometry(shapeOf(ellipse(cx, cz, rx + 6.5, rz + 6.5), [ellipse(cx, cz, rx, rz)]), { depth: 3.1, bevelEnabled: false });
    terrace.rotateX(-Math.PI / 2).translate(0, base, 0);
    splitExtrusion(group, terrace, trim, white, base);
    rim(group, cx, cz, rx + 6.5, rz + 6.5, base + 4.1, 0.08, 0.08, blue);
    rim(group, cx, cz, rx + 6.5, rz + 6.5, base + 3.7, 0.05, 0.05, rail);
    for (let i = 0; i < 96; i++) {
      const a = i / 96 * Math.PI * 2;
      box(group, cx + Math.cos(a) * (rx + 6.5), base + 3.6, cz + Math.sin(a) * (rz + 6.5), 0.06, 1.05, 0.06, rail);
    }
    volume(group, ellipse(cx, cz, rx + 0.6, rz + 0.6), base + 3.1, 3.5, trim, glazing);
    volume(group, ring, base + 6.6, h - 12.4, roof, white);
    volume(group, ring, base + h - 5.8, 4.1, roof, blue);
    rim(group, cx, cz, rx + 0.2, rz + 0.2, base + 6.6, 0.65, 0.22, trim);
    rim(group, cx, cz, rx + 0.35, rz + 0.35, base + h - 5.8, 0.6, 0.28, trim);
    rim(group, cx, cz, rx + 0.5, rz + 0.5, base + h - 1.6, 0.6, 0.3, trim);
    rim(group, cx, cz, rx + 0.15, rz + 0.15, base + h - 0.75, 0.07, 0.07, rail);
    for (let i = 0; i < 144; i++) {
      const a = i / 144 * Math.PI * 2, x = cx + Math.cos(a) * (rx + 0.15), z = cz + Math.sin(a) * (rz + 0.15);
      box(group, x, base + h - 3.6, z, 0.055, 4, 0.06, rail, -a);
      if (i % 3 === 0) box(group, x, base + h - 1.25, z, 0.06, 1.2, 0.06, rail);
    }
    const vertices = [], uvs = [];
    function roofY(x, z) { return base + h - 1.8 + 1.1 * Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2); }
    for (let i = 0; i < 96; i++) for (let k = 0; k < 8; k++) {
      const a = i / 96 * Math.PI * 2, c = (i + 1) / 96 * Math.PI * 2;
      const corners = [[a, k / 8], [c, k / 8], [c, (k + 1) / 8], [a, (k + 1) / 8]].map(([angle, r]) => [cx + Math.cos(angle) * rx * r, cz + Math.sin(angle) * rz * r]);
      for (const j of [0, 2, 1, 0, 3, 2]) {
        const [x, z] = corners[j]; vertices.push(x, roofY(x, z), z); uvs.push(x / 5, z / 5);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals(); draw.emit(group, geometry, roof);
    for (let x = -45; x <= 45; x += 15) for (let z = -48; z <= 48; z += 24) {
      if ((x / rx) ** 2 + (z / rz) ** 2 > 0.7) continue;
      box(group, cx + x, roofY(cx + x, cz + z) + 0.22, cz + z, 1.7, 0.42, 1.4, trim);
    }
    const frontZ = bounds.minZ + 6;
    box(group, cx, base + 10.3, frontZ, 29, 14.2, 8, glazing);
    box(group, cx, base + 20.1, frontZ - 0.05, 29, 5.4, 8.1, plainMaterial(0x1d4c7a, 0.4));
    for (const side of [-1, 1]) {
      box(group, cx + side * 17, base + 13, frontZ, 4.4, 23.2, 9.6, trim);
      for (const y of [8, 14, 20]) box(group, cx + side * 17, base + y, frontZ - 4.83, 4.45, 0.14, 0.08, rail);
    }
    for (let i = 0; i < 8; i++) box(group, cx - 11.7 + i * 3.35, base + 4.5, frontZ - 1.65, 2.7, 2.8, 0.12, blue);
    box(group, cx, base + 6.2, frontZ - 4.5, 25, 0.24, 6, trim);
    for (let i = 0; i < 16; i++) box(group, cx, base + (16 - i) * 0.1, frontZ - 4 - i * 0.42, 27, (16 - i) * 0.2, 0.5, trim);
    const annexX = bounds.maxX - 30.9, annexZ = bounds.maxZ - 44.8;
    const annexRing = [bounds.maxX - 61.8, bounds.maxZ - 81.8, bounds.maxX, bounds.maxZ - 81.8,
      bounds.maxX, bounds.maxZ - 7.8, bounds.maxX - 61.8, bounds.maxZ - 7.8];
    volume(group, annexRing, base + 3.1, 9.5, roof, white);
    box(group, bounds.maxX + 0.06, base + 4.4, annexZ, 0.12, 2.3, 65, blue);
    for (let x = -21; x <= 21; x += 14) for (let z = -26; z <= 26; z += 13) {
      box(group, annexX + x, base + 12.95, annexZ + z, 3.2, 0.7, 2.4, trim);
      if (z < -10) {
        box(group, annexX + x, base + 14, annexZ + z + 4.5, 4.2, 1.6, 2.8, dark);
        for (const side of [-1, 1]) solid(group, new THREE.CylinderGeometry(0.75, 0.75, 0.15, 12), rail, annexX + x + side, base + 14.88, annexZ + z + 4.5);
      }
    }
    arenaLetters(group, cx, cz, rx + 0.9, rz + 0.9, base + h - 5.2, -Math.PI / 2 - 0.72);
    arenaLetters(group, cx, cz, rx + 0.9, rz + 0.9, base + h - 5.2, -Math.PI / 2 + 0.72);
    arenaLetters(group, cx, cz, rx + 0.9, rz + 0.9, base + h - 5.2, Math.PI / 2);
  }

  function emitReviewedBuilding(parent, b, base, bounds) {
    if (b.model !== 'tatneft-arena') return false;
    const group = new THREE.Group(); group.name = 'KazanLandmark/tatneft';
    group.userData.source = b.heightEvidence;
    tatneftArena(group, b, base, bounds); flush(group); parent.add(group);
    return true;
  }
  return emitReviewedBuilding;
}

NYC = { ...NYC, createKazanLandmarkModels };
})();
