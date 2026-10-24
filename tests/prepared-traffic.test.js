import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { packTrafficTopology, unpackTrafficTopology } from '../js/traffic-topology.js';
import { encodeGeometry } from '../tools/encode-geometry.mjs';
import { decodeGeometry } from '../js/geometry-buffer.js';
import { trafficObstacleVersion } from '../js/traffic-obstacles.js';
import { loadModule } from './helpers/module.js';

describe('Prepared traffic topology', () => {
  test('transport retains connected deck lanes and precise junctions, while changed physical clearances reject stale topology', async () => {
    const origin = 1234.1234567890123;
    const points = Array.from({ length: 5 }, (_, i) => [origin + Math.cos(i * Math.PI * 2 / 5) * 100, Math.sin(i * Math.PI * 2 / 5) * 100]);
    const roads = points.map((_, id) => ({ id, kind: 'primary', bridge: true, layer: 1 }));
    const config = { ALL_AVENUES: [], ALL_STREETS: [], AVENUES: [], STREETS: [], BLOCKS: [], ROADS: roads,
      ISLAND_BOUNDS: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 },
      getIslandBoundsAtZ: () => ({ westX: -5000, eastX: 5000 }), terrainHeight: () => 0, roadHeight: () => 7 };
    const runtime = { services: {}, GEO: { roadGraph: { nodes: points.flat(), names: ['Mapped viaduct'],
      links: points.map((_, i) => [i, (i + 1) % points.length, 0, 7.6, 2, 1, [], i]) } } };
    const network = loadModule(readFileSync(new URL('../js/road-network.js', import.meta.url), 'utf8'), {
      imports: { './kazan-config.js': config, './kazan-runtime.js': runtime }, globals: { console: { info() {} } }
    });
    const x = (points[0][0] + points[1][0]) / 2, z = (points[0][1] + points[1][1]) / 2;
    const pier = { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1, minY: 0, maxY: 5.9 };
    const source = network.buildRoadNetwork([], [pier], { paint: false });
    assert.equal(source.nodes.length, 5);
    const geometry = packTrafficTopology(source, roads), payload = await encodeGeometry(geometry);
    geometry.dispose();
    const obstacleVersion = await trafficObstacleVersion([pier]);
    let disposed = 0;
    const assets = loadModule(readFileSync(new URL('../js/kazan-traffic-assets.js', import.meta.url), 'utf8'), {
      imports: { './kazan-runtime.js': runtime, './kazan-config.js': config,
        './traffic-obstacles.js': { trafficObstacleVersion }, './traffic-topology.js': { unpackTrafficTopology },
        './prepared-world.js': { async loadPreparedWorld() { return {
          entries: [{ system: 'traffic', obstacleVersion }], async loadGeometry() {
            const result = await decodeGeometry(payload); result.addEventListener('dispose', () => disposed++); return result;
          }
        }; } } }, globals: { console: { warn() {} } }
    });
    await assets.prepareTraffic();
    const topology = await runtime.services.trafficAssets.take([pier]);
    const restored = network.buildRoadNetwork([], [pier], { paint: false, topology });
    assert.equal(disposed, 1, 'transport buffers are released after restoring live records');
    assert.ok(restored.nodes.some((node) => Object.is(node.x, points[0][0])), 'mapped coordinates retain precision beyond Float32');
    assert.equal(restored.isRoadClear(x, z, 0.15, roads[0]), true, 'a pier below the deck leaves the traffic lane clear');
    assert.ok(restored.edges.some((edge) => edge.road === roads[0]), 'restored lanes retain the actual mapped road identity');
    let edge = restored.edges[0], lane = 0;
    const visited = new Set(), p = {};
    for (let step = 0; step < 25; step++) {
      visited.add(edge.from.id);
      const move = edge.moves.find((move) => move.out[lane] >= 0);
      assert.ok(move, 'every restored lane keeps a traversable outgoing turn');
      assert.ok(edge.to.in.includes(edge) && edge.to.out.includes(move.to), 'junction links share the live edge objects');
      const nextLane = move.out[lane], curve = restored.connector(edge, lane, move.to, nextLane);
      restored.curvePoint(curve, curve.len, p);
      assert.ok(Math.abs(p.x - move.to.sx - move.to.rx * move.to.lanes[nextLane]) < 1e-4);
      assert.ok(Math.abs(p.z - move.to.sz - move.to.rz * move.to.lanes[nextLane]) < 1e-4);
      edge = move.to; lane = nextLane;
    }
    assert.equal(visited.size, 5, 'traffic can repeatedly complete the entire mapped loop');
    await assets.prepareTraffic();
    const changed = [{ ...pier, minY: 7, maxY: 12 }];
    assert.equal(await runtime.services.trafficAssets.take(changed), null, 'changed obstacles select live regeneration');
    const fallback = network.buildRoadNetwork([], changed, { paint: false });
    assert.ok(fallback.edges.every((edge) => edge.road !== roads[0]), 'the regenerated graph closes the actually obstructed deck');
    assert.equal(disposed, 2);
  });
});
