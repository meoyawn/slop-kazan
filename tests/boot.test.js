import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadModule } from './helpers/module.js';

const read = (name) => readFileSync(join(import.meta.dirname, '../js', name), 'utf8');
const mapVersion = createHash('sha256').update(readFileSync(join(import.meta.dirname, '../js/kazan-geodata.json.gz'))).digest('hex').slice(0, 16);

function bootHarness({ coarse = false, gpu = true, search = '', engineFailure = false } = {}) {
  const imports = [], progress = [], elements = new Map();
  let resolveFetch, requestedURL;
  const response = new Promise((resolve) => { resolveFetch = resolve; });
  const document = {
    baseURI: 'https://example.test/city/', documentElement: { dataset: {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', hidden: id === 'loading-retry', style: {},
        classList: { contains: () => false, remove() {} },
        setAttribute(name, value) { if (name === 'aria-valuenow') progress.push(Number(value)); } });
      return elements.get(id);
    }
  };
  const globals = vm.createContext({ document, URL, URLSearchParams, Uint8Array,
    Response, ReadableStream, DecompressionStream, AbortController, setTimeout, clearTimeout,
    console: { error() {} }, addEventListener() {}, location: { search }, __KAZAN_GEODATA_VERSION__: 'test-data',
    matchMedia: () => ({ matches: coarse }), navigator: { gpu: gpu ? {} : undefined },
    importModule: async (specifier) => {
      imports.push(specifier);
      if (specifier === './main.js') {
        assert.equal(runtime.GEO.city.name, 'Kazan', 'city evaluation waits for decoded Kazan geography');
        return { startup: Promise.resolve() };
      }
      if (engineFailure) throw new Error('Engine unavailable');
      return {};
    },
    fetch: (url) => { requestedURL = url.href; return response; }
  });
  const runtime = loadModule(read('kazan-runtime.js'), {
    imports: { './kazan-geodata.js': loadModule(read('kazan-geodata.js')) }, globals
  });
  const engine = loadModule(read('kazan-engine.js').replace(/\bimport\(/g, 'importModule('), {
    imports: { './kazan-runtime.js': runtime }, globals
  });
  globals.runtimeModule = runtime;
  globals.engineModule = engine;
  const body = read('startup.js').replace(/^import .*;\n/gm, '').replace(/\bimport\(/g, 'importModule(');
  const startup = vm.runInContext(`(async () => {
    const { loading, loadGeography } = runtimeModule;
    const { loadEngine } = engineModule;
    ${body}
  })()`, globals);
  return { runtime, document, elements, imports, progress, startup, resolveFetch, getURL: () => requestedURL };
}

describe('Kazan startup', () => {
  for (const compressed of [true, false]) {
    test(`city evaluation waits for ${compressed ? 'gzip' : 'HTTP-decoded JSON'} geography`, async () => {
      const boot = bootHarness();
      await new Promise(setImmediate);
      assert.equal(boot.imports.includes('./main.js'), false);
      assert.match(boot.getURL(), /\/js\/kazan-geodata\.json\.gz\?v=/);
      assert.equal(new URL(boot.getURL()).searchParams.get('v'), mapVersion, 'use the generated map version even when the running dev server has an older define');
      const json = JSON.stringify({ city: { name: 'Kazan' } });
      const body = compressed ? gzipSync(json) : json;
      const stream = compressed ? new ReadableStream({ start(controller) {
        controller.enqueue(body.subarray(0, 1)); controller.enqueue(body.subarray(1, 2));
        controller.enqueue(body.subarray(2)); controller.close();
      } }) : body;
      boot.resolveFetch(new Response(stream, { headers: compressed ? { 'Content-Length': String(body.length) } : { 'Content-Encoding': 'gzip' } }));
      await boot.startup;
      assert.ok(boot.imports.includes('./main.js'));
      assert.equal(boot.runtime.GEO.city.name, 'Kazan');
      assert.ok(boot.progress.at(-1) >= 42);
      assert.ok(boot.progress.every((value, i) => i === 0 || value >= boot.progress[i - 1]));
    });
  }

  for (const options of [{ coarse: true }, { search: '?graphics=lite&renderer=webgl' }]) {
    test(`full city startup ignores retired graphics preferences: ${JSON.stringify(options)}`, async () => {
      const boot = bootHarness(options);
      assert.match(boot.getURL(), /kazan-geodata\.json\.gz\?v=/);
      boot.resolveFetch(new Response(JSON.stringify({ city: { name: 'Kazan' } })));
      await boot.startup;
      assert.equal(boot.runtime.runtime.lite, undefined);
      assert.equal(boot.imports.some((name) => /BloomNode|SSRNode|ClusteredLighting|SkyMesh/.test(name)), true);
      assert.ok(boot.imports.includes('./main.js'));
    });
  }

  test('engine, geography and wrong-city failures reveal recovery controls before evaluating the city', async () => {
    for (const [options, response] of [[{ gpu: false }, new Response('{}')], [{ engineFailure: true }, new Response('{}')], [{}, new Response('unavailable', { status: 503 })],
      [{}, new Response(JSON.stringify({ city: { name: 'New York' } }))]]) {
      const boot = bootHarness(options);
      boot.resolveFetch(response);
      await boot.startup;
      assert.equal(boot.document.getElementById('loading-retry').hidden, false);
      assert.match(boot.document.getElementById('loading-status').textContent, /Could not start/);
      assert.equal(boot.imports.includes('./main.js'), false);
    }
  });
});
