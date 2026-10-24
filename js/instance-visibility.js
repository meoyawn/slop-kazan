/** Keep complete instance records together while owners enter or leave a regional draw. */
export function createInstanceVisibility(mesh, owners) {
  mesh.userData ??= {};
  mesh.userData.dynamicInstances = true;
  const count = mesh.count;
  const rows = new Uint32Array(count), locations = new Uint32Array(count);
  for (let i = 0; i < count; i++) rows[i] = locations[i] = i;
  function currentFields() {
    const fields = new Map();
    function add(attribute) {
      if (!attribute) return;
      const buffer = attribute.isInterleavedBufferAttribute ? attribute.data : attribute;
      if (fields.has(buffer)) return;
      if ((buffer.meshPerAttribute || 1) !== 1) throw new Error('Regional visibility requires one record per instance');
      fields.set(buffer, { array: buffer.array, stride: buffer.stride || buffer.itemSize });
    }
    add(mesh.instanceMatrix);
    add(mesh.instanceColor);
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      if (attribute.isInstancedBufferAttribute || attribute.data?.isInstancedInterleavedBuffer) add(attribute);
    }
    return fields;
  }
  const entries = new Map(owners.map((owner) => [owner.key, { start: owner.start, count: owner.count, visible: true }]));

  function swap(a, b, fields) {
    if (a === b) return;
    const first = rows[a], second = rows[b];
    rows[a] = second; rows[b] = first;
    locations[first] = b; locations[second] = a;
    for (const { array, stride } of fields.values()) {
      for (let j = 0; j < stride; j++) {
        const value = array[a * stride + j];
        array[a * stride + j] = array[b * stride + j];
        array[b * stride + j] = value;
      }
    }
  }

  function setVisible(key, visible) {
    const owner = entries.get(key);
    if (!owner || owner.visible === visible) return;
    const fields = currentFields();
    owner.visible = visible;
    for (let id = owner.start; id < owner.start + owner.count; id++) {
      const row = locations[id];
      if (visible) swap(row, mesh.count++, fields);
      else swap(row, --mesh.count, fields);
    }
    for (const buffer of fields.keys()) buffer.needsUpdate = true;
  }

  return { setVisible };
}
