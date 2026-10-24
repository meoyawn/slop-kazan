import fs from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createParkingIndex, splitAreaAccess } from './kazan-parking.mjs';
import { classifyFacade, createFacadeCohortIndex } from './kazan-facades.mjs';
import { createBuildingTypologies, matchBuildingTypology, smallBuildingFallback } from './kazan-building-typologies.mjs';
import { resolveBuildingAliases } from './kazan-building-aliases.mjs';
import { constructionState } from './kazan-construction.mjs';
import polygonClipping from 'polygon-clipping';
import { passageCorridor, passageVolumes, recessVolumes } from './kazan-passages.mjs';
import { compileRailways } from './kazan-railways.mjs';
import { compileTrams } from './kazan-trams.mjs';
import { compilePower } from './kazan-power.mjs';
import { compileFuelStations } from './kazan-fuel.mjs';
import { compilePedestrianStructures } from './kazan-pedestrian-structures.mjs';
import { compileEducation, compileEducationProperties, applyEducationFacades } from './kazan-education.mjs';
import { compileEducationYards } from './kazan-school-yards.mjs';
import { compileEducationalEnclosures } from './kazan-education-enclosures.mjs';
import { compileEducationEntrances } from './kazan-education-entrances.mjs';
import { compileSports } from './kazan-sports.mjs';
import { compileWorship } from './kazan-worship.mjs';
import { compileBuildingDates } from './kazan-building-dates.mjs';
import { compileStalinkas } from './kazan-stalinka.mjs';
import { compileHousingMaterials } from './kazan-housing.mjs';
import { compilePanelHousing } from './kazan-panel-housing.mjs';

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
const educationSource = readExtract('kazan-education');
if (source.extract && educationSource.source.sha256 !== source.extract.sha256) throw new Error('Education and city sources differ');
const sportsSource = readExtract('kazan-sports');
if (source.extract && sportsSource.source.sha256 !== source.extract.sha256) throw new Error('Sports and city sources differ');

const origin = { lat: 55.79, lon: 49.108 };
const phi = origin.lat * Math.PI / 180;
const e2 = 6.69437999014e-3;
const divisor = 1 - e2 * Math.sin(phi) ** 2;
const kx = Math.PI / 180 * 6378137 / Math.sqrt(divisor) * Math.cos(phi);
const kz = Math.PI / 180 * 6378137 * (1 - e2) / divisor ** 1.5;
const q = (n) => Math.round(n * 10) / 10;
const toWorld = ({ lon, lat }) => [q((lon - origin.lon) * kx), q((origin.lat - lat) * kz)];
const buildingTypologies = createBuildingTypologies(observations.buildingTypologies || [], source.elements, toWorld);
const facadeCohorts = createFacadeCohortIndex(observations.facadeCohorts || [], source.elements, observations.facadeProfiles || {});
const sourceTags = new Map(source.elements.map((e) => [`${e.type}/${e.id}`, e.tags || {}]));
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

const campuses = [];
for (const e of source.elements) {
  const t = e.tags || {};
  if (t.building || !['university', 'college'].includes(t.amenity)) continue;
  const rings = e.type === 'way' ? [closedRing(e.geometry)] : e.type === 'relation' ? joinMembers(e.members, 'outer').map((g) => closedRing(g)) : [];
  const holes = e.type === 'relation' ? joinMembers(e.members, 'inner').map((g) => closedRing(g)).filter((r) => r.length > 2).map(flat) : [];
  const outer = rings.filter((r) => r.length > 2 && Math.abs(area(r)) > 200);
  if (!outer.length) continue;
  campuses.push({ id: e.id, osmType: e.type, kind: t.amenity, name: t.name || '', rings: outer.map(flat), holes,
    source: `https://www.openstreetmap.org/${e.type}/${e.id}` });
}
const educationElements = [...new Map([...source.elements.filter((e) => e.tags?.landuse === 'education'),
  ...educationSource.elements].map((e) => [`${e.type}/${e.id}`, e])).values()];
const educationProperties = compileEducationProperties(educationElements, { closedRing, joinMembers });
for (const p of educationProperties.canonical) {
  if (campuses.some((c) => c.id === p.id && c.osmType === p.osmType)) continue;
  campuses.push({ id: p.id, osmType: p.osmType, kind: p.kind, name: p.name, rings: p.rings, holes: p.holes,
    source: `https://www.openstreetmap.org/${p.reference}` });
}
const campusIndex = createParkingIndex(campuses);
const residentialAreas = [];
for (const e of source.elements) {
  if (e.tags?.landuse !== 'residential') continue;
  const rings = e.type === 'way' ? [closedRing(e.geometry, bounds, 0.3)] : e.type === 'relation' ? joinMembers(e.members, 'outer').map((g) => closedRing(g, bounds, 0.3)) : [];
  const holes = e.type === 'relation' ? joinMembers(e.members, 'inner').map((g) => closedRing(g, bounds, 0.3)).filter((r) => r.length > 2) : [];
  const outer = rings.filter((r) => r.length > 2 && Math.abs(area(r)) > 50);
  if (outer.length) residentialAreas.push({ id: e.id, osmType: e.type, rings: outer.map(flat), holes: holes.map(flat) });
}
const residentialIndex = createParkingIndex(residentialAreas);
const parkings = [];
const parkingRelations = source.elements.filter((e) => e.type === 'relation' && e.tags?.amenity === 'parking');
const parkingMembers = new Set(parkingRelations.flatMap((e) => e.members.filter((m) => m.type === 'way').map((m) => m.ref)));
for (const e of source.elements) {
  const t = e.tags || {};
  if (t.amenity !== 'parking' || /underground|multi-storey|rooftop/.test(t.parking || '') || /underground|roof/.test(t.location || '') || t.building || parseFloat(t.layer) < 0 || parkingMembers.has(e.id) && e.type === 'way') continue;
  const rings = e.type === 'way' ? [closedRing(e.geometry, bounds, 0.3)] : e.type === 'relation' ? joinMembers(e.members, 'outer').map((g) => closedRing(g, bounds, 0.3)) : [];
  const holes = e.type === 'relation' ? joinMembers(e.members, 'inner').map((g) => closedRing(g, bounds, 0.3)).filter((r) => r.length > 2) : [];
  const outer = rings.filter((r) => r.length > 2 && Math.abs(area(r)) > 18);
  if (outer.length) parkings.push({ id: e.id, osmType: e.type, name: displayName(t, 'Parking'), rings: outer.map(flat), holes: holes.map(flat),
    capacity: parseInt(t.capacity, 10) || undefined, surface: t.surface || 'unknown', access: t.access || 'unknown', layoutSource: 'procedural' });
}
const parkingIndex = createParkingIndex(parkings);
const airfields = [];
const apronMembers = new Set(source.elements.filter((e) => e.type === 'relation' && e.tags?.aeroway === 'apron')
  .flatMap((e) => e.members.filter((m) => m.type === 'way').map((m) => m.ref)));
