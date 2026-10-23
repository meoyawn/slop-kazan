import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { GEO } from './kazan-runtime.js';
import { ROADS, roadHeight, terrainHeight, waterAt } from './kazan-config.js';
import { cityUniforms } from './tsl-materials.js';

/** Shared M-frame construction follows each reviewed installation's own position, proportions and materials. */
export function createKazanMStructures(draw) {
  const { plainMaterial, box, solid, flush } = draw;

  function build(parent) {
    const colliders = [];
    for (const s of GEO.structures || []) {
      if (s.kind !== 'm-frame') continue;
      const group = new THREE.Group(); group.name = `KazanLandmark/${s.id}`;
      group.userData.source = s.source; group.userData.reference = s.reference;
      const roads = ROADS.filter((r) => s.roadIds.includes(r.id));
      const deck = Math.max(...roads.map((r) => roadHeight(r, s.x, s.z)));
      const nx = -s.uz, nz = s.ux, normal = new THREE.Vector3(nx, 0, nz), half = s.w / 2;
      const material = plainMaterial(new THREE.Color(s.colour).getHex(), s.cables ? 0 : 0.55);
      const foundation = plainMaterial(0x9ea49c), trim = plainMaterial(0x66757c, 0.4);

      function point(u, y, v = 0) {
        const x = s.x + s.ux * u + nx * v, z = s.z + s.uz * u + nz * v;
        return new THREE.Vector3(x, y, z);
      }
      function beam(a, b, width, depth, paint) {
        const direction = b.clone().sub(a), length = direction.length();
        if (length < 0.01) return;
        direction.divideScalar(length);
        const side = direction.clone().cross(normal).normalize();
        const geometry = new THREE.BoxGeometry(width, length, depth);
        geometry.applyMatrix4(new THREE.Matrix4().makeBasis(side, direction, normal));
        solid(group, geometry, paint, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      }

      const vertices = [-half, -half / 2, 0, half / 2, half].map((u, i) => {
        const p = point(u, deck);
        return point(u, i % 2 ? deck + s.h : s.cables ? deck : terrainHeight(p.x, p.z) + 0.3);
      });
      for (let i = 1; i < vertices.length; i++) {
        beam(vertices[i - 1], vertices[i], s.beamWidth, s.depth, material);
        if (!s.cables) {
          const a = vertices[i - 1].clone().addScaledVector(normal, s.depth / 2 + 0.02);
          const b = vertices[i].clone().addScaledVector(normal, s.depth / 2 + 0.02);
          beam(a, b, 0.1, 0.06, trim);
          for (let band = 0; band < 3; band++) {
            const colours = i <= 2 ? [0x408b59, 0xd8d9d3, 0xb14740] : [0xd8d9d3, 0x557cab, 0xb14740];
            const light = new THREE.MeshStandardNodeMaterial({ color: 0xaeb9b9, metalness: 0.4, roughness: 0.5 });
            light.emissiveNode = TSL.color(colours[band]).mul(TSL.smoothstep(0.3, 1, cityUniforms.uInteriorGlow)).mul(1.1);
            for (const face of [-1, 1]) {
              const a = vertices[i - 1].clone().lerp(vertices[i], band / 3).addScaledVector(normal, face * (s.depth / 2 + 0.07));
              const b = vertices[i - 1].clone().lerp(vertices[i], (band + 1) / 3).addScaledVector(normal, face * (s.depth / 2 + 0.07));
              beam(a, b, 0.13, 0.06, light);
            }
          }
        }
      }
      for (const i of [0, 2, 4]) {
        const p = vertices[i], ground = waterAt(p.x, p.z) ? -0.8 : terrainHeight(p.x, p.z) - 0.15;
        const top = s.cables ? deck + 0.2 : p.y + 0.1, w = s.cables ? 5.5 : 2.1, depth = s.cables ? 4.5 : 2.2;
        box(group, p.x, (ground + top) / 2, p.z, w, Math.max(0.4, top - ground), depth, foundation, -Math.atan2(s.uz, s.ux));
        colliders.push({ minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - w / 2, maxZ: p.z + w / 2,
          minY: ground, maxY: top + 2, obb: { cx: p.x, cz: p.z, hx: w / 2, hz: depth / 2, cs: s.ux, sn: -s.uz } });
      }
      if (s.cables) {
        const gold = plainMaterial(0xcba448, 0.35), up = new THREE.Vector3(0, 1, 0);
        for (const peak of [vertices[1], vertices[3]]) for (const direction of [-1, 1]) for (const reach of [30, 48, 68, 91, 117, 147]) {
          const u = (peak.x - s.x) * s.ux + (peak.z - s.z) * s.uz;
          const anchor = point(u, deck + 0.35, direction * reach);
          anchor.y = Math.max(...roads.map((r) => roadHeight(r, anchor.x, anchor.z))) + 0.35;
          const delta = anchor.clone().sub(peak), geometry = new THREE.CylinderGeometry(0.07, 0.07, delta.length(), 5);
          geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()));
          solid(group, geometry, gold, (peak.x + anchor.x) / 2, (peak.y + anchor.y) / 2, (peak.z + anchor.z) / 2);
        }
      }
      flush(group); parent.add(group);
    }
    return colliders;
  }
  return { build };
}
