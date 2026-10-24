import polygonClipping from 'polygon-clipping';
import { polygonContains } from '../js/footprints.js';

const polygon = (b) => [b.ring, ...b.holes].map((ring) => Array.from({ length: ring.length / 2 }, (_, i) => [ring[i * 2], ring[i * 2 + 1]]));
const outline = (p) => ({ ring: p[0].slice(0, -1).flat(), holes: p.slice(1).map((r) => r.slice(0, -1).flat()) });

/** A raised corner is an explicit estimate bounded by the mapped maximum height; a spire is never inferred. */
export function inferStalinkaComposition(b, frontage, parts = []) {
  const mappedTower = parts.filter((p) => !p.minHeight && p.h >= b.h + 2 && p.levels > b.levels &&
    !p.model && p.architectureFamily === 'stalinka').sort((a, c) => c.h - a.h)[0];
  if (b.hasParts && mappedTower) return { mappedTower: `${mappedTower.osmType}/${mappedTower.id}`, wingHeight: b.h,
    wingLevels: b.levels, wingRoofHeight: b.roofHeight, wingRoofShape: b.roofShape, evidence: 'mapped-raised-building-part' };
  if (b.hasParts || b.levels < 6 || b.h < 18 || b.facadeFamily !== 'stalinka-neoclassical') return null;
  const faces = frontage?.faces || [];
  for (let i = 0; i < faces.length; i++) for (let j = 0; j < i; j++) {
    const a = faces[i], c = faces[j], dot = a.nx * c.nx + a.nz * c.nz;
    if (Math.abs(dot) > 0.5) continue;
    const dx = a.bx - a.ax, dz = a.bz - a.az, ex = c.bx - c.ax, ez = c.bz - c.az, determinant = dx * ez - dz * ex;
    const t = ((c.ax - a.ax) * ez - (c.az - a.az) * ex) / determinant;
    const x = a.ax + dx * t, z = a.az + dz * t;
    if (Math.min(Math.hypot(x - a.ax, z - a.az), Math.hypot(x - a.bx, z - a.bz)) > 22 ||
        Math.min(Math.hypot(x - c.ax, z - c.az), Math.hypot(x - c.bx, z - c.bz)) > 22) continue;
    const width = Math.min(18, Math.max(11, b.h * 0.6)), offset = width / (2 * (1 + dot));
    const cx = x - (a.nx + c.nx) * offset, cz = z - (a.nz + c.nz) * offset;
    if (!polygonContains(b.ring, cx, cz) || b.holes.some((r) => polygonContains(r, cx, cz))) continue;
    return { wingHeight: Math.round(((b.h - b.roofHeight) / b.levels * (b.levels - 2) + 1) * 10) / 10,
      wingLevels: b.levels - 2, wingRoofHeight: 1,
      tower: { x: cx, z: cz, yaw: a.yaw, width, depth: width, height: b.h, levels: b.levels },
      evidence: 'postwar-two-exposed-street-fronts-corner-height-estimate' };
  }
  return null;
}

/** Preserve raw mapped heights while deriving reusable low-wing / raised-tower render sections. */
export function compileStalinkaComposition(b, parts, profile) {
  if (!profile) return null;
  const mappedTower = parts.find((p) => `${p.osmType}/${p.id}` === profile.mappedTower);
  let tower;
  if (mappedTower) tower = { ...mappedTower, levels: profile.towerLevels || mappedTower.levels };
  else {
    const t = profile.tower, cs = Math.cos(t.yaw), sn = Math.sin(t.yaw);
    const patch = { ring: [[-1,-1],[1,-1],[1,1],[-1,1]].flatMap(([u,v]) =>
      [t.x + u * t.width / 2 * cs + v * t.depth / 2 * sn, t.z - u * t.width / 2 * sn + v * t.depth / 2 * cs]), holes: [] };
    const clipped = polygonClipping.intersection(polygon(b), polygon(patch));
    if (clipped.length !== 1) throw Error(`Ambiguous Stalinka tower footprint ${b.id}`);
    tower = { ...b, ...outline(clipped[0]), h: t.height, minHeight: 0, levels: t.levels, roofShape: 'flat', roofHeight: 0 };
  }
  const sources = [...(b.hasParts ? b.body || [] : [b]).map((p) => ({ ...b, ...p, h: profile.wingHeight, levels: profile.wingLevels,
    roofShape: profile.wingRoofShape || 'hipped', roofHeight: profile.wingRoofHeight ?? 1 })),
    ...parts.filter((p) => p !== mappedTower && `${p.osmType}/${p.id}` !== profile.mappedLantern).map((p) =>
      profile.evidence !== 'mapped-raised-building-part' && !p.minHeight && p.h <= profile.wingHeight ?
        { ...p, h: profile.wingHeight, roofShape: profile.wingRoofShape || 'hipped', roofHeight: profile.wingRoofHeight ?? 1 } : p)];
  const sections = [];
  function add(source, shape, role) {
    const section = { ...shape, h: source.h, minHeight: source.minHeight, levels: source.levels,
      roofShape: source.roofShape, roofHeight: source.roofHeight, role,
      evidence: profile.evidence || (mappedTower ? 'mapped-parts-with-photographed-roles' : 'photographed-wing-and-corner-height-estimate'),
      appearance: { ...source.appearance, floorHeight: Math.round((source.h - source.minHeight - source.roofHeight) / (source.levels || 1) * 4) / 4 } };
    if (source.openingVolumes) {
      const volumes = [];
      for (const v of source.openingVolumes) {
        const h = Math.min(v.h, section.h); if (h <= v.minHeight) continue;
        for (const p of polygonClipping.intersection(polygon(shape), polygon(v))) volumes.push({ ...outline(p), minHeight: v.minHeight, h });
      }
      if (volumes.length) section.openingVolumes = volumes;
    }
    sections.push(section);
  }
  for (const source of sources) {
    for (const p of polygonClipping.difference(polygon(source), polygon(tower))) add(source, outline(p), 'wing-or-mapped-annex');
  }
  add(tower, { ring: tower.ring, holes: tower.holes }, 'raised-tower');
  return sections;
}
