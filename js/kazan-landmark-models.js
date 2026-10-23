(function () {
const { THREE, TSL } = NYC;

/** Geometry reviewed against completed-building photographs, on the mapped footprint. */
function createKazanLandmarkModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, flush } = draw;
  let arenaSign = null;
  let oldBrick = null;
  const signs = new Map();

  function label(group, text, x, y, z, width, height, yaw, hex = '#d72535') {
    const key = `${text}/${hex}`;
    if (!signs.has(key)) {
      const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 256;
      const context = canvas.getContext('2d'); context.font = '900 210px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = hex; context.fillText(text, 1024, 133, 2000);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      signs.set(key, new THREE.MeshStandardNodeMaterial({ map: texture, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.6 }));
    }
    const geometry = new THREE.PlaneGeometry(width, height).toNonIndexed(); geometry.rotateY(yaw).translate(x, y, z); draw.emit(group, geometry, signs.get(key));
  }

  function bahetleMall(group, b, base, bounds) {
    const white = cladding(0xd0d5d4), brown = cladding(0x68534b), frame = plainMaterial(0xc4d3d1, 0.48);
    const roof = plainMaterial(0x7b898a, 0.2), glass = plainMaterial(0x28717c, 0.62), dark = plainMaterial(0x263d44);
    const h = b.h - 1.8, cx = 1686.5, cz = -4030.2, radius = 17.3;
    volume(group, b.ring, base, h, roof, white);
    const glazed = new THREE.CylinderGeometry(radius, radius, h - 6.4, 48, 1, true, Math.PI, Math.PI);
    solid(group, glazed, glass, cx, base + h / 2 - 0.2, cz);
    for (let i = 0; i <= 28; i++) {
      const a = Math.PI + i / 28 * Math.PI;
      box(group, cx + Math.sin(a) * (radius + 0.05), base + h / 2, cz + Math.cos(a) * (radius + 0.05), 0.09, h - 6.2, 0.1, frame, a);
    }
    for (const y of [3.2, 8.9, 14.9]) {
      const ring = new THREE.CylinderGeometry(radius + 0.12, radius + 0.12, 0.16, 48, 1, true, Math.PI, Math.PI);
      solid(group, ring, frame, cx, base + y, cz);
    }
    for (const side of [-1, 1]) {
      const z = cz + side * (radius + 1.9);
      box(group, cx - 0.1, base + h * 0.49, z, 0.3, h * 0.86, 5, brown);
      box(group, cx - 0.3, base + h * 0.45, z, 0.12, h * 0.72, 3.7, dark);
      for (let y = 1; y < h - 2; y += 3.1) box(group, cx - 0.4, base + y, z, 0.12, 0.07, 3.7, frame);
      box(group, cx - 0.4, base + h * 0.45, z, 0.15, h * 0.72, 0.08, frame);
    }
    const dome = new THREE.CylinderGeometry(10.1, 12.1, 2, 40, 1, true);
    solid(group, dome, glass, cx - 0.5, base + h + 0.65, cz);
    solid(group, new THREE.CylinderGeometry(10.5, 10.5, 0.18, 40), roof, cx - 0.5, base + h + 1.7, cz);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      box(group, cx - 0.5 + Math.sin(a) * 11, base + h + 0.6, cz + Math.cos(a) * 11, 0.1, 2, 0.1, frame);
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 1.19 + i / 6 * Math.PI * 0.62, x = cx + Math.sin(a) * radius, z = cz + Math.cos(a) * radius;
      box(group, x, base + 1.5, z, 2.1, 3, 0.2, dark, a);
      box(group, x, base + 3.3, z, 2.2, 0.16, 3, frame, a);
    }
    for (let x = bounds.minX + 22; x < bounds.maxX - 4; x += 22) {
      box(group, x, base + h * 0.5, bounds.minZ - 0.12, 7.4, h * 0.65, 0.18, dark);
      for (let y = 4; y < h - 2; y += 3) box(group, x, base + y, bounds.minZ - 0.25, 7.5, 0.08, 0.12, frame);
      box(group, x, base + h * 0.5, bounds.minZ - 0.26, 0.1, h * 0.65, 0.1, frame);
      box(group, x, base + h + 0.7, cz, 6, 1.4, 3, roof);
    }
    label(group, 'Бәхетле', cx - radius - 0.25, base + h - 1.1, cz, 28, 2.7, -Math.PI / 2, '#245bba');
    label(group, 'EUROSPAR', cx - radius - 0.35, base + 3.8, cz, 17, 1.6, -Math.PI / 2, '#c82f35');
  }

  function lemanaStore(group, b, base, bounds) {
    const wall = cladding(0xd1d3ce), roof = plainMaterial(0x979d96), brown = cladding(0x9e9278);
    const dark = plainMaterial(0x303c3e), steel = plainMaterial(0xc7cdca, 0.48), glass = plainMaterial(0x385864, 0.5);
    const yellow = plainMaterial(0xd3a91c), cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const front = bounds.maxZ + 0.14, left = bounds.minX + 28, right = bounds.maxX - 2, width = right - left;
    volume(group, b.ring, base, b.h, roof, wall);
    box(group, (left + right) / 2, base + 2.05, front, width, 3.7, 0.2, glass);
    box(group, (left + right) / 2, base + 5.2, front + 2.3, width + 0.5, 1.25, 0.32, brown);
    box(group, (left + right) / 2, base + 5.8, front + 0.1, width + 0.5, 0.18, 4.9, steel);
    box(group, cx + 3, base + 8.1, front + 0.05, width - 7, 1.35, 0.16, glass);
    for (let x = left + 1.5; x < right; x += 9.6) {
      box(group, x, base + 2.55, front + 2.1, 0.32, 5.1, 0.32, steel);
      box(group, x, base + 2.05, front + 0.15, 0.09, 3.7, 0.12, steel);
      box(group, x, base + 8.1, front + 0.16, 0.08, 1.35, 0.12, steel);
      const brace = new THREE.BoxGeometry(0.08, 3.4, 0.08);
      brace.rotateX(0.75); solid(group, brace, steel, x, base + 6.9, front + 1.15);
    }
    for (let x = left + 5; x < right - 2; x += 4.8) {
      solid(group, new THREE.SphereGeometry(0.31, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), yellow, x, base + 0.1, front + 5.1);
    }
    for (const x of [left + 12, right - 14]) {
      box(group, x, base + 1.65, front + 0.22, 4.8, 3.3, 0.12, dark);
      for (const dx of [-2.3, 0, 2.3]) box(group, x + dx, base + 1.65, front + 0.3, 0.09, 3.3, 0.1, steel);
      label(group, 'ВХОД', x, base + 4.32, front + 2.5, 5, 0.65, 0, '#eeeecc');
    }
    const half = 23, rise = 8.7, faceX = bounds.maxX + 0.17;
    const triangle = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(0, rise), new THREE.Vector2(half, 0)]);
    const fascia = new THREE.ExtrudeGeometry(triangle, { depth: 0.28, bevelEnabled: false });
    fascia.rotateY(Math.PI / 2); solid(group, fascia, dark, faceX, base + 2.6, cz);
    for (let s = -half + 1.5; s < half - 1; s += 0.65) {
      const h = Math.max(0.1, rise * (1 - Math.abs(s) / half) - 0.65);
      box(group, faceX + 0.32, base + 2.8 + h / 2, cz + s, 0.18, h, 0.4, brown);
    }
    label(group, 'ЛЕМАНА', faceX + 0.47, base + 5.25, cz, 16.5, 2.15, Math.PI / 2, '#e2e3db');
    label(group, 'ПРО', faceX + 0.47, base + 3.5, cz, 8.2, 1.75, Math.PI / 2, '#e4b72a');
    const logo = new THREE.Shape([new THREE.Vector2(-2, 0), new THREE.Vector2(-2, 2.5), new THREE.Vector2(0, 4.3),
      new THREE.Vector2(2, 2.5), new THREE.Vector2(2, 0)]);
    logo.holes.push(new THREE.Path([new THREE.Vector2(-0.85, 0.8), new THREE.Vector2(0.85, 0.8),
      new THREE.Vector2(0.85, 2.15), new THREE.Vector2(0, 2.9), new THREE.Vector2(-0.85, 2.15)]));
    const mark = new THREE.ExtrudeGeometry(logo, { depth: 0.15, bevelEnabled: false });
    mark.rotateY(Math.PI / 2); solid(group, mark, yellow, faceX + 0.5, base + 6.2, cz);
    label(group, 'ЛЕМАНА', cx - 8, base + b.h + 1.5, front - 0.3, 45, 3.9, 0, '#263537');
    label(group, 'ПРО', cx + 26, base + b.h + 1.5, front - 0.3, 19, 3.9, 0, '#e4b72a');
    for (const y of [b.h + 0.3, b.h + 1.1]) box(group, cx, base + y, front - 1, width + 10, 0.08, 0.08, steel);
    for (let x = bounds.minX + 22; x < bounds.maxX - 8; x += 26) for (let z = bounds.minZ + 18; z < bounds.maxZ - 12; z += 28) {
      box(group, x, base + b.h + 0.45, z, 3.5, 0.9, 2.6, roof);
      box(group, x, base + b.h + 0.92, z, 3.7, 0.08, 2.8, steel);
    }
  }

  function uramCentre(group, b, base, bounds) {
    const { uv, fract, fwidth, smoothstep, float, color, mix } = TSL;
    const rib = fract(uv().x.div(0.24)), aa = fwidth(rib).max(0.002);
    const paint = new THREE.MeshStandardNodeMaterial({ metalness: 0.22, roughness: 0.65 });
    paint.colorNode = mix(color(0x386fa8), color(0x285786), smoothstep(float(0.65).sub(aa), float(0.65).add(aa), rib));
    paint.userData.observedFacade = true;
    const roof = plainMaterial(0xa8b5ba, 0.2), glass = plainMaterial(0x3c5963, 0.5), frame = plainMaterial(0xb4c1bd, 0.4);
    volume(group, b.ring, base, b.h, roof, paint);
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    let front = null;
    for (let i = 0; i < b.ring.length; i += 2) {
      const j = (i + 2) % b.ring.length, dx = b.ring[j] - b.ring[i], dz = b.ring[j + 1] - b.ring[i + 1], length = Math.hypot(dx, dz);
      if (length < 8) continue;
      const x = (b.ring[j] + b.ring[i]) / 2, z = (b.ring[j + 1] + b.ring[i + 1]) / 2, yaw = -Math.atan2(dz, dx);
      let nx = -dz / length, nz = dx / length;
      if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }
      for (const [y, height] of [[2, 3.6], [9, 2.6]]) {
        box(group, x + nx * 0.12, base + y, z + nz * 0.12, length - 0.5, height, 0.16, glass, yaw);
        for (let t = 1.5; t < length - 1; t += 2.2) {
          box(group, b.ring[i] + dx * t / length + nx * 0.22, base + y,
            b.ring[i + 1] + dz * t / length + nz * 0.22, 0.08, height, 0.12, frame, yaw);
        }
        for (const side of [-1, 1]) box(group, x + nx * 0.21, base + y + side * height / 2, z + nz * 0.21, length, 0.09, 0.12, frame, yaw);
      }
      if (!front || nz > front.nz) front = { x, z, nx, nz };
    }
    if (front) label(group, 'УРАМ', front.x + front.nx * 0.28, base + 6.4, front.z + front.nz * 0.28, 16, 2.5, Math.atan2(front.nx, front.nz), '#e3e7df');
  }

  function musinaRows(group, b, base, bounds) {
    const grey = cladding(0x929c99), orange = cladding(0xb85e26), brown = cladding(0x594337);
    const frame = plainMaterial(0x3b4541, 0.4), glass = plainMaterial(0x38515a, 0.5), roof = plainMaterial(0x6c7775);
    volume(group, b.ring, base, 3.7, roof, grey);
    const x = bounds.maxX + 0.05;
    for (let z = bounds.minZ + 3.2; z < bounds.maxZ - 1; z += 5.5) {
      box(group, x, base + 1.8, z, 0.18, 2.7, 4.9, glass);
      box(group, x + 0.13, base + 1.8, z - 2.6, 0.12, 3.1, 0.12, frame);
      box(group, x + 0.13, base + 1.8, z, 0.12, 3.1, 0.06, frame);
      box(group, x + 0.13, base + 2.7, z, 0.12, 0.08, 5.2, frame);
      box(group, x + 0.2, base + 3.6, z, 0.5, 0.85, 5.5, orange);
      if (Math.round(z / 5.5) % 3 === 0) box(group, x + 0.35, base + 2.8, z, 0.6, 3.4, 2, brown);
    }
    const samsaZ = (NYC.GEO.frame.origin.lat - 55.825844) * NYC.GEO.frame.kz;
    box(group, x + 0.5, base + 3.82, samsaZ, 0.3, 0.8, 12, brown);
    label(group, 'Самса №1', x + 0.68, base + 3.85, samsaZ, 11.3, 0.75, Math.PI / 2, '#e7be3d');
  }

  function kishmishCafe(group, b, base, bounds) {
    const grey = cladding(0x939b94), orange = cladding(0xb85e26), roof = plainMaterial(0x6c7775);
    const frame = plainMaterial(0x494139, 0.35), glass = plainMaterial(0x38515a, 0.5), stone = plainMaterial(0x9e9d8c);
    volume(group, b.ring, base, 3.7, roof, grey);
    const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    for (const north of [false, true]) {
      const span = north ? width : depth, yaw = north ? 0 : Math.PI / 2;
      const x = north ? cx : bounds.maxX + 0.12, z = north ? bounds.minZ - 0.12 : cz;
      box(group, x, base + 0.3, z, span, 0.6, 0.2, stone, yaw);
      box(group, x, base + 1.9, z, span - 0.18, 2.6, 0.18, glass, yaw);
      box(group, x, base + 3.55, z, span + 0.35, 0.8, 0.32, orange, yaw);
      for (let s = -span / 2 + 0.1; s < span / 2; s += 1.6) {
        box(group, x + (north ? s : 0.14), base + 1.9, z + (north ? -0.14 : s), 0.08, 2.7, 0.08, frame);
      }
      box(group, x, base + 2.85, z, span, 0.08, 0.28, frame, yaw);
      box(group, x + (north ? 0 : 0.32), base + 3.13, z - (north ? 0.32 : 0), span + 0.5, 0.12, 0.9, frame, yaw);
    }
    const neon = new THREE.MeshStandardNodeMaterial({ color: 0x5dba54, emissive: 0x34bf32, emissiveIntensity: 0.75 });
    box(group, bounds.maxX + 0.76, base + 3.22, cz, 0.07, 0.07, depth + 0.6, neon);
    box(group, cx, base + 3.22, bounds.minZ - 0.76, width + 0.6, 0.07, 0.07, neon);
    label(group, 'Кишмиш', bounds.maxX + 0.4, base + 4.13, cz, depth - 0.8, 1.45, Math.PI / 2, '#e7b63b');
    label(group, 'Кишмиш', cx, base + 4.13, bounds.minZ - 0.4, width - 3.5, 1.4, Math.PI, '#e7b63b');
    label(group, 'КАФЕ', cx + width * 0.37, base + 4.03, bounds.minZ - 0.4, 2.4, 0.85, Math.PI, '#45aa4b');
    for (const dz of [-3.3, 0, 3.3]) {
      box(group, bounds.maxX + 0.25, base + 1.65, cz + dz, 0.04, 1.1, 0.8, plainMaterial(0xc8c8b3));
      box(group, bounds.maxX + 0.28, base + 1.65, cz + dz, 0.03, 0.7, 0.5, orange);
    }
  }

  function musinaParking(group, b, base, bounds) {
    const brick = NYC.createObservedFacadeMaterial(b.appearance), roof = plainMaterial(0x838b84), red = plainMaterial(0x984d3d);
    volume(group, b.ring, base, b.h, roof, brick);
    for (let z = bounds.minZ + 5; z < bounds.maxZ - 5; z += 8) {
      box(group, bounds.maxX + 0.12, base + b.h - 0.5, z, 0.12, 0.35, 6.5, red);
      box(group, bounds.maxX - 5, base + b.h + 0.35, z, 1.1, 0.8, 0.9, roof);
    }
    const grey = plainMaterial(0x737c78), dark = plainMaterial(0x263331);
    box(group, bounds.maxX + 0.2, base + 1.5, bounds.minZ + 18, 0.3, 3, 5.5, dark);
    box(group, bounds.maxX + 0.25, base + 3.2, bounds.minZ + 18, 0.4, 0.6, 6, grey);
    for (let z = bounds.minZ + 20; z < bounds.maxZ - 15; z += 17) box(group, bounds.maxX + 0.15, base + 10, z, 0.14, 12, 0.08, grey);
  }

  function tandemMall(group, b, base, bounds) {
    const beige = cladding(0xd3c6ac), red = cladding(0x8b2b29), stone = cladding(0xb6a58d);
    const glass = plainMaterial(0x3b6872, 0.6), dark = plainMaterial(0x45463e), frame = plainMaterial(0x919f9d, 0.45);
    const roof = plainMaterial(0x818a87, 0.2), h = b.h - 10;
    const layers = [[0, 0.65, stone], [0.65, 0.15, dark], [0.8, 0.85, stone], [1.65, 0.15, dark], [1.8, 0.85, stone],
      [2.65, 0.15, dark], [2.8, 0.85, stone], [3.65, 0.15, dark], [3.8, 0.8, stone], [4.6, 0.35, dark],
      [4.95, 1.05, glass], [6, 3.5, beige], [9.5, 0.95, glass], [10.45, 3.35, beige], [13.8, h - 13.8, red]];
    for (const [y, height, material] of layers) volume(group, b.ring, base + y, height, roof, material);
    const cx = -911, frontZ = -3398.4;
    box(group, cx, base + h / 2 + 2.2, frontZ, 23, h - 4.4, 1.7, red);
    for (const y of [8.8, 12.1]) box(group, cx, base + y, frontZ + 0.88, 11, 0.9, 0.06, beige);
    box(group, cx, base + 2.1, frontZ + 0.95, 14, 4.1, 0.2, glass);
    for (let i = -2; i <= 2; i++) box(group, cx + i * 2.7, base + 2, frontZ + 1.1, 0.08, 4, 0.1, frame);
    box(group, cx, base + 4.3, frontZ + 2.3, 17, 0.25, 4.2, dark);
    label(group, 'ТАНДЕМ', cx + 2, base + h + 3.1, frontZ, 42, 5.5, 0, '#b32930');
    const logoX = cx - 23;
    box(group, logoX - 1.3, base + h + 2, frontZ, 1.5, 4.6, 0.4, plainMaterial(0x2366ae));
    box(group, logoX + 1.3, base + h + 2, frontZ, 1.5, 4.6, 0.4, plainMaterial(0x2366ae));
    const diamond = new THREE.BoxGeometry(2.3, 2.3, 0.42); diamond.rotateZ(Math.PI / 4);
    solid(group, diamond, red, logoX, base + h + 5.4, frontZ);
    label(group, 'КИНОМАКС', bounds.minX + 44, base + h - 1, -3409, 30, 3.2, 0, '#e2dfd4');
    label(group, 'СПОРТМАСТЕР', bounds.maxX - 48, base + h - 0.8, -3422, 27, 2.1, 0, '#d2dce2');
    label(group, 'Перекрёсток', -866, base + h - 1.2, -3412, 25, 2.3, 0, '#85b375');
    const tx = -988, tz = -3405;
    solid(group, new THREE.CylinderGeometry(7.8, 7.8, h + 1.5, 32), glass, tx, base + (h + 1.5) / 2, tz);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      box(group, tx + Math.sin(a) * 7.85, base + h / 2, tz + Math.cos(a) * 7.85, 0.22, h + 1.5, 0.22, frame);
    }
    solid(group, new THREE.ConeGeometry(8.6, 8.5, 16), frame, tx, base + h + 5.5, tz);
    solid(group, new THREE.ConeGeometry(7.8, 7.8, 16), glass, tx, base + h + 5.6, tz);
    for (let x = bounds.minX + 18; x < bounds.maxX - 20; x += 26) for (let z = bounds.minZ + 15; z < bounds.maxZ - 22; z += 29) {
      if (!NYC.pointInPoly(NYC.toPoints(b.ring), x, z)) continue;
      box(group, x, base + h + 0.7, z, 5.5, 1.4, 3.2, roof);
    }
  }

  function parkHouse(group, b, base) {
    const white = cladding(0xc9cecc), terra = cladding(0xb16840), roof = plainMaterial(0x8f989b, 0.15), frame = plainMaterial(0xc2ccca, 0.45);
    const glass = plainMaterial(0x416b71, 0.65), dark = plainMaterial(0x243f47, 0.45);
    const bodyHeight = b.h * 0.64;
    volume(group, b.ring, base, bodyHeight, roof, white);
    volume(group, b.ring, base + bodyHeight - 3, 3, roof, terra);
    const cx = 590.3, cz = -4369.6, ux = Math.SQRT1_2, uz = Math.SQRT1_2, nx = -uz, nz = ux, yaw = -Math.PI / 4;
    const bottom = 3.5, top = 18.2, r0 = 17.3, r1 = 23;
    const cone = new THREE.CylinderGeometry(r1, r0, top - bottom, 48, 1, true, -Math.PI * 0.75, Math.PI);
    solid(group, cone, glass, cx, base + (top + bottom) / 2, cz);
    const cap = new THREE.CylinderGeometry(r1, r1, 0.35, 48, 1, false, -Math.PI * 0.75, Math.PI);
    solid(group, cap, roof, cx, base + top, cz);
    function beam(a, c, radius) {
      const direction = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z), length = direction.length();
      const geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      solid(group, geometry, frame, (a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
    }
    for (let i = 0; i <= 26; i++) {
      const angle = -Math.PI * 0.75 + Math.PI * i / 26;
      beam({ x: cx + Math.sin(angle) * r0, y: base + bottom, z: cz + Math.cos(angle) * r0 },
        { x: cx + Math.sin(angle) * r1, y: base + top, z: cz + Math.cos(angle) * r1 }, 0.07);
    }
    for (let row = 0; row <= 5; row++) {
      const y = bottom + (top - bottom) * row / 5, radius = r0 + (r1 - r0) * row / 5;
      for (let i = 0; i < 48; i++) {
        const a = -Math.PI * 0.75 + Math.PI * i / 48, c = -Math.PI * 0.75 + Math.PI * (i + 1) / 48;
        beam({ x: cx + Math.sin(a) * radius, y: base + y, z: cz + Math.cos(a) * radius },
          { x: cx + Math.sin(c) * radius, y: base + y, z: cz + Math.cos(c) * radius }, 0.08);
      }
    }
    for (const offset of [-10.5, 0, 10.5]) {
      const x = cx + ux * offset + nx * 16.8, z = cz + uz * offset + nz * 16.8;
      box(group, x, base + 1.7, z, 8.8, 3.4, 0.3, dark, yaw);
      for (const side of [-1, 1]) box(group, x + ux * side * 4.75, base + 1.8, z + uz * side * 4.75, 0.9, 3.6, 1.1, frame, yaw);
    }
    label(group, 'PARK HOUSE', cx + nx * 12, base + 20.3, cz + nz * 12, 37, 4.3, yaw);
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
    const context = canvas.getContext('2d'); context.fillStyle = '#d5ba9b'; context.fillRect(0, 0, 2048, 512);
    const colors = ['#c6587a', '#7199ac', '#e2ba69', '#223f48', '#e3c8b2', '#a5654a'];
    for (let i = 0; i < 20; i++) {
      const x = i * 105 + 35, y = 98 + (i % 3) * 18, scale = 0.85 + (i % 4) * 0.06;
      context.fillStyle = '#e6c2a3'; context.beginPath(); context.ellipse(x, y, 20, 26, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = colors[i % colors.length]; context.beginPath(); context.moveTo(x - 22, y + 28); context.lineTo(x + 22, y + 28);
      context.lineTo(x + 36, y + 210 * scale); context.lineTo(x - 34, y + 210 * scale); context.closePath(); context.fill();
      context.strokeStyle = '#34434a'; context.lineWidth = 12; context.beginPath(); context.moveTo(x - 12, y + 200 * scale); context.lineTo(x - 25, 470);
      context.moveTo(x + 12, y + 200 * scale); context.lineTo(x + 35, 470); context.stroke();
      context.fillStyle = colors[(i + 2) % colors.length]; context.fillRect(x + 32, y + 150, 42, 52);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.MeshStandardNodeMaterial({ map: texture, roughness: 0.86 });
    for (const side of [-1, 1]) {
      const x = cx + ux * side * 61 + nx * 0.7, z = cz + uz * side * 61 + nz * 0.7;
      const geometry = new THREE.PlaneGeometry(64, 9.3).toNonIndexed(); geometry.rotateY(yaw).translate(x, base + 8.3, z); draw.emit(group, geometry, banner);
      label(group, 'АШАН', x - nx * 0.7, base + 16.3, z - nz * 0.7, 25, 4.2, yaw);
    }
    const poly = NYC.toPoints(b.ring), bounds = NYC.boundsOf(poly);
    for (let x = bounds.minX + 22; x < bounds.maxX - 12; x += 28) for (let z = bounds.minZ + 18; z < bounds.maxZ - 15; z += 35) {
      if (!NYC.pointInPoly(poly, x, z) || Math.hypot(x - cx, z - cz) < 25) continue;
      box(group, x, base + bodyHeight + 0.7, z, 3.2, 1.4, 2.4, frame);
      box(group, x + 4, base + bodyHeight + 0.35, z, 1.8, 0.7, 1.6, glass);
    }
  }

  function wornBrickMaterial() {
    if (oldBrick) return oldBrick;
    const { Fn, uv, vec2, floor, fract, sin, dot, mix, smoothstep, float, max, fwidth, color } = TSL;
    function hashValue([p]) { return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)); }
    const hash = Fn(hashValue);
    function noiseValue([p]) {
      const i = floor(p), f = fract(p), u = f.mul(f).mul(float(3).sub(f.mul(2)));
      return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
    }
    const noise = Fn(noiseValue), p = uv(), row = floor(p.y.div(0.095));
    const grid = vec2(p.x.div(0.255).add(fract(row.mul(0.5))), p.y.div(0.095));
    const cell = fract(grid), aa = fwidth(grid).min(vec2(0.2)).max(vec2(0.001));
    const mortar = max(float(1).sub(smoothstep(float(0.035).sub(aa.x), float(0.035).add(aa.x), cell.x)),
      float(1).sub(smoothstep(float(0.075).sub(aa.y), float(0.075).add(aa.y), cell.y)));
    const brick = mix(color(0x78402e), color(0xb9724b), hash(floor(grid)));
    const flakes = noise(p.mul(vec2(0.65, 0.42))).mul(0.63).add(noise(p.mul(3.7)).mul(0.27)).add(noise(p.mul(12)).mul(0.1));
    const plaster = smoothstep(0.52, 0.68, flakes);
    const lime = mix(color(0xa89d83), color(0xd3c4a7), noise(p.mul(5.2)));
    const stain = noise(p.mul(vec2(2.7, 0.16))).mul(0.17);
    oldBrick = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    oldBrick.colorNode = mix(mix(brick, color(0xb6a58b), mortar.mul(0.72)), lime, plaster).mul(float(1).sub(stain));
    oldBrick.userData.observedFacade = true;
    return oldBrick;
  }

  function archShape(width, height) {
    const shape = new THREE.Shape(), r = width / 2;
    shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, height - r);
    shape.absarc(0, height - r, r, 0, Math.PI, false); shape.closePath();
    return shape;
  }

  function arch(group, x, y, z, width, height, yaw, material, thickness = 0, depth = 0.16) {
    const shape = archShape(width + thickness * 2, height + thickness * 2);
    if (thickness) shape.holes.push(new THREE.Path(archShape(width, height).getPoints(24).map((p) => new THREE.Vector2(p.x, p.y + thickness))));
    const geometry = thickness ? new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }) : new THREE.ShapeGeometry(shape, 24);
    geometry.rotateY(yaw).translate(x, y - thickness, z);
    draw.emit(group, geometry.index ? geometry.toNonIndexed() : geometry, material);
  }

  function wire(group, start, end, y, material) {
    const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz), points = [];
    for (let i = 0; i <= Math.ceil(length * 9); i++) {
      const distance = length * i / Math.ceil(length * 9), angle = distance / 1.05 * Math.PI * 2;
      points.push(new THREE.Vector3(start.x + dx * distance / length + dz / length * Math.cos(angle) * 0.34,
        y + 0.4 + Math.sin(angle) * 0.34, start.z + dz * distance / length - dx / length * Math.cos(angle) * 0.34));
    }
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length, 0.018, 3, false);
    draw.emit(group, geometry.toNonIndexed(), material);
  }

  function makarChurch(group, b, base) {
    const wall = wornBrickMaterial(), brick = plainMaterial(0xa75c3d), pale = plainMaterial(0xb6a58c), dark = plainMaterial(0x232c2a, 0.2);
    const cream = plainMaterial(0xc7b89e), roof = plainMaterial(0x5c4740, 0.15), iron = plainMaterial(0x424949, 0.35);
    const ax = b.ring[0], az = b.ring[1], length = Math.hypot(b.ring[2] - ax, b.ring[3] - az);
    const ux = (b.ring[2] - ax) / length, uz = (b.ring[3] - az) / length, vx = -uz, vz = ux, yaw = -Math.atan2(uz, ux);
    function point(u, v) { return { x: ax + u * ux + v * vx, z: az + u * uz + v * vz }; }
    function block(u, y, v, w, h, d, material) {
      const p = point(u, v); box(group, p.x, base + y, p.z, w, h, d, material, yaw);
    }
    function frameWindow(u, v, y, w, h, direction, paired = false) {
      const p = point(u, v), angle = yaw + (direction < 0 ? Math.PI : 0), nx = vx * direction, nz = vz * direction;
      const deep = 0.22;
      arch(group, p.x + nx * 0.04, base + y, p.z + nz * 0.04, w, h, angle, dark);
      for (const [t, material, offset] of [[0.14, cream, 0.08], [0.32, brick, 0.18], [0.48, pale, 0.1]]) {
        arch(group, p.x + nx * offset, base + y, p.z + nz * offset, w + (t > 0.2 ? 0.14 : 0), h, angle, material, t, deep);
      }
      for (let i = 0; i < 18; i++) {
        const angleOnArch = (i + 0.5) / 18 * Math.PI, radius = w / 2 + 0.37;
        const voussoir = new THREE.BoxGeometry(Math.PI * radius / 19, 0.22, 0.22).toNonIndexed();
        voussoir.rotateZ(angleOnArch - Math.PI / 2).translate(Math.cos(angleOnArch) * radius, h - w / 2 + Math.sin(angleOnArch) * radius, 0);
        voussoir.rotateY(angle).translate(p.x + nx * 0.39, base + y, p.z + nz * 0.39);
        draw.emit(group, voussoir, i % 4 === 0 ? cream : brick);
      }
      for (const side of [-1, 1]) {
        const c = point(u + side * (w / 2 + 0.5), v + direction * 0.34);
        solid(group, new THREE.CylinderGeometry(0.2, 0.25, h - 1.1, 10), wall, c.x, base + y + (h - 1.1) / 2, c.z);
        for (const yy of [y + 0.12, y + 0.38, y + h - 1.25, y + h - 1.05]) block(u + side * (w / 2 + 0.5), yy, v + direction * 0.34, 0.66, 0.18, 0.62, cream);
      }
      if (!paired) {
        block(u, y + 0.65, v + direction * 0.08, w - 0.1, 1.3, 0.1, brick);
        for (let s = -w / 2 + 0.18; s < w / 2; s += 0.28) block(u + s, y + h * 0.48, v + direction * 0.12, 0.045, h * 0.7, 0.04, iron);
        for (let yy = y + 1.7; yy < y + h - 0.8; yy += 0.78) block(u, yy, v + direction * 0.14, w, 0.045, 0.04, iron);
      }
      block(u, y - 0.17, v + direction * 0.38, w + 1.1, 0.23, 0.8, pale);
    }
    const body = [point(0, 0), point(38, 0), point(38, 20.4), point(0, 20.4)].flatMap((p) => [p.x, p.z]);
    volume(group, b.ring, base, 0.7, pale, wall);
    volume(group, body, base, 17.8, roof, wall);
    draw.pitchedRoof(group, { ring: body, holes: [], h: 20, minHeight: 0, roofShape: 'hipped' }, base, 2.2, roof);
    for (const side of [-1, 1]) {
      const v = side < 0 ? 0 : 20.4;
      for (const [y, h, inset] of [[0.6, 0.3, 0.16], [1.1, 0.18, 0.22], [2.7, 0.18, 0.12], [15.6, 0.18, 0.26], [16.1, 0.15, 0.18], [17.1, 0.22, 0.32], [17.65, 0.28, 0.4]]) {
        block(19, y, v + side * inset, 38.7, h, 0.4 + inset, y > 16 ? pale : brick);
      }
      for (let u = 0.5; u < 38; u += 0.62) {
        block(u, 16.6, v + side * 0.27, 0.25, 0.5, 0.25, brick);
        block(u, 17.35, v + side * 0.35, 0.35, 0.15, 0.36, cream);
      }
      for (const u of [1.05, 10, 26.7, 36.95]) {
        block(u, 8.4, v + side * 0.27, 2.35, 16.8, 0.55, wall);
        for (const yy of [2.1, 5.5, 8.9, 12.3]) {
          block(u, yy, v + side * 0.58, 1.4, 1.45, 0.15, pale);
          block(u, yy, v + side * 0.68, 0.95, 0.98, 0.1, wall);
          block(u, yy - 0.65, v + side * 0.7, 1.65, 0.15, 0.3, cream);
        }
        for (const yy of [14.5, 15.0, 15.5]) block(u, yy, v + side * 0.38, 2.55, 0.2, 0.8, pale);
      }
      for (const u of [5.5, 15.4, 18.6, 21.8, 32.9]) frameWindow(u, v + side * 0.02, 3.6, u === 5.5 || u === 32.9 ? 2.6 : 2.15, 7.9, side);
      for (const u of [4.7, 6.4, 15.4, 18.6, 21.8, 32.05, 33.75]) frameWindow(u, v + side * 0.03, 12.6, 1.3, 2.3, side, true);
      for (const u of [5.5, 18.6, 32.9]) {
        const p = point(u, v + side * 0.31), triangle = new THREE.Shape();
        triangle.moveTo(-1.3, 0); triangle.lineTo(0, 1.05); triangle.lineTo(1.3, 0); triangle.lineTo(0.8, 0); triangle.lineTo(0, 0.62); triangle.lineTo(-0.8, 0); triangle.closePath();
        const geometry = new THREE.ExtrudeGeometry(triangle, { depth: 0.24, bevelEnabled: false });
        geometry.rotateY(yaw + (side < 0 ? Math.PI : 0)).translate(p.x, base + 15.2, p.z); draw.emit(group, geometry, brick);
      }
      for (const u of [10, 26.7]) {
        const p = point(u - 1.5, v + side * 0.6);
        solid(group, new THREE.CylinderGeometry(0.1, 0.1, 17.7, 8), iron, p.x, base + 8.9, p.z);
      }
      wire(group, point(0, v), point(38, v), base + 17.85, iron);
    }
    for (const u of [0, 38]) {
      for (const yy of [0.6, 15.6, 16.1, 17.1, 17.65]) block(u, yy, 10.2, 0.6, 0.22, 21.1, pale);
      for (let v = 0.5; v < 20.4; v += 0.65) block(u, 16.6, v, 0.65, 0.5, 0.27, brick);
      wire(group, point(u, 0), point(u, 20.4), base + 17.85, iron);
    }
    const west = point(-0.1, 10.2);
    arch(group, west.x - ux * 0.05, base + 2.5, west.z - uz * 0.05, 9.4, 11.8, yaw - Math.PI / 2, pale);
    arch(group, west.x - ux * 0.1, base + 2.5, west.z - uz * 0.1, 9.4, 11.8, yaw - Math.PI / 2, brick, 0.45, 0.25);
    for (const [u, v, radius, h] of [[37.7, 3.6, 5.0, 13.3], [41.5, 11.9, 6.2, 14], [37.7, 20.5, 5.4, 13.3]]) {
      const p = point(u, v), ring = ellipse(p.x, p.z, radius, radius);
      volume(group, ring, base, h, roof, wall);
      for (const [yy, r, hh] of [[0.5, 0.1, 0.25], [2.7, 0.12, 0.14], [h - 1.15, 0.2, 0.17], [h - 0.6, 0.3, 0.2], [h - 0.15, 0.38, 0.24]]) {
        solid(group, new THREE.CylinderGeometry(radius + r, radius + r, hh, 64), yy > h - 1 ? pale : brick, p.x, base + yy, p.z);
      }
      for (const angle of [-0.96, 0, 0.96]) {
        const nu = Math.cos(angle), nv = Math.sin(angle), nwx = ux * nu + vx * nv, nwz = uz * nu + vz * nv;
        const w = point(u + nu * radius, v + nv * radius), rotation = Math.atan2(nwx, nwz);
        arch(group, w.x + nwx * 0.04, base + 3.5, w.z + nwz * 0.04, 1.6, 6.8, rotation, dark);
        for (const [t, material] of [[0.16, cream], [0.34, brick]]) arch(group, w.x + nwx * 0.1, base + 3.5, w.z + nwz * 0.1, 1.6, 6.8, rotation, material, t, 0.18);
        for (const side of [-1, 1]) {
          const x = w.x + Math.cos(rotation) * side * 1.1, z = w.z - Math.sin(rotation) * side * 1.1;
          solid(group, new THREE.CylinderGeometry(0.2, 0.25, 6.5, 10), wall, x, base + 6.6, z);
          box(group, x, base + 10.0, z, 0.7, 0.35, 0.65, pale, rotation);
        }
        for (let s = -0.6; s <= 0.6; s += 0.25) box(group, w.x + Math.cos(rotation) * s + nwx * 0.16, base + 6.8, w.z - Math.sin(rotation) * s + nwz * 0.16, 0.045, 5, 0.045, iron, rotation);
      }
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * Math.PI * 2;
        box(group, p.x + Math.cos(a) * (radius + 0.12), base + h - 0.9, p.z + Math.sin(a) * (radius + 0.12), 0.24, 0.45, 0.22, brick, -a);
      }
    }
    for (const u of [4.8, 18.8, 33.6]) {
      block(u, 20.3, 18.8, 0.95, 3.2, 1.05, brick);
      block(u, 21.98, 18.8, 1.15, 0.18, 1.25, pale);
      block(u, 19.3, 18.8, 1.08, 0.13, 1.15, cream);
    }
    const { positionWorld, sin, abs, mix, color, float, smoothstep } = TSL;
    const concrete = new THREE.MeshStandardNodeMaterial({ roughness: 0.96 }), seam = plainMaterial(0x85877f);
    const streak = abs(sin(positionWorld.x.mul(11.8).add(positionWorld.z.mul(9.1)))).mul(abs(sin(positionWorld.y.mul(0.32).add(positionWorld.x))));
    const damp = float(1).sub(smoothstep(base + 0.1, base + 1.3, positionWorld.y));
    concrete.colorNode = mix(color(0xbab8aa), color(0x757865), streak.mul(0.2).add(damp.mul(0.25)));
    for (let u = -2; u < 53; u += 2.75) {
      const p = point(u + 1.375, 31.2), ground = NYC.terrainHeight(p.x, p.z);
      box(group, p.x, ground + 2.2, p.z, 2.7, 4.4, 0.25, concrete, yaw);
      box(group, p.x, ground + 2.2, p.z + 0.14, 2.5, 0.11, 0.04, seam, yaw);
      for (let s = 0.4; s < 2.7; s += 0.45) {
        const rib = point(u + s, 31.36);
        box(group, rib.x, ground + 2.2, rib.z, 0.075, 4.2, 0.08, pale, yaw);
      }
      const post = point(u, 31.2);
      box(group, post.x, ground + 2.25, post.z, 0.22, 4.5, 0.45, pale, yaw);
    }
    wire(group, point(-2, 31.2), point(53, 31.2), NYC.terrainHeight(point(25, 31.2).x, point(25, 31.2).z) + 4.5, iron);
  }

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
    const name = { 'tatneft-arena': 'tatneft', 'makary-church': 'makary', 'parkhouse-mall': 'parkhouse', 'bahetle-mall': 'bahetle',
      'musina-rows': 'musina-rows', 'kishmish-cafe': 'kishmish', 'musina-parking': 'musina-parking', 'tandem-mall': 'tandem', 'lemana-store': 'lemana', 'uram-centre': 'uram' }[b.model];
    if (!name) return false;
    const group = new THREE.Group(); group.name = `KazanLandmark/${name}`;
    group.userData.source = b.heightEvidence;
    if (b.model === 'tatneft-arena') tatneftArena(group, b, base, bounds);
    else if (b.model === 'makary-church') makarChurch(group, b, base);
    else if (b.model === 'parkhouse-mall') parkHouse(group, b, base);
    else if (b.model === 'bahetle-mall') bahetleMall(group, b, base, bounds);
    else if (b.model === 'musina-rows') musinaRows(group, b, base, bounds);
    else if (b.model === 'kishmish-cafe') kishmishCafe(group, b, base, bounds);
    else if (b.model === 'musina-parking') musinaParking(group, b, base, bounds);
    else if (b.model === 'lemana-store') lemanaStore(group, b, base, bounds);
    else if (b.model === 'uram-centre') uramCentre(group, b, base, bounds);
    else tandemMall(group, b, base, bounds);
    flush(group); parent.add(group);
    return true;
  }

  function buildAttractions(parent) {
    for (const site of NYC.GEO.attractions || []) {
      if (site.kind !== 'big_wheel') continue;
      const group = new THREE.Group(); group.name = `KazanLandmark/${site.landmarkId}-wheel`;
      const ground = NYC.terrainHeight(site.x, site.z), radius = site.h * 30 / 65, hub = site.h * 34.5 / 65;
      const white = plainMaterial(0xd5dad8, 0.2), black = plainMaterial(0x29353c, 0.3), glass = plainMaterial(0x467784, 0.55);
      const led = new THREE.MeshStandardNodeMaterial({ color: 0xd5dad8, metalness: 0.2, roughness: 0.5 });
      led.emissiveNode = TSL.color(0x456aff).mul(TSL.smoothstep(0.35, 1, NYC.cityUniforms.uInteriorGlow)).mul(0.7);
      const cs = Math.cos(site.yaw), sn = Math.sin(site.yaw);
      function point(x, y, z) { return new THREE.Vector3(site.x + x * cs + z * sn, ground + y, site.z - x * sn + z * cs); }
      function beam(a, b, r, material) {
        const start = point(...a), end = point(...b), delta = end.clone().sub(start), geometry = new THREE.CylinderGeometry(r, r, delta.length(), 6);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
        solid(group, geometry, material, (start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
      }
      for (const side of [-1, 1]) {
        const ring = new THREE.TorusGeometry(radius, 0.19, 6, 144);
        ring.rotateY(site.yaw); solid(group, ring, led, site.x + Math.sin(site.yaw) * side * 1.4, ground + hub, site.z + Math.cos(site.yaw) * side * 1.4);
        for (const foot of [-1, 1]) {
          beam([foot * 13, 0.7, side * 6], [0, hub, side * 2], 0.55, white);
          const p = point(foot * 13, 0.35, side * 6); box(group, p.x, p.y, p.z, 4.5, 0.7, 4, plainMaterial(0x9ca29b), site.yaw);
        }
      }
      beam([0, hub, -4], [0, hub, 4], 0.8, black);
      const bands = [0x335d98, 0xa4463c, 0xd9b955, 0x367356, 0x657caa, 0xc68757];
      for (let i = 0; i < site.cabins; i++) {
        const angle = i / site.cabins * Math.PI * 2, x = Math.cos(angle) * radius, y = hub + Math.sin(angle) * radius;
        const next = (i + 1) / site.cabins * Math.PI * 2, nx = Math.cos(next) * radius, ny = hub + Math.sin(next) * radius;
        for (const side of [-1, 1]) {
          beam([0, hub, side * 0.7], [x, y, side * 1.4], 0.065, led);
          beam([x, y, side * 1.4], [nx, ny, -side * 1.4], 0.07, white);
        }
        const cabin = point(x, y - 1.65, 0), trim = plainMaterial(bands[i % bands.length]);
        box(group, cabin.x, cabin.y, cabin.z, 2.4, 2.8, 2.05, black, site.yaw);
        box(group, cabin.x, cabin.y + 0.15, cabin.z, 2.24, 2.05, 2.14, glass, site.yaw);
        box(group, cabin.x, cabin.y - 1.13, cabin.z, 2.43, 0.48, 2.16, trim, site.yaw);
        box(group, cabin.x, cabin.y + 1.26, cabin.z, 2.43, 0.28, 2.16, trim, site.yaw);
        for (const side of [-1, 1]) for (const front of [-1, 1]) {
          const p = point(x + side * 1.1, y - 1.6, front * 1.1); box(group, p.x, p.y, p.z, 0.11, 2.6, 0.11, black, site.yaw);
        }
      }
      const platform = point(0, 0.35, 0); box(group, platform.x, platform.y, platform.z, 22, 0.7, 12, white, site.yaw);
      flush(group); parent.add(group);
    }
  }
  return { emitBuilding: emitReviewedBuilding, buildAttractions, label };
}

NYC = { ...NYC, createKazanLandmarkModels };
})();
