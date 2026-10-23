(function () {
const { THREE, toPoints, boundsOf, pointInPoly } = NYC;

/** Gate openings and their masonry share compiled arch bands with the collision system. */
function createKazanGates(draw) {
  const { plainMaterial, box, solid, shapeOf, splitExtrusion, polygon, emit, buildingCollider } = draw;
  const white = plainMaterial(0xe6e6da), trim = plainMaterial(0xd2d7cf), dark = plainMaterial(0x384844);
  const green = plainMaterial(0x376b61, 0.25), gold = plainMaterial(0xb6a05d, 0.6), bronze = plainMaterial(0x79725a, 0.65);
  let clockMaterial = null;

  function boundaries(ring) {
    const p = toPoints(ring), centre = p.reduce((c, v) => ({ x: c.x + v.x / p.length, z: c.z + v.z / p.length }), { x: 0, z: 0 });
    return p.map((a, i) => {
      const b = p[(i + 1) % p.length], length = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
      let nx = -uz, nz = ux;
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      if ((x - centre.x) * nx + (z - centre.z) * nz < 0) { nx = -nx; nz = -nz; }
      return { x, z, length, ux, uz, nx, nz, yaw: -Math.atan2(uz, ux), faceYaw: Math.atan2(nx, nz) };
    });
  }

  function band(group, f, y, h, width = f.length, projection = 0.2, material = white) {
    box(group, f.x + f.nx * projection / 2, y, f.z + f.nz * projection / 2, width, h, projection, material, f.yaw);
  }

  function volume(group, v, base, material = white, cap = material, openTop = false) {
    const geometry = new THREE.ExtrudeGeometry(shapeOf(v.ring, v.holes), { depth: v.h - v.minHeight, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2).translate(0, base + v.minHeight, 0);
    splitExtrusion(group, geometry, cap, material, base, openTop);
  }

  function clockFace() {
    if (clockMaterial) return clockMaterial;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.translate(256, 256);
    ctx.fillStyle = '#839895'; ctx.beginPath(); ctx.arc(0, 0, 250, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0e3d8'; ctx.beginPath(); ctx.arc(0, 0, 193, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9ddd3'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 246, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '36px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6; ctx.fillText(numerals[i], Math.sin(a) * 218, -Math.cos(a) * 218);
    }
    for (const [angle, length, width] of [[-Math.PI / 3, 112, 10], [Math.PI * 0.27, 165, 7]]) {
      ctx.strokeStyle = '#536b67'; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(-Math.sin(angle) * 25, Math.cos(angle) * 25);
      ctx.lineTo(Math.sin(angle) * length, -Math.cos(angle) * length); ctx.stroke();
    }
    ctx.fillStyle = '#6e8178'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    clockMaterial = new THREE.MeshStandardNodeMaterial({ map: texture, roughness: 0.8 });
    return clockMaterial;
  }

  function slit(group, f, base, u, y, width, height) {
    const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height - width / 2); shape.absarc(0, height - width / 2, width / 2, 0, Math.PI, false); shape.closePath();
    const g = new THREE.ShapeGeometry(shape).toNonIndexed(); g.rotateY(f.faceYaw);
    g.translate(f.x + f.ux * u + f.nx * 0.08, base + y, f.z + f.uz * u + f.nz * 0.08); emit(group, g, dark);
  }

  function spasskaya(group, b, base) {
    const faces = boundaries(b.ring), bounds = boundsOf(toPoints(b.ring));
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    if (b.model === 'spasskaya-base') {
      for (const v of b.openingVolumes || [b]) volume(group, v, base, white, white, v.h < b.h);
      polygon(b.ring, base + b.h + 0.015, green, group, b.holes);
      for (const f of faces.filter((f) => f.length > 7)) {
        band(group, f, base + 6.8, 0.27, f.length + 0.3, 0.4);
        for (let u = -f.length / 2 + 1.3; u < f.length / 2 - 0.8; u += 3.7) {
          const x = f.x + f.ux * u - f.nx * 0.05, z = f.z + f.uz * u - f.nz * 0.05;
          if (b.openingVolumes && !b.openingVolumes.some((v) => v.minHeight < 5 && v.h >= 5 && pointInPoly(toPoints(v.ring), x, z))) continue;
          if (f.x < 0) for (const y of [1.1, 4.1]) slit(group, f, base, u, y, 1.05, 1.8);
          else slit(group, f, base, u, 4.5, 0.48, 1.3);
        }
      }
      if (b.roofSection) draw.pitchedRoof(group, { ring: b.roofSection.ring, holes: [], h: b.h + b.roofSection.height,
        roofShape: 'gabled' }, base, b.roofSection.height, green);
      return;
    }
    if (b.model === 'spasskaya-belfry') {
      const floor = { ...b, minHeight: 23, h: 23.8 }; volume(group, floor, base);
      for (const f of faces) {
        const w = f.length + 0.15, h = 7.2, opening = w * 0.57, spring = 4.5;
        const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
        const hole = new THREE.Path(); hole.moveTo(-opening / 2, 0.55); hole.lineTo(opening / 2, 0.55); hole.lineTo(opening / 2, spring);
        hole.absarc(0, spring, opening / 2, 0, Math.PI, false); hole.closePath(); shape.holes.push(hole);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }); geometry.translate(0, 0, -0.25); geometry.rotateY(f.faceYaw);
        solid(group, geometry, white, f.x, base + 23.7, f.z);
        for (const y of [24, 30.3, 30.8, 31.2]) band(group, f, base + y, 0.22, f.length + 0.4, 0.45);
        box(group, f.x, base + 31.5, f.z, 0.23, 1.05, 0.23, white, f.yaw);
      }
      const bell = new THREE.LatheGeometry([[0.65,0],[0.9,0.1],[0.85,0.3],[0.55,0.55],[0.4,1.1],[0.2,1.45],[0,1.5]].map(([r,y]) => new THREE.Vector2(r,y)), 24);
      solid(group, bell, bronze, cx, base + 26, cz); box(group, cx, base + 29.3, cz, 0.12, 3.5, 0.12, dark);
      const cone = new THREE.ConeGeometry(4.05, 13.4, 8); cone.rotateY(Math.PI / 8);
      solid(group, cone, white, cx, base + 37.9, cz);
      box(group, cx, base + 45, cz, 0.16, 1.1, 0.16, gold);
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1.05, x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i) star.lineTo(x, y); else star.moveTo(x, y);
      }
      star.closePath();
      for (const yaw of [0, Math.PI / 2]) {
        const geometry = new THREE.ExtrudeGeometry(star, { depth: 0.13, bevelEnabled: false }); geometry.rotateY(yaw);
        solid(group, geometry, gold, cx, base + 45.5, cz);
      }
      return;
    }
    volume(group, b, base);
    for (const f of faces) {
      for (const y of [b.minHeight + 0.2, b.h - 0.1]) {
        band(group, f, base + y, 0.3, f.length + 0.4, 0.45);
        for (let u = -f.length / 2 + 0.5; u < f.length / 2; u += 0.7) {
          box(group, f.x + f.ux * u + f.nx * 0.3, base + y - 0.4, f.z + f.uz * u + f.nz * 0.3, 0.22, 0.5, 0.22, white, f.yaw);
        }
      }
      if (b.model === 'spasskaya-square') for (const u of [-f.length * 0.3, f.length * 0.3]) slit(group, f, base, u, 9.5, 0.4, 1.2);
    }
    if (b.model === 'spasskaya-clock') {
      const front = faces.reduce((best, f, i) => f.nz > faces[best].nz ? i : best, 0);
      const east = faces.reduce((best, f, i) => f.nx > faces[best].nx ? i : best, 0);
      for (const i of [front, (front + faces.length / 2) % faces.length, east]) {
        const f = faces[i], radius = Math.min(2.25, f.length * 0.45);
        const g = new THREE.CircleGeometry(radius, 64).toNonIndexed(); g.rotateY(f.faceYaw);
        g.translate(f.x + f.nx * 0.08, base + 18.2, f.z + f.nz * 0.08); emit(group, g, clockFace());
      }
    }
  }

  function emitBuilding(group, b, base, bounds) {
    if (b.model?.startsWith('spasskaya-')) { spasskaya(group, b, base); return true; }
    if (b.fortification) {
      const wallHeight = b.fortification === 'tower' ? b.h - Math.min(6, b.h * 0.3) : b.h;
      for (const v of b.openingVolumes || [b]) if (v.minHeight < wallHeight) {
        const top = Math.min(v.h, wallHeight);
        volume(group, { ...v, h: top }, base, white, white, top < wallHeight);
      }
      const faces = boundaries(b.ring);
      for (const f of faces) {
        band(group, f, base + wallHeight - 0.25, 0.35, f.length + 0.25, 0.45);
        if (b.fortification === 'wall' && f.length > 3) for (let u = -f.length / 2 + 1; u < f.length / 2; u += 3) {
          box(group, f.x + f.ux * u, base + wallHeight + 0.4, f.z + f.uz * u, 1.1, 0.8, 0.9, white, f.yaw);
        }
        if (b.fortification === 'tower' && f.length > 2) for (const y of [wallHeight * 0.38, wallHeight * 0.72]) slit(group, f, base, 0, y, 0.3, 1.05);
      }
      if (b.fortification === 'tower') draw.buildingRoof(group, b, base, bounds, b.h - wallHeight, green);
      return true;
    }
    if (!b.openingVolumes || b.model) return false;
    const cap = draw.roofMaterial(b), facade = draw.facadeMaterial(b);
    const curved = /dome|onion|round|pyramidal|hipped|gabled/.test(b.roofShape);
    const roofHeight = curved ? Math.min(b.h - b.minHeight, b.roofHeight || Math.min(6, (b.h - b.minHeight) * 0.3)) : 0;
    for (const v of b.openingVolumes) {
      const top = Math.min(v.h, b.h - roofHeight);
      if (top > v.minHeight) volume(group, { ...v, h: top }, base, facade, v.h === b.h ? cap : facade, top < b.h - roofHeight);
    }
    draw.buildingRoof(group, b, base, bounds, roofHeight, cap);
    return true;
  }

  function emitWall(group, wall, key, low, top, colliders) {
    const volumes = wall.openings?.[key];
    if (!volumes) return false;
    for (const v of volumes) {
      const body = { ...v, h: v.h === 8 ? top - low : v.h };
      volume(group, body, low, white, white, body.h < top - low); colliders.push(buildingCollider(body, low));
    }
    return true;
  }

  return { emitBuilding, emitWall };
}

NYC = { ...NYC, createKazanGates };
})();
