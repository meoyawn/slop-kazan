import { createTeleport } from './teleports.js';
import { getInitialPlayerPosition, restorePlayerState, savePlayerState } from './player-state.js';
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, positionView, metalness, roughness, vec2, smoothstep } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { createPostProcessing } from './post-processing.js';
import { getLocationLabel, isTypingInField, ROADS, NYC_LANDMARKS, TELEPORT_LOCATIONS, surfaceHeight } from './kazan-config.js';
import { prepareTerrain } from './kazan-terrain-assets.js';
import { prepareRoads } from './kazan-road-assets.js';
import { prepareGround } from './kazan-ground-assets.js';
import { prepareMarkings } from './kazan-marking-assets.js';
import { buildCityGrid, buildBoroughs, buildLandmarks, buildCityBlocks, buildStreetDetails } from './kazan-city.js';
import { createTrafficSystem, createHighwayTraffic } from './traffic.js';
import { ThirdPersonControllerManager } from './controllers.js';
import { TouchControls } from './touch-controls.js';
import { GamepadControls } from './gamepad-controls.js';
import { CameraSystem, CAMERA_PRESETS } from './cameras.js';
import { LightingSystem } from './lighting.js';
import { NYCMapSystem } from './nyc-map.js';
import { setupSceneCulling, updateSceneCulling } from './scene-culling.js';
import { setupStaticBatches } from './static-batches.js';
import { CityAudioSystem } from './audio-system.js';
import { runtime, loading, services } from './kazan-runtime.js';

