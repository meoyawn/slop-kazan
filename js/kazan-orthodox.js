import * as THREE from 'three/webgpu';
import { GEO } from './kazan-runtime.js';
import { toPoints, pointInPoly, boundsOf, terrainHeight } from './kazan-config.js';

const keyOf=(b)=>`${b.osmType}/${b.id}`;

/** Cross-domed massing: lower corner cells, four vaults, a broad naos, drum and head. */
export function createKazanOrthodox(draw,bindings) {
  const {box,solid,emit,shapeOf,splitExtrusion,plainMaterial,buildingRoof}=draw;
  const parts=new Map(),cache=new Map();
  for(const b of GEO.buildings)if(b.part){if(!parts.has(b.parent))parts.set(b.parent,[]);parts.get(b.parent).push(b);}
  const gold=plainMaterial(0xc2a151,0.55),glass=plainMaterial(0x33464b,0.15);
  function tint(value,fallback){return value && (/^#[0-9a-f]{3,6}$/i.test(value)||value.toLowerCase() in THREE.Color.NAMES) ? new THREE.Color(value).getHex() : fallback;}
  function materials(b,binding){
    const s=binding.style || {};
    const photographed=binding.styleSource==='photographic-family-sample';
    const wall=photographed&&s.wallColour?s.wallColour:b.colour||s.wallColour;
    const roof=photographed&&s.roofColour?s.roofColour:b.roofColour||s.roofColour;
    let head=tint(b.roofColour||s.domeColour,0xc2a151),c=new THREE.Color(head);
    if(c.r>0.7&&c.g>0.55&&c.b<0.16)head=0xc2a151;
    return {wall:plainMaterial(tint(wall,0xe5dfcc)),trim:plainMaterial(tint(s.trimColour,0xf0ede2)),
      roof:plainMaterial(/^(onion|dome)$/.test(b.roofShape)?head:tint(roof,0x7f986e),0.2),head:plainMaterial(head,0.35)};
  }
  function faces(b){
    const p=toPoints(b.ring),result=[];
    for(let i=0;i<p.length;i++){
      const a=p[i],c=p[(i+1)%p.length],length=Math.hypot(c.x-a.x,c.z-a.z);if(length<0.2)continue;
      const ux=(c.x-a.x)/length,uz=(c.z-a.z)/length,x=(a.x+c.x)/2,z=(a.z+c.z)/2;
      let nx=-uz,nz=ux;if(pointInPoly(p,x+nx*0.05,z+nz*0.05)){nx=-nx;nz=-nz;}
      result.push({x,z,ux,uz,nx,nz,length,yaw:-Math.atan2(uz,ux)});
    }
    return result;
  }
  function pointInside(b,x,z){return pointInPoly(toPoints(b.ring),x,z)&&!b.holes.some(r=>pointInPoly(toPoints(r),x,z));}
  function clearance(b,x,z){
    if(!pointInside(b,x,z))return 0;
    let d=Infinity;
    for(const ring of [b.ring,...b.holes])for(let i=0,j=ring.length-2;i<ring.length;j=i,i+=2){
      const dx=ring[i]-ring[j],dz=ring[i+1]-ring[j+1],t=Math.max(0,Math.min(1,((x-ring[j])*dx+(z-ring[j+1])*dz)/(dx*dx+dz*dz||1)));
      d=Math.min(d,Math.hypot(x-ring[j]-dx*t,z-ring[j+1]-dz*t));
    }
    return d;
  }
  function core(b){
    const bounds=boundsOf(toPoints(b.ring)),candidates=[];
    for(let i=1;i<10;i++)for(let j=1;j<10;j++)candidates.push({x:bounds.minX+(bounds.maxX-bounds.minX)*i/10,z:bounds.minZ+(bounds.maxZ-bounds.minZ)*j/10});
    const geometry=new THREE.ShapeGeometry(shapeOf(b.ring,b.holes)),p=geometry.attributes.position,index=geometry.index;
    for(let i=0;i<(index?.count||p.count);i+=3){let x=0,z=0;for(let j=0;j<3;j++){const n=index?index.getX(i+j):i+j;x+=p.getX(n);z-=p.getY(n);}candidates.push({x:x/3,z:z/3});}
    geometry.dispose();
    let best=null;
    for(const p of candidates){const r=clearance(b,p.x,p.z);if(r>0.5&&(!best||r>best.r))best={...p,r};}
    return best;
  }
  function arch(group,f,u,y,width,height,material,offset=0.06){
    if(height<=0||width<=0)return;
    const r=Math.min(width/2,height),s=new THREE.Shape();s.moveTo(-width/2,0);s.lineTo(width/2,0);s.lineTo(width/2,height-r);s.absarc(0,height-r,r,0,Math.PI);s.closePath();
    const g=new THREE.ShapeGeometry(s,8);g.rotateY(Math.atan2(f.nx,f.nz));solid(group,g,material,f.x+f.ux*u+f.nx*offset,y,f.z+f.uz*u+f.nz*offset);
  }
  function panel(group,f,u,y,width,height,material,depth=0.12,offset=0.06){box(group,f.x+f.ux*u+f.nx*offset,y,f.z+f.uz*u+f.nz*offset,width,height,depth,material,f.yaw??-Math.atan2(f.uz,f.ux));}
  function sash(group,f,u,y,width,height,m){
    panel(group,f,u,y+height/2,width+0.20,height+0.20,m.trim,0.14,0.09);
    panel(group,f,u,y+height/2,width,height,glass,0.05,0.18);
    panel(group,f,u,y+height/2,0.055,height,m.trim,0.04,0.22);
    for(const h of [1/3,2/3])panel(group,f,u,y+height*h,width,0.055,m.trim,0.04,0.22);
    panel(group,f,u,y-0.10,width+0.32,0.12,m.trim,0.25,0.15);
  }
  function cross(group,p,y,height){
    box(group,p.x,y+height/2,p.z,0.075,height,0.075,gold);
    box(group,p.x,y+height*0.65,p.z,height*0.60,0.07,0.07,gold);
    box(group,p.x,y+height*0.88,p.z,height*0.31,0.06,0.06,gold);
    solid(group,new THREE.BoxGeometry(height*0.43,0.06,0.06).rotateZ(-0.22),gold,p.x,y+height*0.28,p.z);
  }
  function head(group,p,y,radius,height,m){
    const profile=[[0.40,0],[0.40,0.09],[0.57,0.20],[0.82,0.32],[0.98,0.44],[1,0.52],[0.91,0.64],[0.68,0.79],[0.36,0.92],[0.08,0.995],[0,1.02]];
    solid(group,new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r*radius,h*height)),16),m.head,p.x,y,p.z);
  }
  function drum(group,p,y,radius,height,m){
    solid(group,new THREE.CylinderGeometry(radius,radius,height,12),m.wall,p.x,y+height/2,p.z);
    for(const h of [0.1,height-0.1])solid(group,new THREE.CylinderGeometry(radius*1.08,radius*1.08,0.18,12),m.trim,p.x,y+h,p.z);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,nx=Math.sin(a),nz=Math.cos(a),f={x:p.x+nx*radius,z:p.z+nz*radius,nx,nz,ux:nz,uz:-nx};
      const w=Math.min(1.1,radius*0.45),h=height*0.69;
      arch(group,f,0,y+height*0.13-0.05,w+0.16,h+0.12,m.trim,0.03);arch(group,f,0,y+height*0.13,w,h,glass,0.06);
      panel(group,f,0,y+height*0.13+h*0.46,0.045,h*0.92,m.trim,0.04,0.095);panel(group,f,0,y+height*0.13+h*0.43,w,0.045,m.trim,0.04,0.095);
    }
  }
  function body(group,b,base,top,m,roofHeight=0,components=[]){
    function visible(f,u,y,width,height){
      for(const other of components){
        if(other.ring===b.ring)continue;
        const higher=other.h>b.h+0.01 || Math.abs(other.h-b.h)<0.01 && keyOf(other)>keyOf(b);
        for(const du of [-width*0.45,0,width*0.45])for(const dy of [-height*0.45,0,height*0.45]){
          const level=y+dy;
          if(level<(other.minHeight||0)+0.01 || level>other.h-(other.roofHeight||0)-0.01)continue;
          const x=f.x+f.ux*(u+du),z=f.z+f.uz*(u+du);
          if(pointInside(other,x+f.nx*0.3,z+f.nz*0.3) || higher && pointInside(other,x-f.nx*0.03,z-f.nz*0.03))return false;
        }
      }
      return true;
    }
    const low=b.minHeight||0,g=new THREE.ExtrudeGeometry(shapeOf(b.ring,b.holes),{depth:Math.max(0.1,top-low),bevelEnabled:false});
    g.rotateX(-Math.PI/2).translate(0,base+low,0);splitExtrusion(group,g,m.roof,m.wall,base);
    let windows=40,pilasters=16;
    for(const f of faces(b)){
      if(!low){const ground=Math.min(terrainHeight(f.x,f.z),terrainHeight(f.x+f.ux*f.length/2,f.z+f.uz*f.length/2));if(ground<base)panel(group,f,0,(ground+base)/2,f.length,base-ground,m.wall,0.2,0);}
      if(visible(f,0,top-0.12,f.length,0.22))panel(group,f,0,base+top-0.12,f.length,0.22,m.trim,0.24);
      if(f.length<2.3||top-low<2.2)continue;
      if(pilasters>0)for(const u of [-f.length/2+0.2,f.length/2-0.2]){if(visible(f,u,(top+low)/2,0.25,top-low))panel(group,f,u,base+(top+low)/2,0.25,top-low,m.trim,0.18);pilasters--;}
      const bays=Math.min(6,Math.max(1,Math.floor(f.length/3.8))),rows=Math.min(2,Math.max(1,Math.floor((top-low)/5)));
      for(let row=0;row<rows;row++)for(let i=0;i<bays&&windows>0;i++,windows--){
        const u=((i+0.5)/bays-0.5)*f.length,h=Math.min(4.5,(top-low)/rows*0.62),w=Math.min(1.6,f.length/bays*0.44,h*0.6),y=base+low+(row+0.16)*(top-low)/rows;
        if(visible(f,u,y-base+h/2,w,h))sash(group,f,u,y,w,h,m);
      }
    }
    if(windows===40 && b.ring.length>16 && top-low>2.2){
      const c=core(b);
      if(c)for(let i=0;i<8;i++){
        const a=i*Math.PI/4,nx=Math.sin(a),nz=Math.cos(a);let distance=c.r;
        while(distance<100&&pointInside(b,c.x+nx*(distance+0.2),c.z+nz*(distance+0.2)))distance+=0.2;
        const f={x:c.x+nx*distance,z:c.z+nz*distance,nx,nz,ux:nz,uz:-nx},h=Math.min(4.5,(top-low)*0.5),w=Math.min(1.5,c.r*0.6),y=base+top-h-0.25;
        if(visible(f,0,y-base+h/2,w,h))sash(group,f,0,y,w,h,m);
      }
    }
    if(roofHeight){
      if(['hipped','gabled','pyramidal'].includes(b.roofShape)){
        const f=faces(b).reduce((a,c)=>c.length>a.length?c:a),p=toPoints(b.ring),us=p.map(p=>p.x*f.ux+p.z*f.uz),vs=p.map(p=>-p.x*f.uz+p.z*f.ux);
        draw.planarRoof(group,b,base,{roofAxis:{ux:f.ux,uz:f.uz,u0:Math.min(...us),u1:Math.max(...us),v0:Math.min(...vs),v1:Math.max(...vs)},total:b.h,rise:roofHeight,roof:m.roof,wall:m.wall});
      }else buildingRoof(group,b,base,boundsOf(toPoints(b.ring)),roofHeight,/^(onion|dome)$/.test(b.roofShape)?m.head:m.roof);
    }
  }
  function rect(l,u0,u1,v0,v1){return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].flatMap(([u,v])=>[l.c.x+l.ux*u-l.uz*v,l.c.z+l.uz*u+l.ux*v]);}
  function fits(b,ring){
    for(let i=0;i<ring.length;i+=2){const j=(i+2)%ring.length;
      for(const t of [0,0.25,0.5,0.75])if(!pointInside(b,ring[i]+(ring[j]-ring[i])*t,ring[i+1]+(ring[j+1]-ring[i+1])*t))return false;
    }
    const poly=toPoints(ring);
    for(const hole of b.holes)if(toPoints(hole).some(p=>pointInPoly(poly,p.x,p.z)))return false;
    function side(ax,az,bx,bz,x,z){return(bx-ax)*(z-az)-(bz-az)*(x-ax);}
    for(const source of [b.ring,...b.holes])for(let i=0,j=source.length-2;i<source.length;j=i,i+=2)for(let k=0,n=ring.length-2;k<ring.length;n=k,k+=2){
      if(side(source[j],source[j+1],source[i],source[i+1],ring[n],ring[n+1])*side(source[j],source[j+1],source[i],source[i+1],ring[k],ring[k+1])< -1e-8 &&
        side(ring[n],ring[n+1],ring[k],ring[k+1],source[j],source[j+1])*side(ring[n],ring[n+1],ring[k],ring[k+1],source[i],source[i+1])< -1e-8)return false;
    }
    return true;
  }
  function layout(b){
    if(cache.has(b))return cache.get(b);
    const binding=bindings.get(keyOf(b));if(!binding||binding.family!=='orthodox'||b.model||binding.parent)return null;
    const mapped=parts.get(keyOf(b))||[],c=core(b),m=materials(b,binding),l={b,binding,m,mapped,c,shapes:[]};
    const composed=mapped.some(p=>/^(onion|dome)$/.test(p.roofShape));
    if(!c||binding.role==='bell-tower'||composed){l.kind=binding.role==='bell-tower'?'bell-tower':'mapped';}
    else{
      l.kind='cross-in-square';const axis=binding.altarAxis||{x:1,z:0},length=Math.hypot(axis.x,axis.z)||1;l.ux=axis.x/length;l.uz=axis.z/length;
      const q=c.r*0.63,arm=q*0.66,metric=['osm-height','published-height','reviewed-estimate'].includes(b.heightSource);
      l.q=q;l.arm=arm;l.lower=metric?b.h*0.38:b.h;
      l.naos=metric?b.h*0.66:l.lower+Math.max(3,Math.min(14,q*1.25));
      l.drumRadius=q*0.68;l.drumHeight=metric?b.h*0.12:q*0.55;
      l.headHeight=metric?b.h*0.16:l.drumRadius*2.20;
      if(metric)l.drumRadius=Math.min(l.drumRadius,l.headHeight/2.2);
      l.crossHeight=metric?b.h*0.06:Math.max(0.85,l.drumRadius*0.42);
      l.top=l.naos+l.drumHeight+l.headHeight+l.crossHeight;
      l.arms=[];
      for(const [u,v]of [[1,0],[-1,0],[0,1],[0,-1]]){
        let reach=q;
        for(let d=q+0.5;d<=q*2.05;d+=0.5){const r=u?rect(l,Math.min(0,u*d),Math.max(0,u*d),-arm,arm):rect(l,-arm,arm,Math.min(0,v*d),Math.max(0,v*d));if(!fits(b,r))break;reach=d;}
        if(reach>q+0.2)l.arms.push({u,v,reach,ring:u?rect(l,Math.min(u*q,u*reach),Math.max(u*q,u*reach),-arm,arm):rect(l,-arm,arm,Math.min(v*q,v*reach),Math.max(v*q,v*reach))});
      }
      l.shapes.push({...b,h:l.lower},{...b,ring:rect(l,-q,q,-q,q),holes:[],minHeight:l.lower,h:l.naos});
      for(const a of l.arms)l.shapes.push({...b,ring:a.ring,holes:[],minHeight:l.lower,h:l.naos});
      const ring=Array.from({length:12},(_,i)=>[c.x+Math.cos(i*Math.PI/6)*l.drumRadius,c.z+Math.sin(i*Math.PI/6)*l.drumRadius]).flat();
      l.shapes.push({...b,ring: ring.map((v,i)=>i%2?l.c.z+(v-l.c.z)*1.12:l.c.x+(v-l.c.x)*1.12),holes:[],minHeight:l.naos,h:l.top,orthodoxRole:'central-dome'});
    }
    l.bells=[];
    for(const p of GEO.worship.points||[]){
      if(p.owner!==keyOf(b)||p.kind!=='bell_tower'||p.status!=='mapped-tower-point')continue;
      if(mapped.some(part=>pointInside(part,p.x,p.z)&&part.h>b.h+2))continue;
      const r=clearance(b,p.x,p.z)*0.65;if(r<0.5)continue;
      const measured=/^\d+(?:\.\d+)?\s*m?$/.test(p.height||'')?parseFloat(p.height):0;
      l.bells.push({x:p.x,z:p.z,r:Math.min(2.5,r),h:measured||Math.max(b.h+5,Math.min(35,b.h*2.1))});
    }
    cache.set(b,l);return l;
  }
  function vault(group,l,a,base){
    const axis=a.u?{x:l.ux*a.u,z:l.uz*a.u}:{x:-l.uz*a.v,z:l.ux*a.v};
    const centre={x:l.c.x+axis.x*(l.q+a.reach)/2,z:l.c.z+axis.z*(l.q+a.reach)/2},length=a.reach-l.q,r=l.arm,spring=l.naos-r;
    const roof={...l.b,ring:a.ring,holes:[],minHeight:0,roofShape:'flat'};body(group,roof,base,spring,l.m);
    const vertices=[];
    function p(t,angle){return [centre.x+axis.x*t-axis.z*Math.cos(angle)*r,base+spring+Math.sin(angle)*r,centre.z+axis.z*t+axis.x*Math.cos(angle)*r];}
    for(let i=0;i<16;i++){const a0=i*Math.PI/16,a1=(i+1)*Math.PI/16,v=[p(-length/2,a0),p(length/2,a0),p(length/2,a1),p(-length/2,a1)];vertices.push(...v[0],...v[1],...v[2],...v[0],...v[2],...v[3]);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap((v,i)=>i%3?[]:[v/4,vertices[i+2]/4]),2));g.computeVertexNormals();emit(group,g,l.m.roof);
    const end={x:l.c.x+axis.x*a.reach,z:l.c.z+axis.z*a.reach,nx:axis.x,nz:axis.z,ux:axis.z,uz:-axis.x};
    arch(group,end,0,base+spring-0.03,r*2,r,l.m.trim,0.035);arch(group,end,0,base+spring+0.04,r*1.82,r*0.90,l.m.wall,0.06);
    for(const u of [-0.46,0,0.46])sash(group,end,u*r,base+spring+r*0.12,r*0.22,r*(u===0?0.62:0.42),l.m);
  }
  function bell(group,p,base,m){
    const shaft=p.h*0.48,stage=p.h*0.25,w=p.r*Math.SQRT2;
    box(group,p.x,base+shaft/2,p.z,w,shaft,w,m.wall);
    for(const y of [shaft*0.12,shaft])box(group,p.x,base+y,p.z,w*1.12,0.22,w*1.12,m.trim);
    for(const x of [-1,1])for(const z of [-1,1])box(group,p.x+x*w*0.43,base+shaft+stage/2,p.z+z*w*0.43,w*0.15,stage,w*0.15,m.wall);
    box(group,p.x,base+shaft+stage,p.z,w*1.08,0.22,w*1.08,m.trim);
    const dh=p.h*0.08,hh=p.h*0.14,ch=p.h*0.05;drum(group,p,base+shaft+stage,p.r*0.45,dh,m);head(group,p,base+shaft+stage+dh,p.r*0.63,hh,m);cross(group,p,base+p.h-ch,ch);
  }
  function emitMapped(group,b,base,m,components){
    const roof=b.roofShape,c=roof!=='flat'?core(b):null;
    const roofHeight=b.roofHeight||(c?Math.min(4.5,c.r*0.7,(b.h-(b.minHeight||0))*0.4):0),top=b.h-roofHeight;
    body(group,b,base,top,m,roof==='onion'?0:roofHeight,components);
    if(roof==='onion'&&c)head(group,c,base+top,Math.min(c.r*1.3,roofHeight/2.0),roofHeight/1.02,m);
    if(/^(onion|dome)$/.test(roof)){
      if(c){const h=Math.min(1.1,Math.max(0.4,roofHeight*0.16));cross(group,c,base+b.h,h);}
    }
  }
  function emitBuilding(group,b,base){
    const l=layout(b);if(!l)return false;
    const surfaces=l.mapped.length&&b.body?b.body.map(surface=>({...b,...surface})):[b],components=[...surfaces,...l.mapped];
    if(l.kind==='bell-tower'){
      const c=l.c;if(c)bell(group,{...c,r:Math.min(c.r,3),h:b.h},base,l.m);
    }else if(l.kind==='mapped'){
      for(const surface of surfaces)emitMapped(group,surface,base,l.m,components);
    }else{
      const lowRoof=l.binding.source?.roofShape || 'hipped',rise=lowRoof==='flat'?0:Math.min(2.5,l.lower*0.2);
      body(group,{...b,h:l.lower,roofShape:lowRoof,roofHeight:rise},base,l.lower-rise,l.m,rise);
      body(group,{...b,ring:rect(l,-l.q,l.q,-l.q,l.q),holes:[],minHeight:0},base,l.naos,l.m);
      for(const a of l.arms)vault(group,l,a,base);
      drum(group,l.c,base+l.naos,l.drumRadius,l.drumHeight,l.m);
      head(group,l.c,base+l.naos+l.drumHeight,l.drumRadius*1.10,l.headHeight,l.m);
      cross(group,l.c,base+l.naos+l.drumHeight+l.headHeight,l.crossHeight);
    }
    for(const p of l.mapped)emitMapped(group,p,base,materials(p,bindings.get(keyOf(p))||l.binding),components);
    for(const p of l.bells)bell(group,p,base,l.m);
    return true;
  }
  function collisionShapes(b){
    const l=layout(b);if(!l)return null;
    const result=l.kind==='cross-in-square'?[...l.shapes]:[{...b},...l.mapped];
    if(l.kind==='cross-in-square')result.push(...l.mapped);
    for(const p of l.bells){const ring=Array.from({length:8},(_,i)=>[p.x+Math.cos(i*Math.PI/4)*p.r,p.z+Math.sin(i*Math.PI/4)*p.r]).flat();result.push({...b,ring,holes:[],minHeight:0,h:p.h});}
    return result;
  }
  function massingShapes(b){const l=layout(b),shapes=collisionShapes(b);if(!l)return null;return shapes.map(s=>{const m=s.part?materials(s,bindings.get(keyOf(s))||l.binding):l.m,cap=s.orthodoxRole==='central-dome'||/^(onion|dome)$/.test(s.roofShape);return {...s,h:s.h+(/^(onion|dome)$/.test(s.roofShape)?1.1:0),colour:`#${m.wall.color.getHexString()}`,roofColour:`#${(cap?m.head:m.roof).color.getHexString()}`,appearance:{windows:false}};});}
  return {emitBuilding,ownsParts:(b)=>!!layout(b)?.mapped.length,collisionShapes,massingShapes};
}
