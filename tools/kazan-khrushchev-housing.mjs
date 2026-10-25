const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;
const projectKey = (s) => s.normalize('NFKC').toUpperCase().replace(/[–—]/g,'-').replace(/\s+/g,'');

function formOf(b) {
  const ring = b.ring;
  let area = 0, best = null;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    area += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
    const dx = ring[i] - ring[j], dz = ring[i + 1] - ring[j + 1], length = Math.hypot(dx,dz);
    if (length < 0.1) continue;
    const ux = dx / length, uz = dz / length;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < ring.length; k += 2) {
      const x = ring[k] * ux + ring[k + 1] * uz, z = -ring[k] * uz + ring[k + 1] * ux;
      x0 = Math.min(x0,x); x1 = Math.max(x1,x); z0 = Math.min(z0,z); z1 = Math.max(z1,z);
    }
    const rectangle = (x1-x0)*(z1-z0);
    if (!best || rectangle < best.rectangle) best = { rectangle, long: Math.max(x1-x0,z1-z0), depth: Math.min(x1-x0,z1-z0) };
  }
  return { ...best, occupancy: Math.abs(area) / 2 / Math.max(best?.rectangle || 0,1) };
}

/** Era, mapped use and compact repeated-slab geometry select an architectural estimate, independent of the bearing-wall material. */
export function compileKhrushchevHousing(elements, buildings, dates, catalogue, materials = { bindings: [] }) {
  const tags = new Map(elements.map((e) => [referenceOf(e), e.tags || {}])), history = new Map(dates.records.map((d) => [d.reference,d]));
  const passports = new Map(materials.bindings.map((b) => [b.reference,b]));
  const bindings = new Map(), exclusions = new Map(), applied = [];
  const principals = new Map(buildings.filter((b) => !b.part).map((b) => [referenceOf(b), b]));
  const projectPatterns = catalogue.projectPatterns.map((s) => new RegExp(s,'i'));
  const projectConstraints = catalogue.passportProjectConstraints.map((r) => ({...r,pattern:new RegExp(r.pattern,'i')}));
  for (const b of buildings) {
    if (b.part || !/^(apartments|residential)$/.test(b.kind)) continue;
    const reference = referenceOf(b), t = tags.get(reference) || {}, d = history.get(reference);
    const source = passports.get(reference), allProjects = [...new Set([t['building:series'],t['design:ref'],...(source?.series || [])].filter(Boolean))];
    const construction = [...(d?.construction || []), ...(source?.constructionYears || []).filter((s) => /^\d{4}$/.test(s)).map((s) => ({ text:s,from:Number(s),to:Number(s),qualifier:'mapped',field:'passport-construction' }))];
    const rejectedProjects = allProjects.filter((s) => s !== t['building:series'] && s !== t['design:ref'] && projectConstraints.some((r) => r.pattern.test(projectKey(s)) && construction.length && construction.every((e) => Number.isFinite(e.to) && e.to < r.from)));
    const projects = allProjects.filter((s) => !rejectedProjects.includes(s) && !/^(неопредел|не выбран|не указан|индивид|н\/д|[-?]+$)/i.test(s));
    const series = projects.length === 1 ? projects[0] : '', earlySeries = projects.length && projects.every((s) => projectPatterns.some((p) => p.test(projectKey(s))));
    const era = construction.filter((e) => e.qualifier === 'mapped' && e.from >= catalogue.period.from && e.to <= catalogue.period.to);
    const dateConflict = d?.conflict || construction.length > 1 && Math.max(...construction.map((e) => e.from ?? -Infinity)) > Math.min(...construction.map((e) => e.to ?? Infinity));
    if (!earlySeries && !construction.some((e) => e.from <= catalogue.period.to && e.to >= catalogue.period.from)) continue;
    let reason;
    const form = formOf(b), levels = b.levels;
    const roofRise = b.roofHeight || (!Object.hasOwn(t,'roof:height') && /^(hipped|gabled|side_hipped)$/.test(b.roofShape) ? Math.min(3.2,(b.h-b.minHeight)*0.14) : 0);
    const storey = levels ? (b.h - b.minHeight - roofRise) / levels : 0;
    if (b.model || b.construction || b.facadeCohort || b.stalinkaSections || b.architectureFamily && b.architectureFamily !== 'panel-housing' || b.facadeConfidence === 'reviewed') reason = 'existing-reviewed-or-specialist-owner';
    else if (t.amenity || t.leisure || t.religion || t.historic || t.heritage || d?.architecture && !/^(modernism|functionalism|soviet_modernism)$/.test(d.architecture)) reason = 'different-use-or-recorded-architecture';
    else if (d?.conflict || (dateConflict && era.length !== construction.length) || !earlySeries && (!era.length || construction.some((e) => e.qualifier !== 'mapped' || !Number.isFinite(e.from) || !Number.isFinite(e.to)))) reason = 'missing-uncertain-or-conflicting-era';
    else if (earlySeries && construction.length && !era.length) reason = 'series-and-construction-period-conflict';
    else if (!earlySeries && era.some((e) => e.from < 1960)) reason = 'transition-period-needs-project-evidence';
    else if (projects.length && !earlySeries) reason = 'different-or-conflicting-recorded-project';
    else if (!levels || levels < 3 || levels > 5 || storey < 2.4 || storey > 3.4 || b.minHeight) reason = 'not-the-compact-lowrise-storey-proportions';
    else if (b.holes.length || form.long < 24 || form.long > 150 || form.depth < 8 || form.depth > 16 || form.long / form.depth < 2 || form.occupancy < 0.84) reason = 'courtyard-tower-or-irregular-plan';
    else if (!/^(flat|hipped|gabled|side_hipped)$/.test(b.roofShape) || b.roofHeight > 3.4) reason = 'different-roof-envelope';
    else if (/wood|timber|metal|glass|mirror/.test(b.material)) reason = 'different-visible-envelope';
    if (reason) { exclusions.set(reference,{ reference,reason }); continue; }
    const variant = b.architectureFamily === 'panel-housing' || /panel/.test(b.material) ? 'panel' : /brick/.test(b.material) ? 'brick' : 'painted';
    const binding = { reference, variant, levels, dateReference: d ? reference : null, dateText: construction.map((e) => e.text), conflictingDates:!!dateConflict, series: series || null, seriesCandidates: allProjects, rejectedProjectEvidence:rejectedProjects, sourceIds:source?.sourceIds || [],
      confidence: earlySeries ? 'recorded-series-and-compact-plan' : 'era-use-footprint-proportion-estimate',
      structuralFamily: b.architectureFamily || null, form: { long: Math.round(form.long*10)/10, depth: Math.round(form.depth*10)/10, occupancy: Math.round(form.occupancy*1000)/1000 },
      finishEvidence: t['building:colour'] || t.colour ? 'mapped-colour-with-estimated-layout' : 'beauty-biased-local-palette-estimate' };
    bindings.set(reference,binding); apply(b,binding);
  }
  for (const b of buildings) {
    const parent = bindings.get(b.parent);
    if (!b.part || !parent || b.model || b.construction || b.facadeConfidence === 'reviewed' || !/^(yes|apartments|residential)$/.test(b.kind) || /wood|timber|metal|glass|mirror/.test(b.material) || b.h-b.minHeight < 3.5 || b.levels > 5) continue;
    const d = history.get(referenceOf(b));
    if (d?.conflict || d?.construction.some((e) => !Number.isFinite(e.from) || e.from < catalogue.period.from || e.to > catalogue.period.to)) continue;
    const binding = { ...parent, reference: referenceOf(b), parent: b.parent, role: 'mapped-residential-section' };
    bindings.set(binding.reference,binding); apply(b,binding,principals.get(b.parent).appearance);
  }
  function apply(b,binding,inherited) {
    const t = tags.get(referenceOf(b)) || {}, old = b.appearance || {}, mapped = t['building:colour'] || t.colour;
    if (!b.roofHeight && !Object.hasOwn(t,'roof:height') && /^(hipped|gabled|side_hipped)$/.test(b.roofShape)) b.roofHeight = Math.round(Math.min(3.2,(b.h-b.minHeight)*0.14)*10)/10;
    const levels = b.levels || binding.levels, height = b.h-b.minHeight-b.roofHeight;
    const palette = catalogue.palettes[Math.abs(Math.imul(Math.floor(b.id/11),2654435761)) % catalogue.palettes.length];
    const paint = inherited || (binding.variant === 'panel' ? old : palette);
    const colours = Object.fromEntries(Object.entries(paint).filter(([k]) => /Colour$/.test(k)));
    b.housingArchetype = 'khrushchev'; b.architectureFamily ||= 'khrushchev-housing';
    b.appearance = { ...catalogue.families[binding.variant], ...colours,
      floorHeight: Math.round(Math.max(2.4,Math.min(3.4,height/levels))*4)/4,
      ...(mapped ? { wallColour:mapped } : {}), facadeEnds:true, panelEndThreshold:18, panelCrownHeight:0.55 };
    if (binding.variant === 'brick') b.appearance.masonry = 'brick';
    b.facadeFamily = `khrushchev-${binding.variant}`; b.facadeConfidence = binding.confidence;
    b.colour = b.appearance.wallColour; b.colourSource = binding.finishEvidence;
    applied.push(referenceOf(b));
  }
  return { version:1, catalogue, bindings:[...bindings.values()], exclusions:[...exclusions.values()],
    coverage:{ principalReferences:[...bindings.values()].filter((b) => !b.parent).length, mappedPartReferences:[...bindings.values()].filter((b) => b.parent).length, renderedOutlines:applied.length, exclusions:exclusions.size },
    note:'Shared compact first-generation housing archetype estimates, not a verified series census. Material/structure remains separate: a source-confirmed panel house retains its panel construction owner. Known dates, unparsed evidence, earlier architectural owners and ambiguous large/courtyard/later projects remain explicit. Source footprints, total heights, levels, openings and parts are retained; unknown present-day finishes use clean attractive local palettes.' };
}
