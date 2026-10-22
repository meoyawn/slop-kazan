const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, describe } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const preloadScript = html.match(/<script>([^]*?)<\/script>/);
const moduleScript = html.match(/<script type="module">([^]*?)<\/script>/);

describe('City startup', () => {

test('city script preloads start before stylesheets can block the loader', () => {
  assert.ok(preloadScript);
  assert.ok(preloadScript.index < html.indexOf('rel="stylesheet"'));
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/>/);
});

test('preloaded URLs match ordered scripts and execution waits for Three.js imports', () => {
  const links = [];
  const scripts = [];
  const window = {};
  const THREE = {};
  const imports = Object.fromEntries(['bloom', 'ssr', 'mergeGeometries', 'mergeVertices', 'SkyMesh', 'SunLight', 'SunLightNode', 'ClusteredLighting'].map((name) => [name, () => {}]));
  const document = {
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
          scripts.push(element.src);
        }
      }
    }
  };
  const context = vm.createContext({ window, document, THREE, TSL: {}, ...imports });
  vm.runInContext(preloadScript[1], context);
  assert.equal(scripts.length, 0);
  assert.ok(links.length > 0, 'startup fetches city scripts');
  assert.equal(new Set(links).size, links.length, 'each script is preloaded once');

  // Imports are supplied above; evaluate the unchanged module body in the same global lexical environment.
  vm.runInContext(moduleScript[1].replace(/^\s*import .+;$/gm, ''), context);
  assert.deepEqual(scripts, links);
  assert.match(scripts[0], /\/kazan-geodata\.js\?v=/);
  assert.match(scripts.at(-1), /\/main\.js\?v=/);
  assert.equal(new Set(scripts.map((src) => src.split('?v=')[1])).size, 1);
});

});
