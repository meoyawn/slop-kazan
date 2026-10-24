/** Reviewed duplicate identities retain their original geometry without adding another physical building. */
export function resolveBuildingAliases(buildings, observations) {
  const byReference = new Map(), aliases = [];
  for (const b of buildings) {
    const reference = `${b.osmType}/${b.id}`;
    if (!byReference.has(reference)) byReference.set(reference, []);
    byReference.get(reference).push(b);
  }
  for (const [reference, observation] of Object.entries(observations)) {
    if (!observation.duplicateOf) continue;
    const canonical = observation.duplicateOf, originals = byReference.get(reference), targets = byReference.get(canonical);
    if (!originals || !targets || originals.length !== 1 || targets.length !== 1 || reference === canonical || observations[canonical]?.duplicateOf)
      throw new Error(`Invalid building alias: ${reference} -> ${canonical}`);
    if (originals[0].part || targets[0].part || originals[0].hasParts || targets[0].hasParts || buildings.some((b) => b.parent === reference))
      throw new Error(`Building alias would discard mapped parts: ${reference}`);
    aliases.push({ reference, canonical, source: observation.source, reason: observation.geometryNote, building: originals[0] });
  }
  const suppressed = new Set(aliases.map((a) => a.building));
  for (let i = buildings.length - 1; i >= 0; i--) if (suppressed.has(buildings[i])) buildings.splice(i, 1);
  return aliases;
}
