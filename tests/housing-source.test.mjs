import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { compileHousingMaterials } from '../tools/kazan-housing.mjs';

describe('Bulk housing material evidence', () => {
  test('the offline import accepts real source ID suffixes and refuses an incomplete page without overwriting the last complete batch', () => {
    const cache = mkdtempSync(join(tmpdir(), 'Казан housing ')), output = join(cache, 'materials.json.gz');
    function page(start, end) {
      const rows = Array.from({ length: end - start + 1 }, (_, i) => {
        const n = start + i;
        return `<tr><td class="views-field views-field-counter">${n}</td><td><a class="house" href="/dom/${n === 51 ? '51-0' : n}">респ. Татарстан, г. Казань, ул. Новая, д. ${n}</a></td></tr>`;
      });
      return `<input name="wall_material" value="Панельные"><table class="views-table">${rows.join('')}</table>Показано ${start} - ${end} из 51 домов`;
    }
    try {
      writeFileSync(join(cache, 'domivita-negative.html'), '<input name="wall_material" value="__slop_material_absent__">');
      writeFileSync(join(cache, 'domivita-panel-page0.html'), page(1, 50));
      writeFileSync(join(cache, 'domivita-panel-page1.html'), page(51, 51));
      const args = [new URL('../tools/import-kazan-housing.py', import.meta.url).pathname, '--cache-dir', cache, '--offline', '--output', output];
      const complete = spawnSync('python3', args, { encoding: 'utf8' });
      assert.equal(complete.status, 0, complete.stderr);
      const bytes = readFileSync(output), source = JSON.parse(gunzipSync(bytes));
      assert.deepEqual(source.coverage, { sourceCards: 51, pages: 2 });
      assert.equal(source.records[50].sourceId, '51-0', 'a hyphenated real catalogue ID cannot drop a row');
      assert.ok(source.records.every((r) => r.materialCategory === 'panel-bearing'), 'structural evidence is not a facade colour claim');
      writeFileSync(join(cache, 'domivita-panel-page1.html'), page(51, 51).replace('counter">51<', 'counter">50<'));
      const incomplete = spawnSync('python3', args, { encoding: 'utf8' });
      assert.notEqual(incomplete.status, 0);
      assert.match(incomplete.stderr, /Missing or repeated row/);
      assert.deepEqual(readFileSync(output), bytes, 'an incomplete pull never publishes a partially replaced dataset');
    } finally { rmSync(cache, { recursive: true, force: true }); }
  });

  test('unique municipal addresses retain street types, house suffixes and corpus; parts and duplicate outlines cannot select a wrong building', () => {
    const data = [
      [1, 'Чистопольская улица', '51', {}], [2, 'Чистопольская улица', '51', { part: true, parent: 'way/1' }],
      [3, 'Мирная улица', '3', { osmType: 'relation' }], [3, 'Мирная улица', '3', { osmType: 'relation' }],
      [4, 'улица Серова', '6к1', {}], [5, 'улица Серова', '6к2', {}],
      [6, 'Тестовая улица', '10', {}], [7, 'Тестовая улица', '10', {}],
      [8, 'Чистопольская улица', '51', { ring: [200,200,210,200,210,210,200,210] }],
      [9, 'Солнечная улица', '5', {}], [10, 'Проектная улица', '8', {}], [11, 'Проектная переулок', '8', {}],
      [12, 'Кирпичная улица', '2', { material: 'brick' }], [13, 'Школьная улица', '1', { kind: 'school' }],
      [14, '1-я Станционная улица', '12А', {}], [15, 'Оренбургский тракт', '6', {}], [16, 'Новая улица', '66к1', {}]
    ];
    const buildings = data.map(([id,,,props]) => ({ id, osmType: 'way', part: false, kind: 'apartments', material: '', ring: [0,0,10,0,10,10,0,10], holes: [], ...props }));
    const elements = data.map(([id,street,house,props]) => ({ id, type: props.osmType || 'way', tags: { 'addr:street': street, 'addr:housenumber': house } }));
    const addresses = ['ул. Чистопольская, д. 51', 'ул. Чистопольская, д. 51', 'ул. Мирная, д. 3',
      'ул. Серова, д. 6, к. 1', 'ул. Серова, д. 6, к. 2', 'ул. Тестовая, д. 10', 'ул. Солнечная (Лесной городок), д. 5',
      'ул. Проектная, д. 8', 'ул. Кирпичная, д. 2', 'ул. Школьная, д. 1', 'ул. Станционная 1-я, д. 12A',
      'ул. Оренбургский Тракт, д. 6', 'ул. Новая, д. 66кор.1'];
    const source = { source: { provider: 'catalogue' }, records: addresses.map((address, i) => ({ sourceId: `card-${i}`, address: `респ. Татарстан, г. Казань, ${address}` })) };
    const saved = structuredClone(buildings), result = compileHousingMaterials(elements, buildings, source, {
      cityGeometry: { type: 'Polygon', coordinates: [[[-100,-100],[100,-100],[100,100],[-100,100],[-100,-100]]] }, toWorld: ({ lon, lat }) => [lon, lat]
    });
    const byRef = new Map(result.bindings.map((r) => [r.reference, r]));
    assert.deepEqual(byRef.get('way/1').sourceIds, ['card-0','card-1'], 'source-card aliases share one typed principal identity');
    assert.ok(byRef.has('relation/3'), 'repeated outer outlines cannot make one relation ambiguous');
    assert.deepEqual(byRef.get('way/4')?.sourceIds, ['card-3'], 'corpus1 must not be discarded or joined to corpus2');
    assert.deepEqual(byRef.get('way/5')?.sourceIds, ['card-4']);
    assert.deepEqual(byRef.get('way/14')?.sourceIds, ['card-10'], 'ordinal street order and house-letter glyphs are deterministic equivalents');
    assert.deepEqual(byRef.get('way/15')?.sourceIds, ['card-11'], 'a generic catalogue ul. prefix cannot hide the explicit tract type');
    assert.deepEqual(byRef.get('way/16')?.sourceIds, ['card-12'], 'the catalogue kor. abbreviation retains its corpus');
    assert.ok(byRef.has('way/10') && !byRef.has('way/11'), 'a street and a lane remain distinct');
    assert.equal(byRef.get('way/12').materialAgreement, 'different-cladding-or-source-conflict');
    assert.equal(result.unresolved.find((r) => r.sourceId === 'card-5').reason, 'ambiguous-mapped-address');
    assert.equal(result.unresolved.find((r) => r.sourceId === 'card-6').reason, 'no-mapped-address', 'a district qualifier cannot be silently dropped');
    assert.equal(result.unresolved.find((r) => r.sourceId === 'card-9').reason, 'mapped-use-conflict');
    assert.deepEqual(buildings, saved, 'registry structure must not overwrite mapped cladding, geometry or appearances');
  });
});
