import * as THREE from 'three/webgpu';
import { createKazanRoadStructures } from '../js/kazan-road-structures.js';
import { createKazanPedestrianStructures } from '../js/kazan-pedestrian-structures.js';

/** Collect clearance obstacles through the production structure generators without retaining their rendered parts. */
export function collectTrafficObstacles() {
  const draw = {
    plainMaterial() { return new THREE.MeshBasicMaterial(); },
    box() {},
    emit(group, geometry) { geometry.dispose(); },
    flush() {},
    buildingCollider() { return { obb: {} }; },
    shapeOf(ring) {
      return new THREE.Shape(Array.from({ length: ring.length / 2 }, (_, i) => new THREE.Vector2(ring[i * 2], -ring[i * 2 + 1])));
    }
  };
  const pedestrian = createKazanPedestrianStructures(draw).build(new THREE.Group());
  const roads = createKazanRoadStructures(draw);
  return [...pedestrian.colliders, ...roads.colliders].filter((collider) => !collider.obb);
}
