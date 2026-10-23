import fs from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';

/** Compile saved OSM geometry into the engine's meter-scale geography and road graph. */
const input = process.env.KAZAN_DATA || fileURLToPath(new URL('data/kazan-osm.json.gz', import.meta.url));
const output = process.argv[2] || fileURLToPath(new URL('../js/kazan-geodata.js', import.meta.url));
const bytes = fs.readFileSync(input);
const source = JSON.parse(input.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8'));
if (!Array.isArray(source.elements) || source.remark) throw new Error(source.remark || 'Incomplete OSM source');
const readExtract = (name) => JSON.parse(gunzipSync(fs.readFileSync(fileURLToPath(new URL(`data/${name}.json.gz`, import.meta.url)))).toString('utf8'));
const terrain = readExtract('kazan-terrain');
const landcover = readExtract('kazan-landcover');
const heightData = readExtract('kazan-heights');
const relief = JSON.parse(fs.readFileSync(fileURLToPath(new URL('data/kazan-relief-sites.json', import.meta.url)), 'utf8'));
const observations = JSON.parse(fs.readFileSync(fileURLToPath(new URL('data/kazan-building-observations.json', import.meta.url)), 'utf8'));
const coverage = JSON.parse(fs.readFileSync(fileURLToPath(new URL('data/kazan-coverage.json', import.meta.url)), 'utf8'));

const origin = { lat: 55.79, lon: 49.108 };
const phi = origin.lat * Math.PI / 180;
const e2 = 6.69437999014e-3;
const divisor = 1 - e2 * Math.sin(phi) ** 2;
const kx = Math.PI / 180 * 6378137 / Math.sqrt(divisor) * Math.cos(phi);
const kz = Math.PI / 180 * 6378137 * (1 - e2) / divisor ** 1.5;
const q = (n) => Math.round(n * 10) / 10;
const toWorld = ({ lon, lat }) => [q((lon - origin.lon) * kx), q((origin.lat - lat) * kz)];
const bounds = { minX: toWorld({ lon: coverage.bounds.west, lat: origin.lat })[0], maxX: toWorld({ lon: coverage.bounds.east, lat: origin.lat })[0],
  minZ: toWorld({ lon: origin.lon, lat: coverage.bounds.north })[1], maxZ: toWorld({ lon: origin.lon, lat: coverage.bounds.south })[1] };
const nearTerrainBounds = { minX: terrain.x0, maxX: terrain.x0 + (terrain.cols - 1) * terrain.step,
  minZ: terrain.z0, maxZ: terrain.z0 + (terrain.rows - 1) * terrain.step };
const terrainBounds = { minX: terrain.far.x0, maxX: terrain.far.x0 + (terrain.far.cols - 1) * terrain.far.step,
  minZ: terrain.far.z0, maxZ: terrain.far.z0 + (terrain.far.rows - 1) * terrain.far.step };
const flat = (ring) => ring.flatMap((p) => p.map(q));
const insideBounds = ([x, z], b = bounds) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

function clipRoad(points, nodeIds, wayId) {
  const pieces = [];
  let current = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], c = points[i], dx = c[0] - a[0], dz = c[1] - a[1];
    let lo = 0, hi = 1;
    for (const [p, distance] of [[-dx, a[0] - bounds.minX], [dx, bounds.maxX - a[0]], [-dz, a[1] - bounds.minZ], [dz, bounds.maxZ - a[1]]]) {
      if (!p) { if (distance < 0) { lo = 1; hi = 0; break; } }
      else if (p < 0) lo = Math.max(lo, distance / p);
      else hi = Math.min(hi, distance / p);
    }
    if (lo >= hi) { current = null; continue; }
    const start = [q(a[0] + dx * lo), q(a[1] + dz * lo)], end = [q(a[0] + dx * hi), q(a[1] + dz * hi)];
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.1) continue;
    if (!current || current.pts.at(-1)[0] !== start[0] || current.pts.at(-1)[1] !== start[1]) {
      current = { pts: [start], nodes: [lo === 0 ? nodeIds[i - 1] : `clip/${wayId}/${i}/start`] };
      pieces.push(current);
    }
    current.pts.push(end);
    current.nodes.push(hi === 1 ? nodeIds[i] : `clip/${wayId}/${i}/end`);
    if (hi < 1) current = null;
  }
  return pieces;
}

function area(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return sum / 2;
}

