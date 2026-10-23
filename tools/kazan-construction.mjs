/** Planned storeys and opening dates do not describe how much of a building exists today. */
export function constructionState(tags, observation, totalHeight, heightSource, identity) {
  const reviewed = observation?.construction;
  if (!reviewed && tags.building !== 'construction' && tags['building:part'] !== 'construction') return null;
  const stage = reviewed?.stage || tags['construction:stage'] || 'unknown';
  if (!['unknown', 'excavation', 'piling', 'foundation', 'frame', 'renovation'].includes(stage)) throw new Error(`Unknown construction stage: ${stage}`);
  const currentLevels = Number.parseFloat(tags['construction:levels']) || reviewed?.currentLevels || 0;
  const currentHeight = reviewed?.currentHeight ?? (Number.parseFloat(tags['construction:height']) ||
    (currentLevels ? currentLevels * 3 : stage === 'renovation' ? totalHeight : stage === 'frame' ? 6 : 0.6));
  const excavationDepth = reviewed?.excavationDepth ?? 0;
  if (currentHeight <= 0 || excavationDepth < 0) throw new Error(`Invalid construction dimensions: ${identity}`);
  return { stage, currentHeight, currentLevels: currentLevels || undefined, excavationDepth,
    plannedHeight: /osm-height|osm-levels|published-height|reviewed-estimate/.test(heightSource) ? totalHeight : undefined,
    plannedHeightSource: heightSource, plannedLevels: Number.parseFloat(tags['building:levels']) || undefined,
    use: tags.construction || tags.building, confidence: reviewed ? 'reviewed' : stage === 'unknown' ? 'unknown' : 'mapped',
    observedAt: reviewed?.observedAt, source: reviewed?.source || observation?.source || `https://www.openstreetmap.org/${identity}` };
}
