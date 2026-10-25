import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { cityUniforms } from './tsl-materials.js';

const { Fn, uniform, float, vec2, color, uv, fract, floor, abs, sin, dot, fwidth, smoothstep, step, max, mix, pow,
  clamp, sqrt, attribute, positionGeometry, normalGeometry, cameraPosition, positionWorld, normalWorldGeometry, normalize } = TSL;
const materials = new Map();
const facadeHash = Fn(([p]) => fract(sin(dot(p,vec2(127.1,311.7))).mul(43758.5453)));
const facadeNoise = Fn(([p]) => {
  const i=floor(p),f=fract(p),u=f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(mix(facadeHash(i),facadeHash(i.add(vec2(1,0))),u.x),
    mix(facadeHash(i.add(vec2(0,1))),facadeHash(i.add(vec2(1,1))),u.x),u.y);
});

/** Pixel footprints integrate complete periods, retaining the mean glazing coverage below one pixel. */
const filteredPulse = Fn(([coordinate, width]) => {
  const lo = float(0.5).sub(width.mul(0.5)), hi = float(0.5).add(width.mul(0.5));
  const halfPixel = max(fwidth(coordinate), 0.0001).mul(0.5);
  function integral(t) {
    return floor(t).mul(width).add(clamp(fract(t), lo, hi).sub(lo));
  }
  return integral(coordinate.add(halfPixel)).sub(integral(coordinate.sub(halfPixel))).div(halfPixel.mul(2)).clamp(0, 1);
});

/** Distant city silhouettes share a plain wall/roof material, independent of residential detail. */
export function createDistantFacadeMaterial() {
  const wall = attribute('kFacadeWall', 'vec3'), roof = attribute('kFacadeRoof', 'vec3');
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  material.colorNode = mix(wall, roof, step(0.5, normalGeometry.y));
  return material;
}

