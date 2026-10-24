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

/** The original borough renderer keeps facades on instanced boxes; these instances carry Kazan's observed palettes. */
export function createDistantFacadeMaterial() {
  const size = attribute('kFacadeSize', 'vec4'), wall = attribute('kFacadeWall', 'vec3');
  const accent = attribute('kFacadeAccent', 'vec4'), roof = attribute('kFacadeRoof', 'vec3');
  const grid = attribute('kFacadeGrid', 'vec4'), glass = attribute('kFacadeGlass', 'vec4');
  const zones = attribute('kFacadeZones', 'vec4');
  const spandrel = attribute('kFacadeSpandrel', 'vec4'), limits = attribute('kFacadePaintLimits', 'vec2');
  const faceX = step(0.5, abs(normalGeometry.x)), top = step(0.5, normalGeometry.y);
  const u = mix(positionGeometry.x, positionGeometry.z, faceX).add(0.5).mul(mix(size.x, size.z, faceX));
  const y = positionGeometry.y.add(0.5).mul(size.y).add(size.w);
  const gu = u.div(grid.x), gv = y.div(grid.y);
  const windows = max(filteredPulse(gu, grid.z), filteredPulse(gu.div(zones.x), zones.w))
    .mul(filteredPulse(gv.sub(0.03), grid.w)).mul(glass.w);
  const accentZone = filteredPulse(gu.div(zones.x).add(fract(zones.z)), accent.w);
  const band = filteredPulse(gv.add(0.5), zones.y);
  const paintHeight = step(limits.x, y).mul(float(1).sub(step(limits.y, y)));
  const painted = mix(mix(wall, accent.rgb, max(accentZone, band).mul(paintHeight)), spandrel.rgb, filteredPulse(gu, spandrel.w));
  const base = painted.mul(mix(float(0.77), float(1), smoothstep(0, 3, y)));
  const coarse = smoothstep(0.35, 1.2, max(fwidth(gu), fwidth(gv)));
  const random = fract(sin(dot(floor(vec2(gu, gv)).add(zones.z), vec2(12.9898, 78.233))).mul(43758.5453));
  const paneShade = mix(random.mul(0.4).add(0.6), float(0.8), coarse);
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  material.colorNode = mix(mix(base, glass.rgb.mul(paneShade), windows), roof, top);
  material.emissiveNode = color(0xffd5a0).mul(mix(step(0.78, random), float(0.22), coarse))
    .mul(windows).mul(float(1).sub(top)).mul(cityUniforms.uInteriorGlow).mul(0.4);
  return material;
}

