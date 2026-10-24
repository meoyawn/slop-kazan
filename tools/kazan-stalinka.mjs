const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;
const classical = /^(?:stalinist|stalinist_architecture|stalinist_empire|soviet_neoclassicism|neoclassicism|neoclassical)$/i;
const stalinist = /^stalinist(?:_architecture|_empire)?$/i;

function dimensions(b) {
  let area = 0, longest = 0, cornerFrontages = false;
  for (const ring of [b.ring, ...b.holes]) {
    let signed = 0;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      signed += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
      longest = Math.max(longest, Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1]));
      if (ring === b.ring) {
        const k = (i + 2) % ring.length, ux = ring[i] - ring[j], uz = ring[i + 1] - ring[j + 1], vx = ring[k] - ring[i], vz = ring[k + 1] - ring[i + 1];
        if (Math.hypot(ux, uz) >= 20 && Math.hypot(vx, vz) >= 20 && Math.abs(ux * vz - uz * vx) / (Math.hypot(ux, uz) * Math.hypot(vx, vz)) > 0.65) cornerFrontages = true;
      }
    }
    area += Math.abs(signed) / 2 * (ring === b.ring ? 1 : -1);
  }
  return { area, longest, cornerFrontages };
}

function eligibility(b, tags, date, assignment) {
  if (b.model || b.facadeCohort || b.facadeConfidence === 'reviewed' || /^(school|kindergarten|worship|sports)-/.test(b.facadeFamily || '')) return 'existing-reviewed-or-specialist-family';
  if (b.construction || b.fortification || tags.amenity || tags.leisure || tags.religion) return 'different-building-use';
  if (date?.conflict) return 'conflicting-construction-dates';
  if (date?.architecture && !classical.test(date.architecture)) return 'different-mapped-architecture';
  if (!/^(apartments|residential|dormitory)$/.test(b.kind) && !(classical.test(date?.architecture || '') && /^(public|civic|office|yes)$/.test(b.kind))) return 'use-not-established-as-stalinka';
  if (/wood|timber|panel|concrete|glass|metal/.test(b.material) || /khrush|1[-–](?:335|447|464)/i.test(tags['building:series'] || tags['design:ref'] || '')) return 'different-material-or-mass-housing-series';
  const intervals = (date?.construction || []).filter((e) => e.qualifier === 'mapped' && e.from >= 1932 && e.to <= 1959);
  if (!intervals.length && !stalinist.test(date?.architecture || '')) return 'uncertain-or-missing-era';
  if (intervals.length && Math.min(...intervals.map((e) => e.from)) < 1936 && !assignment && !classical.test(date?.architecture || '')) return 'early-era-style-unresolved';
  const { area, longest } = dimensions(b), levels = b.levels || Math.round((b.h - b.minHeight) / 3.5);
  if (levels < 2 || levels > 8 || b.h - b.minHeight < 5.5 || b.h > 36 || area < 80 || area / longest < 5) return 'incompatible-scale-or-footprint';
  if (intervals.length && Math.max(...intervals.map((e) => e.to)) >= 1957 && levels >= 4 && b.roofShape === 'flat' &&
      b.material !== 'plaster' && !tags.historic && !tags.heritage && !assignment && !classical.test(date?.architecture || '')) return 'late-era-mass-housing-or-stalinka-unresolved';
  return null;
}

