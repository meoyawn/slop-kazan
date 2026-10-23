import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import { createParkingIndex, splitParkingAccess } from '../tools/kazan-parking.mjs';

describe('Parking and street traffic', () => {
  test('service access is split at lot and island boundaries while public streets remain connected', () => {
    const index = createParkingIndex([{ rings: [[0, 0, 40, 0, 40, 20, 0, 20]], holes: [[15, 5, 25, 5, 25, 15, 15, 15]] }]);
    const road = { id: 1, pts: [[-10, 10], [50, 10]], nodes: [100, 101], service: true };
    const pieces = splitParkingAccess(road, index);
    assert.deepEqual(pieces.map((p) => [p.pts[0][0], p.pts.at(-1)[0], p.parking]),
      [[-10, 0, false], [0, 15, true], [15, 25, false], [25, 40, true], [40, 50, false]]);
    assert.equal(pieces[0].nodes[0], 100);
    assert.equal(pieces.at(-1).nodes.at(-1), 101);
    for (let i = 1; i < pieces.length; i++) assert.equal(pieces[i - 1].nodes.at(-1), pieces[i].nodes[0], 'share the actual boundary endpoint');
    assert.deepEqual(splitParkingAccess({ ...road, service: false }, index), [{ pts: road.pts, nodes: road.nodes, parking: false }]);
    assert.equal(splitParkingAccess({ ...road, pts: [[70, 10], [90, 10]], parkingAisle: true }, index)[0].parking, true, 'an explicitly tagged aisle needs no enclosing lot to leave ambient traffic');
  });

  test('the real Park House forecourt is absent from the driving graph while Yamasheva remains usable', () => {
    const data = JSON.parse(gunzipSync(readFileSync(process.env.PARKING_TEST_GEODATA || new URL('../js/kazan-geodata.json.gz', import.meta.url))));
    const raw = JSON.parse(gunzipSync(readFileSync(new URL('../tools/data/kazan-osm.json.gz', import.meta.url))));
    const source = raw.elements.find((e) => e.type === 'way' && e.id === 70910358);
    assert.equal(source.tags.amenity, 'parking', 'the independent OSM source identifies the forecourt as a lot');
    const { origin, kx, kz } = data.frame;
    const polygon = source.geometry.map((p) => [(p.lon - origin.lon) * kx, (origin.lat - p.lat) * kz]);
    function inside(x, z) {
      let result = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
      }
      return result;
    }
    let inParking = 0, avenue = 0;
    const graph = data.roadGraph;
    for (const [a, b, name, , , , middle] of graph.links) {
      const points = [graph.nodes[a * 2], graph.nodes[a * 2 + 1], ...middle, graph.nodes[b * 2], graph.nodes[b * 2 + 1]];
      if (/Yamashev/.test(graph.names[name])) avenue++;
      for (let i = 2; i < points.length; i += 2) {
        if (Math.max(points[i - 2], points[i]) < 427 || Math.min(points[i - 2], points[i]) > 790 || Math.max(points[i - 1], points[i + 1]) < -4484 || Math.min(points[i - 1], points[i + 1]) > -4172) continue;
        const length = Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
        for (let s = 2; s < length - 2; s += 2) {
          const x = points[i - 2] + (points[i] - points[i - 2]) * s / length, z = points[i - 1] + (points[i + 1] - points[i - 1]) * s / length;
          if (inside(x, z)) inParking++;
        }
      }
    }
    assert.equal(inParking, 0, 'ambient routes must not cross this parking forecourt');
    assert.ok(avenue > 10, 'retain the public avenue around the mall');
  });
});
