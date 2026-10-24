import { createClassicalCrowns } from './kazan-classical-crowns.js';

/** Shared silhouette accents use the existing spatial box palette; windows remain in the facade shader. */
export function createKazanStalinkas({ box, plainMaterial, solid }) {
  const crowns = createClassicalCrowns({ box, plainMaterial, solid });
  function decorate(group, b, base, wallHeight) {
    if (b.architectureFamily !== 'stalinka') return;
    const ornate = b.facadeFamily === 'stalinka-neoclassical', trim = plainMaterial(b.appearance.trimColour);
    const bottom = base + b.minHeight, top = bottom + wallHeight - 0.12;
    const passageTop = Math.max(0, ...(b.openingVolumes || []).map((v) => v.minHeight).filter((y) => y > 0 && y < b.h));
    if (wallHeight < 4) return;
    crowns.decorate(group, b, base);
    for (const ring of [b.ring, ...b.holes]) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ax = ring[j], az = ring[j + 1], dx = ring[i] - ax, dz = ring[i + 1] - az, length = Math.hypot(dx, dz);
        if (length < 0.3) continue;
        const x = ax + dx / 2, z = az + dz / 2, yaw = -Math.atan2(dz, dx);
        const corniceHeight = ornate ? 0.52 : 0.32;
        box(group, x, top - corniceHeight / 2, z, length, corniceHeight, ornate ? 1.8 : 0.48, trim, yaw);
        if (!ornate) continue;
        box(group, x, top - 0.76, z, length, 0.32, 0.8, trim, yaw);
        const belt = Math.max(passageTop ? passageTop + 0.2 - b.minHeight : 0,
          Math.min(wallHeight * 0.3, Math.max(b.appearance.plinthHeight, b.appearance.floorHeight + 0.2)));
        if (belt >= wallHeight - 0.7) continue;
        box(group, x, bottom + belt, z, length, 0.28, 0.65, trim, yaw);
        if (length < 6) continue;
        const width = 1, start = Math.min(1, length * 0.1), height = wallHeight - belt - 1.2;
        const piers = [start, length - start], spacing = b.appearance.bayWidth * 4, phase = (ax * dx + az * dz) / length;
        for (let u = Math.ceil((phase + start + 3) / spacing) * spacing - phase; u < length - start - 3; u += spacing) piers.push(u);
        for (const u of piers) {
          const px = ax + dx * u / length, pz = az + dz * u / length;
          box(group, px, bottom + belt + height / 2, pz, width, height, 0.7, trim, yaw);
          box(group, px, top - 1.05, pz, width + 0.45, 0.3, 0.9, trim, yaw);
        }
      }
    }
  }
  function bodySections(b) {
    if (!b.stalinkaSections) return null;
    return b.stalinkaSections.map((section) => ({ ...b, ...section, hasParts: false,
      openingVolumes: section.openingVolumes, stalinkaCrown: section.role === 'raised-tower' ? b.stalinkaCrown : undefined }));
  }
  return { decorate, bodySections, crownShapes: crowns.shapes };
}
