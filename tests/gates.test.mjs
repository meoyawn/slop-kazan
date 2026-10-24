import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import { passageCorridor, passageVolumes, recessVolumes } from '../tools/kazan-passages.mjs';
import * as THREE from 'three/webgpu';
import { createKazanPassageFrames } from '../js/kazan-passage-frames.js';

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside;
  }
  return inside;
}

const solidAt = (volumes, x, z, y) => volumes.some((v) => v.minHeight <= y && v.h > y && contains(v.ring, x, z) && !v.holes.some((h) => contains(h, x, z)));

describe('Mapped gate passages', () => {
  test('shared facade frames follow both mapped portals and keep the complete curved clearance open', () => {
    const passage = { road: 1, pts: [0, -9, 0, 9], width: 4, spring: 2.6, height: 4.2, bounds: { minX: -5, maxX: 5, minZ: -12, maxZ: 12 } };
    passage.corridor = passageCorridor(passage);
    for (const height of [15, 3.2]) {
      const scene = new THREE.Scene(), body = { ring: [-8, -5, 8, -5, 8, 5, -8, 5], holes: [], h: height, minHeight: 0,
        facadeFamily: 'stalinka-neoclassical', appearance: { trimColour: '#eee7d6' } };
      body.openingVolumes = passageVolumes(body.ring, [], 0, body.h, [passage]);
      const saved = structuredClone(body), frames = createKazanPassageFrames({ plainMaterial: (colour) => new THREE.MeshBasicMaterial({ color: colour }),
        box(group, x, y, z, w, h, d, material, yaw, orientation) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z);
          if (orientation) mesh.quaternion.copy(orientation); else mesh.rotation.y = yaw;
          group.add(mesh);
        } }, [passage]);
      assert.equal(frames.build(scene, body, 0), 2, 'one common path yields an entrance and an exit frame');
      scene.updateMatrixWorld(true);
      const top = Math.min(passage.height, height - 0.25), spring = Math.min(passage.spring, height - 0.5);
      const thickness = Math.min(0.38, (height - top) / 1.8);
      const crown = new THREE.Raycaster(new THREE.Vector3(0, top + thickness, -8), new THREE.Vector3(0, 0, 1)).intersectObject(scene)[0];
      assert.ok(crown?.distance < 3.5, 'the crown must actually render outside the mapped wall');
      for (let y = 0.3; y < top; y += 0.2) {
        const fraction = Math.max(0, (y - spring) / (top - spring));
        const half = passage.width / 2 * Math.sqrt(1 - fraction * fraction) * 0.86;
        for (const x of [-half, 0, half]) assert.equal(new THREE.Raycaster(new THREE.Vector3(x, y, -8), new THREE.Vector3(0, 0, 1)).intersectObject(scene).length,
          0, 'jambs, curved moulding and keystone stay outside the walk/drive opening');
      }
      assert.ok(new THREE.Box3().setFromObject(scene).max.y <= height, 'a low mapped roof cannot acquire an oversized portal crown');
      assert.deepEqual(body, saved, 'ornament cannot rewrite the shared source/collision volumes');
    }
  });
  test('an upper facade recess preserves its ground room, rear wall and header without filling an existing passage', () => {
    const passage = { pts: [-8,0,8,0], width: 1.5, spring: 2, height: 2.4, bounds: { minX:-12,maxX:12,minZ:-1,maxZ:1 } };
    passage.corridor = passageCorridor(passage);
    const original = passageVolumes([-5,-5,5,-5,5,5,-5,5], [], 0, 10, [passage]);
    const cut = recessVolumes(original, { ring: [-6,-2,-4,-2,-4,2,-6,2], bottom: 3.2, top: 8 });
    assert.equal(solidAt(cut, -4.5, 0, 5), false, 'the upper portico has real free depth');
    assert.equal(solidAt(cut, -4.5, 1.4, 1.5), true, 'the ground room under the recess stays closed');
    assert.equal(solidAt(cut, -4.5, 0, 1.5), false, 'an existing lower passage remains open');
    assert.equal(solidAt(cut, -3.7, 0, 5), true, 'the cut cannot extend through the rear wall');
    assert.equal(solidAt(cut, -4.5, 2.5, 5), true, 'retain the side pier');
    assert.equal(solidAt(cut, -4.5, 0, 9), true, 'retain the roof/header above');
  });

  test('a low building passage keeps its roof below the default clearance estimate', () => {
    const passage = { pts: [0,-8,0,8], width: 3, spring: 2.7, height: 4.2, bounds: { minX:-4,maxX:4,minZ:-12,maxZ:12 } };
    passage.corridor = passageCorridor(passage);
    const volumes = passageVolumes([-5,-5,5,-5,5,5,-5,5], [], 0, 3.2, [passage]);
    assert.equal(solidAt(volumes, 0, 0, 1.5), false, 'the mapped passage stays open at pedestrian height');
    assert.equal(solidAt(volumes, 0, 0, 3.1), true, 'an estimated high opening cannot erase the existing low roof');
  });

  test('Spasskaya has a real pedestrian arch and vehicle opening while neighbouring masonry stays solid', () => {
    const data = JSON.parse(gunzipSync(readFileSync(process.env.GATE_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const tower = data.buildings.find((b) => b.osmType === 'relation' && b.id === 17834854);
    const volumes = tower.openingVolumes || [tower];
    assert.equal(solidAt(volumes, 13.8, -725.9, 1.4), false, 'walk through the mapped main arch instead of a painted black doorway');
    assert.equal(solidAt(volumes, 10.4, -723.8, 1.4), true, 'retain the pier beside the arch');
    assert.equal(solidAt(volumes, 13.8, -725.9, 6), true, 'retain the masonry above the arch');
    const wall = data.buildings.find((b) => b.osmType === 'relation' && b.id === 18110251);
    const cut = wall.openingVolumes || [wall];
    assert.ok(cut.length > 0, 'the separate vehicle gate also cuts the fortress wall');
    assert.equal(solidAt(cut, 25.8, -738.4, 1.4), false, 'the mapped car passage is not blocked by an invisible wall');
    assert.equal(solidAt(cut, 25.8, -738.4, 7), true, 'the vehicle gate keeps its overhead structure');
    assert.equal(solidAt(cut, 21.2, -737.3, 7), true, 'upper masonry keeps the full wall thickness beside the opening');
  });

  test('destination access stays available to the player without admitting ambient through traffic', () => {
    const data = JSON.parse(gunzipSync(readFileSync(process.env.GATE_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    assert.ok(data.roads.some((r) => r.id === 479025571 && r.pts.length >= 4), 'retain the mapped vehicle access surface');
    assert.ok(!data.roadGraph.links.some((l) => data.roads[l[7]].id === 479025571), 'destination-only fortress entry cannot feed a stream of ambient vehicles');
    assert.ok(data.roadGraph.links.some((l) => /Kremlyovskaya/.test(data.roadGraph.names[l[2]])), 'retain the surrounding public street');
  });
});
