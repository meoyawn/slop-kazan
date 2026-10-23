import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';

describe('Small mapped buildings', () => {
  test('pavilions and compact untyped outlines stay low beside buildings with real mapped floors', () => {
    const path = process.env.SMALL_BUILDINGS_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url);
    const data = JSON.parse(gunzipSync(readFileSync(path)));
    for (const id of [393313266, 406564303, 406564435, 406564572]) {
      const building = data.buildings.find((b) => b.id === id && b.osmType === 'way');
      assert.ok(building.h >= 2.5 && building.h <= 4.5, `${id}: a small street pavilion is not a four-storey tower`);
      assert.equal(building.typology, 'retail-pavilion');
    }
    assert.equal(data.buildings.find((b) => b.id === 107116367).h, 12, 'retain the neighbouring four-storey building');
    assert.equal(data.buildings.find((b) => b.id === 83053308).h, 18, 'the six-storey garage remains six storeys');
    assert.equal(data.buildings.find((b) => b.id === 623440662).h, 2.8, 'a plausible satellite height is kept before the small-outline fallback');
    const round = data.buildings.find((b) => b.id === 1057568990);
    assert.ok(round.h <= 4.5, 'the compact round URAM pavilion has no evidence for a four-storey tower');
    assert.equal(round.typology, 'small-building', 'a missing height does not establish that the pavilion is a retail kiosk');
  });
});
