import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileHousingMaterials } from '../tools/kazan-housing.mjs';

describe('Bulk housing material evidence', () => {
  test('the citywide passport import keeps both conflicting source sections, validates indexed addresses and never replaces a complete pull with a partial one', () => {
    const cache = mkdtempSync(join(tmpdir(), 'Kazan passports ')), output = join(cache,'passports.json.gz'), osm = join(cache,'osm.json.gz');
    function save(url, text) {
      const wire=spawnSync('python3',['-c',"import sys;sys.stdout.buffer.write(sys.stdin.read().encode('cp1251'))"],{input:text});
      assert.equal(wire.status,0);
      writeFileSync(join(cache,createHash('sha256').update('https://prawdom.ru'+url).digest('hex')+'.html.gz'),gzipSync(wire.stdout));
    }
    try {
      const title='Список улиц г. Казань';
      save('/k_city.php?d=99092&c=401099092&f=0',`${title}<a href="/k_city.php?d=99092&c=401099092&f=0">1</a><a href="/nsk.php?nse=test">Новая ул .</a>`);
      save('/nsk.php?nse=test','Список домов, по улице Новой: <a href="/dom.php?hm=test_1">1</a><a href="/dom.php?hm=test_2">2</a><a href="/dom.php?hm=test_3">3</a></p>');
      function passport(house,material,series,registry) {
        return `<h1>город Казань, улица Новая, д.${house} (район Тестовый)</h1><h2>Паспорт дома</h2><li>Материал несущих стен - ${material}</li><li>Дата (год) постройки - 1994</li>Серия (типовой проект) здания -<a>${series}</a><br>Серия, тип постройки здания ${registry}<br>Несущие стены: Панельные<br>Год ввода в эксплуатацию 1995<h4>Описание улицы</h4>`;
      }
      save('/dom.php?hm=test_1',passport('1','панельный','121','125'));
      save('/dom.php?hm=test_2',passport('2','кирпичный','1-447','1-447'));
      save('/dom.php?hm=test_3',passport('3','панельный','121','121').replace('город Казань','город Зеленодольск'));
      writeFileSync(osm,gzipSync(JSON.stringify({elements:[1,2,3].map(id=>({type:'way',id,tags:{building:'apartments','addr:street':'улица Новая','addr:housenumber':String(id)}}))})));
      const args=[new URL('../tools/import-kazan-housing-passports.py',import.meta.url).pathname,'--cache-dir',cache,'--offline','--osm',osm,'--output',output];
      const pulled=spawnSync('python3',args,{encoding:'utf8'});
      assert.equal(pulled.status,0,pulled.stderr);
      const bytes=readFileSync(output),source=JSON.parse(gunzipSync(bytes));
      assert.equal(source.coverage.sourceCards,2,'a separated abbreviation dot cannot drop an entire street');
      assert.equal(source.coverage.invalid,1,'a reused source slug cannot import a passport from another municipality');
      assert.deepEqual(source.records[0].series,['121','125'],'legacy and capital-repair projects remain separate contradictory facts');
      assert.deepEqual(source.records[1].bearingWalls,['Панельные','кирпичный']);
      assert.deepEqual(source.records[0].constructionYears,['1994']);
      assert.deepEqual(source.records[0].commissioningYears,['1995'],'commissioning cannot silently replace construction');
      assert.deepEqual(source.records[0].balconies,[],'absence of a field cannot be interpreted as zero balconies');
      rmSync(join(cache,createHash('sha256').update('https://prawdom.ru/dom.php?hm=test_2').digest('hex')+'.html.gz'));
      const partial=spawnSync('python3',args,{encoding:'utf8'});
      assert.notEqual(partial.status,0);
      assert.deepEqual(readFileSync(output),bytes);
    } finally { rmSync(cache,{recursive:true,force:true}); }
  });
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
      [14, '1-я Станционная улица', '12А', {}], [15, 'Оренбургский тракт', '6', {}], [16, 'Новая улица', '66к1', {}],
      [17,'Новая улица','9',{}]
    ];
    const buildings = data.map(([id,,,props]) => ({ id, osmType: 'way', part: false, kind: 'apartments', material: '', ring: [0,0,10,0,10,10,0,10], holes: [], ...props }));
    const elements = data.map(([id,street,house,props]) => ({ id, type: props.osmType || 'way', tags: { 'addr:street': street, 'addr:housenumber': house } }));
    const addresses = ['ул. Чистопольская, д. 51', 'ул. Чистопольская, д. 51', 'ул. Мирная, д. 3',
      'ул. Серова, д. 6, к. 1', 'ул. Серова, д. 6, к. 2', 'ул. Тестовая, д. 10', 'ул. Солнечная (Лесной городок), д. 5',
      'ул. Проектная, д. 8', 'ул. Кирпичная, д. 2', 'ул. Школьная, д. 1', 'ул. Станционная 1-я, д. 12A',
      'ул. Оренбургский Тракт, д. 6', 'ул. Новая, д. 66кор.1'];
    const source = { source: { provider: 'catalogue' }, records: addresses.map((address, i) => ({ sourceId: `card-${i}`, address: `респ. Татарстан, г. Казань, ${address}`, materialCategory:'panel-bearing' })) };
    const saved = structuredClone(buildings), result = compileHousingMaterials(elements, buildings, source, {
      cityGeometry: { type: 'Polygon', coordinates: [[[-100,-100],[100,-100],[100,100],[-100,100],[-100,-100]]] }, toWorld: ({ lon, lat }) => [lon, lat],
      passports:{source:{provider:'Prawdom'},records:[
        {sourceId:'new_9',address:'респ. Татарстан, г. Казань, ул. Новая, д. 9',bearingWalls:['Иные'],series:['121','125'],constructionYears:['1994'],commissioningYears:['1995']},
        {sourceId:'brick_2',address:'респ. Татарстан, г. Казань, ул. Кирпичная, д. 2',bearingWalls:['кирпичный'],series:[],constructionYears:[],commissioningYears:[]}
      ]}
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
    assert.equal(byRef.get('way/12').materialAgreement, 'conflicting-structural-sources');
    assert.equal(byRef.get('way/12').materialCategory,null,'a second contradictory source cannot silently win');
    assert.equal(byRef.get('way/17').materialCategory,null,'a passport with other/unknown walls is not panel material evidence');
    assert.deepEqual(byRef.get('way/17').series,['121','125']);
    assert.deepEqual(byRef.get('way/17').constructionYears,['1994']);
    assert.deepEqual(byRef.get('way/17').commissioningYears,['1995']);
    assert.equal(result.unresolved.find((r) => r.sourceId === 'card-5').reason, 'ambiguous-mapped-address');
    assert.equal(result.unresolved.find((r) => r.sourceId === 'card-6').reason, 'no-mapped-address', 'a district qualifier cannot be silently dropped');
    assert.equal(result.unresolved.find((r) => r.sourceId === 'card-9').reason, 'mapped-use-conflict');
    assert.deepEqual(buildings, saved, 'registry structure must not overwrite mapped cladding, geometry or appearances');
  });
});
