(function () {
const { THREE, TSL } = NYC;

/** Geometry reviewed against completed-building photographs, on the mapped footprint. */
function createKazanLandmarkModels(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, flush } = draw;
  let arenaSign = null;
  let oldBrick = null;

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
    if (b.model !== 'tatneft-arena' && b.model !== 'makary-church') return false;
    const group = new THREE.Group(); group.name = `KazanLandmark/${b.model === 'tatneft-arena' ? 'tatneft' : 'makary'}`;
    group.userData.source = b.heightEvidence;
    if (b.model === 'tatneft-arena') tatneftArena(group, b, base, bounds);
    else makarChurch(group, b, base);
    flush(group); parent.add(group);
    return true;
  }
  return emitReviewedBuilding;
}

NYC = { ...NYC, createKazanLandmarkModels };
})();
