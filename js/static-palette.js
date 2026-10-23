import * as THREE from 'three/webgpu';

/** Shared plain surface families; colour belongs to each part rather than its draw. */
export function createStaticPalette() {
  const registered = new WeakSet();
  const families = new Map();

  function register(material) {
    registered.add(material);
    return material;
  }

  function materialFor(material, vertexColors = false) {
    if (!registered.has(material) || material.transparent || material.opacity !== 1 || material.alphaTest ||
        material.vertexColors || material.emissive.getHex() !== 0 || material.wireframe || material.flatShading ||
        !material.depthWrite || !material.depthTest || material.blending !== THREE.NormalBlending ||
        Object.keys(material).some((key) => (key.endsWith('Node') || key.endsWith('Map') || key === 'map') && material[key])) return null;
    const key = [material.metalness, material.roughness, material.side, material.shadowSide,
      material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits,
      material.toneMapped, material.fog, vertexColors].join('/');
    if (!families.has(key)) {
      const shared = material.clone();
      shared.color.set(0xffffff);
      shared.vertexColors = vertexColors;
      shared.name = 'StaticPalette';
      families.set(key, shared);
    }
    return families.get(key);
  }

  function paint(geometry, material) {
    const shared = materialFor(material, true);
    if (!shared) return material;
    const colours = new Float32Array(geometry.attributes.position.count * 3);
    const { r, g, b } = material.color;
    for (let i = 0; i < colours.length; i += 3) {
      colours[i] = r;
      colours[i + 1] = g;
      colours[i + 2] = b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return shared;
  }

  return { register, materialFor, paint };
}
