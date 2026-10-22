(function () {
const { THREE, TSL, cityUniforms } = NYC;
const { uniform, float, vec2, color, uv, fract, floor, abs, sin, dot, fwidth, smoothstep, step, max, mix, pow,
  cameraPosition, positionWorld, normalWorldGeometry, normalize } = TSL;
const materials = new Map();

/** Reviewed paint zones and glazing; dimensions describe repeatable facade bays, not a photo texture. */
function createObservedFacadeMaterial(a) {
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
  const zone = fract(uv().x.div(bay.mul(module)));
  const aa = fwidth(zone).max(0.001);
  const inZone = smoothstep(float(0.5).sub(zoneWidth.mul(0.5)).sub(aa), float(0.5).sub(zoneWidth.mul(0.5)).add(aa), zone)
    .mul(float(1).sub(smoothstep(float(0.5).add(zoneWidth.mul(0.5)).sub(aa), float(0.5).add(zoneWidth.mul(0.5)).add(aa), zone)));
  const grid = vec2(uv().x.div(bay), uv().y.div(storey)), cell = fract(grid), fw = fwidth(grid).max(vec2(0.002));
  const horizontal = abs(cell.x.sub(0.5)), vertical = abs(cell.y.sub(0.53));
  const opening = float(1).sub(smoothstep(windowWidth.mul(0.5).sub(fw.x), windowWidth.mul(0.5).add(fw.x), horizontal))
    .mul(float(1).sub(smoothstep(windowHeight.mul(0.5).sub(fw.y), windowHeight.mul(0.5).add(fw.y), vertical)));
  const glazing = uniform(a.pattern === 'glazed-strips' ? 1 : 0).mul(inZone).mul(step(uniform(a.plinthHeight ?? 2.2), uv().y));
  const glassCell = fract(vec2(uv().x.div(1.35), grid.y));
  const glassFrames = max(float(1).sub(smoothstep(0.015, 0.045, glassCell.x)), float(1).sub(smoothstep(0.015, 0.045, glassCell.y)));
  const pane = mix(opening, float(1).sub(glassFrames), glazing);
  const painted = mix(wall, accent, inZone.mul(uniform(a.pattern === 'glazed-strips' ? 0 : 1)));
  const panelJoints = max(float(1).sub(smoothstep(0.005, 0.018, cell.x)), float(1).sub(smoothstep(0.005, 0.018, cell.y)));
  const balconyBand = uniform(a.balconyBands ? 1 : 0).mul(float(1).sub(smoothstep(0.07, 0.13, cell.y)));
  const masonry = mix(mix(painted, plinth, float(1).sub(step(uniform(a.plinthHeight ?? 2.2), uv().y))), trim, max(balconyBand, glassFrames.mul(glazing)))
    .mul(float(1).sub(panelJoints.mul(0.12)));
  const view = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(float(1).sub(abs(dot(view, normalWorldGeometry))), 3);
  const reflection = mix(cityUniforms.uSkyHorizonColor, cityUniforms.uSkyTopColor, 0.55);
  const glazed = mix(glass, reflection, fresnel.mul(0.35).add(0.22));
  const cellId = floor(grid), random = fract(sin(dot(cellId, vec2(12.9898, 78.233))).mul(43758.5453));
  const lit = step(0.78, random).mul(pane).mul(cityUniforms.uInteriorGlow);
  const material = new THREE.MeshStandardNodeMaterial();
  material.colorNode = mix(masonry, glazed, pane);
  material.roughnessNode = mix(float(0.86), float(0.23), pane);
  material.metalnessNode = pane.mul(0.36);
  material.emissiveNode = color(0xffd5a0).mul(lit).mul(0.45);
  material.userData.observedFacade = true;
  materials.set(key, material);
  return material;
}

NYC = { ...NYC, createObservedFacadeMaterial };
})();
