import { runCityModule } from './helpers/module.js';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, describe } from 'node:test';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';

const root = join(import.meta.dirname, '..');
const context = vm.createContext({ window: { NYC: { GEO: JSON.parse(gunzipSync(readFileSync(join(root, 'js/kazan-geodata.json.gz')))) } } });
for (const file of ['js/kazan-config.js', 'js/controllers.js']) {
  runCityModule(readFileSync(join(root, file), 'utf8'), context);
}
const city = context.window.NYC;

describe('Kazan geographic accuracy', () => {
  test('mapped trams preserve directed routes, stops and distinct reserved/embedded beds on Yamasheva', () => {
    const trams = city.GEO.trams;
    assert.ok(trams?.tracks.length >= 180, 'import tram tracks independently of heavy rail');
    assert.ok(trams.routes.length >= 16);
    assert.ok(!trams.platforms.some((p) => p.id === 613235441), 'the mapped train-only platform by the central station does not become a tram platform by proximity');
    const railIds = new Set(city.GEO.railways.tracks.map((t) => t.id));
    for (const track of trams.tracks) {
      assert.ok(!railIds.has(track.id));
      assert.equal(track.kind, 'tram');
      assert.ok(track.gauge[0] >= 1500 && track.gauge[0] < 1600);
    }
    for (const route of trams.routes) {
      assert.equal(route.gaps.length, 0, `${route.name} keeps mapped track continuity`);
      assert.equal(route.missingWays.length, 0);
      assert.ok(route.stops.length >= 6);
      for (let i = 1; i < route.parts.length; i++) {
        const before = trams.tracks[route.parts[i - 1].track], after = trams.tracks[route.parts[i].track];
        assert.equal(before.nodes.at(-1), after.nodes[0]);
        assert.notEqual(after.direction, -1, 'route membership respects the mapped one-way direction');
      }
    }
    const yamashevaZ = (city.GEO.frame.origin.lat - 55.828) * city.GEO.frame.kz;
    const yamashevaX = (49.132 - city.GEO.frame.origin.lon) * city.GEO.frame.kx;
    assert.ok(trams.tracks.some((t) => t.pts.some((n, i) => i % 2 === 0 && Math.hypot(n - yamashevaX, t.pts[i + 1] - yamashevaZ) < 550) && t.bedSpans.some((s) => s.bed === 'reserved')), 'retain the reserved Yamasheva median');
    assert.ok(trams.tracks.some((t) => t.bedSpans.some((s) => s.bed === 'embedded' && s.roadId)), 'keep street-running and crossing rails in mapped road pavement');
  });

  test('rail junction heights stay continuous and mapped tunnels retain open portals and covered interiors', () => {
    const railContext = vm.createContext({ window: { NYC: { GEO: city.GEO } } });
    runCityModule(readFileSync(join(root, 'js/kazan-config.js'), 'utf8'), railContext);
    railContext.NYC = railContext.window.NYC;
    runCityModule(readFileSync(join(root, 'js/kazan-railways.js'), 'utf8'), railContext);
    const rail = railContext.window.NYC, heights = new Map();
    for (const t of rail.RAIL_TRACKS) for (let i = 0; i < t.nodes.length; i++) {
      const p = rail.trackPoint(t, t.distances[i]), node = t.nodes[i];
      assert.ok(Number.isFinite(p.y));
      if (heights.has(node)) assert.ok(Math.abs(p.y - heights.get(node)) < 0.001, 'connected rails meet at the same height');
      heights.set(node, p.y);
    }
    const tramPaths = rail.createRailwayPaths(city.GEO.trams), tramHeights = new Map();
    for (const t of tramPaths.tracks) for (let i = 0; i < t.nodes.length; i++) {
      const p = tramPaths.trackPoint(t, t.distances[i]), node = t.nodes[i];
      if (tramHeights.has(node)) assert.ok(Math.abs(p.y - tramHeights.get(node)) < 0.001, `tram way/${t.id} meets its connected approach`);
      tramHeights.set(node, p.y);
    }
    railContext.NYC = rail;
    runCityModule(readFileSync(join(root, 'js/kazan-trams.js'), 'utf8'), railContext);
    const tram = railContext.window.NYC;
    assert.ok(tram.TRAM_UNDERPASSES.length > 0);
    for (const group of tram.TRAM_UNDERPASSES) {
      const heights = group.roadIds.map((id) => {
        const road = tram.ROADS.find((r) => r.id === id);
        return tram.roadHeight(road, group.x, group.z);
      });
      for (const id of group.tracks) {
        const track = tramPaths.tracks.find((t) => t.id === id), p = tramPaths.trackPoint(track, track.length / 2);
        heights.push(p.y);
      }
      assert.ok(Math.max(...heights) - Math.min(...heights) < 0.5, 'co-located tram and road lanes share the same underpass level');
    }
    const embeddedTrack = tramPaths.tracks.find((t) => t.id === 241532218);
    const embeddedSpan = embeddedTrack.bedSpans.find((s) => s.bed === 'embedded' && s.end - s.start > 30);
    const embeddedPoint = tramPaths.trackPoint(embeddedTrack, (embeddedSpan.start + embeddedSpan.end) / 2);
    assert.ok(Math.abs(tram.groundMeshHeight(embeddedPoint.x, embeddedPoint.z) - tram.groundSurfaceHeight(embeddedPoint.x, embeddedPoint.z)) < 0.1,
      'embedded tracks preserve the road surface without recursively excavating it');
    for (const track of tramPaths.tracks.filter((t) => t.tunnel)) for (const s of [0, track.length]) {
      const p = tramPaths.trackPoint(track, s);
      assert.ok(tram.groundMeshHeight(p.x, p.z) <= p.y + 0.33, `tram tunnel way/${track.id} keeps the rail head clear at its entrance`);
    }
    const tunnel = rail.RAIL_TRACKS.find((t) => t.id === 41729835);
    assert.ok(tunnel?.tunnel && tunnel.layer === -1, 'retain the mapped rail tunnel');
    for (const s of [0, tunnel.length]) {
      const p = rail.trackPoint(tunnel, s);
      assert.ok(rail.groundMeshHeight(p.x, p.z) <= p.y, 'terrain opens at the portal instead of burying the entrance');
      assert.ok(rail.groundSurfaceHeight(p.x, p.z) - p.y > 4, 'the track runs below the surface');
    }
    const mid = rail.trackPoint(tunnel, tunnel.length / 2);
    assert.ok(rail.groundMeshHeight(mid.x, mid.z) > mid.y + 4, 'retain the ground above the covered interior');
    assert.equal(rail.railwayAt(mid.x, mid.z), null, 'tunnels do not clear trees from their roof');
  });

  test('heavy rail retains mapped junction topology and operational tags independently of motor traffic', () => {
    const railway = city.GEO.railways;
    assert.ok(railway?.tracks.length > 900, 'import the regional railway, not only station footprints');
    const source = JSON.parse(gunzipSync(readFileSync(join(root, 'tools/data/kazan-osm.json.gz'))));
    const originals = new Map(source.elements.filter((e) => e.type === 'way' && ['rail', 'narrow_gauge'].includes(e.tags?.railway)).map((e) => [e.id, e]));
    const motorIds = new Set(city.GEO.roads.filter((r) => !r.walk).map((r) => r.id));
    for (const track of railway.tracks) {
      const e = originals.get(track.id), t = e.tags;
      assert.ok(!motorIds.has(track.id), `rail way/${track.id} stays out of the road graph`);
      assert.equal(track.electrified, t.electrified || 'unknown');
      assert.equal(track.layer, Number(t.layer) || 0);
      assert.equal(track.tracks, Number(t.tracks) || 1);
      if (t.gauge) assert.deepEqual(Array.from(track.gauge), t.gauge.split(';').map(Number));
      for (let i = 0; i < track.nodes.length; i++) {
        const node = railway.graph.nodes[track.nodes[i]];
        assert.equal(node.x, track.pts[i * 2]);
        assert.equal(node.z, track.pts[i * 2 + 1]);
        if (typeof node.id === 'number') assert.ok(e.nodes.includes(node.id), 'join on mapped node identity');
      }
    }
    const adjacency = new Map();
    for (const link of railway.graph.links) {
      for (const [a, b] of [[link.a, link.b], [link.b, link.a]]) {
        if (!adjacency.has(a)) adjacency.set(a, []);
        adjacency.get(a).push(b);
      }
    }
    const central = railway.stations.find((s) => s.name === 'Казань-Пассажирская');
    const northern = railway.stations.find((s) => s.name === 'Восстание-Пассажирская');
    const airport = railway.stations.find((s) => s.name === 'Аэропорт Казань');
    assert.ok(central && northern && airport, 'retain both main stations and the airport branch');
    const seen = new Set(railway.tracks[central.track].nodes), pending = [...seen];
    for (let i = 0; i < pending.length; i++) for (const next of adjacency.get(pending[i]) || []) {
      if (!seen.has(next)) { seen.add(next); pending.push(next); }
    }
    for (const station of [northern, airport]) assert.ok(railway.tracks[station.track].nodes.some((n) => seen.has(n)), `${station.name} connects through mapped junctions`);
    assert.ok(railway.tracks.some((t) => t.service === 'siding'));
    assert.ok(railway.tracks.some((t) => t.service === 'yard'));
    assert.ok(railway.tracks.some((t) => t.bridge));
    const forestCorridor = railway.tracks.find((t) => t.id === 1320493492);
    assert.ok(forestCorridor?.nodes.some((n) => seen.has(n)), 'retain the connected eastern boundary of the Rus-German Switzerland forest');
    assert.ok(railway.platforms.length > 50);
    assert.ok(railway.features.some((f) => f.kind === 'switch' && adjacency.get(f.node)?.length >= 3));
  });

  test('the phone download retains all mapped buildings and roads, destinations and native hill patches', async () => {
    const { mobileGeodata } = await import('../tools/mobile-geodata.mjs');
    const mobile = mobileGeodata(city.GEO);
    const mobileContext = vm.createContext({ window: { NYC: { GEO: mobile } } });
    runCityModule(readFileSync(join(root, 'js/kazan-config.js'), 'utf8'), mobileContext);
    const phone = mobileContext.window.NYC;
    assert.equal(mobile.buildings.length, city.GEO.buildings.length);
    assert.equal(mobile.roads.length, city.GEO.roads.length);
    for (const [id, arrival] of Object.entries(phone.TELEPORT_LOCATIONS)) {
      assert.ok(phone.nearestRoads(arrival.x, arrival.z, 30).length > 0, `${id} remains reachable`);
      assert.equal(phone.waterAt(arrival.x, arrival.z), null);
      assert.equal(phone.buildingAt(arrival.x, arrival.z), null);
    }
    const hill = city.NYC_LANDMARKS.find((l) => l.id === 'zilant');
    assert.ok(Math.abs(phone.terrainHeight(hill.x, hill.z) - city.terrainHeight(hill.x, hill.z)) < 0.02);
    assert.ok(mobile.elevation.elevations.length < city.GEO.elevation.elevations.length / 8);
    assert.ok(JSON.stringify(mobile).length < JSON.stringify(city.GEO).length * 0.7, 'reduce the parsed download by at least 30%');
  });

  test('the regional world contains real buildings and roads at the requested outer districts', () => {
    for (const [name, lon, lat] of [
      ['Aviastroitelny', 49.0935, 55.8642], ['Novaya Tura', 48.8412, 55.8685],
      ['Zelenodolsk industrial park', 48.84294, 55.85289], ['airport', 49.2787, 55.6083],
      ['Samosyrovskoye cemetery', 49.29779, 55.79739], ['M7', 49.146693, 55.9179601]
    ]) {
      const x = (lon - city.GEO.frame.origin.lon) * city.GEO.frame.kx;
      const z = (city.GEO.frame.origin.lat - lat) * city.GEO.frame.kz;
      const bounds = city.GEO.bounds;
      assert.ok(x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ, `${name} is inside the playable map`);
      assert.ok(city.GEO.buildings.some((b) => Math.hypot(b.ring[0] - x, b.ring[1] - z) < 1000), `${name} has imported building geometry`);
      assert.ok(city.nearestRoads(x, z, 1000).length > 0, `${name} has imported roads`);
      assert.ok(Number.isFinite(city.terrainHeight(x, z)), `${name} has terrain`);
    }
    assert.ok(city.GEO.buildings.some((b) => b.id === 949137551), 'retain the mapped industrial park building');
    assert.ok(city.GEO.cemeteries.some((b) => b.id === 84971781), 'retain the actual cemetery boundary');
    assert.ok(city.GEO.airfields.some((b) => b.kind === 'runway'), 'retain the airport runways');
  });

  test('Zilantov Monastery rises above its foot and retains native DEM sample elevations', () => {
    const site = city.NYC_LANDMARKS.find((l) => l.id === 'zilant');
    assert.ok(site, 'include the monastery as a named destination');
    const footZ = (city.GEO.frame.origin.lat - 55.8093) * city.GEO.frame.kz;
    assert.ok(city.terrainHeight(site.x, site.z) - city.terrainHeight(site.x, footZ) > 12, 'retain the hill above the northern foot');
    const patch = city.GEO.elevation.patches.find((p) => p.id === 'zilant');
    const x = patch.x0 + 40 * patch.stepX, z = patch.z0 + 22 * patch.stepZ;
    assert.ok(Math.abs(city.terrainHeight(x, z) - (patch.elevations[22 * patch.cols + 40] / 10 - patch.datum)) < 0.02, 'use the original hill sample instead of a downsampled regional value');
    const cathedral = city.GEO.buildings.find((b) => b.id === 188725744);
    assert.equal(cathedral.h, 34, 'the monastery publishes a 34 m cathedral, overriding the erroneous 3.2 m satellite estimate');
    assert.equal(cathedral.heightSource, 'published-height');
  });

  test('the Kremlin hill rises above the north riverbank and the controller uses that terrain', () => {
    const hill = city.NYC_LANDMARKS.find((l) => l.id === 'kremlin');
    const bank = city.NYC_LANDMARKS.find((l) => l.id === 'family');
    const hillY = city.terrainHeight(hill.x, hill.z), bankY = city.terrainHeight(bank.x, bank.z);
    assert.ok(hillY - bankY > 20, 'preserve the hill above the Kazanka instead of flattening the scene');
    const controller = Object.create(city.ThirdPersonControllerManager.prototype);
    for (const point of [hill, bank]) {
      assert.ok(Math.abs(controller.getGroundHeight(point.x, point.z, 'car') - city.surfaceHeight(point.x, point.z) - 0.07) < 1e-9);
    }
  });

  test('Kul Sharif keeps its mapped minarets above the low building outline', () => {
    const outline = city.GEO.buildings.find((b) => b.id === 230132591 && !b.part);
    assert.equal(outline.h, 8);
    assert.ok(outline.hasParts, 'the outline gives way to its detailed parts');
    const minarets = city.GEO.buildings.filter((b) => [230132595, 230132598, 230132599, 230132600].includes(b.id));
    assert.equal(minarets.length, 4, 'keep all four independently mapped minarets');
    for (const minaret of minarets) {
      assert.equal(minaret.h, 58);
      assert.equal(minaret.heightSource, 'osm-height');
    }
  });

  test('the Volga separates Kazan from the elevated west bank at Verkhniy Uslon', () => {
    const frame = city.GEO.frame;
    function point(lon, lat) {
      return { x: (lon - frame.origin.lon) * frame.kx, z: (frame.origin.lat - lat) * frame.kz };
    }
    const west = point(48.983, 55.770), river = point(49.020, 55.770);
    assert.equal(city.waterAt(west.x, west.z), null);
    assert.ok(city.terrainHeight(west.x, west.z) > 30, 'retain the real opposite-bank hill beyond the detailed city grid');
    assert.ok(city.waterAt(river.x, river.z), 'keep the reservoir between the shores');
    const summit = point(48.9747635, 55.7774089);
    assert.ok(city.terrainHeight(summit.x, summit.z) + 53 > 160 && city.terrainHeight(summit.x, summit.z) + 53 < 170,
      'Sokolka agrees with the independent 164 m SRTM check and mapped 168 m peak');
    const easternHill = point(49.33372691256872, 55.810208732690455);
    assert.ok(easternHill.x < city.GEO.bounds.maxX - 4000, 'the eastern watershed has map coverage beyond its crest');
    assert.ok(city.terrainHeight(easternHill.x, easternHill.z) + 53 > 185, 'retain the approximately 200 m eastern watershed');
  });

  test('every building part has a positive vertical extent, including roof-only parts', () => {
    for (const b of city.GEO.buildings) assert.ok(b.h > b.minHeight, `${b.osmType}/${b.id}: ${b.minHeight}–${b.h} m`);
  });

  test('the TAIF roof pad uses the mapped square and the builder-published 33.5 m total height', () => {
    const pad = city.HELIPADS.find((p) => p.id === 1052138179);
    const building = city.GEO.buildings.find((b) => b.id === 694568818);
    assert.ok(pad, 'import the roof helipad by its stable OSM identity');
    assert.equal(building.h, 33.5);
    assert.equal(building.heightSource, 'published-height');
    assert.equal(pad.building, 'way/694568818');
    const ground = Math.max(...city.toPoints(building.ring).map((p) => city.terrainHeight(p.x, p.z)));
    assert.ok(Math.abs(pad.y - ground - 33.5) < 1e-9, 'the renderer and landing surface share the building foundation');
    assert.equal(city.landingSurfaceAt(pad.x, pad.z, 6.2), pad, 'the model helicopter fits on the deck');
    assert.equal(city.landingSurfaceAt(pad.x + 10, pad.z, 6.2), null, 'reject an approach too close to the edge');
  });

  test('arrivals and movement keep an open courtyard usable while its walls remain solid', () => {
    const controller = Object.create(city.ThirdPersonControllerManager.prototype);
    controller.activeMode = 'car';
    controller.entities = { car: { type: 'car', position: { x: 500, y: 0, z: 505 } } };
    controller.colliders = [{ minX: 480, maxX: 520, minZ: 480, maxZ: 520, minY: -100, maxY: 500,
      obb: { cx: 500, cz: 500, hx: 20, hz: 20, cs: 1, sn: 0 },
      poly: [[480,480],[520,480],[520,520],[512,520],[512,490],[488,490],[488,520],[480,520]].map(([x,z]) => ({x,z})), holes: [] }];
    const arrival = controller.findTeleportPosition(500, 505, 0, 0);
    assert.equal(arrival.x, 500);
    assert.equal(arrival.z, 505);
    const position = { x: 500, z: 505 };
    controller.resolveHorizontalCollision(position, 0.5, 5);
    assert.equal(position.x, 500);
    assert.equal(position.z, 505);
    position.x = 487.8;
    controller.resolveHorizontalCollision(position, 0.5, 5);
    assert.ok(position.x >= 488.49 && position.x < 489, 'push against the actual courtyard wall rather than the outer bounding box');
  });

  test('the Kazan bundle rebuilds offline from saved sources into a path with spaces and Tatar characters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'Казан geography '));
    try {
      const output = join(dir, 'city data.js');
      const result = spawnSync(process.execPath, [join(root, 'tools/build-kazan-geodata.mjs'), output], { encoding: 'utf8', timeout: 30000 });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(gunzipSync(readFileSync(join(dir, 'city data.json.gz'))).toString('utf8'), gunzipSync(readFileSync(join(root, 'js/kazan-geodata.json.gz'))).toString('utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