// js/main.js
// Main entry point for Kazan, Tatarstan in Three.js WebGPURenderer & TSL.

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  async function stage(progress, message) {
    loading.update(progress, message);
    // Give the loading screen and browser input a turn between city construction stages.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await stage(50, 'Starting graphics…');

  // 1. Initialize Three.js WebGPURenderer with 32-bit float reversedDepthBuffer
  const renderer = new THREE.WebGPURenderer({
    antialias: !runtime.lite,
    powerPreference: 'high-performance',
    reversedDepthBuffer: !runtime.forceWebGL,
    forceWebGL: runtime.forceWebGL,
    outputBufferType: runtime.lite ? THREE.UnsignedByteType : THREE.HalfFloatType
  });
  renderer.setPixelRatio(softwarePreview ? 0.5 : runtime.lite ? 0.75 : 1.0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  container.appendChild(renderer.domElement);

  // Start-up phase timings (logged once as "[init] ...") to keep load-time regressions traceable
  let initTimings = [];
  let initMark = performance.now();
  const markInit = (label) => {
    const now = performance.now();
    initTimings.push(`${label} ${Math.round(now - initMark)}ms`);
    performance.measure(`city-init/${label}`, { start: initMark, end: now });
    initMark = now;
  };

  await renderer.init();
  runtime.webgl = renderer.backend.isWebGLBackend === true;
  if (runtime.webgl) throw new Error('A WebGPU graphics adapter is required to run the city.');
  renderer.onDeviceLost = (info) => {
    renderer.setAnimationLoop(null);
    loading.fail(new Error(info.message || 'Graphics device lost'));
  };
  renderer.shadowMap.enabled = !softwarePreview && !runtime.lite;
  if (ClusteredLighting && !runtime.lite) renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  const rendererLabel = document.getElementById('hud-renderer');
  if (rendererLabel) rendererLabel.textContent = `${runtime.webgl ? 'WebGL 2' : 'WebGPU'}${runtime.lite ? ' · Lite' : ''}`;
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    loading.fail(new Error('Graphics context lost'));
  });
  if (softwarePreview) {
    interactionCanvas.style.width = interactionCanvas.style.height = '100%';
    interactionCanvas.width = renderer.domElement.width;
    interactionCanvas.height = renderer.domElement.height;
    softwareTarget = new THREE.RenderTarget(interactionCanvas.width, interactionCanvas.height, { depthBuffer: false });
    renderer.setOutputRenderTarget(softwareTarget);
  }
  markInit('renderer');

  // 2. Build Scene & Physical Atmospheric Sky / PMREM IBL / 4096x4096 Shadow Lighting
  const scene = new THREE.Scene();
  const lightingSystem = new LightingSystem(scene, renderer);
  if (softwarePreview || runtime.lite) lightingSystem.sunLight.castShadow = false;
  markInit('lighting');

  await stage(54, 'Building Kazan terrain & streets…');

  // 3. Build Kazan terrain, landmarks, buildings, streets and traffic
  const initialPosition = getInitialPlayerPosition();
  await Promise.all([prepareTerrain(initialPosition), prepareRoads(initialPosition), prepareGround(), prepareMarkings(initialPosition)]);
  markInit('worldAssets');
  const cityGrid = buildCityGrid(scene, initialPosition);
  markInit('cityGrid');
  await stage(62, 'Building landmarks…');
  const boroughs = buildBoroughs(scene, { sidewalks: cityGrid.sidewalks });
  markInit('boroughs');
  const { colliders: landmarkColliders, update: updateLandmarks } = buildLandmarks(scene, initialPosition);
  markInit('landmarks');
  await stage(65, 'Preparing mapped buildings…');
  const cityBlocks = buildCityBlocks(scene, initialPosition);
  markInit('blocks');
  const allColliders = [...landmarkColliders, ...cityBlocks.colliders, ...boroughs.colliders, ...(cityGrid.colliders || [])];

  await stage(69, 'Planting trees & street details…');
  const streetDetails = buildStreetDetails(scene, initialPosition);
  markInit('streetDetails');
  await stage(73, 'Preparing traffic…');
  // Buildings turned along non-grid streets have oriented colliders whose world bounds reach past their lots: they stay
  // inside the property line anyway, so the road network (lanes & sidewalks) doesn't need them
  const trafficObstacles = [
    ...cityGrid.footprints,
    ...streetDetails.footprints,
    ...allColliders.filter((c) => !c.obb)
  ];
  const trafficSystem = createTrafficSystem(scene, cityGrid.sidewalks, trafficObstacles);
  markInit('traffic');
  const highwayTraffic = createHighwayTraffic(scene, cityGrid.highwayLanes);
  await stage(78, 'Painting roads & preparing controls…');
  await services.markingAssets.attach(scene, cityGrid.sidewalks, trafficObstacles);
  markInit('roadPaint');

  // 4. Initialize Third-Person Controllers (Person, Car, Cyclist, Helicopter) & Multi-Camera System
  const controllerManager = new ThirdPersonControllerManager(scene, allColliders);
  // Reuse teleport placement so saved players return at rest, close to their last positions.
  try {
    const saved = JSON.parse(localStorage.getItem('nyc-player-state'));
    if (saved?.version === 1) {
      for (const mode of Object.keys(controllerManager.entities)) {
        const p = saved.entities?.[mode];
        if (!p || ![p.x, p.y, p.z, p.heading].every(Number.isFinite)) continue;
        controllerManager.setMode(mode);
        controllerManager.teleportActiveTo(p.x, p.z, p.heading, p.y);
      }
      controllerManager.setMode(Object.hasOwn(controllerManager.entities, saved.activeMode) ? saved.activeMode : 'car');
    }
  } catch { /* Missing or unavailable storage does not prevent playing. */ }

  function savePlayerState() {
    try {
      const entities = Object.fromEntries(Object.entries(controllerManager.entities).map(([mode, entity]) => [mode, {
        x: entity.position.x, y: entity.position.y, z: entity.position.z, heading: entity.heading
      }]));
      localStorage.setItem('nyc-player-state', JSON.stringify({ version: 1, activeMode: controllerManager.activeMode, entities }));
    } catch { /* Storage may be disabled or full. */ }
  }

  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  const touchControls = new TouchControls(controllerManager);
  const soundButton = document.getElementById('btn-sound');
  const audioSystem = new CityAudioSystem({ controllerManager, trafficSystem, highwayTraffic, streetDetails }, {
    onStateChange: updateSoundButton
  });
  function updateSoundButton() {
    if (!soundButton) return;
    soundButton.disabled = !audioSystem.supported;
    soundButton.setAttribute('aria-pressed', String(audioSystem.enabled));
    soundButton.setAttribute('aria-label', audioSystem.enabled ? 'Mute sound' : 'Enable sound');
    soundButton.title = audioSystem.supported ? `${audioSystem.enabled ? 'Mute' : 'Enable'} sound [N]` : 'Web Audio is unavailable';
    soundButton.querySelector('use').setAttribute('href', audioSystem.enabled ? '#i-sound' : '#i-sound-off');
  }
  soundButton?.addEventListener('click', () => audioSystem.setEnabled(!audioSystem.enabled));
  updateSoundButton();
  // pagehide also covers navigation away on mobile; preserve the context across back-forward cache restores.
  window.addEventListener('pagehide', (event) => {
    savePlayerState(controllerManager);
    if (!event.persisted) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      audioSystem.dispose();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) savePlayerState(); });
  markInit('controllers');

  // Island-wide static geometry: chunk & distance-cull the small props, shadow stand-ins for the big casters
  // (scene-culling.js)
  const cullingRoots = ['KazanCityGrid', 'KazanCityBlocks', 'KazanStreetDetails', 'KazanLandmarks']
    .map((name) => scene.getObjectByName(name))
    .filter(Boolean);
  const cullingStats = setupSceneCulling(scene, cullingRoots, renderer.shadowMap.enabled ? lightingSystem.sunLight.shadow : null);
  if (!runtime.webgl) setupStaticBatches(scene, [...cullingRoots, scene.getObjectByName('KazanTrams')].filter(Boolean), lightingSystem.sunLight.shadow);
  markInit('culling');

  // On WebGPU, small InstancedMeshes (<= 1000 instances) keep their matrices in uniform buffers that three.js
  // re-uploads on every draw of every pass (~2.5 MB/frame with the shadow cascades, stalling the GPU queue).
  // Storage attributes are only uploaded when instanceMatrix.needsUpdate is set.
  scene.traverse((object) => {
    if (object.isInstancedMesh && !object.instanceMatrix.isStorageInstancedBufferAttribute && !runtime.webgl) {
      object.instanceMatrix = new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array, 16);
    }
  });

  // 5. TSL RenderPipeline with Half-Res Screen Space Reflections (SSRNode), Bloom & Filmic Toning
  //    Fade out distant and matte surfaces so SSR spends its rays on visible glossy reflections.
  const scenePass = pass(scene, cameraSystem.camera);
  // The multisampled colour attachments (output, normal, metalRough) only need resolving, never storing: discarding
  // them spares the GPU writing 3 x 4 samples per pixel to memory every frame (transient, memoryless attachments where
  // the browser supports them). The multisampled depth stays stored: SSR reads it.
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
  const maxSSRRoughness = 0.75;
  const sceneMRT = mrt({
    output: output,
    normal: normalView,
    metalRough: vec2(roughness.lessThan(maxSSRRoughness).select(metalness.mul(ssrFade), 0), roughness)
  });
  sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
  sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
  scenePass.setMRT(sceneMRT);

    const scenePassDepth = scenePass.getTextureNode('depth');
    const scenePassNormal = scenePass.getTextureNode('normal');
    const scenePassMetalRough = scenePass.getTextureNode('metalRough');

  const ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
    metalnessNode: scenePassMetalRough.r,
    roughnessNode: scenePassMetalRough.g,
    camera: cameraSystem.camera
  });
  ssrPass.resolutionScale = 0.5;
  ssrPass.blurQuality = 1;
  ssrPass.maxDistance.value = 42;
  ssrPass.thickness.value = 0.85;
  // Fewer coarse steps, then refine detected hits to keep reflection edges precise.
  ssrPass.quality.value = 0.25;
  ssrPass.binaryRefine = true;
  ssrPass.intensity.value = 0.50;
  ssrPass.screenEdgeFadeBlack = true;

  // Roughness mip blur must not spread reflections back onto matte or nonreflective surfaces.
  const reflectionMask = scenePassMetalRough.r.greaterThan(0).select(smoothstep(maxSSRRoughness, 0.55, scenePassMetalRough.g), 0);
  const reflections = ssrPass.mul(reflectionMask);
  const colorGrade = createPostProcessing(renderer, scenePassColor, reflections);
  const renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);

  // 6. Wire UI Controls (Strictly using safe DOM APIs: textContent, classList, addEventListener)
  const modeButtons = document.querySelectorAll('[data-mode]');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  const timeButtons = document.querySelectorAll('[data-time]');
  const teleportButtons = document.querySelectorAll('[data-teleport]');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const modeSwitch = document.getElementById('mode-switch');
  touchControls.onAvailabilityChange = placeModeIndicator;

  const elFps = document.getElementById('hud-fps');
  const elMode = document.getElementById('hud-active-mode');
  const elCamera = document.getElementById('hud-active-camera');
  const elSpeed = document.getElementById('hud-speed');
  const elSpeedMeter = document.getElementById('hud-speed-meter');
  const elSuperBoost = document.getElementById('hud-super-boost');
  const elAltitude = document.getElementById('hud-altitude');
  const elLocation = document.getElementById('hud-location');
  const elControlsHint = document.getElementById('hud-controls-hint');
  const gamepadControls = new GamepadControls(controllerManager, cameraSystem, {
    onCycleMode: (step) => {
      const modes = ['person', 'car', 'cyclist', 'helicopter'];
      selectMode(modes[(modes.indexOf(controllerManager.activeMode) + step + modes.length) % modes.length]);
    },
    onCycleCamera: cycleCamera,
    onToggleMap: () => mapSystem.toggleFullMap(!mapSystem.isFullMapOpen),
    onCloseMap: () => mapSystem.toggleFullMap(false)
  });

  // Keyboard guide for each mode: [keys, action]
  const controlHints = {
    person: [[['W', 'S'], 'Walk'], [['A', 'D'], 'Turn'], [['Shift'], 'Sprint'], [['Space'], 'Jump'], [['Drag'], 'Orbit']],
    car: [[['W', 'S'], 'Drive / Reverse'], [['A', 'D'], 'Steer'], [['Shift'], 'Boost'], [['B'], 'Horn'], [['Drag'], 'Orbit']],
    cyclist: [[['W', 'S'], 'Pedal / Brake'], [['A', 'D'], 'Lean & Turn'], [['Shift'], 'Sprint'], [['Drag'], 'Orbit']],
    helicopter: [[['W', 'S'], 'Pitch'], [['A', 'D'], 'Yaw'], [['Space', 'E'], 'Ascend'], [['Q', 'C'], 'Descend'], [['Shift'], 'Boost']]
  };
  // Boosted top speeds in km/h: full scale of the speed meter.
  const topSpeedKmh = { person: 30, car: 130, cyclist: 68, helicopter: 188 };

  function renderControlHints(mode) {
    if (!elControlsHint) return;
    const hints = [...(controlHints[mode] || []), [['Shift ×2'], 'Super boost on / off']];
    const items = hints.map(([keys, action]) => {
      const item = document.createElement('span');
      item.className = 'hint';
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        item.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.className = 'hint-label';
      label.textContent = action;
      item.appendChild(label);
      return item;
    });
    elControlsHint.replaceChildren(...items);
  }

  // The taxi-yellow pill under the selected mode glides from button to button
  function placeModeIndicator() {
    const active = modeSwitch ? modeSwitch.querySelector('.mode-btn.active') : null;
    if (!active) return;
    modeSwitch.style.setProperty('--ind-x', `${active.offsetLeft}px`);
    modeSwitch.style.setProperty('--ind-w', `${active.offsetWidth}px`);
  }

  function selectMode(mode) {
    controllerManager.setMode(mode);
    touchControls.setMode(controllerManager.activeMode);
    gamepadControls.reset();
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    document.body.dataset.mode = mode;
    placeModeIndicator();
    const ent = controllerManager.getActiveEntity();
    if (elMode) elMode.textContent = ent.label;
    renderControlHints(mode);

    // If currently on a static scenic camera, switch to 3rd-Person Chase so user sees their selected character/vehicle
    const currentCam = cameraSystem.getActivePreset();
    if (currentCam.category !== 'follow') {
      selectCamera('chase', false);
    }
  }

  function selectCamera(camId, snap = false) {
    cameraSystem.setCameraPreset(camId, snap);
    cameraButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-camera') === camId);
    });
    const preset = cameraSystem.getActivePreset();
    if (elCamera) elCamera.textContent = preset.name;
  }

  // Steps through CAMERA_PRESETS (V / Shift+V, and the arrows either side of the camera name)
  function cycleCamera(step) {
    const n = CAMERA_PRESETS.length;
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(idx + step + n) % n].id, true);
  }

  function selectTime(timeId) {
    lightingSystem.applyPreset(timeId);
    colorGrade?.applyPreset(lightingSystem.activePresetId);
    timeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-time') === timeId);
    });
  }

  // Popovers (native [popover]: light dismiss & Esc for free) open against the control that toggles them: data-anchor
  // names the element they sit above / below, data-align the one whose right edge they line up with
  const popovers = document.querySelectorAll('.popover[popover]');
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  function closePopovers() {
    if (!supportsPopover) return;
    popovers.forEach((pop) => {
      if (pop.matches(':popover-open')) pop.hidePopover();
    });
  }
  popovers.forEach((pop) => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    pop.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      if (invoker) invoker.classList.toggle('is-open', open);
      if (!open) return;
      const anchor = document.getElementById(pop.dataset.anchor) || invoker;
      const align = document.getElementById(pop.dataset.align) || invoker;
      if (!anchor || !align) return;
      const r = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, r.top - 20);
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 20);
      let above = pop.dataset.side === 'above';
      // The camera control moves to the top on touch screens; open toward the available space.
      if ((above ? spaceAbove : spaceBelow) < 160) above = spaceAbove > spaceBelow;
      pop.style.right = `${Math.max(8, window.innerWidth - align.getBoundingClientRect().right)}px`;
      if (above) {
        pop.style.top = 'auto';
        pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
        pop.style.maxHeight = `${spaceAbove}px`;
      } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.maxHeight = `${spaceBelow}px`;
      }
    });
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectMode(btn.getAttribute('data-mode'));
    });
  });

  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectCamera(btn.getAttribute('data-camera'), true);
      closePopovers();
    });
  });

  const camPrevBtn = document.getElementById('cam-prev');
  const camNextBtn = document.getElementById('cam-next');
  if (camPrevBtn) camPrevBtn.addEventListener('click', () => cycleCamera(-1));
  if (camNextBtn) camNextBtn.addEventListener('click', () => cycleCamera(1));

  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTime(btn.getAttribute('data-time'));
    });
  });

  // A mouse click mustn't leave the focus on a HUD button, or Space (jump / ascend) and Enter would press it again
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });

  // Where you are: the place's name over its street corner, drawn as a pair of NYC street-name signs
  const roadNames = new Set(ROADS.map((r) => r.name));
  const placeNames = new Set(NYC_LANDMARKS.map((l) => l.name));
  let locationText = '';
  function renderLocation(label) {
    if (!elLocation || label === locationText) return;
    locationText = label;
    let place = '';
    let streets = label;
    const split = label.indexOf(' · ');
    if (split >= 0) {
      place = label.slice(0, split);
      streets = label.slice(split + 3);
    } else if (placeNames.has(label) || (!label.includes(' & ') && !roadNames.has(label))) {
      place = label;
      streets = '';
    }
    const nodes = [];
    if (place) {
      const el = document.createElement('div');
      el.className = 'location-place';
      el.textContent = place;
      nodes.push(el);
    }
    if (streets) {
      const row = document.createElement('div');
      row.className = 'location-signs';
      if (streets.startsWith('near ')) {
        streets = streets.slice(5);
        const near = document.createElement('span');
        near.className = 'location-near';
        near.textContent = 'near';
        row.appendChild(near);
      }
      for (const name of streets.split(' & ')) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    elLocation.replaceChildren(...nodes);
  }

  const teleportTo = createTeleport({
    controllerManager, touchControls, gamepadControls, cameraSystem, selectCamera, getLocationLabel,
    getMap: () => mapSystem,
    prepareDestination(x, z) {
      return Promise.all([services.terrainAssets.prepareAround(x, z), services.roadAssets.prepareAround(x, z), services.markingAssets.prepareAround(x, z)]);
    }
  });

  const mapSystem = new NYCMapSystem({
    controllerManager,
    cameraSystem,
    trafficSystem,
    allBlocks: cityBlocks.allBlocks,
    onToggle: (open) => {
      controllerManager.resetInput();
      touchControls.setEnabled(!open);
      gamepadControls.setEnabled(!open);
      const mapHint = document.getElementById('fullmap-hover-info');
      if (open && touchControls.available && mapHint) {
        mapHint.textContent = 'Tap to teleport · Drag to pan · Use + / − to zoom';
      }
    },
    onTeleport: teleportTo
  });

  teleportButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-teleport');
      const loc = TELEPORT_LOCATIONS[key];
      if (loc) {
        teleportTo(loc.x, loc.z, loc.heading);
      }
      closePopovers();
    });
  });

  const openMapBtn = document.getElementById('btn-open-map');
  if (openMapBtn) openMapBtn.addEventListener('click', () => mapSystem.toggleFullMap(true));

  const fullscreenButton = document.getElementById('btn-fullscreen');
  const fullscreenStatus = document.getElementById('fullscreen-status');
  if (fullscreenButton && document.fullscreenEnabled) {
    fullscreenButton.hidden = false;
    fullscreenButton.addEventListener('click', async () => {
      try {
        fullscreenStatus.hidden = true;
        if (document.fullscreenElement) await document.exitFullscreen();
        else {
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
          if (touchControls.available && screen.orientation?.lock) {
            try { await screen.orientation.lock('landscape'); } catch { /* Rotation remains available when locking is unsupported. */ }
          }
        }
      } catch (error) {
        console.warn('[fullscreen]', error);
        fullscreenStatus.textContent = 'Fullscreen is unavailable. You can keep playing in this view.';
        fullscreenStatus.hidden = false;
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const active = Boolean(document.fullscreenElement);
      fullscreenButton.setAttribute('aria-pressed', String(active));
      fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      fullscreenButton.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
      if (!active) screen.orientation?.unlock?.();
      controllerManager.resetInput();
      touchControls.reset();
    });
  }

  if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('hud-minimized');
      const isMin = document.body.classList.contains('hud-minimized');
      hudToggleBtn.setAttribute('aria-pressed', String(isMin));
      hudToggleBtn.setAttribute('aria-label', isMin ? 'Show HUD' : 'Hide HUD');
      hudToggleBtn.title = isMin ? 'Show the HUD [H]' : 'Clean view: hide the HUD [H]';
      if (isMin) closePopovers();
    });
  }

  // Global keyboard shortcuts for modes (1-4), cameras (V / 5-0), and HUD (H)
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e)) return;
    switch (e.code) {
      case 'Digit1':
        selectMode('person');
        break;
      case 'Digit2':
        selectMode('car');
        break;
      case 'Digit3':
        selectMode('cyclist');
        break;
      case 'Digit4':
        selectMode('helicopter');
        break;
      case 'Digit5':
        selectCamera('chase', true);
        break;
      case 'Digit6':
        selectCamera('action', true);
        break;
      case 'Digit7':
        selectCamera('pov', true);
        break;
      case 'Digit8':
        selectCamera('kulsharif', true);
        break;
      case 'Digit9':
        selectCamera('bauman', true);
        break;
      case 'Digit0':
        selectCamera('palace', true);
        break;
      case 'KeyV':
        cycleCamera(e.shiftKey ? -1 : 1);
        break;
      case 'KeyH':
        if (hudToggleBtn) hudToggleBtn.click();
        break;
      case 'KeyN':
        if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) audioSystem.setEnabled(!audioSystem.enabled);
        break;
      case 'KeyB':
        if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !mapSystem.isFullMapOpen) audioSystem.honk(controllerManager.getActiveEntity());
        break;
    }
  });

  window.addEventListener('resize', () => {
    cameraSystem.onResize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (softwareTarget) {
      interactionCanvas.width = renderer.domElement.width;
      interactionCanvas.height = renderer.domElement.height;
      softwareTarget.setSize(interactionCanvas.width, interactionCanvas.height);
    }
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  });

  // Initialize the UI and chase camera around the restored player, or the default taxi on a first visit.
  selectMode(controllerManager.activeMode);
  selectCamera('chase', true);
  selectTime('golden');
  // the web fonts change the buttons' widths once they arrive
  if (document.fonts) document.fonts.ready.then(placeModeIndicator);
  markInit('ui');

  // The loading screen stays up while the shaders compile (precompileShaders() & the warm-up frame, see the loop) and
  // until the first frame is on screen
  await stage(82, runtime.lite ? 'Preparing the first view…' : 'Compiling shaders…');

  // Compile each shader layout once, with bounded graph construction and GPU pipeline work.
  const COMPILE_POOL = 2;
  const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
  async function precompileShaders() {
    if (softwarePreview || runtime.lite) return;
    // An empty frame first: it sets up the post-processing chain, which configures the scene pass's render target
    // (MSAA samples, depth format), so the pipelines compiled below are the very ones the scene pass asks for
    scene.visible = false;
    renderPipeline.render();
    scene.visible = true;
    markInit('postFX');

    // Every visible object with frustum culling off (like the warm-up frame, see the loop). Plain meshes that share
    // a material share its shader, so one job compiles them in turn (the first build serves the rest); every
    // instanced mesh gets a build of its own unless its chunks share a pipeline
    const culled = [];
    const jobs = [];
    const compiledLayouts = new Set();
    scene.traverseVisible((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      // chunks of one mesh share its pipeline (the first one compiles it) and the shadow stand-ins only ever draw in
      // the shadow maps (the warm-up frame compiles those)
      if (o.userData.sharesPipelineWith || o.userData.shadowProxy) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      const layout = [o.type, o.isBatchedMesh, o.isInstancedMesh, o.isSkinnedMesh, o.receiveShadow,
        o.instanceMatrix?.isStorageInstancedBufferAttribute ? 'storage' : o.instanceMatrix?.count,
        ...materials.map((material) => material.uuid),
        ...Object.entries(o.geometry?.attributes || {}).map(([name, attribute]) => `${name}/${attribute.itemSize}/${attribute.normalized}/${attribute.array?.constructor.name}/${attribute.isInstancedBufferAttribute}`),
        ...Object.keys(o.geometry?.morphAttributes || {})].join('|');
      if (compiledLayouts.has(layout)) return;
      compiledLayouts.add(layout);
      jobs.push([o]);
    });

    renderer.setRenderTarget(scenePass.renderTarget);
    renderer.setMRT(sceneMRT);
    const compile = async (object) => {
      // Each compile starts in a task of its own: compileAsync() keeps one precompilation state on the renderer,
      // which must not be mid-step for two of them in the same microtask checkpoint
      await nextTask();
      try {
        await renderer.compileAsync(object, cameraSystem.camera, scene);
      } catch (e) {
        console.warn('[compile]', e); // the warm-up frame compiles it instead
      }
    };
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        for (const object of job) await compile(object);
        done++;
        loading.update(82 + done / jobs.length * 14, 'Compiling shaders…');
      }
    };
    await Promise.all(Array.from({ length: COMPILE_POOL }, worker));
    renderer.setMRT(null);
    renderer.setRenderTarget(null);
    for (const o of culled) o.frustumCulled = true;
  }

  await precompileShaders();
  markInit('compile');
  scene.matrixAutoUpdate = scene.matrixWorldAutoUpdate = false;

  // 6. Animation Loop
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let nextPlayerSave = 0;
  let warmedUp = false; // see the first frame below
  let submittedFrames = 0;

  if (elFps) elFps.textContent = '60';

  renderer.setAnimationLoop((now) => {
    // Keep the GPU queue short so slow adapters remain responsive to input and live reload.
    if (document.hidden || loading.failed || submittedFrames >= (softwarePreview || runtime.lite ? 1 : 2)) return;
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed += dt;

    // Update 3rd-person controllers, camera, signals, traffic & vehicle collisions, building LODs, and dynamic shadow focus
    gamepadControls.update(dt);
    controllerManager.update(dt, elapsed);
    cameraSystem.update(dt, elapsed);
    cityGrid.trams?.update(dt, elapsed, cameraSystem.currentPos, trafficSystem, controllerManager.getActiveEntity());
    streetDetails.signalClock.value = elapsed;
    trafficSystem.update(
      dt,
      elapsed,
      cameraSystem.currentPos,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      cameraSystem.camera
    );
    highwayTraffic.update(dt, cameraSystem.camera, controllerManager.getActiveEntity(), controllerManager.activeMode);
    if (!document.hidden && now >= nextPlayerSave) {
      savePlayerState();
      nextPlayerSave = now + 5000;
    }
    if (boroughs.update) boroughs.update(elapsed); // Roosevelt Island Tramway cabins
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityGrid.update) cityGrid.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    services.markingAssets.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityBlocks.updateLights) cityBlocks.updateLights(cameraSystem.camera);
    if (streetDetails.update) streetDetails.update(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos);
    mapSystem.update();
    audioSystem.update(dt, elapsed, cameraSystem.camera, lightingSystem.activePresetId === 'midnight');
    updateLandmarks(cameraSystem.camera.position.x, cameraSystem.camera.position.z);
    updateSceneCulling(cameraSystem.camera.position);
    scene.updateMatrixWorld();

    // Render frame via TSL RenderPipeline (SSR + Bloom)
    renderPipeline.render();
    const queue = renderer.backend.device?.queue;
    if (softwareTarget) {
      submittedFrames++;
      const width = softwareTarget.width, height = softwareTarget.height;
      renderer.readRenderTargetPixelsAsync(softwareTarget, 0, 0, width, height).then((pixels) => {
        if (interactionCanvas.width === width && interactionCanvas.height === height) {
          softwareContext.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
        }
      }).catch((error) => console.warn('[software preview]', error)).finally(() => { submittedFrames--; });
    } else if (queue) {
      submittedFrames++;
      queue.onSubmittedWorkDone().then(() => { submittedFrames--; }, () => { submittedFrames--; });
    }
    if (!warmedUp) {
      warmedUp = true;
      markInit('firstFrame');
      // The loading screen stays up until the GPU has got through the first frame (and the pipelines its warm-up
      // compiled), i.e. until the city is actually on screen
      const device = renderer.backend.device;
      Promise.resolve(device && device.queue.onSubmittedWorkDone()).catch(() => {}).then(() => {
        markInit('gpu');
        console.log(`[init] ${initTimings.join(', ')}`);
        initTimings = null;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        audioSystem.ready = true;
        services.worldReady = true;
        performance.mark('city-ready');
      });
    }

    // Telemetry uses wall time, not the clamped simulation step, so slow frames and high-refresh displays report
    // their actual frame rate (updates DOM every 250ms).
    frameCount++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      const currentFps = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;

      const activeEnt = controllerManager.getActiveEntity();
      const mode = controllerManager.activeMode;
      const kmh = Math.round(Math.abs(activeEnt.speed) * 3.6);
      const altitude = Math.max(0, Math.round(activeEnt.position.y - window.NYC.surfaceHeight(activeEnt.position.x, activeEnt.position.z)));

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(kmh);
      const superBoost = controllerManager.keys.superBoost;
      touchControls.syncBoost();
      const topSpeed = (topSpeedKmh[mode] || 130) * (superBoost ? mode === 'helicopter' ? 4 : 2 : 1);
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, kmh / topSpeed)})`;
      if (elSuperBoost) elSuperBoost.hidden = !superBoost;
      document.body.classList.toggle('is-boosting', (controllerManager.keys.boost || superBoost) && kmh > 0);
      if (elAltitude) elAltitude.textContent = altitude.toLocaleString('en-US');
      // The street corner of the player on the follow cameras, of the camera itself on the scenic ones
      const where = cameraSystem.getActivePreset().category === 'follow' ? activeEnt.position : cameraSystem.currentPos;
      renderLocation(getLocationLabel(where.x, where.z));
    }
  });
}

initApp();
