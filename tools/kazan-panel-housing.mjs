const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;

function footprint(b) {
  let area = 0, perimeter = 0, longest = 0;
  for (const ring of [b.ring, ...b.holes]) {
    let signed = 0;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const length = Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1]);
      signed += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
      perimeter += length; longest = Math.max(longest, length);
    }
    area += Math.abs(signed) / 2 * (ring === b.ring ? 1 : -1);
  }
  return { area, meanDepth: 2 * area / Math.max(perimeter, 1), longest };
}

/** Explicit structural evidence selects the inventory; footprint/storeys parameterise one family without asserting current renovation or a floor/year cutoff. */
export function compilePanelHousing(elements, buildings, dates, materials, catalogue) {
  const raw = new Map(elements.map((e) => [referenceOf(e), e.tags || {}])), evidence = new Map(materials.bindings.map((r) => [r.reference, r]));
  const history = new Map(dates.records.map((r) => [r.reference, r])), bindings = new Map(), exclusions = [], applied = [];
  const principals = new Map(buildings.filter((b) => !b.part).map((b) => [referenceOf(b), b]));
  for (const b of buildings) {
    if (b.part || !/^(apartments|residential|dormitory)$/.test(b.kind) && !(b.kind === 'yes' && evidence.has(referenceOf(b)))) continue;
    const reference = referenceOf(b), t = raw.get(reference) || {}, source = evidence.get(reference);
    const mappedPanel = /panel/.test(b.material), levels = b.levels || Math.round((b.h - b.minHeight) / 3);
    const series = [...new Set([t['building:series'], t['design:ref'], ...(source?.series || [])].filter(Boolean))];
    const projectPanel = series.length && series.every((s) => /^(?:111[-–])?(?:121|125|90|97)(?:[-–./\s]|$)|^(?:[I1][-–])?464[дДdD](?:[-–./\s]|$)/.test(s.trim()));
    const sourcePanel = source?.materialCategory === 'panel-bearing' || projectPanel && !source?.materialCategories?.includes('brick-bearing');
    if (!sourcePanel && !mappedPanel) continue;
    const date = history.get(reference), form = footprint(b);
    let reason;
    if (source?.materialConflict) reason = 'conflicting-structural-sources';
    else if (b.model || b.construction || b.architectureFamily || b.facadeCohort || /^(school|kindergarten|worship|sports)-/.test(b.facadeFamily || '')) reason = 'existing-specialist-or-project-owner';
    else if (/brick|wood|timber|glass|mirror|metal/.test(b.material)) reason = 'different-visible-material-or-source-conflict';
    else if (t.amenity || t.leisure || t.religion) reason = 'different-mapped-use';
    else if (b.h - b.minHeight < 3.5 || b.h - b.minHeight > 100 || form.area < 50 || form.area > 12000) reason = 'incompatible-vertical-scale-or-footprint';
    else if (/dome|onion|round|pyramidal/.test(b.roofShape)) reason = 'different-roof-silhouette';
    else if (b.facadeConfidence === 'reviewed' && !/^panel-/.test(b.facadeFamily || '') && b.appearance?.joints !== 'panels') reason = 'different-reviewed-facade';
    if (reason) { exclusions.push({ reference, reason, sourceIds: source?.sourceIds || [] }); continue; }
    const variant = form.longest >= form.meanDepth * 2.8 ? 'slab' : 'tower';
    const binding = { reference, variant, sourceIds: source?.sourceIds || [], levels, dateReference: date ? reference : null,
      dateText: date?.construction.map((d) => d.text), confidence: sourcePanel ? source?.materialCategory === 'panel-bearing' ? 'catalogue-structure-and-layout' : 'passport-project-and-layout' : 'mapped-panel-material-and-layout',
      colourEvidence: b.facadeConfidence === 'reviewed' ? 'retained-reviewed-paint' : t['building:colour'] || t.colour ? 'mapped-colour' : 'post-2020-district-palette-estimate',
      series: series.length === 1 ? series[0] : null, seriesCandidates: series, seriesSource: series.length ? t['building:series'] || t['design:ref'] ? 'osm-tag-and-passport-evidence' : 'passport-evidence' : null,
      dateStatus: date?.conflict ? 'conflicting' : !date?.construction.length ? 'unknown' : 'mapped-construction-evidence' };
    binding.finishEvidence = 'beauty-biased-painted-estimate';
    bindings.set(reference, binding); apply(b, binding);
  }
  for (const b of buildings) {
    const parent = bindings.get(b.parent);
    if (!b.part || !parent || b.model || b.construction || b.facadeConfidence === 'reviewed' || /brick|wood|glass|mirror|metal/.test(b.material) || b.h - b.minHeight < 3.5 || !/^(yes|apartments|residential|dormitory)$/.test(b.kind)) continue;
    const binding = { ...parent, reference: referenceOf(b), parent: b.parent, role: 'mapped-residential-section' };
    bindings.set(binding.reference, binding); apply(b, binding, principals.get(b.parent).appearance);
  }
  function apply(b, binding, inherited) {
    const t = raw.get(referenceOf(b)) || {}, mapped = t['building:colour'] || t.colour;
    const observed = b.facadeConfidence === 'reviewed' ? b.appearance : null;
    if (!b.roofHeight && !Object.hasOwn(t, 'roof:height') && /^(hipped|gabled|side_hipped)$/.test(b.roofShape)) {
      b.roofHeight = Math.round(Math.min(3.2, (b.h - b.minHeight) * 0.14) * 10) / 10;
    }
    const height = b.h - b.minHeight - b.roofHeight, levels = b.levels || Math.max(1, Math.round(height / 3));
    const xs = b.ring.filter((_, i) => i % 2 === 0), zs = b.ring.filter((_, i) => i % 2 === 1);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const paletteIndex = Math.abs(Math.imul(Math.floor(cx / 450), 73856093) ^ Math.imul(Math.floor(cz / 450), 19349663) ^ Math.floor(b.id / 7)) % catalogue.palettes.length;
    const palette = catalogue.palettes[paletteIndex];
    binding.palette = inherited ? 'inherited-parent-finish' : observed ? 'retained-observed-paint' : mapped ? 'mapped-wall-colour-with-estimated-accents' : palette.name;
    b.appearance = { ...catalogue.families[binding.variant], ...palette, ...observed, ...inherited,
      floorHeight: Math.round(Math.max(2.5, Math.min(3.5, height / levels)) * 4) / 4,
      panelHousing: true, panelEndThreshold: binding.variant === 'slab' ? 16 : 0,
      ...(mapped ? { wallColour: mapped } : {}) };
    b.architectureFamily = 'panel-housing'; b.facadeFamily = `panel-housing-${binding.variant}`;
    b.facadeConfidence = binding.confidence; b.colourSource = binding.colourEvidence; b.colour = b.appearance.wallColour;
    applied.push(referenceOf(b));
  }
  return { version: 1, bindings: [...bindings.values()], exclusions,
    source: { materials: materials.source, dateExtract: dates.source.extract }, catalogue,
    coverage: { principalReferences: [...bindings.values()].filter((b) => !b.parent).length,
      mappedPartReferences: [...bindings.values()].filter((b) => b.parent).length, renderedOutlines: applied.length, exclusions: exclusions.length },
    note: 'Shared structural-evidence/layout family with no floor/year selection threshold, not an asserted construction-series census. Bearing panels do not establish visible cladding or measured facade colours. Source outlines, heights, openings, ownership and reviewed paint remain intact; unknown/unmatched/ambiguous source records remain explicit.' };
}