function simplify(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [a, b] = pending.pop();
    const [ax, az] = points[a], [bx, bz] = points[b];
    const dx = bx - ax, dz = bz - az, d2 = dx * dx + dz * dz;
    let far = epsilon * epsilon, index = -1;
    for (let i = a + 1; i < b; i++) {
      const t = d2 ? Math.max(0, Math.min(1, ((points[i][0] - ax) * dx + (points[i][1] - az) * dz) / d2)) : 0;
      const d = (points[i][0] - ax - t * dx) ** 2 + (points[i][1] - az - t * dz) ** 2;
      if (d > far) { far = d; index = i; }
    }
    if (index >= 0) { keep.add(index); pending.push([a, index], [index, b]); }
  }
  return points.filter((_, i) => keep.has(i));
}

function clipRing(points, b) {
  let ring = points;
  for (const [axis, edge, sign] of [[0, b.minX, 1], [0, b.maxX, -1], [1, b.minZ, 1], [1, b.maxZ, -1]]) {
    const clipped = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], c = ring[i];
      const inA = (a[axis] - edge) * sign >= 0, inC = (c[axis] - edge) * sign >= 0;
      if (inA !== inC) {
        const t = (edge - a[axis]) / (c[axis] - a[axis]);
        clipped.push([q(a[0] + (c[0] - a[0]) * t), q(a[1] + (c[1] - a[1]) * t)]);
      }
      if (inC) clipped.push(c);
    }
    ring = clipped;
  }
  return ring;
}

function closedRing(geometry, box = bounds, epsilon = 0.35) {
  if (!geometry || geometry.length < 4) return [];
  const ring = geometry.map(toWorld);
  if (ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  const clipped = clipRing(ring, box);
  if (clipped.length < 3) return [];
  const half = Math.floor(clipped.length / 2);
  return simplify(clipped.slice(0, half + 1), epsilon).slice(0, -1)
    .concat(simplify(clipped.slice(half).concat([clipped[0]]), epsilon).slice(0, -1));
}

function joinMembers(members, role) {
  const parts = members.filter((m) => m.type === 'way' && (m.role || 'outer') === role && m.geometry?.length > 1)
    .map((m) => m.geometry.slice());
  const rings = [];
  function same(a, b) { return a.lat === b.lat && a.lon === b.lon; }
  while (parts.length) {
    let ring = parts.pop();
    while (!same(ring[0], ring.at(-1))) {
      const i = parts.findIndex((p) => same(p[0], ring.at(-1)) || same(p.at(-1), ring.at(-1)));
      if (i < 0) break;
      const next = parts.splice(i, 1)[0];
      if (!same(next[0], ring.at(-1))) next.reverse();
      ring = ring.concat(next.slice(1));
    }
    if (same(ring[0], ring.at(-1))) rings.push(ring);
    else throw new Error(`Unclosed ${role} multipolygon member chain`);
  }
  return rings;
}

const transliteration = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function displayName(tags, fallback = '') {
  if (tags['name:en']) return tags['name:en'];
  return (tags.name || fallback).replace(/улица /g, '').replace(/проспект /g, '').replace(/ набережная/g, ' Embankment')
    .replace(/[А-Яа-яЁё]/g, (c) => c === c.toUpperCase() ? (transliteration[c.toLowerCase()] || c).replace(/^./, (v) => v.toUpperCase()) : transliteration[c] || c);
}

const roads = [];
const drivable = [];
const highwayWidths = { motorway: 12, motorway_link: 6, trunk: 11, trunk_link: 6, primary: 15, primary_link: 7.2, secondary: 12, secondary_link: 7.2, tertiary: 10,
  tertiary_link: 7.2, residential: 7.2, unclassified: 7.2, living_street: 6, service: 5 };
const pathTypes = new Set(['pedestrian', 'footway', 'cycleway', 'path']);
for (const e of source.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry || !t.highway || t.area === 'yes' || t.indoor === 'yes' || t.tunnel === 'yes') continue;
  const vehicle = t.highway in highwayWidths && t.access !== 'private' && t.access !== 'no' &&
    t.motor_vehicle !== 'no' && t.vehicle !== 'no';
  const walk = pathTypes.has(t.highway) || (!vehicle && t.highway === 'service');
  if (!vehicle && !walk) continue;
  const pieces = clipRoad(e.geometry.map(toWorld), e.nodes, e.id);
  if (!pieces.length) continue;
  const lanes = Math.max(1, Math.min(6, parseInt(t.lanes, 10) || (t.oneway === 'yes' ? 2 : 2)));
  const w = Math.max(walk ? 1.5 : 5.5, Math.min(30, parseFloat(t.width) || (walk ? (t.highway === 'pedestrian' ? 12 : 2.5) : Math.max(highwayWidths[t.highway], lanes * 3.2))));
  const dir = t.oneway === '-1' ? -1 : t.oneway === 'yes' || t.junction === 'roundabout' ? 1 : 0;
  for (const { pts, nodes } of pieces) {
    roads.push({ id: e.id, name: displayName(t, walk ? 'Path' : 'Local street'), localName: t.name || '',
      w: q(w), lanes, dir, highway: /^(motorway|trunk|primary)$/.test(t.highway), ref: t.ref || undefined, bridge: t.bridge === 'yes', walk,
      pts: flat(simplify(pts, 0.35)) });
    if (vehicle) drivable.push({ e: { ...e, nodes }, pts, w: q(w), lanes, dir, name: displayName(t, 'Local street') });
  }
}

