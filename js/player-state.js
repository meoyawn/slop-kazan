import { ISLAND_BOUNDS, SPAWN } from './kazan-config.js';

const STORAGE_KEY = 'kazan-player-state';

function readSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.version === 1 && saved.city === 'kazan' ? saved : null;
  } catch { return null; }
}

function savedPosition(saved, mode) {
  const p = saved?.entities?.[mode];
  if (!p || ![p.x, p.y, p.z, p.heading].every(Number.isFinite)) return null;
  if (p.x < ISLAND_BOUNDS.minX || p.x > ISLAND_BOUNDS.maxX || p.z < ISLAND_BOUNDS.minZ || p.z > ISLAND_BOUNDS.maxZ) return null;
  return p;
}

/** Build the initial streamed district around the player restored by the controller. */
export function getInitialPlayerPosition() {
  const saved = readSavedState();
  const mode = ['person', 'car', 'cyclist', 'helicopter'].includes(saved?.activeMode) ? saved.activeMode : 'car';
  return savedPosition(saved, mode) || SPAWN;
}

export function restorePlayerState(controllers) {
  try {
    const saved = readSavedState();
    if (!saved) return;
    for (const mode of Object.keys(controllers.entities)) {
      const p = savedPosition(saved, mode);
      if (!p) continue;
      controllers.setMode(mode);
      controllers.teleportActiveTo(p.x, p.z, p.heading, p.y);
    }
    controllers.setMode(Object.hasOwn(controllers.entities, saved.activeMode) ? saved.activeMode : 'car');
  } catch { /* Unavailable or invalid storage does not prevent playing. */ }
}

export function savePlayerState(controllers) {
  try {
    const entities = Object.fromEntries(Object.entries(controllers.entities).map(([mode, entity]) => [mode, {
      x: entity.position.x, y: entity.position.y, z: entity.position.z, heading: entity.heading
    }]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, city: 'kazan', activeMode: controllers.activeMode, entities }));
  } catch { /* Storage may be disabled or full. */ }
}
