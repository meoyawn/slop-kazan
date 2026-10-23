import { runtime, loading } from './kazan-runtime.js';

export let SkyMesh, SunLight, SunLightNode, bloom, ssr, ClusteredLighting;

export async function loadEngine() {
  if (!navigator.gpu) throw new Error('WebGPU is required to run the city.');
  loading.update(1, 'Loading the game engine…');
  const slow = setTimeout(() => loading.update(1, 'The engine download is taking a while. You can retry below.'), 20000);
  let deadline;
  try {
    const modules = Promise.all([
      import('three/webgpu'), import('three/tsl'), import('three/addons/utils/BufferGeometryUtils.js'),
      runtime.lite ? {} : import('three/addons/objects/SkyMesh.js'),
      runtime.lite ? {} : import('three/addons/lights/SunLight.js'),
      runtime.lite ? {} : import('three/addons/lights/SunLightNode.js'),
      runtime.lite ? {} : import('three/addons/tsl/display/BloomNode.js'),
      runtime.lite ? {} : import('three/addons/tsl/display/SSRNode.js'),
      runtime.lite ? {} : import('three/addons/lighting/ClusteredLighting.js')
    ]);
    const [, , , sky, sun, sunNode, effects, reflections, clustered] = await Promise.race([modules, new Promise((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Engine download timed out')), 90000);
    })]);
    SkyMesh = sky.SkyMesh;
    SunLight = sun.SunLight;
    SunLightNode = sunNode.SunLightNode;
    bloom = effects.bloom;
    ssr = reflections.ssr;
    ClusteredLighting = clustered.ClusteredLighting;
  } finally { clearTimeout(slow); clearTimeout(deadline); }
}
