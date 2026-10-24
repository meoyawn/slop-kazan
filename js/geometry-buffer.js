import * as THREE from 'three/webgpu';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

const MAGIC = 0x4b5a4731;
const TYPES = { Float64Array, Float32Array, Uint32Array, Uint16Array };
const aligned = (length) => Math.ceil(length / 4) * 4;

/** Decode directly into one GPU-ready allocation without JavaScript vertex objects. */
export async function decodeGeometry(buffer) {
  await MeshoptDecoder.ready;
  if (buffer.byteLength < 16) throw new Error('Truncated geometry buffer');
  const header = new Uint32Array(buffer, 0, 4);
  if (header[0] !== MAGIC || header[3] !== 2) throw new Error('Unsupported geometry buffer');
  const start = 16 + aligned(header[1]);
  if (start + header[2] !== buffer.byteLength) throw new Error('Truncated geometry payload');
  const descriptor = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, header[1])));
  if (!Number.isSafeInteger(descriptor.decodedSize) || descriptor.decodedSize < 0 || descriptor.decodedSize > 536870912) throw new Error('Invalid geometry size');
  const decoded = new ArrayBuffer(descriptor.decodedSize);
  const geometry = new THREE.BufferGeometry();
  if (descriptor.userData) geometry.userData = descriptor.userData;
  for (const field of descriptor.attributes) {
    const Type = TYPES[field.type];
    if (!Type || field.offset + field.encodedLength > header[2] || field.decodedOffset + field.length * Type.BYTES_PER_ELEMENT > decoded.byteLength) throw new Error('Invalid geometry attribute');
    const values = new Type(decoded, field.decodedOffset, field.length);
    const target = new Uint8Array(decoded, field.decodedOffset, values.byteLength);
    const source = new Uint8Array(buffer, start + field.offset, field.encodedLength);
    const count = field.length / field.itemSize, stride = field.itemSize * Type.BYTES_PER_ELEMENT;
    if (count) {
      if (field.name === 'index') MeshoptDecoder.decodeIndexSequence(target, count, stride, source);
      else MeshoptDecoder.decodeVertexBuffer(target, count, stride, source);
    }
    const attribute = new THREE.BufferAttribute(values, field.itemSize, field.normalized);
    if (field.name === 'index') geometry.setIndex(attribute);
    else geometry.setAttribute(field.name, attribute);
  }
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...descriptor.box[0]), new THREE.Vector3(...descriptor.box[1]));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(...descriptor.sphere[0]), descriptor.sphere[1]);
  return geometry;
}
