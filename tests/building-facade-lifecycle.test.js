import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import * as geometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createStaticPalette } from '../js/static-palette.js';
import { createInstanceVisibility } from '../js/instance-visibility.js';
import { createKazanStalinkas } from '../js/kazan-stalinka.js';
import { createKazanPassageFrames } from '../js/kazan-passage-frames.js';
import { passageCorridor, passageVolumes } from '../tools/kazan-passages.mjs';
import * as footprints from '../js/footprints.js';
import { loadModule } from './helpers/module.js';

const read = (name) => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');
const config = {
  CENTRAL_PARK_BOUNDS: {}, ISLAND_BOUNDS: {}, SPAWN: { x: 0, z: 0 },
  terrainHeight: () => 0,
  toPoints: (ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[i * 2], z: ring[i * 2 + 1] })),
  boundsOf: footprints.polygonBounds,
  pointInPoly: footprints.polygonContains
};

function unusedModels() {
  return { emitBuilding() { return false; }, collisionShapes() { return null; } };
}

describe('Procedural building facade lifecycle', () => {
  for (const shortFirst of [true, false]) {
    test(`short and tall buildings retain their material families when ${shortFirst ? 'the short building' : 'the tower'} loads first`, () => {
      const runtime = { runtime: {} };
      const materials = loadModule(read('tsl-materials.js'), { imports: {
        'three/webgpu': THREE, 'three/tsl': TSL, './kazan-config.js': config, './kazan-runtime.js': runtime
      } });
      const facades = loadModule(read('kazan-facades.js'), { imports: {
        'three/webgpu': THREE, 'three/tsl': TSL, './tsl-materials.js': materials
      } });
      const source = read('kazan-city.js'), imports = {};
      for (const match of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm)) {
        imports[match[2]] = Object.fromEntries(match[1].split(',').map((name) => [name.trim(), unusedModels]));
      }
      const common = { osmType: 'way', kind: 'yes', material: '', colour: '', minHeight: 0,
        holes: [], roofShape: 'flat', roofHeight: 0, roofMaterial: '', roofColour: '' };
      const shed = { ...common, id: 1, h: 3, colour: '#e1dfd5', ring: [0, 0, 10, 0, 10, 10, 0, 10] };
      const tower = { ...common, id: 2, h: 72, ring: [80, 0, 90, 0, 90, 10, 80, 10] };
      const mosque = { ...common, id: 3, kind: 'mosque', h: 8, hasParts: true, ring: [160, 0, 180, 0, 180, 20, 160, 20] };
      const porch = { ...common, id: 4, part: true, parent: 'way/3', h: 4, ring: [160, 0, 164, 0, 164, 4, 160, 4] };
      const binding = { reference: 'way/3', faith: 'mosque', family: 'mosque', role: 'principal', style: { minaretHeight: 24 } };
      const compound = { ...common, id: 5, kind: 'mosque', h: 12, roofShape: 'dome',
        ring: [220, 0, 250, 0, 250, 10, 230, 10, 230, 30, 220, 30] };
      const towerStub = { ...common, id: 6, towerType: 'minaret', heightSource: 'fallback', h: 12, minHeight: 9,
        ring: [263, 14, 265, 14, 265, 16, 263, 16] };
      const parade = { ...common, id: 7, kind: 'apartments', h: 15, architectureFamily: 'stalinka', facadeFamily: 'stalinka-neoclassical',
        appearance: { wallColour: '#dbd4bf', trimColour: '#eee7d6', floorHeight: 3, bayWidth: 3, plinthHeight: 1.1 },
        stalinkaCrown: { x: 305, z: 1007, yaw: 0, width: 3, depth: 3, baseHeight: 15, belvedereHeight: 2, lanternRadius: 0.8, lanternHeight: 2, spireHeight: 3 },
        ring: [280, 1000, 310, 1001.1, 309.6, 1013.1, 279.6, 1012] };
      const mappedPassage = { road: 1, pts: [295, 995, 295, 1020], width: 8, spring: 2.7, height: 4.2, bounds: { minX: 290, maxX: 300, minZ: 992, maxZ: 1023 } };
      mappedPassage.corridor = passageCorridor(mappedPassage);
      parade.openingVolumes = passageVolumes(parade.ring, [], 0, parade.h, [mappedPassage]);
      const savedPassageVolumes = structuredClone(parade.openingVolumes);
      const stepped = { ...common, id: 8, kind: 'apartments', h: 21, architectureFamily: 'stalinka', facadeFamily: 'stalinka-neoclassical', appearance: parade.appearance,
        ring: [350,1000,405,1000,405,1015,350,1015], stalinkaSections: [
          { ring: [350,1000,390,1000,390,1015,350,1015], holes: [], h: 15, minHeight: 0, levels: 5, roofShape: 'flat', roofHeight: 0, role: 'wing-or-mapped-annex' },
          { ring: [390,1000,405,1000,405,1015,390,1015], holes: [], h: 21, minHeight: 0, levels: 7, roofShape: 'flat', roofHeight: 0, role: 'raised-tower' }
        ] };
      const panel = { ...common, id: 9, kind: 'apartments', h: 30, levels: 10, architectureFamily: 'panel-housing',
        appearance: { wallColour: '#e1dfd5', accentColour: '#d6aa62', panelEndColour: '#70afb0', panelHousing: true,
          panelEndThreshold: 16, panelEndGlazing: 0, panelWallHeight: 30, panelCrownHeight: 1.6, joints: 'none' },
        ring: [450,1000,522,1000,540,1000,540,1013,450,1013] };
      const panelPassage = { ...mappedPassage, pts: [495,995,495,1020], bounds: { minX:490,maxX:500,minZ:992,maxZ:1023 } };
      panelPassage.corridor = passageCorridor(panelPassage);
      panel.openingVolumes = passageVolumes(panel.ring, [], 0, panel.h, [panelPassage]);
      const compactBrick = {...common,id:10,kind:'apartments',h:15,levels:5,architectureFamily:'khrushchev-housing',
        appearance:{wallColour:'#e1dfd5',facadeEnds:true,panelEndThreshold:18,panelEndGlazing:0.35,smallBalconies:true,stairBays:true,windowMullions:true},
        ring:[600,1000,650,1000,650,1013,600,1013]};
      imports['three/webgpu'] = THREE;
      imports['three/addons/utils/BufferGeometryUtils.js'] = geometryUtils;
      imports['./static-palette.js'] = { createStaticPalette };
      imports['./instance-visibility.js'] = { createInstanceVisibility };
      imports['./kazan-stalinka.js'] = { createKazanStalinkas };
      imports['./footprints.js'] = footprints;
      imports['./kazan-runtime.js'] = { GEO: { buildings: [...(shortFirst ? [shed, tower] : [tower, shed]), mosque, porch, compound, towerStub, parade, stepped, panel, compactBrick], landmarks: [],
        worship: { bindings: [binding, { ...binding, reference: 'way/4', parent: 'way/3', role: 'mapped-part' },
          { ...binding, reference: 'way/5' }, { ...binding, reference: 'way/6', role: 'minaret' }] } }, runtime: {} };
      imports['./kazan-config.js'] = config;
      imports['./kazan-worship.js'] = loadModule(read('kazan-worship.js'), { imports: {
        'three/webgpu': THREE, './kazan-runtime.js': imports['./kazan-runtime.js'], './kazan-config.js': config
      } });
      imports['./kazan-gates.js'] = loadModule(read('kazan-gates.js'), { imports: { 'three/webgpu': THREE, './kazan-config.js': config,
        './kazan-passage-frames.js': { createKazanPassageFrames } } });
      imports['./tsl-materials.js'] = materials;
      imports['./kazan-facades.js'] = facades;
      imports['./kazan-campus.js'] = { createKazanCampusModels() { return { ...unusedModels(), collisionShapes: (b) => [b] }; } };
      const timers = [];
      const city = loadModule(source, { imports, globals: { performance, Float32Array, setTimeout(fn) { timers.push(fn); return timers.length; } } });
      const scene = new THREE.Scene();
      const blocks = city.buildCityBlocks(scene);
      while (timers.length) timers.shift()();
      scene.updateMatrixWorld(true);
      const towerHit = new THREE.Raycaster(new THREE.Vector3(75, 35, 5), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      const shedHit = new THREE.Raycaster(new THREE.Vector3(-5, 1.5, 5), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.ok(towerHit?.object.material.colorNode, 'a tall wall keeps its procedural windows');
      assert.equal(shedHit?.object.material.colorNode, null, 'an unobserved low shed retains its plain wall treatment');
      const far = scene.getObjectByName('KazanMassingRegion/0,0'), transform = new THREE.Matrix4();
      let worshipInstances = 0, houseInstances = 0;
      for (let i = 0; i < far.instanceMatrix.count; i++) {
        far.getMatrixAt(i, transform);
        const x = transform.elements[12], glazing = far.geometry.attributes.kFacadeGlass.getW(i);
        if (x >= 160 && x < 280) { worshipInstances++; assert.equal(glazing, 0, 'religious massing never inherits apartment windows'); }
        else if (x > 70 && x < 160) { houseInstances++; assert.equal(glazing, 1, 'ordinary tall buildings retain their windows'); }
      }
      assert.ok(worshipInstances >= 2 && houseInstances === 1);
      let highestParadeProxy = 0;
      for (let i = 0; i < far.instanceMatrix.count; i++) {
        far.getMatrixAt(i, transform);
        if (Math.abs(transform.elements[12] - 305) < 0.1) highestParadeProxy = Math.max(highestParadeProxy, transform.elements[13] + transform.elements[5] / 2);
      }
      assert.ok(highestParadeProxy > 22, 'the city massing owner retains the supported spire above the distant body');
      assert.ok(blocks.colliders.some((c) => c.minY > 18 && c.maxY > 22), 'the city collision owner includes the rooftop crown');
      assert.deepEqual(parade.openingVolumes, savedPassageVolumes, 'adding rooftop colliders must not mutate source passage volumes');
      const wingRoof = new THREE.Raycaster(new THREE.Vector3(370, 50, 1007), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      const towerRoof = new THREE.Raycaster(new THREE.Vector3(397, 50, 1007), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      assert.equal(wingRoof?.point.y, 15, 'the actual city renderer lowers the wing instead of extruding the whole outline to the maximum height');
      assert.equal(towerRoof?.point.y, 21, 'the raised storeys remain a complete corner body beneath the crown');
      const longPanel = new THREE.Raycaster(new THREE.Vector3(530,12,995), new THREE.Vector3(0,0,1)).intersectObject(scene)[0];
      const endPanel = new THREE.Raycaster(new THREE.Vector3(545,12,1006), new THREE.Vector3(-1,0,0)).intersectObject(scene)[0];
      const longData = longPanel?.object.geometry.attributes.kPanelFace, endData = endPanel?.object.geometry.attributes.kPanelFace;
      assert.ok(longData && endData, 'panel walls carry mapped face dimensions for end-wall glazing and paint');
      assert.ok(Math.abs(longData.getX(longPanel.face.a) - 90) < 0.05, 'collinear source nodes cannot turn a long facade into a narrow end wall');
      assert.ok(Math.abs(endData.getX(endPanel.face.a) - 13) < 0.05, 'the true narrow gable keeps its separate finish');
      assert.ok(Number.isFinite(endData.getY(endPanel.face.a)), 'local end-wall window placement has a finite origin');
      const panelFar = scene.getObjectByName('KazanMassingRegion/0,0');
      let panelProxy = false;
      for (let i = 0; i < panelFar.instanceMatrix.count; i++) {
        panelFar.getMatrixAt(i, transform);
        if (Math.abs(transform.elements[12] - 495) > 1) continue;
        assert.equal(panelFar.geometry.attributes.kFacadeEnd.getW(i), 16, 'distant massing retains the end-wall rule');
        assert.equal(panelFar.geometry.attributes.kFacadePanel.getX(i), 0, 'blank gables cannot acquire windows in distant views');
        assert.ok(panelFar.geometry.attributes.kFacadeEnd.getY(i) > panelFar.geometry.attributes.kFacadeEnd.getX(i), 'the distant end retains its turquoise paint');
        panelProxy = true;
      }
      assert.ok(panelProxy);
      const brickWall = new THREE.Raycaster(new THREE.Vector3(620,8,995),new THREE.Vector3(0,0,1)).intersectObject(scene)[0];
      assert.ok(brickWall?.object.geometry.attributes.kPanelFace,'compact brick facades need the same true wall dimensions without being labelled panel construction');
      let compactProxy=false;
      for(let i=0;i<panelFar.instanceMatrix.count;i++){
        panelFar.getMatrixAt(i,transform);
        if(Math.abs(transform.elements[12]-625)>1)continue;
        assert.equal(panelFar.geometry.attributes.kFacadePanel.getZ(i),1,'distant compact houses retain stair-landing windows');
        assert.equal(panelFar.geometry.attributes.kFacadePanel.getW(i),1,'small balconies remain distinct from continuous loggias after visibility compaction');
        compactProxy=true;
      }
      assert.ok(compactProxy);
      const minaret = new THREE.Raycaster(new THREE.Vector3(170, 40, 10), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      assert.ok(minaret?.point.y > 23.5, 'a mapped porch does not suppress the estimated mosque minaret');
      const wall = new THREE.Raycaster(new THREE.Vector3(155, 2, 10), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.equal(wall?.object.material.colorNode, null, 'near mosque walls use the shared plain/arched family');
      const emptyCourtyard = new THREE.Raycaster(new THREE.Vector3(240, 30, 20), new THREE.Vector3(0, -1, 0)).intersectObject(scene);
      assert.equal(emptyCourtyard.length, 0, 'a compound domed mosque never becomes a bounding-box-sized roof plate');
      const supportedTower = new THREE.Raycaster(new THREE.Vector3(264, 40, 15), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      assert.ok(supportedTower?.point.y > 23.5, 'a fallback-height minaret becomes a complete estimated shaft, not a raised stub');
      const shaft = new THREE.Raycaster(new THREE.Vector3(260, 5, 15), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.ok(shaft && shaft.distance < 5, 'the estimated shaft connects to its foundation');
      assert.deepEqual([towerStub.h, towerStub.minHeight], [12, 9], 'source heights remain separate from the visual estimate');
      const cornice = new THREE.Raycaster(new THREE.Vector3(295, 25, 1000.15), new THREE.Vector3(0, -1, 0)).intersectObject(scene)[0];
      assert.ok(cornice?.point.y >= 14.6, 'a parade facade keeps its projecting cornice when the passage renderer owns its walls');
      const passage = new THREE.Raycaster(new THREE.Vector3(295, 2, 997), new THREE.Vector3(0, 0, 1)).intersectObject(scene);
      assert.equal(passage.length, 0, 'new cornices, belts and pilasters cannot fill a mapped archway');
      const underside = new THREE.Raycaster(new THREE.Vector3(285, -1, 1005), new THREE.Vector3(0, 1, 0)).intersectObject(scene)[0];
      assert.equal(underside?.object.material.colorNode, null, 'horizontal passage faces cannot inherit facade windows');
      const innerWall = new THREE.Raycaster(new THREE.Vector3(295, 1.5, 1005), new THREE.Vector3(1, 0, 0)).intersectObject(scene)[0];
      assert.ok(innerWall?.distance < 5, 'retain the actual wall beside the corridor');
      assert.equal(innerWall.object.material.colorNode, null, 'interior arch walls use plain masonry without exterior apartment windows');
      const columns = [];
      for (let y = 2.8; y < 4.2; y += 0.2) {
        const wallHit = new THREE.Raycaster(new THREE.Vector3(285, y, 997), new THREE.Vector3(0, 0, 1)).intersectObject(scene)[0];
        assert.ok(wallHit?.uv, 'the masonry beside the opening remains present'); columns.push(wallHit.uv.x);
      }
      assert.ok(Math.max(...columns) - Math.min(...columns) < 0.04, 'window columns stay aligned across clipped arch bands on oblique mapped walls');
    });
  }
});