for (const e of source.elements) {
  const t = e.tags || {}, kind = t.aeroway;
  if (!['runway', 'taxiway', 'apron', 'parking_position'].includes(kind) || t.area === 'yes' && kind !== 'apron') continue;
  const field = { id: e.id, osmType: e.type, name: displayName(t), kind, ref: t.ref || '', surface: t.surface || 'unknown' };
  if (kind === 'apron') {
    if (e.type === 'way' && apronMembers.has(e.id)) continue;
    const rings = e.type === 'way' ? [closedRing(e.geometry, bounds, 0.3)] : e.type === 'relation' ? joinMembers(e.members, 'outer').map((g) => closedRing(g, bounds, 0.3)) : [];
    const holes = e.type === 'relation' ? joinMembers(e.members, 'inner').map((g) => closedRing(g, bounds, 0.3)).filter((r) => r.length > 2) : [];
    const outer = rings.filter((r) => r.length > 2 && Math.abs(area(r)) > 50);
    if (outer.length) airfields.push({ ...field, rings: outer.map(flat), holes: holes.map(flat) });
  } else if (e.type === 'way') {
    airfields.push({ ...field, w: q(parseFloat(t.width) || (kind === 'runway' ? 45 : kind === 'taxiway' ? 18 : 0)), pts: flat(e.geometry.map(toWorld)) });
  } else if (kind === 'parking_position') {
    const [x, z] = toWorld(e);
    airfields.push({ ...field, x, z });
  }
}

const airsideIndex = createParkingIndex(airfields.filter((f) => f.kind === 'apron'));
const roads = [];
const drivable = [];
const highwayWidths = { motorway: 12, motorway_link: 6, trunk: 11, trunk_link: 6, primary: 15, primary_link: 7.2, secondary: 12, secondary_link: 7.2, tertiary: 10,
  tertiary_link: 7.2, residential: 7.2, unclassified: 7.2, living_street: 6, service: 5 };
