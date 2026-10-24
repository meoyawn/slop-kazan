/** Assign a repeatable facade family while keeping photographic, mapped and inferred evidence separate. */
export function classifyFacade(tags, observation, profiles, typology, cohort) {
  const reviewed = observation?.facadeProfile || observation?.appearance;
  const mapped = tags['building:colour'] || tags.colour;
  const material = tags['building:material'] || observation?.material || '';
  if (/glass|mirror/.test(material)) return null;
  let family = observation?.facadeProfile;
  if (family && !profiles[family]) throw new Error(`Unknown facade family: ${family}`);
  if (reviewed) {
    const inferred=observation.appearanceEvidence==='procedural-estimate';
    return { family: family || (inferred?'procedural-custom':'reviewed-custom'),
      source: inferred ? mapped?'osm-colour':'procedural-estimate' : 'reviewed-photograph',
      confidence: inferred ? mapped?'mapped':'inferred' : 'reviewed',
      appearance: { ...profiles[family], ...observation.appearance, ...(inferred&&mapped?{wallColour:mapped}:{}) } };
  }
  if (cohort) {
    const variant = tags['building:part'] && tags['building:part'] !== 'no' ? cohort.partVariants?.find((v) =>
      Number(tags['building:levels']) >= (v.minLevels ?? 0) && Number(tags['building:levels']) <= (v.maxLevels ?? Infinity)) : null;
    family = variant?.facadeProfile || cohort.facadeProfile;
    if (!profiles[family]) throw new Error(`Unknown cohort facade family: ${family}`);
    return { family, source: mapped ? 'osm-colour' : 'reference-cohort', confidence: mapped ? 'mapped' : 'inferred',
      appearance: { ...profiles[family], ...cohort.appearance, ...variant?.appearance, ...(mapped ? { wallColour: mapped } : {}) } };
  }
  if (typology) return { family: typology.facadeProfile, source: 'footprint-typology', confidence: 'inferred',
    appearance: { ...profiles[typology.facadeProfile], ...(mapped ? { wallColour: mapped } : {}) } };
  const kindergartenEnvelope = tags.amenity === 'kindergarten' && !/^(apartments|residential|dormitory|office|commercial)$/.test(tags.building || '') ||
    !tags.amenity && tags.building === 'kindergarten';
  if (kindergartenEnvelope) {
    family = /brick/.test(material) ? 'kindergarten-brick' : /panel|concrete/.test(material) ? 'kindergarten-panel' : 'kindergarten-plaster';
    if (!profiles[family]) throw new Error(`Unknown kindergarten facade family: ${family}`);
    return { family, source: mapped ? 'osm-colour' : material ? 'osm-material' : 'procedural-kindergarten',
      confidence: mapped ? 'mapped' : 'inferred', appearance: { ...profiles[family], ...(mapped ? { wallColour: mapped } : {}) } };
  }
  const schoolEnvelope = tags.amenity === 'school' && !/^(apartments|residential|dormitory|office|commercial)$/.test(tags.building || '') ||
    !tags.amenity && tags.building === 'school';
  if (schoolEnvelope) {
    const historic = Number.parseInt(tags.start_date, 10) < 1955 || !!tags.heritage;
    family = /sports_hall|sports_centre/.test(tags.leisure || '') ? 'school-sports-hall' : historic ? 'school-historic-classroom' :
      /brick/.test(material) ? 'school-brick-classroom' : /panel|concrete/.test(material) ? 'school-panel-classroom' : 'school-plaster-classroom';
    if (!profiles[family]) throw new Error(`Unknown school facade family: ${family}`);
    return { family, source: mapped ? 'osm-colour' : material ? 'osm-material' : 'procedural-school',
      confidence: mapped ? 'mapped' : 'inferred', appearance: { ...profiles[family], ...(mapped ? { wallColour: mapped } : {}) } };
  }
  const residential = /^(apartments|residential|dormitory)$/.test(tags.building || tags['building:part'] || '');
  if (!residential) return null;
  let confidence = 'low', source = 'procedural-unknown';
  if (/brick/.test(material)) {
    family = /^(red|brown|maroon|firebrick)$/.test(mapped || '') ? 'brick-red' : 'brick-white';
    confidence = 'material'; source = 'osm-material';
  } else if (/panel/.test(material)) {
    family = 'panel-light'; confidence = 'material'; source = 'osm-material';
  } else if (/plaster|stucco/.test(material)) {
    family = 'plaster-light'; confidence = 'material'; source = 'osm-material';
  } else {
    family = 'mineral-neutral';
  }
  const appearance = { ...profiles[family] };
  if (mapped) { appearance.wallColour = mapped; source = 'osm-colour'; confidence = 'mapped'; }
  return { family, source, confidence, appearance };
}

/** A project/address membership is evidence of a shared design; proximity alone cannot assign paint. */
export function createFacadeCohortIndex(specs, elements, profiles) {
  const index = new Map();
  for (const spec of specs) {
    if (!profiles[spec.facadeProfile]) throw new Error(`Unknown cohort facade family: ${spec.facadeProfile}`);
    for (const e of elements) {
      const key = `${e.type}/${e.id}`, tags = e.tags || {};
      const selected = spec.members?.includes(key) || spec.addresses?.some((a) =>
        a.street === tags['addr:street'] && a.numbers.includes(tags['addr:housenumber']));
      if (!selected || !tags.building || tags.building === 'construction') continue;
      if (index.has(key)) throw new Error(`Ambiguous facade cohort: ${key}`);
      index.set(key, spec);
    }
  }
  return index;
}
