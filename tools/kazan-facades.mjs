/** Assign a repeatable facade family while keeping photographic, mapped and inferred evidence separate. */
export function classifyFacade(tags, observation, profiles) {
  const reviewed = observation?.facadeProfile || observation?.appearance;
  const mapped = tags['building:colour'] || tags.colour;
  const material = tags['building:material'] || observation?.material || '';
  if (/glass|mirror/.test(material)) return null;
  let family = observation?.facadeProfile;
  if (family && !profiles[family]) throw new Error(`Unknown facade family: ${family}`);
  if (reviewed) return { family: family || 'reviewed-custom', source: 'reviewed-photograph', confidence: 'reviewed',
    appearance: { ...profiles[family], ...observation.appearance } };
  const residential = /^(apartments|residential|dormitory)$/.test(tags.building || tags['building:part'] || '');
  if (!residential) return null;
  let confidence = 'low', source = 'procedural-unknown';
  if (/brick/.test(material)) {
    family = /^(red|brown|maroon|firebrick)$/.test(mapped || '') ? 'brick-red' : 'brick-white';
    confidence = 'material'; source = 'osm-material';
  } else if (/concrete|panel/.test(material)) {
    family = 'panel-light'; confidence = 'material'; source = 'osm-material';
  } else if (/plaster|stucco/.test(material)) {
    family = 'plaster-light'; confidence = 'material'; source = 'osm-material';
  } else {
    const year = Number.parseInt(tags.start_date, 10);
    family = year >= 1955 && year < 1990 ? 'panel-light' : 'mineral-neutral';
    if (family === 'panel-light') source = 'procedural-era';
  }
  const appearance = { ...profiles[family] };
  if (mapped) { appearance.wallColour = mapped; source = 'osm-colour'; confidence = 'mapped'; }
  return { family, source, confidence, appearance };
}
