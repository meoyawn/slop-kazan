const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, describe } = require('node:test');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const preloadScript = html.match(/<script>([^]*?)<\/script>/);
const moduleScript = html.match(/<script type="module">([^]*?)<\/script>/);

describe('City startup', () => {

test('city script preloads start before stylesheets can block the loader', () => {
  assert.ok(preloadScript);
  assert.ok(preloadScript.index < html.indexOf('rel="stylesheet"'));
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/>/);
});

test('preloaded scripts execute after Three.js and configuration waits for compressed geography', async () => {
  const links = [];
  const scripts = [];
  const window = {};
  const THREE = {};
  const imports = Object.fromEntries(['bloom', 'ssr', 'mergeGeometries', 'mergeVertices', 'SkyMesh', 'SunLight', 'SunLightNode', 'ClusteredLighting'].map((name) => [name, () => {}]));
  const document = {
    baseURI: 'https://example.test/city/',
    getElementById: () => ({ textContent: '' }),
    createElement: (tagName) => ({ tagName, async: true }),
    head: {
      appendChild(element) {
        if (element.tagName === 'link') {
          assert.equal(window.NYC, undefined, 'fetching does not initialize or execute app code');
          assert.equal(element.rel, 'preload');
          assert.equal(element.as, 'script');
          links.push(element.href);
        } else {
          assert.equal(window.NYC.THREE, THREE, 'Three.js is available before app script execution');
          assert.equal(element.async, false, 'the browser must preserve dependency order');
          if (scripts.length) assert.equal(window.NYC.GEO.city.name, 'Kazan', 'geography is decoded before configuration executes');
          else window.NYC.GEO_DATA_FILE = 'kazan-geodata.json.gz';
          scripts.push(element.src);
          queueMicrotask(element.onload);
        }
      }
    }
  };
  let resolveFetch;
  const response = new Promise((resolve) => { resolveFetch = resolve; });
  const context = vm.createContext({ window, document, THREE, TSL: {}, ...imports,
    URL, Uint8Array, Blob, Response, DecompressionStream,
    fetch: (url) => {
      assert.match(url.href, /^https:\/\/example.test\/city\/js\/kazan-geodata\.json\.gz\?v=/);
      return response;
    } });
  vm.runInContext(preloadScript[1], context);
  assert.equal(scripts.length, 0);
  assert.ok(links.length > 0, 'startup fetches city scripts');
  assert.equal(new Set(links).size, links.length, 'each script is preloaded once');

  // Imports are supplied above; evaluate the unchanged module body in the same global lexical environment.
  const startup = vm.runInContext(`(async () => { ${moduleScript[1].replace(/^\s*import .+;$/gm, '')} })()`, context);
  await new Promise(setImmediate);
  assert.equal(scripts.length, 1, 'dependent scripts wait while the geography response is pending');
  resolveFetch(new Response(gzipSync(JSON.stringify({ city: { name: 'Kazan' } }))));
  await startup;
  assert.deepEqual(scripts, links);
  assert.match(scripts[0], /\/kazan-geodata\.js\?v=/);
  assert.match(scripts.at(-1), /\/main\.js\?v=/);
  assert.equal(new Set(scripts.map((src) => src.split('?v=')[1])).size, 1);
});

});
