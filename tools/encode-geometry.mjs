import { MeshoptEncoder } from 'meshoptimizer/encoder';

const MAGIC = 0x4b5a4731;
const aligned = (length) => Math.ceil(length / 4) * 4;

/** One small descriptor followed by directly uploadable typed arrays. */
export async function encodeGeometry(geometry) {
  await MeshoptEncoder.ready;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const fields = Object.entries(geometry.attributes);
  if (geometry.index) fields.push(['index', geometry.index]);
  let size = 0, decodedSize = 0;
  const chunks = [];
  const attributes = fields.map(([name, attribute]) => {
    const array = attribute.array, bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const stride = attribute.itemSize * array.BYTES_PER_ELEMENT;
    const chunk = !attribute.count ? new Uint8Array(0) : name === 'index'
      ? MeshoptEncoder.encodeIndexSequence(bytes, attribute.count, stride)
      : MeshoptEncoder.encodeVertexBuffer(bytes, attribute.count, stride);
    const field = { name, type: array.constructor.name, itemSize: attribute.itemSize,
      normalized: attribute.normalized, offset: size, encodedLength: chunk.length,
      decodedOffset: decodedSize, length: array.length };
    size += chunk.length;
    decodedSize += aligned(array.byteLength);
    chunks.push(chunk);
    return field;
  });
  const descriptor = new TextEncoder().encode(JSON.stringify({ attributes, decodedSize,
    ...(Object.keys(geometry.userData).length ? { userData: geometry.userData } : {}),
    box: [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()],
    sphere: [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius] }));
  const start = 16 + aligned(descriptor.length), buffer = new ArrayBuffer(start + size);
  new Uint32Array(buffer, 0, 4).set([MAGIC, descriptor.length, size, 2]);
  new Uint8Array(buffer, 16, descriptor.length).set(descriptor);
  chunks.forEach((chunk, i) => new Uint8Array(buffer, start + attributes[i].offset, chunk.length).set(chunk));
  return buffer;
}