const uses = new Map();
for (const { e } of drivable) for (const id of new Set(e.nodes)) uses.set(id, (uses.get(id) || 0) + 1);
const graphNodes = [], graphLinks = [], names = [];
const nodeIds = new Map(), nameIds = new Map();
function graphNode(id, point) {
  if (!nodeIds.has(id)) { nodeIds.set(id, graphNodes.length / 2); graphNodes.push(...point); }
  return nodeIds.get(id);
}
for (const { e, pts, w, lanes, dir, name } of drivable) {
  if (!nameIds.has(name)) { nameIds.set(name, names.length); names.push(name); }
  let start = 0;
  for (let i = 1; i < e.nodes.length; i++) {
    if (i !== e.nodes.length - 1 && uses.get(e.nodes[i]) < 2 && !(e.nodes[0] === e.nodes.at(-1) && i === Math.floor(e.nodes.length / 2))) continue;
    const a = graphNode(e.nodes[start], pts[start]), b = graphNode(e.nodes[i], pts[i]);
    if (a !== b) graphLinks.push([a, b, nameIds.get(name), w, lanes, dir, flat(simplify(pts.slice(start, i + 1), 0.35).slice(1, -1))]);
    start = i;
  }
}

const water = [], parks = [], buildings = [], walls = [], forests = [], cemeteries = [], airfields = [];
const waterRelations = source.elements.filter((e) => e.type === 'relation' && e.tags?.natural === 'water');
const waterMembers = new Set(waterRelations.flatMap((e) => e.members.filter((m) => m.type === 'way').map((m) => m.ref)));
for (const e of waterRelations) {
  const outer = joinMembers(e.members, 'outer').map((g) => closedRing(g, terrainBounds, 1.2)).filter((r) => r.length > 2 && Math.abs(area(r)) > 300);
  const inner = joinMembers(e.members, 'inner').map((g) => closedRing(g, terrainBounds, 1.2)).filter((r) => r.length > 2);
  if (outer.length) water.push({ id: e.id, name: displayName(e.tags), rings: outer.map(flat), holes: inner.map(flat) });
}
for (const e of source.elements) {
  if (e.type !== 'way' || !e.geometry) continue;
  const t = e.tags || {};
  if (t.natural === 'water' && !waterMembers.has(e.id)) {
    const r = closedRing(e.geometry, terrainBounds, 1.2);
    if (r.length > 2 && Math.abs(area(r)) > 300) water.push({ id: e.id, name: displayName(t), rings: [flat(r)], holes: [] });
  }
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass') {
    const r = closedRing(e.geometry, bounds, 0.8);
    if (r.length > 2 && Math.abs(area(r)) > 500) parks.push({ id: e.id, name: displayName(t, 'Garden'), rings: [flat(r)] });
  }
  if (t.historic === 'citywalls') walls.push({ id: e.id, pts: flat(e.geometry.map(toWorld)) });
  if (t.landuse === 'forest' || t.natural === 'wood' || t.landuse === 'cemetery' || t.aeroway === 'apron') {
    const r = closedRing(e.geometry, bounds, 0.8);
    const list = t.aeroway ? airfields : t.landuse === 'cemetery' ? cemeteries : forests;
    if (r.length > 2 && Math.abs(area(r)) > 500) list.push({ id: e.id, name: displayName(t), kind: t.aeroway || t.landuse || t.natural, rings: [flat(r)], holes: [] });
  }
  if (/^(runway|taxiway)$/.test(t.aeroway)) airfields.push({ id: e.id, name: displayName(t, t.aeroway), kind: t.aeroway,
    w: q(parseFloat(t.width) || (t.aeroway === 'runway' ? 45 : 18)), pts: flat(e.geometry.map(toWorld)) });
}

