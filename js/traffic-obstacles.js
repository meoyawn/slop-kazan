/** Prepared markings are valid only for the same static traffic clearances. */
export async function trafficObstacleVersion(obstacles) {
  const records = obstacles.map((obstacle) => JSON.stringify(Object.fromEntries(Object.entries(obstacle).sort()))).sort();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(records)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
