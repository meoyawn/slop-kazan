import * as THREE from 'three/webgpu';
import { GEO, runtime } from './kazan-runtime.js';
import { terrainHeight, toPoints, boundsOf, pointInPoly, groundMeshHeight, groundSurfaceHeight, surfaceHeight, projectGroundPolygon, nearestRoads } from './kazan-config.js';

/** Activity outlines choose repeatable courts, bowls and pump tracks; internal obstacle layouts remain estimates. */
function createKazanRecreation(draw) {
  const { plainMaterial, box, solid, polygon, emit, flush } = draw;
  const concrete = plainMaterial(0xb5b7ad), asphalt = plainMaterial(0x414b4d), turf = plainMaterial(0x718452);
  const orange = plainMaterial(0xbd805a), blue = plainMaterial(0x6a8098), white = plainMaterial(0xd9d9ca);
  const black = plainMaterial(0x35403f), red = plainMaterial(0xa65b40);
  const schoolFence = plainMaterial(0x536b62), schoolHedge = plainMaterial(0x526b39);
  const entranceGlass = plainMaterial(0x405b65, 0.2);

  function frame(site) {
    const poly = toPoints(site.ring), bounds = boundsOf(poly), cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    let longest = 0, ux = 1, uz = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length > longest) { longest = length; ux = (b.x - a.x) / length; uz = (b.z - a.z) / length; }
    }
    const local = poly.map((p) => ({ x: (p.x - cx) * ux + (p.z - cz) * uz, z: -(p.x - cx) * uz + (p.z - cz) * ux }));
    const b = boundsOf(local), u = (b.minX + b.maxX) / 2, v = (b.minZ + b.maxZ) / 2;
    return { poly, cx: cx + ux * u - uz * v, cz: cz + uz * u + ux * v, ux, uz,
      w: b.maxX - b.minX, d: b.maxZ - b.minZ, yaw: -Math.atan2(uz, ux),
      y: Math.max(0.22, ...poly.map((p) => NYC.groundMeshHeight(p.x, p.z) + 0.14)) };
  }

  function point(f, u, v, y = f.y) {
    const x = f.cx + u * f.ux - v * f.uz, z = f.cz + u * f.uz + v * f.ux;
    return { x, y, z };
  }

  function rect(group, f, u, v, w, d, y, material) {
    const p = point(f, u, v, y);
    box(group, p.x, p.y, p.z, w, 0.04, d, material, f.yaw);
  }

  function outline(group, f, u, v, w, d, y, material) {
    for (const side of [-1, 1]) {
      rect(group, f, u, v + side * d / 2, w, 0.08, y, material);
      rect(group, f, u + side * w / 2, v, 0.08, d, y, material);
    }
  }

  function circle(group, f, u, v, radius, y, material) {
    for (let i = 0; i < 48; i++) {
      const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
      const p = point(f, u + Math.cos(a) * radius, v + Math.sin(a) * radius, y);
      const q = point(f, u + Math.cos(b) * radius, v + Math.sin(b) * radius, y);
      box(group, (p.x + q.x) / 2, y, (p.z + q.z) / 2, Math.hypot(q.x - p.x, q.z - p.z) + 0.02, 0.04, 0.07, material, -Math.atan2(q.z - p.z, q.x - p.x));
    }
  }

  function court(group, site, f) {
    const basket = site.kind === 'basketball', sand = site.kind === 'sand-court';
    polygon(site.ring, f.y - 0.05, sand ? plainMaterial(0xc4b48d) : basket ? orange : plainMaterial(0x547c61), group);
    const w = f.w - 4, d = f.d - 3;
    if (basket) rect(group, f, 0, 0, w, d, f.y, blue);
    outline(group, f, 0, 0, w, d, f.y + 0.05, white);
    rect(group, f, 0, 0, 0.08, d, f.y + 0.05, white);
    if (!sand) circle(group, f, 0, 0, Math.min(d * 0.2, basket ? 1.8 : 3), f.y + 0.05, white);
    if (basket) for (const side of [-1, 1]) {
      outline(group, f, side * (w / 2 - 2.8), 0, 5.6, Math.min(4.9, d * 0.5), f.y + 0.05, white);
      const post = point(f, side * (w / 2 + 0.6), 0), board = point(f, side * (w / 2 - 1.1), 0);
      box(group, post.x, f.y + 1.8, post.z, 0.16, 3.6, 0.16, black);
      rect(group, f, side * (w / 2 - 0.2), 0, 1.7, 0.12, f.y + 3.7, black);
      box(group, board.x, f.y + 3.52, board.z, 0.12, 1.05, 1.8, white, f.yaw);
      const hoop = new THREE.TorusGeometry(0.225, 0.035, 5, 16); hoop.rotateX(Math.PI / 2);
      const p = point(f, side * (w / 2 - 1.4), 0, f.y + 3.05); solid(group, hoop, red, p.x, p.y, p.z);
    }
    if (site.kind === 'football') for (const side of [-1, 1]) {
      const goal = point(f, side * w / 2, 0);
      for (const edge of [-1, 1]) {
        const p = point(f, side * w / 2, edge * 1.5);
        box(group, p.x, f.y + 1, p.z, 0.09, 2, 0.09, white);
      }
      box(group, goal.x, f.y + 2, goal.z, 0.09, 0.09, 3.1, white, f.yaw);
    }
  }

  function flowSurface(group, site, f) {
    const pump = site.kind === 'pump-track', scale = Math.min(f.w, f.d), bowls = pump ? [
      [-f.w * 0.23, -f.d * 0.12, f.w * 0.27, f.d * 0.3],
      [f.w * 0.22, f.d * 0.17, f.w * 0.27, f.d * 0.3],
      [f.w * 0.04, -f.d * 0.22, f.w * 0.2, f.d * 0.25]] : [
      [-f.w * 0.28, -f.d * 0.22, f.w * 0.18, f.d * 0.15],
      [f.w * 0.1, -f.d * 0.26, f.w * 0.2, f.d * 0.14],
      [f.w * 0.32, -f.d * 0.02, f.w * 0.12, f.d * 0.18],
      [-f.w * 0.29, f.d * 0.19, f.w * 0.19, f.d * 0.17],
      [f.w * 0.04, f.d * 0.08, f.w * 0.2, f.d * 0.2],
      [f.w * 0.2, f.d * 0.31, f.w * 0.16, f.d * 0.12]];
    polygon(site.ring, f.y - 0.06, pump ? turf : concrete, group);
    function sample(u, v) {
      let distance = Infinity, inside = Infinity;
      for (const [cu, cv, rx, rz] of bowls) {
        const r = Math.hypot((u - cu) / rx, (v - cv) / rz);
        distance = Math.min(distance, Math.abs(r - 1) * Math.min(rx, rz)); inside = Math.min(inside, r);
      }
      const edge = Math.min(f.w / 2 - Math.abs(u), f.d / 2 - Math.abs(v));
      const fade = Math.max(0, Math.min(1, edge / 4));
      const angle = Math.atan2(v / f.d, u / f.w), onTrack = distance < Math.min(2.6, scale * 0.06);
      const transition = Math.max(0, Math.min(1, (inside - 0.72) / 0.28));
      const height = pump ? onTrack ? 0.48 + 0.36 * Math.sin(angle * 7 + u * 0.1) : Math.min(1.5, distance * 0.2) :
        (1 - Math.cos(transition * Math.PI / 2)) * 2.4;
      const p = point(f, u, v, f.y + height * fade);
      return { ...p, track: onTrack, interior: inside < 0.84 };
    }
    const positions = [[], []], step = NYC.runtime?.lite ? 1.5 : 0.75;
    for (let u = -f.w / 2; u < f.w / 2; u += step) for (let v = -f.d / 2; v < f.d / 2; v += step) {
      const corners = [sample(u, v), sample(Math.min(u + step, f.w / 2), v),
        sample(Math.min(u + step, f.w / 2), Math.min(v + step, f.d / 2)), sample(u, Math.min(v + step, f.d / 2))];
      for (const indices of [[0, 2, 1], [0, 3, 2]]) {
        const tri = indices.map((i) => corners[i]);
        if (tri.some((p) => !pointInPoly(f.poly, p.x, p.z))) continue;
        const centre = sample(u + step / 2, v + step / 2);
        const category = (pump ? centre.track : centre.interior) ? 1 : 0;
        for (const p of tri) positions[category].push(p.x, p.y, p.z);
      }
    }
    for (const [i, vertices] of positions.entries()) {
      if (!vertices.length) continue;
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 ? [] : [vertices[i], vertices[i + 2]]), 2));
      geometry.computeVertexNormals(); emit(group, geometry, pump ? i ? asphalt : turf : i ? plainMaterial(0x929f9f) : concrete);
    }
    if (!pump) for (const [u, v, rx, rz] of bowls) {
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
        const p = sample(u + rx * Math.cos(a), v + rz * Math.sin(a)), q = sample(u + rx * Math.cos(b), v + rz * Math.sin(b));
        if (!pointInPoly(f.poly, p.x, p.z) || !pointInPoly(f.poly, q.x, q.z) || Math.min(p.y, q.y) < f.y + 1.2) continue;
        box(group, (p.x + q.x) / 2, (p.y + q.y) / 2 + 0.04, (p.z + q.z) / 2,
          Math.hypot(q.x - p.x, q.z - p.z) + 0.02, 0.07, 0.09, black, -Math.atan2(q.z - p.z, q.x - p.x));
      }
    }
  }

  function airPark(group, site, f) {
    polygon(site.ring, f.y - 0.05, concrete, group);
    const wood = plainMaterial(0x956b4d);
    for (const side of [-1, 1]) for (const lane of [-1, 0, 1]) {
      const w = f.w * 0.24, depth = f.d * 0.25, centre = lane * f.w * 0.28, vertices = [];
      for (let i = 0; i < 16; i++) {
        const a = i / 16, b = (i + 1) / 16;
        const p = [point(f, centre - w / 2, side * (f.d * 0.14 + a * depth), f.y + (1 - Math.cos(a * Math.PI / 2)) * 3),
          point(f, centre + w / 2, side * (f.d * 0.14 + a * depth), f.y + (1 - Math.cos(a * Math.PI / 2)) * 3),
          point(f, centre + w / 2, side * (f.d * 0.14 + b * depth), f.y + (1 - Math.cos(b * Math.PI / 2)) * 3),
          point(f, centre - w / 2, side * (f.d * 0.14 + b * depth), f.y + (1 - Math.cos(b * Math.PI / 2)) * 3)];
        for (const j of side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) vertices.push(p[j].x, p[j].y, p[j].z);
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 ? [] : [vertices[i], vertices[i + 2]]), 2));
      geometry.computeVertexNormals(); emit(group, geometry, wood);
    }
  }

  function groundPaint(group, ring, offset, material) {
    const poly = toPoints(ring), points = poly.map((p) => new THREE.Vector2(p.x, p.z)), vertices = [];
    function append(face) {
      for (let i = 1; i + 1 < face.length; i++) {
        const a = face[0], b = face[i], c = face[i + 1];
        const order = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0 ? [a, c, b] : [a, b, c];
        for (const p of order) vertices.push(p[0], p[4] + offset, p[1]);
      }
    }
    for (const triangle of THREE.ShapeUtils.triangulateShape(points, [])) {
      projectGroundPolygon(triangle.map((i) => [poly[i].x, poly[i].z, poly[i].x, poly[i].z]), append);
    }
    if (!vertices.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 ? [] : [vertices[i], vertices[i + 2]]), 2));
    geometry.computeVertexNormals(); emit(group, geometry, material);
  }

  function schoolActivity(group, site, f) {
    const football = site.kind === 'football', hockey = site.kind === 'hockey', basket = site.kind === 'basketball';
    const exercise = site.kind === 'exercise', play = site.kind === 'playground', track = site.kind === 'track';
    const w = Math.max(1, f.w - 1.2), d = Math.max(1, f.d - 1.2);
    function groundPoint(u, v, rise = 0) {
      const p = point(f, u, v);
      p.y = groundSurfaceHeight(p.x, p.z) + rise;
      return p;
    }
    function strip(a, b, width = 0.16, material = white) {
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 0.01) return;
      const nx = -dz * width / (length * 2), nz = dx * width / (length * 2);
      const ring = [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]]
        .flatMap(([u, v]) => { const p = point(f, u, v); return [p.x, p.z]; });
      groundPaint(group, ring, 0.11, material);
    }
    function lineRect(u, v, width, depth) {
      for (const side of [-1, 1]) {
        strip([u - width / 2, v + side * depth / 2], [u + width / 2, v + side * depth / 2]);
        strip([u + side * width / 2, v - depth / 2], [u + side * width / 2, v + depth / 2]);
      }
    }
    function roundLine(u, v, radius) {
      for (let i = 0; i < 20; i++) strip([u + Math.cos(i * Math.PI / 10) * radius, v + Math.sin(i * Math.PI / 10) * radius],
        [u + Math.cos((i + 1) * Math.PI / 10) * radius, v + Math.sin((i + 1) * Math.PI / 10) * radius]);
    }
    function pole(u, v, height, material = blue) {
      const p = groundPoint(u, v, height / 2);
      box(group, p.x, p.y, p.z, 0.1, height, 0.1, material);
    }
    function crossbar(u, v, length, height, material = white, across = true) {
      const p = groundPoint(u, v, height);
      box(group, p.x, p.y, p.z, across ? 0.1 : length, 0.1, across ? length : 0.1, material, f.yaw);
    }
    if (!track) groundPaint(group, site.ring, 0.075, football ? turf : hockey ? asphalt : basket ? blue : play || exercise ? orange : asphalt);
    if (exercise || play) {
      for (let i = 0; i < 3; i++) {
        const u = (i - 1) * Math.min(1.8, w / 4), height = 1.5 + i * 0.3, span = Math.min(1.5, d * 0.65);
        for (const side of [-1, 1]) pole(u, side * span / 2, height, blue);
        crossbar(u, 0, span, height, red);
      }
      return;
    }
    if (track) {
      for (let i = 0; i < f.poly.length; i++) {
        const a = f.poly[i], b = f.poly[(i + 1) % f.poly.length], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
        if (!length) continue;
        const nx = -dz * 0.06 / length, nz = dx * 0.06 / length;
        groundPaint(group, [a.x + nx * 18, a.z + nz * 18, b.x + nx * 18, b.z + nz * 18,
          b.x - nx * 18, b.z - nz * 18, a.x - nx * 18, a.z - nz * 18], 0.075, orange);
        groundPaint(group, [a.x + nx, a.z + nz, b.x + nx, b.z + nz, b.x - nx, b.z - nz, a.x - nx, a.z - nz], 0.11, white);
      }
      return;
    }
    lineRect(0, 0, w, d); strip([0, -d / 2], [0, d / 2]);
    roundLine(0, 0, Math.min(basket ? 1.8 : 3.5, d / 5));
    if (football || hockey) for (const side of [-1, 1]) {
      const goalWidth = Math.min(3, d * 0.3), height = hockey ? 1.3 : 2;
      for (const edge of [-1, 1]) pole(side * (w / 2 - 0.1), edge * goalWidth / 2, height, white);
      crossbar(side * (w / 2 - 0.1), 0, goalWidth, height);
      lineRect(side * (w / 2 - Math.min(4, w * 0.12) / 2), 0, Math.min(4, w * 0.12), Math.min(d * 0.55, 10));
    }
    if (basket) for (const side of [-1, 1]) {
      const u = side * (w / 2 - 1.2), p = groundPoint(u, 0, 3.05);
      pole(side * (w / 2 - 0.3), 0, 3.8, black);
      crossbar(side * (w / 2 - 0.75), 0, 0.9, 3.7, black, false);
      box(group, p.x, p.y + 0.48, p.z, 0.1, 1.05, Math.min(1.8, d / 3), white, f.yaw);
      const hoop = new THREE.TorusGeometry(0.225, 0.035, 5, 12); hoop.rotateX(Math.PI / 2);
      const q = groundPoint(u - side * 0.33, 0, 3.05); solid(group, hoop, red, q.x, q.y, q.z);
      lineRect(side * (w / 2 - 2.8), 0, Math.min(5.6, w * 0.4), Math.min(4.9, d * 0.6));
    }
    if (hockey) {
      for (const side of [-1, 1]) for (let u = -w / 2; u < w / 2; u += 3) {
        const length = Math.min(3, w / 2 - u), p = groundPoint(u + length / 2, side * d / 2, 0.5);
        box(group, p.x, p.y, p.z, length, 1, 0.12, white, f.yaw);
        box(group, p.x, p.y + 0.53, p.z, length, 0.07, 0.15, red, f.yaw);
      }
      for (const side of [-1, 1]) for (let v = -d / 2; v < d / 2; v += 2) {
        const length = Math.min(2, d / 2 - v);
        if (Math.abs(v + length / 2) < 1.4) continue;
        const p = groundPoint(side * w / 2, v + length / 2, 0.5);
        box(group, p.x, p.y, p.z, 0.12, 1, length, white, f.yaw);
      }
      for (const u of [-w * 0.22, w * 0.22]) strip([u, -d / 2], [u, d / 2], 0.16, red);
    }
  }

  function schoolBarriers(regionAt) {
    const sites = (GEO.education?.sites || []).filter((s) => s.kind === 'school'), features = new Map();
    for (const site of sites) for (const feature of [...site.features, ...site.entrances.filter((e) => /gate/.test(e.barrier || ''))]) features.set(feature.reference, feature);
    for (const gate of GEO.education?.schoolEntrances?.gates || []) features.set(gate.id, { kind: 'gate', pts: gate.pts });
    const gates = [...features.values()].filter((f) => /gate/.test(f.barrier || f.kind)).map((f) => toPoints(f.pts))
      .map((points) => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, z: points.reduce((sum, p) => sum + p.z, 0) / points.length }));
    const barriers = [...features.values()].filter((f) => ['fence', 'wall', 'hedge'].includes(f.kind) && f.pts.length >= 4);
    for (const yard of GEO.education?.schoolYards?.yards || []) if (yard.boundarySource === 'mapped-enclosure-inferred-school') {
      for (const ring of yard.rings) barriers.push({ kind: 'fence', pts: [...ring, ...ring.slice(0, 2)] });
    }
    const edges = new Set();
    let spans = 0;
    for (const feature of barriers) {
      const points = toPoints(feature.pts);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
        if (length < 0.2) continue;
        const key = [`${a.x},${a.z}`, `${b.x},${b.z}`].sort().join('/');
        if (edges.has(key)) continue;
        edges.add(key);
        const count = Math.ceil(length / 6), width = length / count, yaw = -Math.atan2(dz, dx);
        for (let j = 0; j < count; j++) {
          const t = (j + 0.5) / count, x = a.x + dx * t, z = a.z + dz * t;
          if (gates.some((g) => Math.hypot(g.x - x, g.z - z) < width / 2 + 2)) continue;
          const crossing = nearestRoads(x, z, 10).some((r) => !r.road.bridge && !r.road.tunnel && !r.road.layer &&
            (r.road.walk || r.road.campusAccess) && r.dist < r.road.w / 2 + width / 2 &&
            Math.abs(dx / length * Math.cos(r.heading) - dz / length * Math.sin(r.heading)) > 0.3);
          if (crossing) continue;
          const group = regionAt(x, z), y = groundSurfaceHeight(x, z), height = feature.kind === 'hedge' ? 1.1 : 1.6;
          if (feature.kind === 'wall' || feature.kind === 'hedge') box(group, x, y + height / 2, z, width, height,
            feature.kind === 'wall' ? 0.25 : 0.7, feature.kind === 'wall' ? concrete : schoolHedge, yaw);
          else {
            for (const rise of [0.5, 1.4]) box(group, x, y + rise, z, width, 0.06, 0.06, schoolFence, yaw);
            for (const side of [-1, 1]) {
              const px = x + dx / length * width * side / 2, pz = z + dz / length * width * side / 2;
              box(group, px, groundSurfaceHeight(px, pz) + height / 2, pz, 0.08, height, 0.08, schoolFence);
            }
          }
          spans++;
        }
      }
    }
    return spans;
  }

  function schoolEntrances(regionAt) {
    let count = 0;
    for (const entry of GEO.education?.schoolEntrances?.entries || []) {
      const group = regionAt(entry.x, entry.z), floor = surfaceHeight(entry.x, entry.z) + 0.09;
      const yaw = -Math.atan2(entry.uz, entry.ux), width = entry.width, height = entry.height;
      function panel(u, rise, w, h, depth, projection, material) {
        box(group, entry.x + entry.ux * u + entry.nx * projection, floor + rise,
          entry.z + entry.uz * u + entry.nz * projection, w, h, depth, material, yaw);
      }
      if (entry.approach) groundPaint(group, entry.approach, 0.085, concrete);
      panel(0, height / 2, width, height, 0.055, 0.075, entranceGlass);
      for (const side of [-1, 1]) panel(side * width / 2, height / 2, 0.07, height + 0.08, 0.08, 0.11, white);
      for (const rise of [0, height]) panel(0, rise, width + 0.08, 0.07, 0.08, 0.11, white);
      if (width > 1.35) panel(0, height / 2, 0.06, height, 0.08, 0.12, white);
      for (const u of width > 1.35 ? [-0.12, 0.12] : [width * 0.3]) panel(u, height * 0.48, 0.035, 0.3, 0.05, 0.16, white);
      if (entry.canopy) {
        const depth = entry.approach ? 1.1 : 0.6;
        panel(0, height + 0.23, entry.porchWidth, 0.13, depth, depth / 2 + 0.02, schoolFence);
      }
      count++;
    }
    for (const canopy of GEO.education?.schoolEntrances?.canopies || []) {
      const body = GEO.buildings[canopy.buildingIndex];
      if (!body || body.fuelRole || body.undergroundEntranceRoof) continue;
      const points = toPoints(body.ring), base = body.foundationAt ? terrainHeight(...body.foundationAt) : Math.max(...points.map((p) => terrainHeight(p.x, p.z)));
      const underside = base + body.minHeight;
      for (const p of points) {
        const ground = surfaceHeight(p.x, p.z), height = Math.max(0.1, underside - ground);
        box(regionAt(p.x, p.z), p.x, ground + height / 2, p.z, 0.09, height, 0.09, schoolFence);
      }
    }
    return count;
  }

  function build(parent, initialPosition = { x: 0, z: 0 }) {
    const group = new THREE.Group(); group.name = 'KazanRecreation';
    let lamps = 0;
    const regions = new Map();
    function regionAt(x, z) {
      const ix = Math.floor(x / 1024), iz = Math.floor(z / 1024), key = `${ix},${iz}`;
      if (!regions.has(key)) {
        const part = new THREE.Group(); part.name = `KazanSchoolYards/${key}`;
        part.userData.centre = { x: (ix + 0.5) * 1024, z: (iz + 0.5) * 1024 };
        regions.set(key, part); group.add(part);
      }
      return regions.get(key);
    }
    for (const site of (GEO.recreation || []).filter((s) => s.site && s.kind)) {
      const f = frame(site);
      if (site.site === 'school') {
        schoolActivity(regionAt(f.cx, f.cz), site, f);
        continue;
      }
      if (['skate-bowls', 'pump-track'].includes(site.kind)) flowSurface(group, site, f);
      else if (site.kind === 'air-park') airPark(group, site, f);
      else court(group, site, f);
      if (lamps++ < 12) {
        const p = point(f, -f.w / 2 - 1, f.d / 2 + 1);
        if (NYC.nearestRoads(p.x, p.z, 25).some((r) => r.road.bridge && r.dist < r.road.w / 2 + 2)) continue;
        box(group, p.x, f.y + 5.5, p.z, 0.18, 11, 0.18, black);
        box(group, p.x, f.y + 10.9, p.z, 2.2, 0.15, 0.35, black);
        for (const dx of [-0.7, 0.7]) box(group, p.x + dx, f.y + 10.8, p.z, 0.55, 0.4, 0.2, white);
      }
    }
    group.userData.schoolBoundarySpans = schoolBarriers(regionAt);
    group.userData.schoolEntranceCount = schoolEntrances(regionAt);
    for (const region of regions.values()) flush(region);
    flush(group); parent.add(group);
    function update(x, z) {
      for (const region of regions.values()) {
        const centre = region.userData.centre;
        region.visible = Math.hypot(x - centre.x, z - centre.z) < 2700;
      }
    }
    update(initialPosition.x, initialPosition.z);
    return { update };
  }
  return { build };
}

NYC = { ...NYC, createKazanRecreation };
})();