const pathTypes = new Set(['pedestrian', 'footway', 'cycleway', 'path', 'steps']);
for (const e of source.elements) {
  const t = e.tags || {};
  if (e.type !== 'way' || !e.geometry || !t.highway || t.area === 'yes' || t.indoor === 'yes') continue;
  const vehicle = t.highway in highwayWidths && !/^(private|no|emergency)$/.test(t.access || '') &&
    !/^(private|no|emergency)$/.test(t.motor_vehicle || t.vehicle || '') && t.service !== 'emergency_access';
  const ambient = vehicle && !/^(destination|delivery|customers|permit)$/.test(t.motor_vehicle || t.vehicle || t.access || '');
  const walk = pathTypes.has(t.highway) || (!vehicle && t.highway === 'service');
  if (!vehicle && !walk) continue;
  const pieces = clipRoad(e.geometry.map(toWorld), e.nodes, e.id);
  if (!pieces.length) continue;
  const lanes = Math.max(1, Math.min(6, parseInt(t.lanes, 10) || (t.oneway === 'yes' ? 2 : 2)));
  const inferredWidth = t.lanes ? lanes * 3.4 + 0.8 : highwayWidths[t.highway];
  const w = Math.max(walk ? 1.5 : 5.5, Math.min(30, parseFloat(t.width) || (walk ? (t.highway === 'pedestrian' ? 12 : 2.5) : inferredWidth)));
  const dir = t.oneway === '-1' ? -1 : t.oneway === 'yes' || t.junction === 'roundabout' ? 1 : 0;
  const reviewedAccess = observations.campusAccess?.[`way/${e.id}`];
  const living = t.highway === 'living_street' || t.highway === 'service' && (t.living_street === 'yes' || /living_street/.test(t.maxspeed || ''));
  const courtyardSource = living ? 'mapped-living-street' : t.highway === 'service' && t.service === 'driveway' ? 'mapped-driveway' : '';
  const residentialAccess = t.highway === 'service' && !t.name && !t.ref && !/^(alley|drive-through|slipway)$/.test(t.service || '') &&
    (!t.bridge || t.bridge === 'no') && (!t.tunnel || t.tunnel === 'no') && !(parseFloat(t.layer) || 0);
  // Campus grounds exclude every surface motor-road class, including residential access.
  // Preserve existing service-access restrictions; other streets at another level may cross the site.
  const campusSurface = t.highway === 'service' || t.highway in highwayWidths && (!t.bridge || t.bridge === 'no') && t.tunnel !== 'yes' && !(parseFloat(t.layer) || 0);
  let accessPieces = pieces.map((piece) => ({ ...piece, id: e.id, service: t.highway === 'service' }));
  for (const [index, property, forced] of [[parkingIndex, 'parking', t.service === 'parking_aisle'],
    [campusIndex, 'campusAccess', !!reviewedAccess?.excludeAmbient], [airsideIndex, 'airside', false],
    [residentialIndex, 'courtyard', !!courtyardSource]]) {
    accessPieces = accessPieces.flatMap((piece) => splitAreaAccess({ ...piece, service: property === 'courtyard' ? residentialAccess : property === 'campusAccess' ? campusSurface : piece.service }, index, property, forced)
      .map((part) => ({ ...piece, ...part })));
  }
  for (const { pts, nodes, parking, campusAccess, airside, courtyard } of accessPieces) {
    const campus = campusIndex.at(pts[0][0], pts[0][1]) || campusIndex.at(pts.at(-1)[0], pts.at(-1)[1]);
    roads.push({ id: e.id, name: displayName(t, walk ? 'Path' : 'Local street'), localName: t.name || '',
      w: q(w), lanes, dir, highway: /^(motorway|trunk|primary)$/.test(t.highway), ref: t.ref || undefined,
      kind: t.highway, bridge: !!t.bridge && t.bridge !== 'no', tunnel: t.tunnel === 'yes' || undefined,
      covered: t.covered === 'yes' || undefined, cutting: t.cutting === 'yes' || undefined,
      layer: Number.parseFloat(t.layer) || (t.bridge && t.bridge !== 'no' ? 1 : t.tunnel === 'yes' ? -1 : 0), walk,
      parking: parking || undefined, service: t.service || undefined, campusAccess: campusAccess || undefined,
      ambientRestricted: vehicle && !ambient || undefined, airside: airside || undefined,
      courtyard: courtyard || undefined, courtyardSource: courtyard ? courtyardSource || 'mapped-residential-area' : undefined,
      campus: reviewedAccess?.campus || observations.campusSteps?.[`way/${e.id}`]?.campus || (campus ? `${campus.osmType}/${campus.id}` : undefined),
      campusSource: reviewedAccess?.source,
      stepCount: t.highway === 'steps' ? parseInt(t.step_count, 10) || undefined : undefined,
      handrail: t.highway === 'steps' ? t.handrail !== 'no' : undefined,
      buildingPassage: t.tunnel === 'building_passage' || undefined,
      pts: flat(simplify(pts, 0.35)) });
    if (ambient && !parking && !campusAccess && !airside && !courtyard) drivable.push({ e: { ...e, nodes }, roadIndex: roads.length - 1, pts, w: q(w), lanes, dir, name: displayName(t, 'Local street') });
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
for (const { e, pts, w, lanes, dir, name, roadIndex } of drivable) {
  if (!nameIds.has(name)) { nameIds.set(name, names.length); names.push(name); }
  let start = 0;
  for (let i = 1; i < e.nodes.length; i++) {
    if (i !== e.nodes.length - 1 && uses.get(e.nodes[i]) < 2 && !(e.nodes[0] === e.nodes.at(-1) && i === Math.floor(e.nodes.length / 2))) continue;
    const a = graphNode(e.nodes[start], pts[start]), b = graphNode(e.nodes[i], pts[i]);
    if (a !== b) graphLinks.push([a, b, nameIds.get(name), w, lanes, dir, flat(simplify(pts.slice(start, i + 1), 0.35).slice(1, -1)), roadIndex]);
    start = i;
  }
}

const water = [], parks = [], buildings = [], walls = [], forests = [], cemeteries = [], recreation = [];
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
  if (['pitch', 'track'].includes(t.leisure) && !t.building &&
      e.geometry[0].lon === e.geometry.at(-1).lon && e.geometry[0].lat === e.geometry.at(-1).lat) {
    const ring = closedRing(e.geometry, bounds, 0.3);
    if (ring.length > 2 && Math.abs(area(ring)) > 25) {
      const reviewed = observations.recreation?.[`way/${e.id}`];
      recreation.push({ id: e.id, osmType: 'way', name: t.name || '', sport: t.sport || '', surface: t.surface || '',
        kind: reviewed?.kind || (t.sport === 'basketball' ? 'basketball' : /futsal|soccer/.test(t.sport || '') ? 'football' : ''),
        site: reviewed?.site, colour: reviewed?.colour, source: reviewed?.source, ring: flat(ring) });
    }
  }
  if (t.landuse === 'forest' || t.natural === 'wood' || t.landuse === 'cemetery') {
    const r = closedRing(e.geometry, bounds, 0.8);
    const list = t.landuse === 'cemetery' ? cemeteries : forests;
    if (r.length > 2 && Math.abs(area(r)) > 500) list.push({ id: e.id, name: displayName(t), kind: t.aeroway || t.landuse || t.natural, rings: [flat(r)], holes: [] });
  }
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
  const typology = matchBuildingTypology(t, rings[0] || [], buildingTypologies);
  const small = smallBuildingFallback(t, Math.abs(area(rings[0] || [])), observed);
  const cohort = facadeCohorts.get(`${e.type}/${e.id}`);
  const facade = classifyFacade(t, observed, observations.facadeProfiles || {}, typology, cohort);
  const kind = t.building || t['building:part'];
  const fallback = small?.height || (/garage|shed|service|roof/.test(kind) ? 3 : /house|detached/.test(kind) ? 6 : /church|mosque/.test(kind) ? 16 : 12);
  let minHeight = measure(t.min_height) || measure(t['building:min_level']) * 3;
  let h = heightTag || observed?.height || observed?.heightEstimate || (levels ? levels * 3 + roofHeight : 0) || gba || fallback;
  let heightSource = heightTag ? 'osm-height' : observed?.height ? 'published-height' : observed?.heightEstimate ? 'reviewed-estimate' : levels ? 'osm-levels' : gba ? 'gba' : 'fallback';
  if (observed?.heightCorrection) { h = observed.heightCorrection.height; heightSource = 'reviewed-estimate'; }
  if (heightSource === 'fallback' && small) heightSource = 'footprint-lowrise-estimate';
  const heightIssue = h <= minHeight ? 'mapped minimum exceeds available total height' : '';
  if (heightIssue) {
    h = minHeight + (roofHeight || (/pyramidal|gabled|hipped/.test(t['roof:shape']) ? 3 : Math.max(1, Math.min(6, gba || fallback))));
    heightSource = 'fallback-part';
  }
  const construction = constructionState(t, observed, h, heightSource, `${e.type}/${e.id}`);
  if (construction) { h = construction.currentHeight; minHeight = 0; heightSource = 'construction-stage'; }
  const wallRefs = e.members?.filter((m) => sourceTags.get(`way/${m.ref}`)?.historic === 'citywalls').map((m) => m.ref) || [];
  const fortification = wallRefs.length ? 'wall' : t.building === 'castle_tower' && t['building:colour'] === 'white' ? 'tower' : undefined;
  for (const r of rings) {
    if (r.length < 3 || Math.abs(area(r)) < 3) continue;
    buildings.push({ id: e.id, osmType: e.type, name: displayName(t) || observed?.name || '', localName: t.name || observed?.name || '', kind,
      part: !!t['building:part'] && t['building:part'] !== 'no', h: q(Math.max(construction ? 0.2 : 1, Math.min(220, h))), minHeight: q(minHeight), construction: construction || undefined,
      heightSource, heightEvidence: observed?.source, model: observed?.model, campusRole: observed?.campusRole,
      fortification, wallRefs: wallRefs.length ? wallRefs : undefined, mappedHeight: observed?.heightCorrection ? heightTag : undefined,
      frontTowards: observed?.frontTowards ? toWorld({ lon: observed.frontTowards[0], lat: observed.frontTowards[1] }) : undefined,
      localFoundation: observed?.localFoundation || undefined, heightIssue: heightIssue || undefined, towerType: t['tower:type'] || undefined,
      foundationAt: observed?.foundationAt ? toWorld({ lon: observed.foundationAt[0], lat: observed.foundationAt[1] }) : undefined,
      roofSection: observed?.roofSection ? { ...observed.roofSection, ring: flat(observed.roofSection.ring.map(([lon, lat]) => toWorld({ lon, lat }))) } : undefined,
      levels: levels || null, roofShape: t['roof:shape'] || observed?.roofShape || 'flat', roofHeight: q(roofHeight || observed?.roofHeightEstimate || 0),
      material: t['building:material'] || observed?.material || '', colour: facade?.appearance.wallColour || t['building:colour'] || t.colour || observed?.colour || '',
      appearance: facade?.appearance, colourSource: facade?.source, facadeFamily: facade?.family, facadeConfidence: facade?.confidence,
      facadeCohort: cohort?.id, facadeReference: cohort?.source,
      typology: typology?.id || small?.typology, typologyReference: typology?.reference, typologySimilarity: typology?.score,
      mappedColour: facade ? t['building:colour'] || t.colour || undefined : undefined, roofMaterial: t['roof:material'] || '',
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

const buildingAliases = resolveBuildingAliases(buildings, observations.buildings);
const buildingById = new Map(buildings.map((b) => [`${b.osmType}/${b.id}`, b]));
for (const b of buildings.filter((b) => b.fortification === 'wall')) for (const id of b.wallRefs) {
  const wall = walls.find((w) => w.id === id);
  if (wall) wall.envelope = `${b.osmType}/${b.id}`;
}
for (const part of buildings.filter((b) => b.parent)) {
  const parent = buildingById.get(part.parent);
  if (!parent.construction || parent.construction.stage === 'renovation' || part.construction) continue;
  part.construction = { ...parent.construction, plannedHeight: part.h, plannedHeightSource: part.heightSource, plannedLevels: part.levels || undefined };
  part.h = parent.h; part.minHeight = 0; part.heightSource = 'construction-stage';
}
const partsByParent = new Map();
for (const p of buildings.filter((b) => b.parent)) {
  if (!partsByParent.has(p.parent)) partsByParent.set(p.parent, []);
  if (p.minHeight < 0.2) partsByParent.get(p.parent).push(p);
}
const ringPoints = (ring) => Array.from({ length: ring.length / 2 }, (_, i) => [ring[i * 2], ring[i * 2 + 1]]);
for (const b of buildings.filter((b) => b.hasParts)) {
  const parts = partsByParent.get(`${b.osmType}/${b.id}`) || [];
  const polygon = [ringPoints(b.ring), ...b.holes.map(ringPoints)];
  const remaining = parts.length ? polygonClipping.difference(polygon, ...parts.map((p) => [ringPoints(p.ring), ...p.holes.map(ringPoints)])) : [polygon];
  b.body = remaining.filter((p) => Math.abs(area(p[0])) > 2).map((p) => ({ ring: flat(p[0].slice(0, -1)), holes: p.slice(1).map((r) => flat(r.slice(0, -1))) }));
}
const passages = roads.filter((r) => r.buildingPassage).map((r) => {
  const observed = observations.passages?.[`way/${r.id}`];
  const p = { road: r.id, pts: r.pts, width: observed?.widthEstimate || r.w, spring: observed?.springEstimate || 2.7,
    height: observed?.heightEstimate || 4.2, source: observed?.source || `https://www.openstreetmap.org/way/${r.id}`,
    dimensions: 'estimated-clearance' };
  p.corridor = passageCorridor(p);
  const coordinates = p.corridor.flat(2), xs = coordinates.map((v) => v[0]), zs = coordinates.map((v) => v[1]);
  p.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  return p;
});
for (const b of buildings) {
  if (b.minHeight >= 6 || b.construction) continue;
  if (b.hasParts) {
    for (const body of b.body || []) body.openingVolumes = passageVolumes(body.ring, body.holes, -5, b.h, passages);
    continue;
  }
  b.openingVolumes = passageVolumes(b.ring, b.holes, b.minHeight ? b.minHeight : -5, b.h, passages);
  const recess = observations.buildings[`${b.osmType}/${b.id}`]?.facadeRecess;
  if (recess) {
    const i = recess.face * 2, j = ((recess.lastFace ?? recess.face) * 2 + 2) % b.ring.length;
    const dx = b.ring[j] - b.ring[i], dz = b.ring[j + 1] - b.ring[i + 1], length = Math.hypot(dx, dz);
    const width = recess.fullFace ? length + 0.4 : recess.width;
    if (!recess.fullFace && length < width + 0.2) throw new Error(`Facade recess exceeds its mapped face: ${b.id}`);
    const ux = dx / length, uz = dz / length, x = (b.ring[i] + b.ring[j]) / 2, z = (b.ring[i + 1] + b.ring[j + 1]) / 2;
    let nx = -uz, nz = ux;
    if (contains(b.ring, x + nx * 0.2, z + nz * 0.2)) { nx = -nx; nz = -nz; }
    const ring = [[-width / 2, 0.15], [width / 2, 0.15], [width / 2, -recess.depth], [-width / 2, -recess.depth]]
      .flatMap(([u, d]) => [x + ux * u + nx * d, z + uz * u + nz * d]);
    b.facadeRecess = { ...recess, width, x, z, ux, uz, nx, nz, length, geometrySource: 'photographic-recess-on-mapped-face' };
    b.openingVolumes = recessVolumes(b.openingVolumes || [{ ring: b.ring, holes: b.holes, minHeight: b.minHeight || -5, h: b.h }],
      { ring, bottom: recess.bottom, top: recess.top });
  }
}
for (const wall of walls) {
  const pts = ringPoints(wall.pts), openings = {};
  for (let i = 0; i + 1 < pts.length; i++) {
    const start = pts[i], end = pts[i + 1], length = Math.hypot(end[0] - start[0], end[1] - start[1]), steps = Math.max(1, Math.ceil(length / 6));
    for (let k = 0; k < steps; k++) {
      const a = [start[0] + (end[0] - start[0]) * k / steps, start[1] + (end[1] - start[1]) * k / steps];
      const b = [start[0] + (end[0] - start[0]) * (k + 1) / steps, start[1] + (end[1] - start[1]) * (k + 1) / steps];
      const nx = -(end[1] - start[1]) / length * 1.35, nz = (end[0] - start[0]) / length * 1.35;
      const ring = [a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz, b[0] - nx, b[1] - nz, a[0] - nx, a[1] - nz];
      const volumes = passageVolumes(ring, [], 0, 8, passages);
      if (volumes) openings[`${i}/${k}`] = volumes;
    }
  }
  if (Object.keys(openings).length) wall.openings = openings;
}
const attractions = source.elements.filter((e) => e.type === 'node' && e.tags?.attraction === 'big_wheel').map((e) => {
  const observed = observations.attractions?.[`node/${e.id}`], [x, z] = toWorld(e);
  return { id: e.id, osmType: e.type, kind: 'big_wheel', landmarkId: observed?.landmarkId || `wheel-${e.id}`, name: e.tags.name || 'Колесо обозрения', x, z,
    h: measure(e.tags.height) || observed?.height || 35, heightSource: measure(e.tags.height) ? 'osm-height' : observed?.height ? 'published-height' : 'fallback',
    cabins: observed?.cabins || 24, yaw: observed?.yaw || 0, source: observed?.source || `https://www.openstreetmap.org/node/${e.id}` };
});
const aircraft = source.elements.filter((e) => e.type === 'way' && e.tags?.memorial === 'aircraft').map((e) => {
  const observed = observations.aircraft?.[`way/${e.id}`], ring = flat(closedRing(e.geometry, bounds, 0.05));
  if (!observed) return { id: e.id, name: e.tags.name, ring, source: `https://www.openstreetmap.org/way/${e.id}` };
  const noseIndex = e.nodes.indexOf(observed.noseNode), tailIndex = e.nodes.indexOf(observed.tailNode);
  if (noseIndex < 0 || tailIndex < 0) throw new Error(`Missing aircraft axis: way/${e.id}`);
  const nose = toWorld(e.geometry[noseIndex]), tail = toWorld(e.geometry[tailIndex]);
  const mappedLength = Math.hypot(nose[0] - tail[0], nose[1] - tail[1]);
  const fx = (nose[0] - tail[0]) / mappedLength, fz = (nose[1] - tail[1]) / mappedLength;
  return { ...observed, id: e.id, osmType: 'way', ring, x: nose[0] - fx * observed.length / 2,
    z: nose[1] - fz * observed.length / 2, yaw: Math.atan2(fx, fz), mappedLength,
    geometrySource: 'mapped-aircraft-outline-and-axis', dimensionSource: 'published-length-span; other components reviewed estimates',
    source: `https://www.openstreetmap.org/way/${e.id}` };
});
for (const spec of observations.displayAircraft || []) {
  const [x, z] = toWorld({ lon: spec.at[0], lat: spec.at[1] });
  const target = toWorld({ lon: spec.frontTowards[0], lat: spec.frontTowards[1] });
  aircraft.push({ ...spec, x, z, yaw: Math.atan2(target[0] - x, target[1] - z),
    geometrySource: 'photographic-placement-estimate', dimensionSource: 'procedural-type-estimate' });
}
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
  const cohort = facadeCohorts.get(p.parent);
  const partFacade = cohort && p.facadeConfidence !== 'reviewed' ? classifyFacade(sourceTags.get(`${p.osmType}/${p.id}`) || {},
    observations.buildings[`${p.osmType}/${p.id}`], observations.facadeProfiles, null, cohort) : null;
  p.material ||= parent.material;
  if (partFacade && !/glass/.test(p.material)) {
    p.appearance = partFacade.appearance; p.colour = partFacade.appearance.wallColour;
    p.colourSource = partFacade.source; p.facadeFamily = partFacade.family; p.facadeConfidence = partFacade.confidence;
    p.facadeCohort = cohort.id; p.facadeReference = cohort.source;
    continue;
  }
  if (p.facadeConfidence !== 'reviewed' && parent.appearance && !/glass/.test(p.material) &&
      (parent.facadeConfidence === 'reviewed' || !p.appearance || p.colourSource !== 'osm-colour')) {
    p.appearance = parent.appearance;
    p.mappedColour = p.colour || undefined;
    p.colour = parent.appearance.wallColour;
    p.colourSource = parent.colourSource;
    p.facadeFamily = parent.facadeFamily;
    p.facadeConfidence = parent.facadeConfidence;
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
  ['spasskaya', 'Спасская башня', 'Спасская башня', 15958803, 'Кремль · главные ворота', 46],
  ['kfu-main', 'КФУ · главное здание', 'КФУ · главное', 182148884, 'Кремлёвская, 18 · Сковородка', 13.5],
  ['kfu-second', 'КФУ · второй корпус', 'КФУ · двойка', 19266663, 'Кремлёвская, 35', 64],
  ['kfu-physics', 'КФУ · Институт физики', 'КФУ · физфак', 14238671, 'Кремлёвская, 16А', 56],
  ['kfu-library', 'КФУ · библиотека Лобачевского', 'КФУ · библиотека', 19266664, 'Кремлёвская, 35 · Ленинский сад', 15],
  ['lemana', 'Лемана Про · Амирхана', 'Лемана Про', 222508209, 'Фатыха Амирхана, 3Б', 11.5],
  ['uram', 'Экстрим-парк «Урам»', 'Урам', 973924084, 'Кремлёвская набережная · под Миллениумом', 14],
  ['kulsharif', 'Kul Sharif Mosque', 'Kul Sharif', 230132591, 'Kazan Kremlin', 58],
  ['suyumbike', 'Suyumbike Tower', 'Suyumbike', 228963085, 'Kazan Kremlin', 58],
  ['annunciation', 'Annunciation Cathedral', 'Annunciation', 259988409, 'Kazan Kremlin', 40],
  ['palace', 'Palace of Agriculture', 'Agriculture Palace', 90251771, 'Kremlin Embankment', 48],
  ['family', 'Kazan Family Center', 'Family Center', 222787130, 'Kazanka River', 32],
  ['belfry', 'Epiphany Bell Tower', 'Epiphany Belfry', 99325935, 'Bauman Street', 74],
  ['marjani', 'Al-Marjani Mosque', 'Al-Marjani', 133264462, 'Old Tatar Quarter', 30],
  ['taif', 'ТАИФ · вертолётная площадка', 'ТАИФ · крыша', 694568818, 'Пушкина, 80 · у Национальной библиотеки', 33.5],
  ['tatneft', 'Татнефть Арена', 'Татнефть Арена', 82960312, 'Чистопольская, 42', 26],
  ['makary', 'Макарьевская церковь · СИЗО-2', 'Макарьевская церковь', 262494371, 'Большая, 98 · Адмиралтейская слобода', 22],
  ['parkhouse', 'Парк Хаус', 'Парк Хаус', 58969521, 'Ямашева, 46/33', 22.5],
  ['bahetle', 'Бахетле · Ямашева, 71А', 'Бахетле', 80373334, 'Ямашева / Амирхана · Eurospar', 20.3],
  ['kishmish', 'Кишмиш · Мусина', 'Кишмиш', 263308228, 'Мусина, 29/2 · угол со стороны Ямашева', 5],
  ['tandem', 'Тандем', 'Тандем', 58971260, 'Ибрагимова, 56', 27.5]
];
const landmarks = [];
const campusFeatures = (observations.campusFeatures || []).map((spec) => {
  const node = source.elements.find((e) => `${e.type}/${e.id}` === spec.reference);
  if (!node || node.type !== 'node') throw new Error(`Missing campus feature: ${spec.reference}`);
  const [x, z] = toWorld(node), target = toWorld({ lon: spec.frontTowards[0], lat: spec.frontTowards[1] });
  return { ...spec, x, z, yaw: Math.atan2(target[0] - x, target[1] - z) };
});
const structures = (observations.structures || []).map((spec) => {
  const e = source.elements.find((e) => `${e.type}/${e.id}` === spec.reference);
  if (!e) throw new Error(`Missing structural reference: ${spec.reference}`);
  const mapped = e.type === 'node' ? [toWorld(e)] : e.geometry.map(toWorld);
  const xs = mapped.map((p) => p[0]), zs = mapped.map((p) => p[1]);
  const x = q((Math.min(...xs) + Math.max(...xs)) / 2), z = q((Math.min(...zs) + Math.max(...zs)) / 2);
  const routes = spec.roadIds.map((id) => roads.find((r) => r.id === id && !r.walk));
  if (routes.some((r) => !r)) throw new Error(`Missing structural roadway: ${spec.id}`);
  let width = 0, ux = 0, uz = 0;
  const points = e.type === 'node' ? Array.from({ length: routes[0].pts.length / 2 }, (_, i) => routes[0].pts.slice(i * 2, i * 2 + 2)) : mapped;
  let best = e.type === 'node' ? Infinity : 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (!length) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length ** 2));
    const distance = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    if (e.type === 'node' ? distance < best : length > best) {
      best = e.type === 'node' ? distance : length;
      ux = e.type === 'node' ? -dz / length : dx / length;
      uz = e.type === 'node' ? dx / length : dz / length;
      width = length;
    }
  }
  return { ...spec, x, z, ux, uz, w: q(spec.widthEstimate || width), h: spec.heightEstimate,
    heightSource: 'reviewed-estimate', widthSource: spec.widthEstimate ? 'reviewed-estimate' : 'osm-support-footprint' };
});
for (const s of structures.filter((s) => s.teleport)) landmarks.push({ id: s.id, name: s.name, short: s.short || s.name,
  district: s.district, x: s.x, z: s.z, h: 0, entry: { x: q(s.x + s.ux * (s.w / 2 + 8)), z: q(s.z + s.uz * (s.w / 2 + 8)) } });
for (const site of attractions) landmarks.push({ id: site.landmarkId, osmId: site.id, osmType: site.osmType, name: site.name, short: 'Ривьера · колесо',
  district: 'Ривьера · Фатыха Амирхана, 1Е', x: site.x, z: site.z, w: site.h, d: 20, h: site.h });
for (const [id, name, short, osmId, district, h] of landmarkSpecs) {
  const building = buildings.find((b) => b.id === osmId);
  if (!building) throw new Error(`Missing landmark footprint: ${name}`);
  const xs = building.ring.filter((_, i) => i % 2 === 0), zs = building.ring.filter((_, i) => i % 2 === 1);
  const entrance = observations.buildings[`${building.osmType}/${building.id}`]?.entrance;
  const entry = entrance ? toWorld(entrance) : null;
  landmarks.push({ id, name, short, osmId, district, x: q((Math.min(...xs) + Math.max(...xs)) / 2), z: q((Math.min(...zs) + Math.max(...zs)) / 2),
    entry: entry ? { x: entry[0], z: entry[1] } : undefined,
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

const railways = compileRailways(source.elements, { toWorld, clipRoad, closedRing, joinMembers });
const cityGeometry = JSON.parse(fs.readFileSync(new URL('data/kazan-city-boundary.geojson', import.meta.url), 'utf8')).geometry;
const education = compileEducation(source.elements, educationSource.elements, { toWorld, closedRing, joinMembers, cityGeometry }, buildings);
education.schoolFacades = applyEducationFacades(education, buildings, sourceTags, observations.facadeProfiles);
education.kindergartenFacades = applyEducationFacades(education, buildings, sourceTags, observations.facadeProfiles, { kind: 'kindergarten' });
education.schoolEntrances = compileEducationEntrances(education, buildings);
education.kindergartenEntrances = compileEducationEntrances(education, buildings, { kind: 'kindergarten' });
education.source = educationSource.source;
education.incompleteRelations = educationSource.incompleteRelations;
const schoolEnclosures = compileEducationalEnclosures(educationSource.elements, { toWorld });
const schoolYardFeatures = educationSource.elements.filter((e) => e.type === 'way' && !e.tags.building &&
  (['pitch', 'track', 'playground', 'fitness_station'].includes(e.tags.leisure) || ['fence', 'wall', 'hedge'].includes(e.tags.barrier)) && e.nodes?.length > 1)
  .map((e) => ({ reference: `way/${e.id}`, pts: flat(e.geometry.map(toWorld)), kind: e.tags.leisure || e.tags.barrier,
    sport: e.tags.sport || '', closed: e.nodes.length > 3 && e.nodes[0] === e.nodes.at(-1) }));
const schoolReserved = [...parkings.flatMap((p) => p.rings.map((ring) => ({ ring, holes: p.holes }))),
  ...water.flatMap((p) => p.rings.map((ring) => ({ ring, holes: p.holes })))];
education.schoolYards = compileEducationYards(education, buildings, roads, recreation, { enclosures: schoolEnclosures, reserved: schoolReserved, yardFeatures: schoolYardFeatures });
education.kindergartenYards = compileEducationYards(education, buildings, roads, recreation, { enclosures: schoolEnclosures, reserved: schoolReserved, yardFeatures: schoolYardFeatures }, { kind: 'kindergarten' });
const sports = compileSports(source.elements, sportsSource.elements, { toWorld, closedRing, joinMembers, cityGeometry }, buildings,
  { education, campuses, reviewed: observations.sportsVenues, recreation });
sports.source = sportsSource.source;
sports.incompleteRelations = sportsSource.incompleteRelations;
console.log('Sports inventory:', sports.coverage);
console.log('Education inventory:', education.coverage);
console.log('School yards:', education.schoolYards.coverage);
console.log('School entrances:', education.schoolEntrances.coverage);
console.log('Kindergarten yards:', education.kindergartenYards.coverage);
console.log('Kindergarten entrances:', education.kindergartenEntrances.coverage);
const fuel = compileFuelStations(source.elements, { toWorld, closedRing, insideBounds }, buildings, roads);
const fuelBindings = new Map(fuel.bindings.map((b) => [b.id, b]));
for (const b of buildings) {
  const binding = fuelBindings.get(b.parent || `${b.osmType}/${b.id}`);
  if (binding) { b.fuelStation = binding.station; b.fuelRole = binding.role; }
}
console.log(`Fuel: ${fuel.stations.length} sites, ${fuel.bindings.filter((b) => b.role === 'canopy').length} mapped canopies, ${fuel.mappedPumps} mapped pumps`);
const pedestrianStructures = compilePedestrianStructures(source.elements, { toWorld, clipRoad }, roads);
const underground = compilePedestrianStructures(source.elements, { toWorld, clipRoad, underground: true, buildings }, roads);
underground.appearance = observations.undergroundEntranceFamily;
const undergroundRoofs = new Set(underground.roofBindings.map((b) => b.id));
const undergroundPavilions = new Set(underground.pavilions.map((p) => p.building));
for (const b of buildings) if (undergroundRoofs.has(b.parent || `${b.osmType}/${b.id}`)) b.undergroundEntranceRoof = true;
for (const b of buildings) if (undergroundPavilions.has(b.parent || `${b.osmType}/${b.id}`)) b.undergroundPavilion = true;
console.log(`Underground: ${underground.sourceUndergroundWays} source ways, ${underground.structures.length} structures, ${underground.entries.length} subway entries`);
pedestrianStructures.appearance = observations.pedestrianStructureFamilies;
console.log(`Pedestrian bridges: ${pedestrianStructures.sourceBridgeWays} mapped ways, ${pedestrianStructures.structures.length} connected structures, ${pedestrianStructures.attachedWays} access ways`);

const churchSource = JSON.parse(fs.readFileSync(new URL('data/kazan-church-sites.json', import.meta.url), 'utf8'));
if (source.extract && churchSource.source.sha256 !== source.extract.sha256) throw new Error('Church-site and city sources differ');
const churchElements = new Map(churchSource.elements.map((e) => [`${e.type}/${e.id}`,e]));
function compileChurchSite(site) {
  const boundary = churchElements.get(site.boundaryReference);
  if (!boundary) throw new Error(`Missing church property ${site.boundaryReference}`);
  const gates = [], barriers = [];
  for (const reference of site.barrierReferences) {
    const way = churchElements.get(reference);
    if (!way?.geometry) throw new Error(`Missing church barrier ${reference}`);
    const pts = way.geometry.map(toWorld), distances = [0], openings = [];
    for (let i=1;i<pts.length;i++) distances.push(distances[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
    const length = distances.at(-1);
    if (way.tags.barrier === 'gate') {
      const a = pts[0], b = pts.at(-1), span = Math.hypot(b[0]-a[0],b[1]-a[1]);
      gates.push({ reference, centre:[(a[0]+b[0])/2,(a[1]+b[1])/2], normal:[-(b[1]-a[1])/span,(b[0]-a[0])/span], width:length });
      continue;
    }
    for (let i=0;i<way.nodes.length;i++) {
      const reference = `node/${way.nodes[i]}`, gate = churchElements.get(reference);
      if (!['gate','wicket_gate'].includes(gate?.tags.barrier)) continue;
      const estimate = site.gateWidths[reference];
      if (!estimate) throw new Error(`Church gate needs a mapped or estimated width: ${reference}`);
      const a = pts[Math.max(0,i-1)], b = pts[Math.min(pts.length-1,i+1)], span = Math.hypot(b[0]-a[0],b[1]-a[1]);
      openings.push({ start:distances[i]-estimate.width/2,end:distances[i]+estimate.width/2,reference });
      gates.push({ reference,centre:pts[i],normal:[-(b[1]-a[1])/span,(b[0]-a[0])/span],...estimate });
    }
    barriers.push({ reference,kind:way.tags.barrier,pts:flat(pts),openings });
  }
  if (site.entranceGap) {
    const entranceEnds = site.entranceGap.references.map((ref) => toWorld(churchElements.get(ref).geometry[0]));
    const [a,b] = entranceEnds, length = Math.hypot(b[0]-a[0],b[1]-a[1]);
    gates.push({ reference:'west-portico',centre:[(a[0]+b[0])/2,(a[1]+b[1])/2],normal:[-(b[1]-a[1])/length,(b[0]-a[0])/length],width:length });
  }
  return { ...site,boundary:flat(closedRing(boundary.geometry,bounds,0)),barriers,gates };
}
const churchSites = (observations.churchSites || []).map(compileChurchSite);
const worship = compileWorship(source.elements, { closedRing, joinMembers }, buildings, observations.worshipStyles);
console.log('Religious families:', worship.coverage);
const buildingDates = compileBuildingDates(source.elements, buildings, { cityGeometry, toWorld, source: source.extract });
console.log('City construction dates:', buildingDates.coverage.municipal);
const housingSource = readExtract('kazan-housing-materials');
const housingMaterials = compileHousingMaterials(source.elements, buildings, housingSource, { cityGeometry, toWorld });
const panelHousing = compilePanelHousing(source.elements, buildings, buildingDates, housingMaterials, observations.panelHousingStyles);
console.log('Panel housing families:', panelHousing.coverage);
const stalinkas = compileStalinkas(source.elements, buildings, buildingDates, observations.stalinkaStyles, roads);
console.log('Stalinka families:', stalinkas.coverage);
const prisonSource = JSON.parse(fs.readFileSync(new URL('data/kazan-prison-site.json', import.meta.url), 'utf8'));
if (source.extract && prisonSource.source.sha256 !== source.extract.sha256) throw new Error('Prison property and city sources differ');
const prisonElements = new Map(prisonSource.elements.map((e) => [`${e.type}/${e.id}`, e]));
const prisonSites = (observations.prisonSites || []).map((site) => {
  const boundary = prisonElements.get(site.boundaryReference);
  if (!boundary?.geometry) throw new Error(`Missing prison property ${site.boundaryReference}`);
  for (const ref of site.bodies) if (!buildingById.has(ref)) throw new Error(`Missing prison body ${ref}`);
  const nodeIds = new Set(boundary.nodes), gates = prisonSource.elements.filter((e) => e.type === 'node' && nodeIds.has(e.id) && /gate/.test(e.tags.barrier || ''))
    .map((e) => { const [x, z] = toWorld(e); return { reference: `node/${e.id}`, x, z }; });
  return { ...site, boundary: flat(closedRing(boundary.geometry)), gates, boundarySource: 'mapped-property', wallAppearanceSource: 'procedural-estimate' };
});
const powerSource = readExtract('kazan-power');
if (source.extract && powerSource.source.sha256 !== source.extract.sha256) throw new Error('Power network and city sources differ');
const power = { ...compilePower(powerSource.elements,{toWorld,clipRoad,closedRing,joinMembers}),source:powerSource.source };
const stationStructureSource = JSON.parse(fs.readFileSync(new URL('data/kazan-power-station-structures.json',import.meta.url),'utf8'));
if (source.extract && stationStructureSource.source.sha256 !== source.extract.sha256) throw new Error('Station structures and city sources differ');
power.stationStructures = stationStructureSource.elements.map((e) => {
  const observed=observations.powerStationStructures?.[`${e.type}/${e.id}`] || {},points=e.geometry.map(toWorld);
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),x=q((Math.min(...xs)+Math.max(...xs))/2),z=q((Math.min(...zs)+Math.max(...zs))/2);
  const pipeline=e.tags.man_made==='pipeline' || e.tags.bridge==='pipeline';
  if(pipeline && (!Array.isArray(e.nodes) || e.nodes.length!==points.length))throw new Error(`Station pipe route lacks source node identities: ${e.id}`);
  const ring=e.type==='way' && !pipeline?flat(closedRing(e.geometry)):undefined,mappedHeight=measure(e.tags.height);
  const h=mappedHeight || observed.height || observed.heightEstimate;
  return {...observed,id:e.id,osmType:e.type,station:e.station,kind:e.tags['tower:type']==='cooling'?'cooling-tower':e.tags.man_made,
    x,z,ring,pts:pipeline?flat(points):undefined,nodeIds:pipeline?e.nodes:undefined,location:e.tags.location,substance:e.tags.substance,layer:e.tags.layer,h,
    heightSource:mappedHeight?'osm-height':observed.height?'published-height':h?'reviewed-estimate':'unknown',
    geometrySource:pipeline?'mapped-route':ring?'mapped-footprint':'mapped-point',mappedSource:`https://www.openstreetmap.org/${e.type}/${e.id}`};
});
console.log(`Power: ${power.lines.length} line/cable ways, ${power.supports.length} supports, ${power.substations.length} substations`);
const tramSource = JSON.parse(fs.readFileSync(new URL('data/kazan-tram-routes.json', import.meta.url), 'utf8'));
if (source.extract && tramSource.source.sha256 !== source.extract.sha256) throw new Error('Tram and city sources differ');
const trams = compileTrams(source.elements, { toWorld, clipRoad, closedRing, joinMembers }, roads, tramSource);
console.log(`Trams: ${trams.tracks.length} tracks, ${trams.routes.length} directed routes, ${trams.stations.length} stops, ${trams.platforms.length} platforms`);
console.log(`Railways: ${railways.tracks.length} track ways, ${railways.graph.links.length} links, ${railways.stations.length} stations/halts, ${railways.platforms.length} platforms`);
const data = { version: 3, city: { name: 'Kazan', region: 'Tatarstan', localName: 'Казань · Казан' },
  source: { name: 'OpenStreetMap', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright', timestamp: source.osm3s?.timestamp_osm_base, extract: source.extract, importer: source.extract ? 'tools/import-kazan-osm.py' : undefined, query: source.extract ? undefined : 'tools/data/q_kazan.overpassql' },
  frame: { origin, bearingDeg: 0, units: 'm', kx, kz }, bounds, terrainBounds, nearTerrainBounds,
  elevation: terrain, landcover, railways, trams, power, fuel, education, sports, worship, buildingDates, stalinkas, panelHousing, pedestrianStructures, underground, churchSites, prisonSites, heightDataset: { ...heightData, heights: undefined },
  siteBoundaries: source.elements.filter((e) => e.type === 'relation' && e.id === 3867929).map((e) => ({ id: 'zilant', rings: joinMembers(e.members, 'outer').map((r) => flat(closedRing(r))) })),
  coverage, reliefSites: relief.sites.map((site) => { const [x, z] = toWorld(site); return { ...site, x, z }; }), roads, roadGraph: { nodes: graphNodes, links: graphLinks, names }, buildings, buildingAliases, attractions, aircraft, structures, recreation, campuses, campusFeatures, passages: passages.map(({ corridor, bounds, ...p }) => p), helipads, parkings, parks, forests, cemeteries, airfields, water, walls, landmarks };
if (roads.length < 1000 || buildings.length < 1000 || !water.some((w) => w.name === 'Kazanka')) throw new Error('Incomplete Kazan geography');
const payload = output.replace(/\.js$/, '') + '.json.gz';
const json = JSON.stringify(data);
const packed = gzipSync(json, { level: 9 });
const version = createHash('sha256').update(packed).digest('hex').slice(0, 16);
fs.writeFileSync(payload, packed);
fs.writeFileSync(output, `/* GENERATED by tools/build-kazan-geodata.mjs. © OpenStreetMap contributors, ODbL-1.0. */\nexport const GEO_DATA_FILE = ${JSON.stringify(basename(payload))};\nexport const GEO_DATA_VERSION = ${JSON.stringify(version)};\n`);
console.log(`Kazan: ${roads.length} road/path ways, ${graphLinks.length} drivable links, ${buildings.length} building footprints, ${parks.length} parks, ${water.length} water bodies`);
console.log('Heights:', Object.fromEntries(['osm-height', 'published-height', 'reviewed-estimate', 'osm-levels', 'gba', 'footprint-lowrise-estimate', 'fallback', 'fallback-part', 'construction-stage'].map((s) => [s, buildings.filter((b) => b.heightSource === s).length])));
console.log(`Wrote ${output} and ${payload} (${(fs.statSync(payload).size / 1024 / 1024).toFixed(1)} MiB compressed, ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MiB decoded)`);
