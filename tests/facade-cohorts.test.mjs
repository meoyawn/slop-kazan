import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';

describe('Residential project facade inheritance', () => {
  test('Savin sections retain white towers and brown wings while neighbouring projects keep their own materials', () => {
    const path = process.env.FACADE_COHORT_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url);
    const data = JSON.parse(gunzipSync(readFileSync(path)));
    const sections = data.buildings.filter((b) => b.parent === 'relation/13018766');
    const tower = sections.find((b) => b.levels === 20), wing = sections.find((b) => b.levels === 6);
    assert.ok(tower && wing, 'the actual mapped project has independently modelled tall and low sections');
    assert.notEqual(tower.appearance.wallColour, wing.appearance.wallColour, 'one parent palette must not turn every section white or brown');
    const white = Number.parseInt(tower.appearance.wallColour.slice(1, 3), 16);
    const brown = Number.parseInt(wing.appearance.wallColour.slice(1, 3), 16);
    assert.ok(white > brown + 70, 'the tall sections have pale piers and the low sections have darker cladding');
    assert.ok(tower.appearance.spandrelColour, 'continuous dark window spandrels remain separate from the white piers');
    assert.equal(tower.facadeCohort, wing.facadeCohort);
    assert.equal(tower.facadeConfidence, 'inferred', 'a shared project rule does not claim an individual photographic survey');
    const yit = data.buildings.find((b) => b.osmType === 'way' && b.id === 143018218);
    assert.notEqual(yit.facadeCohort, tower.facadeCohort, 'the adjacent Sovremennik development is a separate family');
    assert.ok(yit.appearance.accentMaxHeight < yit.h, 'yellow inserts are limited to the lower floors');
    const magellan = data.buildings.find((b) => b.osmType === 'way' && b.id === 151626297);
    assert.equal(magellan.facadeConfidence, 'reviewed');
    assert.equal(magellan.appearance.wallColour, '#c97945', 'the photograph-confirmed orange family remains an individual override');
    const hospital = data.buildings.find((b) => b.id === 856858879);
    assert.equal(hospital.facadeCohort, undefined, 'proximity to Savin is insufficient evidence for its paint');
  });
});
