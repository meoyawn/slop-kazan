import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

/** Compare the shipped ground sampler with saved independent SRTM observations. */
const root = new URL('../', import.meta.url);
const readJSON = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const geo = JSON.parse(gunzipSync(readFileSync(new URL('js/kazan-geodata.json.gz', root))));
const check = readJSON('tools/data/kazan-srtm-check.json');
const context = vm.createContext({ window: { NYC: { GEO: geo } } });
vm.runInContext(readFileSync(new URL('js/kazan-config.js', root), 'utf8'), context);
const city = context.window.NYC;

function observation(point, index) {
  const x = (point.lon - geo.frame.origin.lon) * geo.frame.kx;
  const z = (geo.frame.origin.lat - point.lat) * geo.frame.kz;
  const b = geo.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) throw new Error(`Missing coverage at ${point.id}`);
  const reference = check.response.results[index];
  if (!Number.isFinite(reference?.elevation) || Math.abs(reference.location.lat - point.lat) > 1e-6 || Math.abs(reference.location.lng - point.lon) > 1e-6) {
    throw new Error(`SRTM observation is missing or mismatched at ${point.id}`);
  }
  const fabdemASL = Math.round((city.terrainHeight(x, z) + geo.elevation.datum) * 10) / 10;
  const srtmASL = reference.elevation;
  return { ...point, fabdemASL, srtmASL, difference: Math.round((fabdemASL - srtmASL) * 10) / 10, water: !!city.waterAt(x, z) };
}

const samples = check.points.map(observation);
const sites = geo.reliefSites.map((site) => ({ ...site, ...samples.find((p) => p.id === site.id) }));
const profile = samples.filter((p) => p.id.startsWith('uslon-profile-'));
const peak = sites.find((p) => p.id === 'sokolka');
const audit = {
  checkedAt: check.retrievedAt,
  note: 'Representative terrain controls, not a surveyed summit ranking. Independent DEM disagreement remains visible; observations do not forcibly deform the shipped terrain.',
  sources: { ground: geo.elevation.url, independent: 'https://www.opentopodata.org/datasets/srtm/', requests: [check.url, ...(check.additionalQueries || [])], registry: 'kazan-relief-sites.json' },
  sites,
  uslon: { summit: peak, heightAboveWaterDatum: Math.round((peak.fabdemASL - geo.elevation.datum) * 10) / 10,
    profile, note: 'The cross-bank profile retains the full bluff. Water is rendered at the approximate 53 m datum, independently of raw DEM water pixels.' },
  differencesAboveEightMetres: sites.filter((p) => Math.abs(p.difference) > 8).map((p) => p.id)
};
writeFileSync(new URL('tools/data/kazan-relief-audit.json', root), `${JSON.stringify(audit, null, 2)}\n`);
console.table(sites.map(({ id, fabdemASL, srtmASL, difference }) => ({ id, fabdemASL, srtmASL, difference })));
