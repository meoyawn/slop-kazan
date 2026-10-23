const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const source = readFileSync(process.env.MAP_TEST_SOURCE || join(__dirname, '../js/nyc-map.js'), 'utf8');

for (const [width, height, dpr] of [[500, 300, 1], [320, 180, 1.5], [1920, 1080, 2]]) {
  test(`map clicks match rendered world positions at ${width}x${height}, DPR ${dpr}`, () => {
    const window = { innerWidth: width, innerHeight: height, devicePixelRatio: dpr };
    const { NYCMapSystem } = loadModule(source, {
      globals: { window, performance: { now: () => 0 } },
      imports: { './nyc-geodata.js': { GEO: {} }, './city-config.js': { ROADS: [] } }
    });
    const map = Object.create(NYCMapSystem.prototype);
    // Capture the production render viewport; drawing primitives are irrelevant to coordinate conversion.
    const context = new Proxy({}, { get: () => () => {} });
    let view;
    Object.assign(map, {
      fullCanvas: { clientWidth: width, clientHeight: height },
      fullCtx: context,
      fullStatic: { getContext: () => context },
      isFullMapOpen: true,
      viewCenterX: 200,
      viewCenterZ: -300,
      viewZoom: 0.5,
      controllerManager: { getActiveEntity: () => ({ position: { x: 200, z: -300 }, heading: 0 }) },
      renderFullMapStatic: (_context, viewport) => { view = viewport; }
    });
    map.resizeFullCanvas();
    map.renderFullMap();

    for (const point of [{ x: 200, z: -300 }, { x: 325, z: -375 }]) {
      // Convert the renderer's centred coordinates through the canvas backing store to CSS pixels.
      const screenX = (view.toX(point.x) + view.w / 2) * view.dpr * width / map.fullCanvas.width;
      const screenY = (view.toY(point.z) + view.h / 2) * view.dpr * height / map.fullCanvas.height;
      const clicked = map.screenToWorld(screenX, screenY, width, height);
      // The pixel budget can yield a fractional DPR; integer backing sizes may round by less than one pixel.
      const tolerance = 1 / (view.s * view.dpr);
      assert.ok(Math.abs(clicked.x - point.x) < tolerance, `clicked x ${clicked.x} should match drawn x ${point.x}`);
      assert.ok(Math.abs(clicked.z - point.z) < tolerance, `clicked z ${clicked.z} should match drawn z ${point.z}`);
    }
  });
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    }
  };
}

function classList() {
  const names = new Set();
  return {
    add: (name) => names.add(name),
    remove: (name) => names.delete(name),
    contains: (name) => names.has(name),
    toggle(name, enabled) { if (enabled) names.add(name); else names.delete(name); }
  };
}

function mapHarness() {
  const window = { ...eventTarget(), innerWidth: 200, innerHeight: 200 };
  const canvas = {
    ...eventTarget(), style: {}, clientWidth: 200, clientHeight: 200,
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 200 })
  };
  const controls = eventTarget();
  const wrapper = { classList: classList() };
  const zoomIn = eventTarget(), zoomOut = eventTarget();
  const elements = {
    'fullmap-canvas': canvas, 'fullmap-canvas-wrap': wrapper,
    'fullmap-modal': { classList: classList() },
    'map-zoom-in': zoomIn, 'map-zoom-out': zoomOut
  };
  const document = {
    ...eventTarget(), hidden: false,
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => []
  };
  const captured = new Set();
  canvas.setPointerCapture = (id) => captured.add(id);
  canvas.hasPointerCapture = (id) => captured.has(id);
  canvas.releasePointerCapture = (id) => {
    captured.delete(id);
    canvas.dispatch('lostpointercapture', { pointerId: id });
  };
  const config = {
    ROADS: [], BLOCKS: [], NYC_LANDMARKS: [],
    ISLAND_BOUNDS: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 },
    getIslandBoundsAtZ: () => ({ westX: -10000, eastX: 10000 }),
    getLocationLabel: (x, z) => `${x}, ${z}`,
    isTypingInField: () => false
  };
  const { NYCMapSystem } = loadModule(source, {
    globals: { window, document },
    imports: { './nyc-geodata.js': { GEO: { frame: {} } }, './city-config.js': config }
  });
  const teleports = [], toggles = [];
  const map = new NYCMapSystem({
    controllerManager: { getActiveEntity: () => ({ position: { x: 1000, z: 2000 } }) },
    onTeleport: (x, z) => teleports.push([x, z]),
    onToggle: (open) => toggles.push(open)
  });
  // Exercise the real viewport/input state without drawing the map's geographic layers.
  map.renderFullMap = () => {};
  map.viewZoom = 1;
  map.toggleFullMap(true);
  return {
    map, canvas, controls, wrapper, window, document, captured, teleports, toggles, zoomIn, zoomOut,
    pointer(target, type, id, x = 110, y = 120, pointerType = 'touch', button = 0) {
      const event = { pointerId: id, clientX: x, clientY: y, pointerType, button, preventDefault() {} };
      (captured.has(id) ? canvas : target).dispatch(type, event);
      window.dispatch(type, event);
    }
  };
}

