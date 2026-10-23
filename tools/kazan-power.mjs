const numbers = (value) => String(value || '').split(/[;,+]/).map(Number).filter((v) => Number.isFinite(v) && v > 0);
const sourceURL = (e) => `https://www.openstreetmap.org/${e.type}/${e.id}`;

/** Power topology shares mapped support identities, independently of road and railway graphs. */
export function compilePower(elements, { toWorld, clipRoad, closedRing, joinMembers }) {
  const originals = new Map(elements.map((e) => [`${e.type}/${e.id}`,e]));
  const supports = [], supportIndex = new Map(), nodes = [], nodeIndex = new Map(), links = [], lines = [], inactive = [];
  const active = [];
  for (const e of elements) {
    const t=e.tags || {}, lifecycle=['demolished','removed','disused','abandoned','construction','proposed'].find((s) => t[`${s}:power`] || t.power===s || t[s]==='yes');
    const notedRemoval=/снесли|демонтирован|demolished|removed/i.test(t.note || '');
    if (lifecycle || notedRemoval || ['power','line'].includes(t.construction)) {
      inactive.push({id:e.id,osmType:e.type,status:lifecycle || (notedRemoval?'removed-note':'construction'),note:t.note || '',source:sourceURL(e)});
    } else active.push(e);
  }
  function node(id, p) {
    if (!nodeIndex.has(id)) {
      nodeIndex.set(id,nodes.length); nodes.push({id,x:p[0],z:p[1]});
    }
    return nodeIndex.get(id);
  }
  function support(e) {
    if (supportIndex.has(e.id)) return supportIndex.get(e.id);
    const t=e.tags,[x,z]=toWorld(e),height=parseFloat(t.height);
    const item={id:e.id,kind:t.power,x,z,ref:t.ref || '',material:t.material || '',structure:t.structure || '',design:t.design || '',
      attachment:t.line_attachment || '',management:t.line_management || '',transition:t['location:transition'] === 'yes',
      height:Number.isFinite(height) && height>0 ? height : null,heightSource:Number.isFinite(height) && height>0 ? 'osm' : 'unknown',
      voltage:numbers(t.voltage),lines:[],source:sourceURL(e)};
    supportIndex.set(e.id,supports.length);supports.push(item);return supports.length-1;
  }
  for (const e of active) if (e.type==='node' && ['tower','pole','portal'].includes(e.tags?.power)) support(e);
  for (const e of active) {
    const t=e.tags || {};
    if (e.type!=='way' || !e.geometry || !['line','minor_line','cable'].includes(t.power)) continue;
    const voltage=numbers(t.voltage),circuits=numbers(t.circuits),cables=numbers(t.cables),underground=t.power==='cable' || ['underground','underwater','submarine','indoor'].includes(t.location);
    for (const piece of clipRoad(e.geometry.map(toWorld),e.nodes,e.id)) {
      const index=lines.length,ids=piece.pts.map((p,i) => node(piece.nodes[i],p));
      const line={id:e.id,kind:t.power,name:t.name || '',ref:t.ref || '',operator:t.operator || '',voltage,
        voltageSource:voltage.length?'osm':'unknown',circuits:circuits.reduce((a,b)=>a+b,0) || null,
        cables:cables.reduce((a,b)=>a+b,0) || null,wires:t.wires || '',frequency:t.frequency || '',location:t.location || '',
        underground,raw:{voltage:t.voltage || '',circuits:t.circuits || '',cables:t.cables || '',wires:t.wires || ''},
        pts:piece.pts.flat(),nodes:ids,source:sourceURL(e)};
      lines.push(line);
      for (const id of ids) {
        const mapped=originals.get(`node/${nodes[id].id}`);
        if (!['tower','pole','portal'].includes(mapped?.tags.power)) continue;
        const s=supportIndex.get(mapped.id);
        if (s===undefined) continue;
        const p=supports[s];nodes[id].support=s;
        if (!p.lines.includes(index)) p.lines.push(index);
        p.voltage=[...new Set([...p.voltage,...voltage])].sort((a,b)=>a-b);
      }
      for (let i=1;i<ids.length;i++) {
        const a=nodes[ids[i-1]],b=nodes[ids[i]],length=Math.hypot(b.x-a.x,b.z-a.z);
        if (length>0) links.push({a:ids[i-1],b:ids[i],line:index,length});
      }
    }
  }
  const substations=[],equipment=[],facilities=[],circuits=[];
  for (const e of active) {
    const t=e.tags || {};
    if (e.type==='relation' && (t.power==='circuit' || t.route==='power')) {
      circuits.push({id:e.id,name:t.name || '',ref:t.ref || '',voltage:numbers(t.voltage),members:e.members.map(({type,ref,role})=>({type,ref,role})),source:sourceURL(e)});
    }
    if (!['substation','transformer','switch','plant','generator'].includes(t.power)) continue;
    const rings=e.type==='way' ? [closedRing(e.geometry)].filter((r)=>r.length>2) :
      e.type==='relation' ? joinMembers(e.members,'outer').map((r)=>closedRing(r)).filter((r)=>r.length>2) : [];
    if (e.type!=='node' && !rings.length) continue;
    const points=rings.flat(),[x,z]=e.type==='node'?toWorld(e):[points.reduce((s,p)=>s+p[0],0)/points.length,points.reduce((s,p)=>s+p[1],0)/points.length];
    const item={id:e.id,osmType:e.type,kind:t.power,name:t.name || '',ref:t.ref || '',substation:t.substation || '',
      voltage:numbers(t.voltage),location:t.location || '',building:t.building || '',operator:t.operator || '',
      x,z,rings:rings.map((r)=>r.flat()),source:sourceURL(e)};
    if (t.power==='substation') substations.push(item);
    else if (['plant','generator'].includes(t.power)) facilities.push(item);
    else equipment.push(item);
  }
  return {lines,supports,substations,equipment,facilities,circuits,inactive,graph:{nodes,links},
    dimensions:'Mapped tags and coordinates retained. Untagged height, conductor arrangement, sag and clearances require explicit procedural estimates. Underground lines retain topology without overhead wires. Railway catenary masts remain in their independent transit system.'};
}
