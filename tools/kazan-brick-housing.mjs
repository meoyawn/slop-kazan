const referenceOf = (b) => `${b.osmType || b.type}/${b.id}`;

function planTurns(ring) {
  let turns=0;
  for(let i=0;i<ring.length;i+=2){
    const p=(i+ring.length-2)%ring.length,n=(i+2)%ring.length;
    const ax=ring[i]-ring[p],az=ring[i+1]-ring[p+1],bx=ring[n]-ring[i],bz=ring[n+1]-ring[i+1];
    const a=Math.hypot(ax,az),b=Math.hypot(bx,bz);
    if(a>0.8&&b>0.8&&Math.abs(ax*bz-az*bx)/(a*b)>0.17)turns++;
  }
  return turns;
}

/** Rule order is data-owned: later periods can add a facade variant without changing source joins or rendering code. */
export function compileBrickHousing(elements, buildings, dates, materials, catalogue) {
  const tags = new Map(elements.map((e) => [referenceOf(e),e.tags || {}]));
  const history = new Map(dates.records.map((d) => [d.reference,d])), evidence = new Map(materials.bindings.map((b) => [b.reference,b]));
  const bindings = new Map(), exclusions = [], applied = [];
  const principals = new Map(buildings.filter((b) => !b.part).map((b) => [referenceOf(b),b]));
  for (const b of buildings) {
    if (b.part || !/^(apartments|residential|dormitory)$/.test(b.kind)) continue;
    const reference = referenceOf(b), t = tags.get(reference) || {}, source = evidence.get(reference), d = history.get(reference);
    if (!/brick/.test(b.material) && source?.materialCategory !== 'brick-bearing') continue;
    if (b.architectureFamily || b.model || b.construction || t.amenity || t.leisure || t.religion) continue;
    const construction = [...(d?.construction || []), ...(source?.constructionYears || []).filter((s) => /^\d{4}$/.test(s)).map((s) => ({ from:Number(s),to:Number(s),qualifier:'mapped' }))];
    const definite = construction.filter((e) => e.qualifier === 'mapped' && Number.isFinite(e.from) && Number.isFinite(e.to));
    const conflict = !!d?.conflict || definite.length > 1 && Math.max(...definite.map((e) => e.from)) > Math.min(...definite.map((e) => e.to));
    const year = !conflict && definite.length ? Math.max(...definite.map((e) => e.from)) : null;
    const rule = (!d?.conflict && definite.length ? catalogue.rules.find((r) => definite.every((e) => e.from >= r.from && e.to <= r.to)) : null) || catalogue.rules.find((r) => r.unknown);
    const turns=planTurns(b.ring),formVariant=rule.variants?.find((v)=>turns>=v.minimumTurns && (!v.unmappedEnvelope || !b.material));
    const binding = { reference, rule:rule.id, variant:formVariant?.style || rule.style, year, conflictingDates:conflict,
      envelopeLayout:formVariant ? 'compound-plan-visual-estimate' : 'period-visual-estimate',planTurns:turns,
      dateRange:definite.length ? [Math.min(...definite.map((e) => e.from)),Math.max(...definite.map((e) => e.to))] : null,
      confidence:source?.materialCategory === 'brick-bearing' ? 'passport-brick-and-mapped-envelope' : 'mapped-brick-envelope',
      sourceIds:source?.sourceIds || [], seriesCandidates:source?.series || [],
      finishEvidence:t['building:colour'] || t.colour ? 'mapped-colour' : 'beauty-biased-period-palette-estimate' };
    bindings.set(reference,binding);
    if (source?.materialConflict) { binding.status='structural-source-conflict'; exclusions.push({reference,reason:binding.status}); continue; }
    if (b.facadeConfidence === 'reviewed' || b.facadeCohort || rule.preserve || t.historic || t.heritage || d?.architecture && !/^(modernism|functionalism|soviet_modernism)$/.test(d.architecture)) {
      binding.status='retained-reviewed-or-historical-envelope'; continue;
    }
    apply(b,binding);
  }
  for (const b of buildings) {
    const parent = bindings.get(b.parent);
    if (!b.part || !parent || parent.status !== 'generated' || b.architectureFamily || b.model || b.construction || b.facadeConfidence === 'reviewed' || /wood|glass|mirror|metal|panel/.test(b.material) || b.h-b.minHeight < 3.5 || !/^(yes|apartments|residential|dormitory)$/.test(b.kind)) continue;
    const binding = {...parent,reference:referenceOf(b),parent:b.parent,role:'mapped-residential-section'};
    bindings.set(binding.reference,binding); apply(b,binding,principals.get(b.parent).appearance);
  }
  function apply(b,binding,inherited) {
    const t = tags.get(referenceOf(b)) || {}, style = catalogue.families[binding.variant];
    const palette = style.palettes[Math.abs(Math.imul(Math.floor(b.id/7),2654435761)) % style.palettes.length];
    const mapped = t['building:colour'] || t.colour;
    if (!b.roofHeight && !Object.hasOwn(t,'roof:height') && /^(hipped|gabled|side_hipped)$/.test(b.roofShape)) b.roofHeight = Math.round(Math.min(3.2,(b.h-b.minHeight)*0.14)*10)/10;
    const wallHeight = b.h-b.minHeight-b.roofHeight, levels = b.levels || Math.max(1,Math.round(wallHeight/3));
    const {palettes,...appearance} = style;
    b.appearance = {...appearance,...palette,...inherited,floorHeight:Math.round(Math.max(2.5,Math.min(3.5,wallHeight/levels))*4)/4,
      facadeEnds:true,...(mapped ? {wallColour:mapped} : {})};
    if (b.material && !/brick/.test(b.material)) delete b.appearance.masonry;
    binding.claddingEvidence=/brick/.test(b.material) ? 'mapped-brick-envelope' : b.material ? 'mapped-nonbrick-envelope' : 'period-envelope-estimate-not-bearing-material-fact';
    b.architectureFamily='brick-housing'; b.facadeFamily=binding.variant; b.facadeConfidence=binding.confidence;
    b.colour=b.appearance.wallColour; b.colourSource=binding.finishEvidence;
    binding.status='generated'; binding.palette=inherited ? 'inherited-parent-finish' : palette.name;
    applied.push(referenceOf(b));
  }
  return {version:1,catalogue,bindings:[...bindings.values()],exclusions,
    coverage:{principalReferences:[...bindings.values()].filter((b) => !b.parent).length,mappedPartReferences:[...bindings.values()].filter((b) => b.parent).length,renderedOutlines:applied.length},
    note:'Brick bearing structure or mapped brick envelope is independent of architectural era. Ordered shared period rules select lightweight facade variants, with clean estimated colours when paint is unmeasured. Reviewed multicolour facades and historical envelopes remain intact. Construction/commissioning and source conflicts are not silently resolved; no address-specific rendering rules.'};
}