/** Per-instance dimensions and linear colours keep one material and one draw per tile at every distance. */
export function createDistantFacadeGeometry(records) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const sizes = [], walls = [], accents = [], roofs = [], grids = [], glasses = [], zones = [], spandrels = [], limits = [];
  const tint = new THREE.Color();
  for (const { b, collider, wallColour, roofColour } of records) {
    const a = b.appearance || {}, glass = /glass/.test(b.material);
    sizes.push(collider.obb.hx * 2, b.h - b.minHeight, collider.obb.hz * 2, b.minHeight);
    walls.push(...tint.setHex(wallColour).toArray());
    accents.push(...tint.set(a.accentColour || wallColour).toArray(), a.zoneWidth ?? 0);
    roofs.push(...tint.setHex(roofColour).toArray());
    grids.push(a.bayWidth || (glass ? 2.3 : 2.8), a.floorHeight || 3,
      a.windowRatioX || (glass ? 0.88 : 0.44), a.windowRatioY || (glass ? 0.8 : 0.55));
    glasses.push(...tint.set(a.glassColour || '#354957').toArray(), b.h >= 4 && b.kind !== 'garage' && !b.fortification && (!b.construction || b.construction.stage === 'renovation') ? 1 : 0);
    zones.push(a.moduleBays || 6, a.accentBands || 0, b.id % 1009 + (a.zonePhase || 0), a.balconyZones ? a.balconyWidth || 0.4 : 0);
    spandrels.push(...tint.set(a.spandrelColour || wallColour).toArray(), a.spandrelColour ? a.spandrelWidth || a.windowRatioX || 0.44 : 0);
    limits.push(a.accentMinHeight ?? 0, a.accentMaxHeight ?? 1000);
  }
  const fields = [['kFacadeSize', sizes, 4], ['kFacadeWall', walls, 3], ['kFacadeAccent', accents, 4],
    ['kFacadeRoof', roofs, 3], ['kFacadeGrid', grids, 4], ['kFacadeGlass', glasses, 4], ['kFacadeZones', zones, 4],
    ['kFacadeSpandrel', spandrels, 4], ['kFacadePaintLimits', limits, 2]];
  const stride = fields.reduce((sum, field) => sum + field[2], 0);
  const packed = new Float32Array(records.length * stride), buffer = new THREE.InstancedInterleavedBuffer(packed, stride);
  let offset = 0;
  for (const [name, values, count] of fields) {
    for (let i = 0; i < records.length; i++) for (let j = 0; j < count; j++) packed[i * stride + offset + j] = values[i * count + j];
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, count, offset));
    offset += count;
  }
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
  const bay = uniform(a.bayWidth || 3), storey = uniform(a.floorHeight || 3);
  const module = uniform(a.moduleBays || 6), zoneWidth = uniform(a.zoneWidth ?? 0.38);
  const windowWidth = uniform(a.windowRatioX || 0.45), windowHeight = uniform(a.windowRatioY || 0.55);
  const zone = fract(uv().x.div(bay.mul(module)).add(uniform(a.zonePhase || 0)));
  const aa = fwidth(zone).max(0.001);
  const inZone = smoothstep(float(0.5).sub(zoneWidth.mul(0.5)).sub(aa), float(0.5).sub(zoneWidth.mul(0.5)).add(aa), zone)
    .mul(float(1).sub(smoothstep(float(0.5).add(zoneWidth.mul(0.5)).sub(aa), float(0.5).add(zoneWidth.mul(0.5)).add(aa), zone)));
  const grid = vec2(uv().x.div(bay), uv().y.div(storey)), cell = fract(grid), fw = fwidth(grid).max(vec2(0.002));
  const horizontal = abs(cell.x.sub(0.5)), vertical = abs(cell.y.sub(0.53));
  function windowMask(padding) {
    const halfWidth = windowWidth.mul(0.5).add(padding), halfHeight = windowHeight.mul(0.5).add(padding);
    let mask = float(1).sub(smoothstep(halfWidth.sub(fw.x), halfWidth.add(fw.x), horizontal))
      .mul(float(1).sub(smoothstep(halfHeight.sub(fw.y), halfHeight.add(fw.y), vertical)));
    if (a.windowArch) {
      const rise = uniform(a.windowArch).add(padding), archY = max(0, cell.y.sub(float(0.53).add(halfHeight).sub(rise))).div(rise);
      const distance = sqrt(horizontal.div(halfWidth).pow(2).add(archY.pow(2)));
      mask = mask.mul(float(1).sub(smoothstep(float(1).sub(fw.x.add(fw.y)), float(1).add(fw.x.add(fw.y)), distance)));
    }
    return mask;
  }
  const windowsEnabled = uniform(a.windows === false ? 0 : 1);
  const opening = windowMask(0).mul(windowsEnabled), surround = windowMask(0.025).sub(opening).max(0).mul(windowsEnabled);
  const glazing = uniform(a.pattern === 'glazed-strips' ? 1 : 0).mul(inZone).mul(step(uniform(a.plinthHeight ?? 2.2), uv().y));
  const glassCell = fract(vec2(uv().x.div(1.35), grid.y));
  const glassFrames = max(float(1).sub(smoothstep(0.015, 0.045, glassCell.x)), float(1).sub(smoothstep(0.015, 0.045, glassCell.y)));
  const pane = mix(opening, float(1).sub(glassFrames), glazing);
  const bands = float(1).sub(smoothstep(uniform(a.accentBands || 0), uniform((a.accentBands || 0) + 0.012), cell.y))
    .mul(uniform(a.accentBands ? 1 : 0));
  const paintHeight = step(uniform(a.accentMinHeight ?? 0), uv().y).mul(float(1).sub(step(uniform(a.accentMaxHeight ?? 1000), uv().y)));
  const paintedZones = mix(wall, accent, max(inZone.mul(uniform(a.pattern === 'glazed-strips' ? 0 : 1)), bands).mul(paintHeight));
  const spandrel = uniform(new THREE.Color(a.spandrelColour || a.wallColour));
  let painted = mix(paintedZones, spandrel, filteredPulse(grid.x, uniform(a.spandrelColour ? a.spandrelWidth || a.windowRatioX || 0.44 : 0)));
  const panelJoints = max(float(1).sub(smoothstep(0.005, 0.018, cell.x)), float(1).sub(smoothstep(0.005, 0.018, cell.y)))
    .mul(uniform(a.joints === 'panels' ? 1 : 0));
  const balconyBand = uniform(a.balconyBands ? 1 : 0).mul(float(1).sub(smoothstep(0.07, 0.13, cell.y)));
  const brickGrid = vec2(uv().x.div(0.27).add(floor(uv().y.div(0.1)).mod(2).mul(0.5)), uv().y.div(0.1));
  const brickCell = fract(brickGrid), brickAA = fwidth(brickGrid).max(vec2(0.001));
  if(a.repairBrickColour&&a.masonry==='brick'){
    const rate=a.repairBrickFraction||0.12,detail=float(1).sub(smoothstep(0.3,1,max(brickAA.x,brickAA.y)));
    const patches=mix(float(rate),step(1-rate,facadeHash(floor(brickGrid))),detail)
      .mul(step(uniform(a.repairMinHeight??0),uv().y)).mul(float(1).sub(step(uniform(a.repairMaxHeight??3.1),uv().y)));
    painted=mix(painted,color(a.repairBrickColour),patches);
  }
  const mortar = max(float(1).sub(smoothstep(0.025, brickAA.x.add(0.04), brickCell.x)), float(1).sub(smoothstep(0.025, brickAA.y.add(0.06), brickCell.y)))
    .mul(float(1).sub(smoothstep(0.3, 1, max(brickAA.x, brickAA.y)))).mul(uniform(a.masonry === 'brick' ? 1 : 0));
  const masonry = mix(mix(mix(painted, plinth, float(1).sub(step(uniform(a.plinthHeight ?? 2.2), uv().y))), trim, max(balconyBand, glassFrames.mul(glazing))),
    color(0xa1a69a), mortar.mul(0.42))
    .mul(float(1).sub(panelJoints.mul(0.12)));
  const balconyPosition = abs(fract(zone.add(0.5)).sub(0.5));
  const balcony = float(1).sub(smoothstep(uniform((a.balconyWidth || 0.4) * 0.5 - 0.01), uniform((a.balconyWidth || 0.4) * 0.5 + 0.01), balconyPosition))
    .mul(uniform(a.balconyZones ? 1 : 0));
  const balconyPane = float(1).sub(smoothstep(0.22, 0.27, vertical)).mul(float(1).sub(glassFrames));
  const finalPane = mix(pane, balconyPane, balcony);
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
  const framed = mix(weathered, trim, surround.mul(float(1).sub(glazing)).mul(float(1).sub(balcony)));
  material.colorNode = mix(framed, glazed.mul(random.mul(0.4).add(0.6)), finalPane);
  material.roughnessNode = mix(float(0.86), float(0.23), finalPane);
  material.metalnessNode = finalPane.mul(0.36);
  material.emissiveNode = color(0xffd5a0).mul(lit).mul(0.45);
  material.userData.observedFacade = true;
  materials.set(key, material);
  return material;
}