function measure(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n * (/ft|feet|'/.test(String(value)) ? 0.3048 : 1) : 0;
}

for (const e of source.elements) {
  const t = e.tags || {};
  if ((!t.building && !t['building:part']) || t.building === 'no') continue;
  const rings = e.type === 'way' ? [closedRing(e.geometry)] : joinMembers(e.members || [], 'outer').map((r) => closedRing(r));
  const holes = e.type === 'relation' ? joinMembers(e.members || [], 'inner').map((r) => closedRing(r)).filter((r) => r.length > 2) : [];
  const heightTag = measure(t.height), levels = measure(t['building:levels']);
  const roofHeight = measure(t['roof:height']) || measure(t['roof:levels']) * 3;
  const gba = heightData.heights[`${e.type}/${e.id}`] || 0;
  const observed = observations.buildings[`${e.type}/${e.id}`];
  const kind = t.building || t['building:part'];
  const fallback = /garage|shed|service|roof/.test(kind) ? 3 : /house|detached/.test(kind) ? 6 : /church|mosque/.test(kind) ? 16 : 12;
  const minHeight = measure(t.min_height) || measure(t['building:min_level']) * 3;
  let h = heightTag || observed?.height || observed?.heightEstimate || (levels ? levels * 3 + roofHeight : 0) || gba || fallback;
  let heightSource = heightTag ? 'osm-height' : observed?.height ? 'published-height' : observed?.heightEstimate ? 'reviewed-estimate' : levels ? 'osm-levels' : gba ? 'gba' : 'fallback';
  const heightIssue = h <= minHeight ? 'mapped minimum exceeds available total height' : '';
  if (heightIssue) {
    h = minHeight + (roofHeight || (/pyramidal|gabled|hipped/.test(t['roof:shape']) ? 3 : Math.max(1, Math.min(6, gba || fallback))));
    heightSource = 'fallback-part';
  }
  for (const r of rings) {
    if (r.length < 3 || Math.abs(area(r)) < 3) continue;
    buildings.push({ id: e.id, osmType: e.type, name: displayName(t) || observed?.name || '', localName: t.name || observed?.name || '', kind,
      part: !!t['building:part'] && t['building:part'] !== 'no', h: q(Math.max(1, Math.min(220, h))), minHeight: q(minHeight),
      heightSource, heightEvidence: observed?.source, model: observed?.model, heightIssue: heightIssue || undefined, towerType: t['tower:type'] || undefined,
      levels: levels || null, roofShape: t['roof:shape'] || 'flat', roofHeight: q(roofHeight),
      material: t['building:material'] || observed?.material || '', colour: observed?.appearance?.wallColour || t['building:colour'] || t.colour || observed?.colour || '',
      appearance: observed?.appearance, colourSource: observed?.appearance ? 'reviewed-photograph' : undefined,
      mappedColour: observed?.appearance ? t['building:colour'] || t.colour || undefined : undefined, roofMaterial: t['roof:material'] || '',
      roofColour: t['roof:colour'] || observed?.roofColour || '', ring: flat(r), holes: holes.map(flat), hasParts: false });
  }
}

function contains(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > z) !== (ring[j + 1] > z) && x < (ring[j] - ring[i]) * (z - ring[i + 1]) / (ring[j + 1] - ring[i + 1]) + ring[i]) inside = !inside;
  }
  return inside;
}

const buildingCells = new Map();
for (const b of buildings.filter((b) => !b.part)) {
  const xs = b.ring.filter((_, i) => i % 2 === 0), zs = b.ring.filter((_, i) => i % 2 === 1);
  for (let x = Math.floor(Math.min(...xs) / 128); x <= Math.floor(Math.max(...xs) / 128); x++) {
    for (let z = Math.floor(Math.min(...zs) / 128); z <= Math.floor(Math.max(...zs) / 128); z++) {
      const key = `${x},${z}`;
      if (!buildingCells.has(key)) buildingCells.set(key, []);
      buildingCells.get(key).push(b);
    }
  }
}
for (const p of buildings.filter((b) => b.part)) {
  const n = p.ring.length / 2;
  const x = p.ring.filter((_, i) => i % 2 === 0).reduce((sum, v) => sum + v, 0) / n;
  const z = p.ring.filter((_, i) => i % 2 === 1).reduce((sum, v) => sum + v, 0) / n;
  for (const b of buildingCells.get(`${Math.floor(x / 128)},${Math.floor(z / 128)}`) || []) {
    if (contains(b.ring, x, z)) {
      b.hasParts = true;
      p.parent = `${b.osmType}/${b.id}`;
    }
  }
}

