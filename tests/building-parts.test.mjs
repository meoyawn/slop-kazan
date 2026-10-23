import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside;
  }
  return inside;
}

describe('Mapped building bodies and partial wings', () => {
  test('Chetaeva 27A retains its nine-storey arm beside the separately mapped five-storey wing', () => {
    const path = process.env.BUILDING_PARTS_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url);
    const data = JSON.parse(gunzipSync(readFileSync(path)));
    const parent = data.buildings.find((b) => b.osmType === 'way' && b.id === 995160395);
    const wing = data.buildings.find((b) => b.osmType === 'way' && b.id === 83289897);
    const bodies = parent.hasParts ? parent.body || [] : [parent];
    assert.ok(bodies.some((b) => contains(b.ring, 1205, -3800)), 'the north arm remains rendered when only the east wing is mapped as a part');
    assert.ok(!bodies.some((b) => contains(b.ring, 1240, -3770)), 'the main body does not cover the lower wing with a nine-storey roof');
    assert.ok(contains(wing.ring, 1240, -3770));
    assert.equal(parent.h, 27);
    assert.equal(wing.h, 15);
    assert.equal(wing.appearance.accentColour, '#954738', 'unreviewed parts inherit the photograph-confirmed red inserts');
    assert.equal(wing.appearance.masonry, 'brick');
  });
});