/** One offline era/morphology classifier; dated candidates are not a census of confirmed architectural styles. */
export function compileStalinkas(elements, buildings, dates, catalogue) {
  const tags = new Map(elements.map((e) => [referenceOf(e), e.tags || {}])), records = new Map(dates.records.map((r) => [r.reference, r]));
  const bindings = new Map(), exclusions = new Map(), applied = [];
  const upperParts = new Set(buildings.filter((b) => b.part && b.minHeight >= 12 && /^(pyramidal|hipped|spire)$/.test(b.roofShape)).map((b) => b.parent));
  for (const b of buildings) {
    if (b.part) continue;
    const reference = referenceOf(b), date = records.get(reference), assignment = catalogue.assignments?.[reference];
    const eraCandidate = date?.construction.some((e) => e.from <= 1959 && e.to >= 1932) || stalinist.test(date?.architecture || '') || assignment;
    if (!eraCandidate) continue;
    const t = tags.get(reference) || {}, reason = eligibility(b, t, date, assignment);
    if (reason) { exclusions.set(reference, { reference, reason }); continue; }
    const levels = b.levels || Math.round((b.h - b.minHeight) / 3.5);
    const form = dimensions(b), parade = classical.test(date?.architecture || '') || levels >= 4 &&
      (upperParts.has(reference) || t.historic === 'building' || t.heritage || form.cornerFrontages && form.area >= 700);
    const variant = assignment?.variant || (parade ? 'neoclassical' : b.material === 'brick' ? 'brick' : 'plaster');
    if (!catalogue.families[variant]) throw new Error(`Unknown Stalinka family: ${variant}`);
    const binding = bindings.get(reference) || { reference, variant, confidence: assignment ? 'photographic-style' : classical.test(date?.architecture || '') ? 'mapped-style' : 'era-morphology-estimate',
      dateReference: reference, dateText: date?.construction.map((e) => e.text), architecture: date?.architecture,
      source: assignment?.source || 'mapped-construction-date-use-scale-material', levels, use: b.kind,
      ornamentEvidence: assignment ? 'photographic-style-sample' : classical.test(date?.architecture || '') ? 'mapped-classical-style' : parade ? 'mapped-upper-parts-heritage-or-large-corner-estimate' : 'restrained-era-family-estimate' };
    bindings.set(reference, binding);
    apply(b, binding, t, assignment);
  }
  for (const b of buildings) {
    if (!b.part || b.model || b.facadeConfidence === 'reviewed') continue;
    const parent = bindings.get(b.parent); if (!parent) continue;
    const reference = referenceOf(b), ownDate = records.get(reference), t = tags.get(reference) || {};
    if (ownDate?.conflict || ownDate?.architecture && !classical.test(ownDate.architecture) ||
        ownDate?.construction.length && !ownDate.construction.some((e) => e.qualifier === 'mapped' && e.from >= 1932 && e.to <= 1959)) {
      exclusions.set(reference, { reference, reason: 'mapped-part-has-different-or-uncertain-history' }); continue;
    }
    if (/wood|timber|panel|concrete|glass|metal/.test(b.material)) continue;
    const roofOnly = /^(roof|spire)$/.test(b.kind) || b.h - b.minHeight < 2;
    const binding = { ...parent, reference, parent: b.parent, role: roofOnly ? 'mapped-roof-or-spire' : 'mapped-part' };
    bindings.set(reference, binding);
    if (!roofOnly) apply(b, binding, t, catalogue.assignments?.[b.parent]);
  }
  function apply(b, binding, t, assignment) {
    const profile = catalogue.families[binding.variant], sourceColour = t['building:colour'] || t.colour || b.mappedColour;
    if (!b.roofHeight && /^(hipped|gabled|side_hipped)$/.test(b.roofShape)) b.roofHeight = Math.round(Math.min(3.2, (b.h - b.minHeight) * 0.14) * 10) / 10;
    const levels = b.levels || (b.part ? Math.max(1, Math.round((b.h - b.minHeight) / 3.3)) : binding.levels);
    const floorHeight = Math.round(Math.max(2.5, Math.min(4.5, (b.h - b.minHeight - b.roofHeight) / levels)) * 4) / 4;
    b.architectureFamily = 'stalinka';
    b.appearance = { ...profile, ...assignment?.appearance, floorHeight, ...(sourceColour ? { wallColour: sourceColour } : {}) };
    b.colour = b.appearance.wallColour;
    b.colourSource = sourceColour ? 'osm-colour' : assignment?.appearance?.wallColour ? 'reviewed-photograph' : 'procedural-stalinka-palette';
    b.facadeFamily = `stalinka-${binding.variant}`;
    b.facadeConfidence = binding.confidence;
    applied.push(referenceOf(b));
  }
  return { version: 1, bindings: [...bindings.values()], exclusions: [...exclusions.values()], catalogue,
    coverage: { principalReferences: [...bindings.values()].filter((b) => !b.parent).length,
      mappedPartReferences: [...bindings.values()].filter((b) => b.parent).length, renderedOutlines: applied.length,
      excludedEraReferences: exclusions.size },
    note: 'Shared era/use/scale/material estimates, not a verified style census. Unknown and conflicting dates, constructivism, specialist families and ambiguous late mass housing remain excluded. Mapped outlines, heights, holes and roof/spire parts are retained. Colours are mapped, photographed or explicitly estimated; no satellite wall-colour source is connected.' };
}
