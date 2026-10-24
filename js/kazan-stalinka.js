/** Shared silhouette accents use the existing spatial box palette; windows remain in the facade shader. */
export function createKazanStalinkas({ box, plainMaterial }) {
  function decorate(group, b, base, wallHeight) {
    if (b.architectureFamily !== 'stalinka') return;
    const ornate = b.facadeFamily === 'stalinka-neoclassical', trim = plainMaterial(b.appearance.trimColour);
    const bottom = base + b.minHeight, top = bottom + wallHeight;
    const passageTop = Math.max(0, ...(b.openingVolumes || []).map((v) => v.minHeight).filter((y) => y > 0 && y < b.h));
    if (wallHeight < 4) return;
    for (const ring of [b.ring, ...b.holes]) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = ring[j], az = ring[j + 1], dx = ring[i] - ax, dz = ring[i + 1] - az, length = Math.hypot(dx, dz);
        if (length < 0.3) continue;
        const x = ax + dx / 2, z = az + dz / 2, yaw = -Math.atan2(dz, dx);
        box(group, x, top - 0.16, z, length, 0.32, ornate ? 1.1 : 0.48, trim, yaw);
        if (!ornate) continue;
        box(group, x, top - 0.44, z, length, 0.15, 0.56, trim, yaw);
        const belt = Math.max(passageTop ? passageTop + 0.2 - b.minHeight : 0,
          Math.min(wallHeight * 0.3, Math.max(b.appearance.plinthHeight, b.appearance.floorHeight + 0.2)));
        if (belt >= wallHeight - 0.7) continue;
        box(group, x, bottom + belt, z, length, 0.17, 0.42, trim, yaw);
        if (length < 6) continue;
        const width = 0.7, start = Math.min(1, length * 0.1), height = wallHeight - belt - 0.7;
        const piers = [start, length - start], spacing = b.appearance.bayWidth * 4, phase = (ax * dx + az * dz) / length;
        for (let u = Math.ceil((phase + start + 3) / spacing) * spacing - phase; u < length - start - 3; u += spacing) piers.push(u);
        for (const u of piers) {
          const px = ax + dx * u / length, pz = az + dz * u / length;
          box(group, px, bottom + belt + height / 2, pz, width, height, 0.46, trim, yaw);
          box(group, px, top - 0.65, pz, width + 0.25, 0.22, 0.5, trim, yaw);
        }
      }
    }
  }
  return { decorate };
}
