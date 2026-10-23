const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { gunzipSync } = require('node:zlib');
const { join } = require('node:path');
const { describe, test } = require('node:test');
const vm = require('node:vm');

function loadCity() {
  const root = join(__dirname, '..');
  const data = JSON.parse(gunzipSync(readFileSync(join(root, 'js/kazan-geodata.json.gz'))));
  const context = vm.createContext({ window: { NYC: { GEO: data, DEBUG_ROADS: false } } });
  vm.runInContext(readFileSync(process.env.ROAD_SURFACE_TEST_SOURCE || join(root, 'js/kazan-config.js'), 'utf8'), context);
  vm.runInContext(readFileSync(process.env.ROAD_NETWORK_TEST_SOURCE || join(root, 'js/road-network.js'), 'utf8'), context);
  return context.window.NYC;
}

function distanceToRoad(road, x, z) {
  let distance = Infinity;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return distance;
}

const city = loadCity();

describe('Grade separated mapped traffic', () => {
  test('a pier below the deck keeps its upper lanes open, while an obstacle on the deck blocks them', () => {
    const corners = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const roads = corners.map((p, i) => ({ id: i, kind: 'primary', bridge: true, layer: 1 }));
    const context = vm.createContext({ window: { NYC: {
      ALL_AVENUES: [], ALL_STREETS: [], AVENUES: [], STREETS: [], BLOCKS: [], ROADS: roads, DEBUG_ROADS: false,
      ISLAND_BOUNDS: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
      getIslandBoundsAtZ: () => ({ westX: -1000, eastX: 1000 }), terrainHeight: () => 0, roadHeight: () => 7,
      GEO: { roadGraph: { nodes: corners.flat(), names: ['Mapped viaduct'],
        links: corners.map((p, i) => [i, (i + 1) % 4, 0, 7.6, 2, 1, [], i]) } }
    } } });
    vm.runInContext(readFileSync(process.env.ROAD_NETWORK_TEST_SOURCE || join(__dirname, '../js/road-network.js'), 'utf8'), context);
    const pier = { minX: 48, maxX: 52, minZ: -3, maxZ: 3, minY: 0, maxY: 5.9 };
    const clear = context.window.NYC.buildRoadNetwork([], [pier]);
    assert.equal(clear.edges.filter((e) => e.road === roads[0]).length, 1, 'the column ends below the driving surface');
    assert.ok(clear.edges.every((e) => e.moves.length > 0), 'traffic can complete the mapped loop');
    const blocked = context.window.NYC.buildRoadNetwork([], [{ ...pier, minY: 7, maxY: 12 }]);
    assert.equal(blocked.edges.filter((e) => e.road === roads[0]).length, 0, 'a real obstruction at road level still closes the lanes');
  });

  test('both directions of Millennium and the Amirkhan overpasses remain drivable within their decks', () => {
    const network = city.buildRoadNetwork([], []);
    for (const id of [80229117, 137124583, 90635148, 90635156, 123956265, 123956267]) {
      const road = city.ROADS.find((r) => r.id === id);
      const edges = network.edges.filter((e) => e.span > 25 && distanceToRoad(road, e.from.x, e.from.z) < 0.6 && distanceToRoad(road, e.to.x, e.to.z) < 0.6);
      assert.ok(edges.length >= 1, `find the actual carriageway ${id}`);
      let worst = 0;
      for (const e of edges) for (const offset of e.lanes) for (let s = 0; s <= e.len; s += 4) {
        worst = Math.max(worst, distanceToRoad(road, e.sx + e.dx * s + e.rx * offset, e.sz + e.dz * s + e.rz * offset));
      }
      assert.ok(worst < road.w / 2 - 1.2, `${id}: vehicle centre strays ${worst.toFixed(2)} m from a ${road.w} m carriageway`);
    }
  });

  test('ground traffic stays below each overpass while traffic already on its deck stays above', () => {
    for (const id of [80229117, 90635148, 123956265]) {
      const road = city.ROADS.find((r) => r.id === id);
      const half = road.length / 2;
      let i = 1;
      while (road.distances[i] < half) i++;
      const a = road.pts[i - 1], b = road.pts[i];
      const t = (half - road.distances[i - 1]) / (road.distances[i] - road.distances[i - 1]);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const ground = city.terrainHeight(x, z), deck = city.surfaceHeight(x, z);
      assert.ok(deck - ground > 4, `${id} has clearance for lower-level traffic`);
      assert.ok(Math.abs(city.surfaceHeight(x, z, ground) - ground) < 0.001, `${id}: the lower road must not jump onto the overpass`);
      assert.ok(Math.abs(city.surfaceHeight(x, z, deck) - deck) < 0.001, `${id}: keep an upper-road vehicle on its own deck`);
    }
  });

  test('ordinary roads and their traffic follow the visible terrain facet on a hill', () => {
    const road = city.ROADS.find((r) => r.id === 1455103684);
    const x = 6407.386315404484, z = 8503.722923831174;
    const a = { x: 6420, z: 8490 }, b = { x: 6390, z: 8520 }, c = { x: 6420, z: 8520 };
    const u = (x - b.x) / 30, v = (z - a.z) / 30;
    const ground = city.terrainHeight(c.x, c.z) * (u + v - 1) +
      city.terrainHeight(a.x, a.z) * (1 - v) + city.terrainHeight(b.x, b.z) * (1 - u) - 0.03;
    const drivingSurface = city.roadHeight(road, x, z) + 0.065;
    assert.ok(drivingSurface > ground && drivingSurface - ground < 0.12,
      `asphalt and tyres must sit on the rendered DEM triangle, not ${Number(ground - drivingSurface).toFixed(3)} m beneath it`);
  });

  test('Amirkhan tunnels and Pobedy turning ramps join their approaches without a vertical step', () => {
    const graph = city.GEO.roadGraph;
    for (const id of [188432053, 223301193, 138463348, 145401446]) {
      const roadIndex = city.ROADS.findIndex((r) => r.id === id);
      assert.ok(roadIndex >= 0, `${id}: retain the mapped drivable segment`);
      const road = city.ROADS[roadIndex];
      const links = graph.links.filter((link) => link[7] === roadIndex);
      assert.ok(links.length, `${id}: the road remains in the traffic graph`);
      const portals = [links[0][0], links.at(-1)[1]];
      for (const node of portals) {
        const x = graph.nodes[node * 2], z = graph.nodes[node * 2 + 1];
        const approaches = graph.links.filter((link) => link[7] !== roadIndex && (link[0] === node || link[1] === node));
        assert.ok(approaches.length, `${id}: connect the portal to an approach`);
        for (const link of approaches) {
          const other = city.ROADS[link[7]];
          assert.ok(Math.abs(city.roadHeight(road, x, z) - city.roadHeight(other, x, z)) < 0.25,
            `${id} and ${other.id}: connected road surfaces must meet at the portal`);
        }
      }
      if (road.tunnel) {
        const p = road.pts[Math.floor(road.pts.length / 2)];
        assert.ok(city.terrainHeight(p.x, p.z) - city.roadHeight(road, p.x, p.z) > 5, 'the tunnel runs below the terrain roof');
      }
    }
  });
});
