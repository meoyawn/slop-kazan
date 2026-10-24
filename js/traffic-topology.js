import * as THREE from 'three/webgpu';

const NODE_FIELDS = ['x', 'z', 'hx', 'hz', 'signal', 'sideCount', 'groupCount'];
const EDGE_FIELDS = ['sx', 'sz', 'dx', 'dz', 'rx', 'rz', 'len', 'half', 'clx', 'clz', 'x0', 'z0', 'axis', 'general'];
const AXES = ['ave', 'st'], TURNS = ['S', 'L', 'R'];

/** Store live road topology in exact numeric tables, independently of construction intermediates and actors. */
export function packTrafficTopology(network, roads) {
  const geometry = new THREE.BufferGeometry(), roadIds = new Map(roads.map((road, id) => [road, id]));
  function fields(records, names, name) {
    const values = new Float64Array(records.length * names.length), presence = new Uint32Array(records.length);
    for (const [id, record] of records.entries()) {
      if (record.id !== id) throw new Error(`Non-sequential ${name} identity`);
      for (const [column, key] of names.entries()) {
        if (!Object.hasOwn(record, key)) continue;
        const value = record[key], kind = value === undefined ? 1 : value === null ? 3 : 2;
        presence[id] |= kind << (column * 2);
        if (kind !== 2) continue;
        const encoded = key === 'axis' ? AXES.indexOf(value) : typeof value === 'boolean' ? Number(value) : value;
        if (typeof encoded !== 'number' || !Number.isFinite(encoded) || key === 'axis' && encoded < 0) throw new Error(`Unsupported ${name}.${key}`);
        values[id * names.length + column] = encoded;
      }
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, names.length));
    geometry.setAttribute(`${name}Presence`, new THREE.BufferAttribute(presence, 1));
  }
  fields(network.nodes, NODE_FIELDS, 'nodes'); fields(network.edges, EDGE_FIELDS, 'edges');
  const links = new Uint32Array(network.edges.length * 11);
  const laneCount = network.edges.reduce((sum, edge) => sum + edge.lanes.length, 0);
  const moves = network.edges.flatMap((edge) => edge.moves), outCount = moves.reduce((sum, move) => sum + move.out.length, 0);
  const lanes = new Float64Array(laneCount), moveLinks = new Uint32Array(moves.length * 4), cross = new Float64Array(moves.length), out = new Uint32Array(outCount);
  let laneStart = 0, moveStart = 0, outStart = 0;
  for (const [id, edge] of network.edges.entries()) {
    if (edge.road && !roadIds.has(edge.road)) throw new Error('Traffic road is outside the mapped source');
    links.set([edge.from.id, edge.to.id, edge.opposite ? edge.opposite.id + 1 : 0, edge.road ? roadIds.get(edge.road) + 1 : 0,
      laneStart, edge.lanes.length, moveStart, edge.moves.length, edge.inSide, edge.outSide, edge.axisIndex], id * 11);
    lanes.set(edge.lanes, laneStart); laneStart += edge.lanes.length;
    for (const move of edge.moves) {
      const turn = TURNS.indexOf(move.turn);
      if (turn < 0) throw new Error(`Unsupported traffic turn ${move.turn}`);
      moveLinks.set([move.to.id, turn, outStart, move.out.length], moveStart * 4);
      cross[moveStart] = move.cross;
      for (const lane of move.out) out[outStart++] = lane + 1;
      moveStart++;
    }
  }
  geometry.setAttribute('edgeLinks', new THREE.BufferAttribute(links, 11));
  geometry.setAttribute('lanes', new THREE.BufferAttribute(lanes, 1));
  geometry.setAttribute('moveLinks', new THREE.BufferAttribute(moveLinks, 4));
  geometry.setAttribute('cross', new THREE.BufferAttribute(cross, 1));
  geometry.setAttribute('out', new THREE.BufferAttribute(out, 1));
  geometry.userData.topologyVersion = 1;
  geometry.boundingBox = new THREE.Box3();
  for (const node of network.nodes) geometry.boundingBox.expandByPoint(new THREE.Vector3(node.x, 0, node.z));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

/** Restore only live lane/junction records and their shared mapped road identities. */
export function unpackTrafficTopology(geometry, roads) {
  if (geometry.userData.topologyVersion !== 1) throw new Error('Unsupported traffic topology');
  const attributes = geometry.attributes;
  function fields(names, name) {
    const data = attributes[name], presence = attributes[`${name}Presence`].array, records = [];
    for (let id = 0; id < data.count; id++) {
      const record = { id };
      for (const [column, key] of names.entries()) {
        const kind = (presence[id] >>> (column * 2)) & 3;
        if (!kind) continue;
        const value = data.array[id * names.length + column];
        record[key] = kind === 1 ? undefined : kind === 3 ? null : key === 'axis' ? AXES[value] :
          key === 'signal' || key === 'general' ? Boolean(value) : value;
      }
      records.push(record);
    }
    return records;
  }
  const nodes = fields(NODE_FIELDS, 'nodes'), edges = fields(EDGE_FIELDS, 'edges');
  const links = attributes.edgeLinks.array, lanes = attributes.lanes.array, moves = attributes.moveLinks.array;
  const cross = attributes.cross.array, out = attributes.out.array;
  for (const node of nodes) { node.in = []; node.out = []; }
  for (const [id, edge] of edges.entries()) {
    const start = id * 11, laneStart = links[start + 4], laneCount = links[start + 5];
    edge.from = nodes[links[start]]; edge.to = nodes[links[start + 1]];
    edge.opposite = links[start + 2] ? edges[links[start + 2] - 1] : null;
    edge.road = links[start + 3] ? roads[links[start + 3] - 1] : undefined;
    edge.inSide = links[start + 8]; edge.outSide = links[start + 9]; edge.axisIndex = links[start + 10];
    edge.lanes = Array.from(lanes.subarray(laneStart, laneStart + laneCount));
    edge.moves = [];
    for (let move = links[start + 6]; move < links[start + 6] + links[start + 7]; move++) {
      const offset = move * 4, to = moves[offset], outStart = moves[offset + 2], count = moves[offset + 3];
      edge.moves.push({ to: edges[to], turn: TURNS[moves[offset + 1]], cross: cross[move],
        out: Array.from(out.subarray(outStart, outStart + count), (lane) => lane - 1) });
    }
    edge.from.out.push(edge); edge.to.in.push(edge);
  }
  return { nodes, edges };
}
