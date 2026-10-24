import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compileBuildingDates } from '../tools/kazan-building-dates.mjs';

const helpers = { cityGeometry: { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
  [[70, 70], [90, 70], [90, 90], [70, 90], [70, 70]]] }, toWorld: (p) => [p.lon, p.lat], source: { sha256: 'paired-extract' } };
const body = (id, x = id, z = 10) => ({ osmType: 'way', id, kind: 'apartments', ring: [x, z, x + 1, z, x + 1, z + 1, x, z + 1], holes: [] });

describe('Shared city construction dates', () => {
  test('bulk source dates retain their precision, bounds and uncertainty instead of becoming guessed exact years', () => {
    const cases = [
      ['1954', { from: 1954, to: 1954, precision: 'year', qualifier: 'mapped' }],
      ['2020-02-29', { from: 2020, to: 2020, precision: 'day', qualifier: 'mapped' }],
      ['1900..1904', { from: 1900, to: 1904, precision: 'range', qualifier: 'mapped' }],
      ['1930s', { from: 1930, to: 1939, precision: 'decade', qualifier: 'mapped' }],
      ['C18', { from: 1701, to: 1800, precision: 'century', qualifier: 'mapped' }],
      ['early C19', { from: 1801, to: 1833, precision: 'partial-century', qualifier: 'mapped' }],
      ['circa 1950', { from: 1950, to: 1950, precision: 'year', qualifier: 'approximate' }],
      ['before 1700', { to: 1699, precision: 'before-year', qualifier: 'mapped' }],
      ['>1930', { from: 1931, precision: 'after-year', qualifier: 'mapped' }],
      ['1940;1960', { precision: 'unparsed', qualifier: 'mapped' }],
      ['2021-02-29', { precision: 'unparsed', qualifier: 'mapped' }],
      ['1959..1930', { precision: 'unparsed', qualifier: 'mapped' }]
    ];
    const elements = cases.map(([value], i) => ({ type: 'way', id: i + 1, tags: { building: 'apartments', start_date: value } }));
    const result = compileBuildingDates(elements, elements.map((e) => body(e.id)), helpers);
    for (let i = 0; i < cases.length; i++) {
      assert.deepEqual(result.records.find((r) => r.reference === `way/${i + 1}`).construction,
        [{ field: 'start_date', text: cases[i][0], ...cases[i][1] }]);
    }
    assert.equal(result.coverage.municipal.unparsedDates, 3);
    assert.equal(result.coverage.municipal.exact1932to1959Candidates, 1, 'coarse or approximate dates cannot silently become confirmed exact-year candidates');
  });

  test('source identities, mapped parts and municipal holes stay distinct from renovations, openings and conflicting dates', () => {
    const elements = [
      { type: 'way', id: 1, tags: { start_date: '1937', 'building:architecture': 'constructivism' } },
      { type: 'way', id: 2, tags: { opening_date: '1950' } },
      { type: 'way', id: 3, tags: { renovation_date: '1950' } },
      { type: 'way', id: 4, tags: { start_date: '1750', reconstruction_date: '1980' } },
      { type: 'way', id: 5, tags: { start_date: '1937', 'building:year': '1980' } },
      { type: 'way', id: 6, tags: { start_date: '1955' } }
    ];
    const buildings = [body(1), body(1, 15), body(2), body(3), body(4), body(5), body(6, 80, 80),
      { ...body(7), part: true, parent: 'way/1' }, { ...body(8), parent: 'way/1' }];
    const saved = structuredClone(buildings), result = compileBuildingDates(elements, buildings, helpers);
    assert.equal(result.records.filter((r) => r.reference === 'way/1').length, 1, 'one source identity can own multiple retained outlines');
    assert.equal(result.records.find((r) => r.reference === 'way/1').architecture, 'constructivism', 'the year does not overwrite a different recorded style');
    assert.equal(result.records.some((r) => r.reference === 'way/2'), false, 'an opening date is not a construction date');
    assert.deepEqual(result.records.find((r) => r.reference === 'way/3').construction, []);
    assert.equal(result.records.find((r) => r.reference === 'way/4').construction[0].from, 1750);
    assert.equal(result.records.find((r) => r.reference === 'way/4').alterations[0].from, 1980);
    assert.equal(result.records.find((r) => r.reference === 'way/5').conflict, true);
    assert.deepEqual(result.inheritedParts, [{ reference: 'way/7', parent: 'way/1' }]);
    assert.equal(result.coverage.regional.principalReferences - result.coverage.municipal.principalReferences, 1, 'the municipal hole excludes its source identity');
    assert.equal(result.coverage.municipal.exact1932to1959Candidates, 1, 'a contradictory date is retained for review');
    assert.deepEqual(buildings, saved, 'the shared date layer preserves all mapped geometry and heights');
    assert.equal(result.source.extract.sha256, 'paired-extract');
  });
});