test('unrelated touches cannot move or release the map pan', () => {
  const h = mapHarness();
  assert.equal(h.canvas.style.touchAction, 'none');
  h.pointer(h.canvas, 'pointerdown', 1);
  h.pointer(h.controls, 'pointerdown', 2);
  h.pointer(h.canvas, 'pointerdown', 3);
  h.pointer(h.controls, 'pointermove', 2, 190);
  h.pointer(h.canvas, 'pointermove', 3, 190);
  h.pointer(h.controls, 'pointerup', 2);
  h.pointer(h.canvas, 'pointercancel', 3);
  assert.equal(h.map.viewCenterX, 1000);
  assert.equal(h.map.isPanning, true);
  assert.equal(h.teleports.length, 0);

  h.pointer(h.controls, 'pointermove', 1, 130);
  assert.equal(h.map.viewCenterX, 980);
  h.pointer(h.controls, 'pointerup', 1, 130);
  assert.equal(h.map.isPanning, false);
  assert.equal(h.wrapper.classList.contains('is-panning'), false);
  assert.equal(h.teleports.length, 0);
});

test('a normal map tap teleports once and releases capture', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointerdown', 1);
  h.pointer(h.canvas, 'pointerup', 1);
  assert.deepEqual(h.teleports, [[1000, 2000]]);
  assert.equal(h.map.waypoint.name, '1000, 2000');
  assert.equal(h.captured.size, 0);
  assert.equal(h.map.isPanning, false);
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'close']) {
  test(`${interruption} cancels a map tap without teleporting or leaving a drag active`, () => {
    const h = mapHarness();
    h.pointer(h.canvas, 'pointerdown', 1);
    if (interruption === 'blur') h.window.dispatch('blur');
    else if (interruption === 'hidden') {
      h.document.hidden = true;
      h.document.dispatch('visibilitychange');
    } else if (interruption === 'close') h.map.toggleFullMap(false);
    else if (interruption === 'lostpointercapture') h.canvas.releasePointerCapture(1);
    else h.pointer(h.canvas, interruption, 1);
    h.pointer(h.canvas, 'pointerup', 1);
    assert.equal(h.teleports.length, 0);
    assert.equal(h.map.isPanning, false);
    assert.equal(h.captured.size, 0);
    assert.equal(h.wrapper.classList.contains('is-panning'), false);
    if (interruption === 'close') {
      assert.deepEqual(h.toggles, [true, false]);
      h.map.toggleFullMap(true);
    }
    h.pointer(h.canvas, 'pointerdown', 2);
    h.pointer(h.canvas, 'pointerup', 2);
    assert.equal(h.teleports.length, 1);
  });
}

test('a pointer released outside the map or far from its start does not teleport', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointerdown', 1, 205);
  h.pointer(h.controls, 'pointerup', 1, 215);
  h.pointer(h.canvas, 'pointerdown', 2, 110);
  h.pointer(h.canvas, 'pointerup', 2, 130);
  assert.equal(h.teleports.length, 0);
});

test('mouse hover and zoom buttons remain available without a pan', () => {
  const h = mapHarness();
  h.pointer(h.canvas, 'pointermove', 1, 120, 130, 'mouse');
  assert.equal(h.map.hoverWorld.x, 1010);
  assert.equal(h.map.hoverWorld.z, 2010);
  h.pointer(h.canvas, 'pointermove', 2, 180, 130);
  assert.equal(h.map.hoverWorld.x, 1010, 'untracked touch does not update hover');
  h.zoomIn.dispatch('click');
  assert.equal(h.map.viewZoom, 1.45);
  h.zoomOut.dispatch('click');
  assert.equal(h.map.viewZoom, 1);
});

