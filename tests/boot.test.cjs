const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, describe } = require('node:test');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const preloadScript = html.match(/<script>([^]*?)<\/script>/);
const moduleScript = html.match(/<script type="module">([^]*?)<\/script>/);

function bootHarness({ coarse = false, gpu = true, search = '', engineFailure = false } = {}) {
  const links = [], scripts = [], imports = [], progress = [];
  const elements = new Map();
  const window = {};
  const THREE = {};
  let resolveFetch;
  const response = new Promise((resolve) => { resolveFetch = resolve; });
  const document = {
    baseURI: 'https://example.test/city/',
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', hidden: id === 'loading-retry', style: {},
        classList: { contains: () => false, remove() {} },
        setAttribute(name, value) { if (name === 'aria-valuenow') progress.push(Number(value)); } });
      return elements.get(id);
    },
    createElement: (tagName) => ({ tagName, async: true }),
    head: {
      appendChild(element) {
        if (element.tagName === 'link') {
          assert.equal(window.NYC, undefined, 'preloads do not execute city code');
          links.push(element.href);
        } else {
          assert.equal(window.NYC.THREE, THREE);
          assert.equal(element.async, false);
          if (scripts.length) assert.equal(window.NYC.GEO.city.name, 'Kazan', 'configuration waits for decoded geography');
          else window.NYC.GEO_DATA_FILE = 'kazan-geodata.json.gz';
          scripts.push(element.src);
          queueMicrotask(element.onload);
        }
      }
    }
  };
  let requestedURL;
  const context = vm.createContext({ window, document, URL, URLSearchParams, Uint8Array,
    Response, ReadableStream, DecompressionStream, AbortController, setTimeout, clearTimeout,
    console: { error() {} }, addEventListener() {}, location: { search },
    matchMedia: () => ({ matches: coarse }), navigator: { gpu: gpu ? {} : undefined },
    importModule: async (specifier) => {
      imports.push(specifier);
      if (engineFailure) throw new Error('CDN unavailable');
      return specifier === 'three/webgpu' ? THREE : {};
    },
    fetch: (url) => { requestedURL = url.href; return response; }
  });
  vm.runInContext(preloadScript[1], context);
  // Substitute the browser module transport while running the actual startup body.
  const startup = vm.runInContext(`(async () => { ${moduleScript[1].replace(/\bimport\(/g, 'importModule(')} })()`, context);
  return { window, document, elements, links, scripts, imports, progress, startup, resolveFetch, getURL: () => requestedURL };
}

describe('City startup', () => {
  test('city script preloads start before stylesheets can block the loader', () => {
    assert.ok(preloadScript.index < html.indexOf('rel="stylesheet"'));
  });

  for (const compressed of [true, false]) {
    test(`startup preserves dependency order with ${compressed ? 'gzip' : 'HTTP-decoded JSON'}`, async () => {
      const boot = bootHarness();
      await new Promise(setImmediate);
      assert.equal(boot.scripts.length, 1, 'dependent scripts wait for the geography response');
      assert.match(boot.getURL(), /\/js\/kazan-geodata\.json\.gz\?v=/);
      const json = JSON.stringify({ city: { name: 'Kazan' } });
      const body = compressed ? gzipSync(json) : json;
      const stream = compressed ? new ReadableStream({ start(controller) {
        controller.enqueue(body.subarray(0, 1));
        controller.enqueue(body.subarray(1, 2));
        controller.enqueue(body.subarray(2));
        controller.close();
      } }) : body;
      boot.resolveFetch(new Response(stream, { headers: compressed ? { 'Content-Length': String(body.length) } : { 'Content-Encoding': 'gzip', 'Content-Length': '5' } }));
      await boot.startup;
      assert.deepEqual(boot.scripts, boot.links);
      assert.equal(new Set(boot.links).size, boot.links.length);
      assert.match(boot.scripts.at(-1), /\/main\.js\?v=/);
      assert.ok(boot.progress.at(-1) >= 42);
      assert.ok(boot.progress.every((value, i) => i === 0 || value >= boot.progress[i - 1]), 'progress never goes backwards');
    });
  }

  for (const options of [{ coarse: true }, { gpu: false }, { search: '?graphics=lite&renderer=webgl' }]) {
    test(`lightweight startup selects a smaller download and skips optional effects: ${JSON.stringify(options)}`, async () => {
      const boot = bootHarness(options);
      await new Promise(setImmediate);
      assert.match(boot.getURL(), /kazan-geodata-lite\.json\.gz\?v=/);
      boot.resolveFetch(new Response(JSON.stringify({ city: { name: 'Kazan' } })));
      await boot.startup;
      assert.equal(boot.window.NYC.runtime.lite, true);
      assert.equal(boot.imports.some((name) => /BloomNode|SSRNode|ClusteredLighting|SkyMesh/.test(name)), false);
    });
  }

  test('engine and geography failures reveal recovery controls instead of leaving a silent spinner', async () => {
    for (const engineFailure of [true, false]) {
      const boot = bootHarness({ engineFailure });
      boot.resolveFetch(new Response('unavailable', { status: 503 }));
      await boot.startup;
      assert.equal(boot.document.getElementById('loading-retry').hidden, false);
      assert.match(boot.document.getElementById('loading-status').textContent, /Could not start/);
      assert.equal(boot.scripts.length, engineFailure ? 0 : 1);
    }
  });
});
