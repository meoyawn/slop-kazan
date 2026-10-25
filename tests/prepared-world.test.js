import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import { encodeGeometry } from '../tools/encode-geometry.mjs';
import { decodeGeometry } from '../js/geometry-buffer.js';
import { loadModule } from './helpers/module.js';

describe('Prepared world release URLs', () => {
  test('a hashed manifest loads its compressed region relative to the emitted manifest under a deployment subpath', async () => {
    const source = new THREE.PlaneGeometry(6, 4), payload = await encodeGeometry(source);
    const entry = { system: 'terrain', file: 'kazan-terrain-H4sh.bin.gz', bytes: payload.byteLength };
    const manifestUrl = 'https://example.test/city/assets/kazan-world-H4sh.json';
    const regionUrl = 'https://example.test/city/assets/kazan-terrain-H4sh.bin.gz', requests = [];
    const { loadPreparedWorld } = loadModule(readFileSync(new URL('../js/prepared-world.js', import.meta.url), 'utf8').replaceAll('import.meta.env.PROD', 'true'), {
      imports: { 'three/webgpu': THREE, './geometry-buffer.js': { decodeGeometry }, './kazan-geodata.js': { GEO_DATA_VERSION: 'map' },
        'virtual:kazan-world': { manifestUrl, worldVersion: 'release' } },
      globals: { URL, Response, Blob, Uint8Array, DecompressionStream, document: { baseURI: 'https://example.test/city/' },
        async fetch(url) {
          requests.push(url.href);
          if (url.href === manifestUrl) return Response.json({ version: 'release', geography: 'map', entries: [entry] });
          if (url.href === regionUrl) return new Response(gzipSync(Buffer.from(payload)));
          throw new Error('Unexpected prepared URL: ' + url.href);
        }
      }
    });
    const world = await loadPreparedWorld(), geometry = await world.loadGeometry(world.entries[0]);
    assert.deepEqual(requests, [manifestUrl, regionUrl]);
    assert.equal(geometry.getAttribute('position').count, 4, 'the fetched compressed region becomes a usable native surface');
    source.dispose(); geometry.dispose();
  });
});
