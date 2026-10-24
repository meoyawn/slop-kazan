/** A destination becomes active only after its world regions are ready. */
export function createTeleport({ controllerManager, touchControls, gamepadControls, cameraSystem,
  selectCamera, prepareDestination, getMap, getLocationLabel }) {
  let version = 0;
  return async function teleportTo(x, z, heading = Math.PI) {
    const request = ++version;
    await prepareDestination(x, z);
    if (request !== version) return;
    const destination = controllerManager.teleportActiveTo(x, z, heading);
    touchControls.reset();
    gamepadControls.reset();
    cameraSystem.resetForTeleport();
    selectCamera('chase', true);
    getMap().waypoint = { x: destination.x, z: destination.z, name: getLocationLabel(destination.x, destination.z) };
    return destination;
  };
}