describe('Teleport markers', () => {
  test('a new map has no unsolicited destination', () => {
    assert.equal(mapHarness().map.waypoint, null);
  });

  test('radar and atlas mark a teleport without inventing a route across the geography', () => {
    const window = { NYC: { GEO: {}, ROADS: [], NYC_LANDMARKS: [] }, devicePixelRatio: 1 };
    const document = { body: { classList: classList() } };
    vm.runInNewContext(source, { window, document, performance: { now: () => 0 } });
    const strokes = [], fills = [];
    const context = new Proxy({
      stroke() { strokes.push(this.strokeStyle); },
      fill() { fills.push(this.fillStyle); },
      createRadialGradient() { return { addColorStop() {} }; }
    }, { get: (target, key) => target[key] ?? (() => {}) });
    const map = Object.create(window.NYC.NYCMapSystem.prototype);
    const canvas = { width: 320, height: 180, clientWidth: 320, clientHeight: 180, offsetParent: {} };
    const state = {
      miniCtx: context, miniCanvas: canvas, miniScale: 0.32,
      miniCache: { canvas: {}, cx: 0, cz: 0, s: 0.32, version: 0 },
      fullCtx: context, fullCanvas: canvas, fullStatic: { getContext: () => context },
      isFullMapOpen: true, viewCenterX: 0, viewCenterZ: 0, viewZoom: 0.32,
      renderFullMapStatic() {},
      controllerManager: { getActiveEntity: () => ({ position: { x: 0, y: 0, z: 0 }, heading: 0 }) },
      cameraSystem: { currentPos: {}, currentLookAt: { clone: () => ({ sub: () => ({ x: 0, z: 1 }) }) } },
      waypoint: { x: 50, z: -40, name: 'Last teleport' }
    };
    for (const [key, value] of Object.entries(state)) map[key] = value;
    for (const render of ['renderMinimap', 'renderFullMap']) {
      strokes.length = fills.length = 0;
      map[render]();
      assert.equal(strokes.includes('#ffc21a'), false, 'no yellow navigation line');
      assert.equal(fills.filter((color) => color === '#ffc21a').length, 1, 'keep the destination marker');
    }
  });
});

describe('Heading-up radar', () => {
  test('cached streets, waypoint, player and north agree through a full turn at both pixel ratios', () => {
    for (const dpr of [1, 2]) {
      let matrix = [1, 0, 0, 1, 0, 0];
      const stack = [], images = [], waypoints = [], tips = [];
      function project(x, y) { return [(matrix[0] * x + matrix[2] * y + matrix[4]) / dpr, (matrix[1] * x + matrix[3] * y + matrix[5]) / dpr]; }
      const ctx = new Proxy({
        save() { stack.push(matrix.slice()); },
        restore() { matrix = stack.pop(); },
        setTransform(...values) { matrix = values; },
        rotate(angle) {
          const [a, b, c, d, x, y] = matrix, cs = Math.cos(angle), sn = Math.sin(angle);
          matrix = [a * cs + c * sn, b * cs + d * sn, c * cs - a * sn, d * cs - b * sn, x, y];
        },
        drawImage(image, x, y, width, height) {
          images.push(project(x + width * (0.5 + 32 * dpr / image.width), y + height / 2));
        },
        arc(x, y, radius) { if (radius === 4.5) waypoints.push(project(x, y)); },
        moveTo(x, y) { if (x === 0 && y === -9) tips.push(project(x, y)); },
        createRadialGradient() { return { addColorStop() {} }; }
      }, { get: (target, key) => target[key] ?? (() => {}) });
      const window = { NYC: { GEO: {}, ROADS: [], NYC_LANDMARKS: [] }, devicePixelRatio: dpr };
      const document = { body: { classList: classList() } };
      vm.runInNewContext(source, { window, document });
      const entity = { position: { x: 0, y: 0, z: 0 }, heading: 0 };
      const map = Object.create(window.NYC.NYCMapSystem.prototype);
      const state = {
        miniCtx: ctx, miniCanvas: { width: 200 * dpr, height: 200 * dpr, clientWidth: 200, clientHeight: 200, offsetParent: {} },
        miniScale: 0.32, miniCache: { canvas: { width: 400 * dpr, height: 400 * dpr }, cx: 0, cz: 0, s: 0.32, version: 0 },
        elMiniNorth: { style: {} }, controllerManager: { getActiveEntity: () => entity },
        cameraSystem: { currentPos: {}, currentLookAt: { clone: () => ({ sub: () => ({ x: 0, z: 1 }) }) } },
        waypoint: { x: 100, z: 0 }
      };
      for (const [key, value] of Object.entries(state)) map[key] = value;
      const r = 32 / Math.SQRT2, east = [[-32, 0], [-r, -r], [0, -32], [r, -r], [32, 0], [r, r], [0, 32], [-r, r], [-32, 0]];
      function close(actual, expected, message) {
        assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-7), `${message}: ${actual} versus ${expected}`);
      }
      for (const [i, offset] of east.entries()) {
        entity.heading = i * Math.PI / 4;
        map.renderMinimap();
        const target = [100 + offset[0], 100 + offset[1]];
        close(images.at(-1), target, 'the cached street east of the player rotates with the map');
        close(waypoints.at(-1), target, 'the destination stays on its street');
        close(tips.at(-1), [100, 91], 'the player arrow remains centred and points up');
        const north = map.elMiniNorth.style.transform.match(/translate\(([-.\de+]+)px, ([-.\de+]+)px\)$/);
        assert.ok(north, 'position the north label on the rim');
        close([Number(north[1]), Number(north[2])], [offset[1] / 32 * 85, -offset[0] / 32 * 85], 'true north orbits the player without turning its label');
      }
    }
  });
});