/** Instance transforms carry the dimensions; only two linear colours travel with each low-poly box. */
export function createDistantFacadeGeometry(records) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const packed = new Float32Array(records.length * 6), tint = new THREE.Color();
  for (let i = 0; i < records.length; i++) {
    tint.set(records[i].b.appearance?.wallColour ?? records[i].wallColour).toArray(packed, i * 6);
    tint.setHex(records[i].roofColour).toArray(packed, i * 6 + 3);
  }
  const buffer = new THREE.InstancedInterleavedBuffer(packed, 6);
  geometry.setAttribute('kFacadeWall', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geometry.setAttribute('kFacadeRoof', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  return geometry;
}

/** Reviewed paint zones and glazing; dimensions describe repeatable facade bays, not a photo texture. */
export function createObservedFacadeMaterial(a) {
  const key = JSON.stringify(a);
  if (materials.has(key)) return materials.get(key);
  const wall = uniform(new THREE.Color(a.wallColour));
  const accent = uniform(new THREE.Color(a.accentColour || a.wallColour));
  const trim = uniform(new THREE.Color(a.trimColour || '#e5e5dd'));
  const plinth = uniform(new THREE.Color(a.plinthColour || a.wallColour));
  const glass = uniform(new THREE.Color(a.glassColour || '#456b7c'));
  const face = a.panelHousing || a.facadeEnds ? attribute('kPanelFace', 'vec3') : null;
  const isEnd = face ? float(1).sub(step(uniform(a.panelEndThreshold || 0), face.x)) : float(0);
  const endWindows = face ? mix(float(1), filteredPulse(uv().x.sub(face.y).div(face.x.max(1)), uniform(a.panelEndGlazing ?? 0.24)), isEnd) : float(1);
  const longWall = float(1).sub(isEnd);
  const bay = uniform(a.bayWidth || 3), storey = uniform(a.floorHeight || 3);
  const module = uniform(a.moduleBays || 6), zoneWidth = uniform(a.zoneWidth ?? 0.38);
  const windowWidth = uniform(a.windowRatioX || 0.45), windowHeight = uniform(a.windowRatioY || 0.55);
  const zone = fract(uv().x.div(bay.mul(module)).add(uniform(a.zonePhase || 0)));
  const aa = fwidth(zone).max(0.001);
  const inZone = smoothstep(float(0.5).sub(zoneWidth.mul(0.5)).sub(aa), float(0.5).sub(zoneWidth.mul(0.5)).add(aa), zone)
    .mul(float(1).sub(smoothstep(float(0.5).add(zoneWidth.mul(0.5)).sub(aa), float(0.5).add(zoneWidth.mul(0.5)).add(aa), zone)));
  const grid = vec2(uv().x.div(bay), uv().y.div(storey)), cell = fract(grid), fw = fwidth(grid).max(vec2(0.002));
  const stairs = a.stairBays ? inZone.mul(longWall) : float(0);
  const horizontal = abs(cell.x.sub(0.5)), vertical = abs(fract(grid.y.add(stairs.mul(0.5))).sub(0.53));
  function windowMask(padding) {
    const halfWidth = windowWidth.mul(mix(float(0.5), float(0.275), stairs)).add(padding), halfHeight = windowHeight.mul(mix(float(0.5), float(0.3), stairs)).add(padding);
    let mask = float(1).sub(smoothstep(halfWidth.sub(fw.x), halfWidth.add(fw.x), horizontal))
      .mul(float(1).sub(smoothstep(halfHeight.sub(fw.y), halfHeight.add(fw.y), vertical)));
    if (a.windowArch) {
      const rise = uniform(a.windowArch).add(padding), archY = max(0, cell.y.sub(float(0.53).add(halfHeight).sub(rise))).div(rise);
      const distance = sqrt(horizontal.div(halfWidth).pow(2).add(archY.pow(2)));
      mask = mask.mul(float(1).sub(smoothstep(float(1).sub(fw.x.add(fw.y)), float(1).add(fw.x.add(fw.y)), distance)));
    }
    return mask;
  }
  const windowsEnabled = uniform(a.windows === false ? 0 : 1).mul(endWindows);
  const opening = windowMask(0).mul(windowsEnabled), surround = windowMask(a.classicalOrder ? 0.045 : 0.025).sub(opening).max(0).mul(windowsEnabled);
  const glazing = uniform(a.pattern === 'glazed-strips' ? 1 : 0).mul(inZone).mul(step(uniform(a.plinthHeight ?? 2.2), uv().y)).mul(longWall);
  const glassCell = fract(vec2(uv().x.div(1.35), grid.y));
  const glassFrames = max(float(1).sub(smoothstep(0.015, 0.045, glassCell.x)), float(1).sub(smoothstep(0.015, 0.045, glassCell.y)));
  const pane = mix(opening, float(1).sub(glassFrames), glazing);
  const bands = float(1).sub(smoothstep(uniform(a.accentBands || 0), uniform((a.accentBands || 0) + 0.012), cell.y))
    .mul(uniform(a.accentBands ? 1 : 0));
  const paintHeight = step(uniform(a.accentMinHeight ?? 0), uv().y).mul(float(1).sub(step(uniform(a.accentMaxHeight ?? 1000), uv().y)));
  const crown = face && a.panelCrownHeight ? step(face.z.sub(uniform(a.panelCrownHeight)), uv().y) : float(0);
  const paintedZones = mix(wall, accent, max(max(inZone.mul(uniform(a.pattern === 'glazed-strips' ? 0 : 1)), bands).mul(paintHeight), crown));
  const spandrel = uniform(new THREE.Color(a.spandrelColour || a.wallColour));
  let painted = mix(paintedZones, spandrel, filteredPulse(grid.x, uniform(a.spandrelColour ? a.spandrelWidth || a.windowRatioX || 0.44 : 0)));
  if(a.brickSpandrels){
    const apron=filteredPulse(grid.x,windowWidth.add(0.12)).mul(filteredPulse(grid.y.add(0.34),float(0.14))).mul(longWall).mul(paintHeight);
    painted=mix(painted,accent,apron);
  }
  if (face) painted = mix(painted, color(a.panelEndColour || a.wallColour), isEnd);
  const panelJoints = max(float(1).sub(smoothstep(0.005, 0.018, cell.x)), float(1).sub(smoothstep(0.005, 0.018, cell.y)))
    .mul(uniform(a.joints === 'panels' ? 1 : 0));
  const balconyBand = uniform(a.balconyBands ? 1 : 0).mul(float(1).sub(smoothstep(0.07, 0.13, cell.y))).mul(longWall);
  const masonryHeight=a.masonryHeight||.1;
  const brickGrid = vec2(uv().x.div(a.masonryWidth||.27).add(floor(uv().y.div(masonryHeight)).mod(2).mul(a.masonryBond==='stacked'?0:.5)), uv().y.div(masonryHeight));
  const brickCell = fract(brickGrid), brickAA = fwidth(brickGrid).max(vec2(0.001));
  if(a.repairBrickColour&&a.masonry==='brick'){
    const rate=a.repairBrickFraction||0.12,detail=float(1).sub(smoothstep(0.3,1,max(brickAA.x,brickAA.y)));
    const patches=mix(float(rate),step(1-rate,facadeHash(floor(brickGrid))),detail)
      .mul(step(uniform(a.repairMinHeight??0),uv().y)).mul(float(1).sub(step(uniform(a.repairMaxHeight??3.1),uv().y)));
    painted=mix(painted,color(a.repairBrickColour),patches);
  }
  const mortar = max(float(1).sub(smoothstep(0.025, brickAA.x.add(0.04), brickCell.x)), float(1).sub(smoothstep(0.025, brickAA.y.add(0.06), brickCell.y)))
    .mul(float(1).sub(smoothstep(0.3, 1, max(brickAA.x, brickAA.y)))).mul(uniform(['brick','block'].includes(a.masonry) ? 1 : 0));
  const masonry = mix(mix(mix(painted, plinth, float(1).sub(step(uniform(a.plinthHeight ?? 2.2), uv().y))), trim, max(balconyBand, glassFrames.mul(glazing))),
    color(a.mortarColour || 0xa1a69a), mortar.mul(a.mortarContrast ?? 0.42))
    .mul(float(1).sub(panelJoints.mul(uniform(a.panelJointContrast ?? 0.12))));
  const balconyPosition = abs(fract(zone.add(0.5)).sub(0.5));
  const balcony = float(1).sub(smoothstep(uniform((a.balconyWidth || 0.4) * 0.5 - 0.01), uniform((a.balconyWidth || 0.4) * 0.5 + 0.01), balconyPosition))
    .mul(uniform(a.balconyZones ? 1 : 0)).mul(longWall);
  const balconyPane = float(1).sub(smoothstep(0.22, 0.27, vertical)).mul(float(1).sub(glassFrames));
  const mullions = a.windowMullions ? max(float(1).sub(smoothstep(0.008, 0.02, horizontal)), float(1).sub(smoothstep(0.008, 0.02, vertical))).mul(opening) : float(0);
  const finalPane = mix(pane, balconyPane, balcony).mul(float(1).sub(mullions));
  const view = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(float(1).sub(abs(dot(view, normalWorldGeometry))), 3);
  const reflection = mix(cityUniforms.uSkyHorizonColor, cityUniforms.uSkyTopColor, 0.55);
  const glazed = mix(glass, reflection, fresnel.mul(0.24).add(0.1));
  const cellId = floor(grid), random = fract(sin(dot(cellId, vec2(12.9898, 78.233))).mul(43758.5453));
  const lit = step(0.78, random).mul(finalPane).mul(cityUniforms.uInteriorGlow);
  const material = new THREE.MeshStandardNodeMaterial();
  const wearNoise = facadeNoise(vec2(positionWorld.x.mul(0.85).add(positionWorld.z.mul(0.53)),positionWorld.y.mul(1.15))).mul(0.65)
    .add(facadeNoise(vec2(positionWorld.z.mul(2.7).sub(positionWorld.x.mul(0.3)),positionWorld.y.mul(4.2))).mul(0.35));
  const wash = smoothstep(0.4,0.62,wearNoise).mul(float(a.weathering || 0)).mul(smoothstep(0,8,uv().y).mul(0.6).add(0.4));
  const weathered = a.weathering ? mix(masonry,color(a.weatheringColour || '#ddd5ba'),wash) : masonry;
  let surface = weathered;
  if(a.brickRelief){
    const slab=filteredPulse(grid.y.add(0.48),float(0.045)).mul(balcony);
    const reveal=windowMask(0.045).sub(opening).max(0).add(balcony.mul(filteredPulse(grid.y.add(0.21),float(0.10)))).clamp(0,1);
    surface=mix(surface.mul(float(1).sub(reveal.mul(0.22))),trim,slab);
  }
  if (a.smallBalconies) {
    const horizontalMask = filteredPulse(grid.x, float(0.72));
    const occupied = float(1).sub(step(1, floor(grid.x).mod(2))).mul(step(storey, uv().y)).mul(longWall).mul(float(1).sub(stairs));
    const railing = max(filteredPulse(grid.y.add(0.32), float(0.055)), filteredPulse(grid.x.mul(7), float(0.06)).mul(filteredPulse(grid.y.add(0.32), float(0.18))))
      .mul(horizontalMask).mul(occupied);
    const shadow = filteredPulse(grid.y.add(0.38), float(0.11)).mul(horizontalMask).mul(occupied);
    surface = mix(surface.mul(float(1).sub(shadow.mul(0.14))), plinth.mul(0.6), railing);
  }
  if (a.classicalRustication) {
    const courses = uv().y.div(0.38), courseAA = fwidth(courses).max(0.002);
    const joints = float(1).sub(smoothstep(courseAA, courseAA.add(0.035), abs(fract(courses).sub(0.5))))
      .mul(float(1).sub(step(uniform(a.plinthHeight ?? 1.1), uv().y)));
    surface = weathered.mul(float(1).sub(joints.mul(0.2)));
  }
  if (a.classicalOrder) {
    const lintel = filteredPulse(grid.x, windowWidth.add(0.16))
      .mul(filteredPulse(grid.y.sub(float(0.53).add(windowHeight.mul(0.5)).sub(0.5).add(0.06)), float(0.045)))
      .mul(step(uniform(a.plinthHeight ?? 1.1), uv().y));
    surface = mix(surface, trim, lintel);
  }
  const framed = mix(surface, trim, surround.mul(float(1).sub(glazing)).mul(float(1).sub(balcony)));
  material.colorNode = mix(framed, glazed.mul(random.mul(0.4).add(0.6)), finalPane);
  material.roughnessNode = mix(float(0.86), float(0.23), finalPane);
  material.metalnessNode = finalPane.mul(0.36);
  material.emissiveNode = color(0xffd5a0).mul(lit).mul(0.45);
  material.userData.observedFacade = true;
  material.userData.facadeFaces = !!(a.panelHousing || a.facadeEnds);
  materials.set(key, material);
  return material;
}
