// Part 6: the street centreline as a graph, for the drivable road network where the Manhattan grid ends (Lower
// Manhattan's non-grid streets, js/road-network.js). Every at-grade street piece of the CSCL runs between two nodes
// (intersections, dead ends, attribute changes): its ends become graph nodes (merged within 1 m) and the piece a link
// with its curb-to-curb width, travel lanes and direction of travel.
import { cscl, segLines, toWorld, rdp, log } from './geo-base.mjs';
import { STREETS } from './geo-streets.mjs';

const MERGE = 1.0; // m: piece ends this close are the same node

export function buildRoadGraph() {
  const st14 = STREETS.find((s) => s.n === 14);
  const zFrom = (st14 ? st14.z : 2219) - 60; // from just north of 14th St down to the Battery
  const nodes = [];
  const cells = new Map();
  const cellKey = (ix, iz) => ix * 100003 + iz;
  function nodeAt(x, z) {
    const ix = Math.floor(x / MERGE), iz = Math.floor(z / MERGE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const id of cells.get(cellKey(ix + dx, iz + dz)) || []) {
          if (Math.hypot(nodes[id][0] - x, nodes[id][1] - z) <= MERGE) return id;
        }
      }
    }
    const id = nodes.length;
    nodes.push([x, z]);
    const k = cellKey(ix, iz);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(id);
    return id;
  }
  const names = [];
  const nameIds = new Map();
  const nameId = (n) => {
    if (!nameIds.has(n)) { nameIds.set(n, names.length); names.push(n); }
    return nameIds.get(n);
  };
  const links = [];
  let skipped = 0;
  for (const s of cscl) {
    if (s.rw_type !== '1' || s.from_level_code !== '13' || s.to_level_code !== '13') continue; // at-grade streets
    const name = s.full_street_name || '';
    if (/DRIVEWAY|PEDESTRIAN|ALLEY|\bALY\b|CONNECTOR|TRANSVERSE|SERVICE RD/.test(name)) continue;
    const dir = s.trafdir === 'TW' ? 0 : s.trafdir === 'FT' ? 1 : s.trafdir === 'TF' ? -1 : null;
    if (dir === null) { skipped++; continue; } // non-vehicular
    const w = parseFloat(s.streetwidth || '0') * 0.3048;
    const lanes = parseInt(s.number_travel_lanes || '0', 10);
    for (const ln of segLines(s)) {
      const pts = ln.map(([lon, lat]) => toWorld(lon, lat));
      if (pts.length < 2 || Math.max(...pts.map((p) => p[1])) < zFrom) continue;
      const a = nodeAt(...pts[0]);
      const b = nodeAt(...pts[pts.length - 1]);
      if (a === b) continue;
      const line = rdp(pts, 0.4);
      links.push([a, b, nameId(name), Math.round(w * 10) / 10, lanes, dir, line]);
    }
  }
  // keep only the nodes the links use, renumbered
  const used = new Map();
  const outNodes = [];
  const idOf = (i) => {
    if (!used.has(i)) { used.set(i, outNodes.length / 2); outNodes.push(Math.round(nodes[i][0] * 10) / 10, Math.round(nodes[i][1] * 10) / 10); }
    return used.get(i);
  };
  const outLinks = links.map(([a, b, n, w, lanes, dir, line]) => {
    const ia = idOf(a), ib = idOf(b);
    // inner shape points only (the ends are the nodes)
    const inner = line.slice(1, -1).flatMap(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    return [ia, ib, n, w, lanes, dir, inner];
  });
  log(`road graph: ${outNodes.length / 2} nodes, ${outLinks.length} links south of z=${Math.round(zFrom)} (${skipped} non-vehicular pieces skipped)`);
  return { nodes: outNodes, links: outLinks, names };
}
