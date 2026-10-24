import { createHash } from 'node:crypto';

/** Assemble bounded faces only along mapped barrier edges and shared OSM nodes; never bridge a gap by proximity. */
export function compileEducationalEnclosures(elements, { toWorld }) {
  const nodes = new Map(), edges = new Map();
  const edgeKey = (a, b) => a < b ? `${a}/${b}` : `${b}/${a}`;
  for (const way of elements.filter((e) => e.type === 'way' && /^(fence|wall|hedge|gate|lift_gate)$/.test(e.tags?.barrier || ''))) {
    if (!way.nodes?.length || way.nodes.length !== way.geometry?.length) continue;
    for (let i = 0; i < way.nodes.length; i++) {
      const id = way.nodes[i];
      if (!nodes.has(id)) nodes.set(id, { point: toWorld(way.geometry[i]), next: new Set() });
      if (!i || id === way.nodes[i - 1]) continue;
      const before = way.nodes[i - 1], key = edgeKey(before, id);
      nodes.get(id).next.add(before); nodes.get(before).next.add(id);
      if (!edges.has(key)) edges.set(key, new Set());
      edges.get(key).add(way.id);
    }
  }
  for (const node of nodes.values()) node.next = [...node.next].sort((a, b) => {
    const p = nodes.get(a).point, q = nodes.get(b).point, at = node.point;
    return Math.atan2(p[1] - at[1], p[0] - at[0]) - Math.atan2(q[1] - at[1], q[0] - at[0]) || a - b;
  });
  const visited = new Set(), enclosures = [];
  for (const [start, node] of nodes) for (const next of node.next) {
    const first = `${start}/${next}`;
    if (visited.has(first)) continue;
    let a = start, b = next, closed = false;
    const ids = [], boundaryEdges = [];
    while (!visited.has(`${a}/${b}`)) {
      visited.add(`${a}/${b}`); ids.push(a); boundaryEdges.push(edgeKey(a, b));
      const at = nodes.get(b), from = at.next.indexOf(a);
      a = b; b = at.next[(from - 1 + at.next.length) % at.next.length];
      if (`${a}/${b}` === first) { closed = true; break; }
    }
    if (!closed || ids.length < 3 || new Set(ids).size !== ids.length) continue;
    const points = ids.map((id) => nodes.get(id).point);
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
    // The opposite winding is the unbounded exterior face. Keep conservative school-scale candidates.
    if (area < 200 || area > 400000) continue;
    const references = [...new Set(boundaryEdges.flatMap((key) => [...edges.get(key)]))].sort((x, y) => x - y).map((id) => `way/${id}`);
    // A content identity for provenance only; the yard layout never uses this hash or any random seed.
    const identity = createHash('sha256').update(boundaryEdges.sort().join(',')).digest('hex').slice(0, 16);
    enclosures.push({ reference: references.length === 1 ? references[0] : `enclosure/${identity}`, references, ring: points.flat() });
  }
  return enclosures.sort((a, b) => a.reference.localeCompare(b.reference));
}