const buildingById = new Map(buildings.map((b) => [`${b.osmType}/${b.id}`, b]));
const helipads = [];
for (const e of source.elements.filter((e) => e.type === 'way' && e.tags?.aeroway === 'helipad')) {
  const ring = closedRing(e.geometry);
  if (ring.length < 3) continue;
  const x = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const z = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const parent = buildings.filter((b) => !b.part && contains(b.ring, x, z)).sort((a, b) => b.h - a.h)[0];
  const onRoof = e.tags.location === 'roof';
  const appearance = observations.helipads?.[`way/${e.id}`];
  if (onRoof && !parent) continue;
  helipads.push({ id: e.id, name: e.tags.name || (e.id === 1052138179 ? 'ТАИФ · вертолётная площадка' : 'Вертолётная площадка'),
    ring: flat(ring), x: q(x), z: q(z), onRoof, building: onRoof ? `${parent.osmType}/${parent.id}` : undefined,
    height: onRoof ? parent.h : 0.1, heightSource: onRoof ? parent.heightSource : 'terrain', source: `https://www.openstreetmap.org/way/${e.id}`,
    colour: appearance?.colour, markingColour: appearance?.markingColour });
}
for (const p of buildings.filter((b) => b.parent)) {
  const parent = buildingById.get(p.parent);
  p.material ||= parent.material;
  if (!p.appearance && parent.appearance && !/glass/.test(p.material)) {
    p.appearance = parent.appearance;
    p.mappedColour = p.colour || undefined;
    p.colour = parent.appearance.wallColour;
    p.colourSource = 'reviewed-photograph';
  } else if (!/glass/.test(p.material)) p.colour ||= parent.colour;
}

for (const e of source.elements.filter((e) => e.type === 'relation' && /^(park|garden)$/.test(e.tags?.leisure))) {
  const rings = joinMembers(e.members, 'outer').map((r) => closedRing(r, bounds, 0.8)).filter((r) => r.length > 2 && Math.abs(area(r)) > 500);
  if (rings.length) parks.push({ id: e.id, name: displayName(e.tags, 'Garden'), rings: rings.map(flat) });
}
for (const e of source.elements.filter((e) => e.type === 'relation' && (e.tags?.landuse === 'forest' || e.tags?.natural === 'wood' || e.tags?.landuse === 'cemetery'))) {
  const rings = joinMembers(e.members, 'outer').map((r) => closedRing(r, bounds, 0.8)).filter((r) => r.length > 2 && Math.abs(area(r)) > 500);
  const holes = joinMembers(e.members, 'inner').map((r) => closedRing(r, bounds, 0.8)).filter((r) => r.length > 2);
  if (rings.length) (e.tags.landuse === 'cemetery' ? cemeteries : forests).push({ id: e.id, name: displayName(e.tags), rings: rings.map(flat), holes: holes.map(flat) });
}

