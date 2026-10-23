import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(import.meta.dirname, '../js/tsl-materials.js'), 'utf8');
const start = source.indexOf('let _smokeCloudTexture =');
const smokeSource = source.slice(start, source.indexOf('/**', start));
const originalHash = `const hash = (ix, iy) => {
    const s = Math.sin(ix * 127.1 + iy * 311.7 + 19.19) * 43758.5453;
    return s - Math.floor(s);
  };`;

function bake(cached) {
  let body = cached ? smokeSource : smokeSource.replace(/const hash = \(ix, iy\) => \{[\s\S]*?\n  \};/, originalHash);
  // Count actual lattice computations, including all the domain-warped finite-difference samples.
  body = body.replace('const s = Math.sin(ix *', 'counts.hashes++;\n    const s = Math.sin(ix *');
  const counts = { hashes: 0, uploads: 0 };
  let pixels;
  const canvas = { getContext: () => ({
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: image => { pixels = image.data; counts.uploads++; }
  }) };
  const document = { createElement: () => canvas };
  const THREE = {
    CanvasTexture: class { constructor(image) { this.image = image; } },
    ClampToEdgeWrapping: 1001
  };
  const getTexture = new Function('document', 'THREE', 'counts', `${body}; return getSmokeCloudTexture;`)(document, THREE, counts);
  const texture = getTexture();
  return { pixels, texture, counts, getTexture };
}

test('smoke lattice cache preserves every texture byte and avoids repeated hash calculations', () => {
  const original = bake(false);
  const cached = bake(true);
  assert.equal(cached.pixels.length, 256 * 256 * 4);
  assert.deepEqual(cached.pixels, original.pixels);
  assert.equal(original.counts.hashes, 5887680);
  assert.equal(cached.counts.hashes, 48561, 'each reused lattice point is computed only once');
  assert.equal(cached.texture.wrapS, original.texture.wrapS);
  assert.equal(cached.texture.wrapT, original.texture.wrapT);
  assert.equal(cached.texture.needsUpdate, true);
  assert.equal(cached.getTexture(), cached.texture, 'subsequent requests keep sharing the finished texture');
  assert.equal(cached.counts.uploads, 1);
  assert.equal(cached.counts.hashes, 48561, 'requesting the cached texture does no further noise work');
});