const landmarkSpecs = [
  ['kulsharif', 'Kul Sharif Mosque', 'Kul Sharif', 230132591, 'Kazan Kremlin', 58],
  ['suyumbike', 'Suyumbike Tower', 'Suyumbike', 228963085, 'Kazan Kremlin', 58],
  ['annunciation', 'Annunciation Cathedral', 'Annunciation', 259988409, 'Kazan Kremlin', 40],
  ['palace', 'Palace of Agriculture', 'Agriculture Palace', 90251771, 'Kremlin Embankment', 48],
  ['family', 'Kazan Family Center', 'Family Center', 222787130, 'Kazanka River', 32],
  ['belfry', 'Epiphany Bell Tower', 'Epiphany Belfry', 99325935, 'Bauman Street', 74],
  ['marjani', 'Al-Marjani Mosque', 'Al-Marjani', 133264462, 'Old Tatar Quarter', 30],
  ['taif', 'ТАИФ · вертолётная площадка', 'ТАИФ · крыша', 694568818, 'Пушкина, 80 · у Национальной библиотеки', 33.5],
  ['tatneft', 'Татнефть Арена', 'Татнефть Арена', 82960312, 'Чистопольская, 42', 26],
  ['makary', 'Макарьевская церковь · СИЗО-2', 'Макарьевская церковь', 262494371, 'Большая, 98 · Адмиралтейская слобода', 22]
];
const landmarks = [];
for (const [id, name, short, osmId, district, h] of landmarkSpecs) {
  const building = buildings.find((b) => b.id === osmId);
  if (!building) throw new Error(`Missing landmark footprint: ${name}`);
  const xs = building.ring.filter((_, i) => i % 2 === 0), zs = building.ring.filter((_, i) => i % 2 === 1);
  landmarks.push({ id, name, short, osmId, district, x: q((Math.min(...xs) + Math.max(...xs)) / 2), z: q((Math.min(...zs) + Math.max(...zs)) / 2),
    w: q(Math.max(...xs) - Math.min(...xs)), d: q(Math.max(...zs) - Math.min(...zs)), h, ring: building.ring });
}
for (const [id, name, short, lon, lat, district] of [
  ['kremlin', 'Kazan Kremlin', 'Kremlin', 49.1072, 55.7982, 'Historic Center'],
  ['bauman', 'Bauman Street', 'Bauman Street', 49.1156, 55.7886, 'Historic Center'],
  ['kaban', 'Lower Kaban Lake', 'Lake Kaban', 49.1196, 55.7796, 'Old Tatar Quarter'],
  ['millennium', 'Millennium Bridge', 'Millennium Bridge', 49.1476, 55.8049, 'Kazanka River'],
  ['blacklake', 'Black Lake Park', 'Black Lake', 49.1195, 55.7960, 'Historic Center']
]) {
  const [x, z] = toWorld({ lon, lat });
  landmarks.push({ id, name, short, district, x, z, h: 0 });
}
for (const checkpoint of coverage.checkpoints) {
  const [x, z] = toWorld(checkpoint);
  landmarks.push({ ...checkpoint, short: checkpoint.short || checkpoint.name, district: checkpoint.localName, x, z, h: 0 });
}

const data = { version: 3, city: { name: 'Kazan', region: 'Tatarstan', localName: 'Казань · Казан' },
  source: { name: 'OpenStreetMap', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright', timestamp: source.osm3s?.timestamp_osm_base, extract: source.extract, importer: source.extract ? 'tools/import-kazan-osm.py' : undefined, query: source.extract ? undefined : 'tools/data/q_kazan.overpassql' },
  frame: { origin, bearingDeg: 0, units: 'm', kx, kz }, bounds, terrainBounds, nearTerrainBounds,
  elevation: terrain, landcover, heightDataset: { ...heightData, heights: undefined },
  siteBoundaries: source.elements.filter((e) => e.type === 'relation' && e.id === 3867929).map((e) => ({ id: 'zilant', rings: joinMembers(e.members, 'outer').map((r) => flat(closedRing(r))) })),
  coverage, reliefSites: relief.sites.map((site) => { const [x, z] = toWorld(site); return { ...site, x, z }; }), roads, roadGraph: { nodes: graphNodes, links: graphLinks, names }, buildings, helipads, parks, forests, cemeteries, airfields, water, walls, landmarks };
if (roads.length < 1000 || buildings.length < 1000 || !water.some((w) => w.name === 'Kazanka')) throw new Error('Incomplete Kazan geography');
const payload = output.replace(/\.js$/, '') + '.json.gz';
const json = JSON.stringify(data);
fs.writeFileSync(payload, gzipSync(json, { level: 9 }));
fs.writeFileSync(output, `/* GENERATED by tools/build-kazan-geodata.mjs. © OpenStreetMap contributors, ODbL-1.0. */\nwindow.NYC = { ...(window.NYC || {}), GEO_DATA_FILE: ${JSON.stringify(basename(payload))} };\n`);
console.log(`Kazan: ${roads.length} road/path ways, ${graphLinks.length} drivable links, ${buildings.length} building footprints, ${parks.length} parks, ${water.length} water bodies`);
console.log('Heights:', Object.fromEntries(['osm-height', 'published-height', 'reviewed-estimate', 'osm-levels', 'gba', 'fallback', 'fallback-part'].map((s) => [s, buildings.filter((b) => b.heightSource === s).length])));
console.log(`Wrote ${output} and ${payload} (${(fs.statSync(payload).size / 1024 / 1024).toFixed(1)} MiB compressed, ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MiB decoded)`);
