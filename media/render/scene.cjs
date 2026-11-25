'use strict';

// The released film uses the canonical camera-space layout exported by the atlas.
module.exports = function createScene(canvas, model) {
  if (model.schema_version !== '1.0') {
    throw new Error('This film renderer requires network schema 1.0.');
  }
  const ctx = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height;
  const focal = Math.min(width, height) * 1.18;
  const PI2 = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let seed = model.layout.seed;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function rgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255].join(',');
  }
  const rgba = (color, alpha) => 'rgba(' + color + ',' + clamp(alpha, 0, 1) + ')';
  const nodes = model.nodes.map(node => {
    let phase = 0;
    if (node.kind === 'work') {
      // The atlas sampled three coordinates before assigning its pulse phase.
      random(); random(); random();
      phase = random() * PI2;
    }
    return {
      ...node.position, id: node.id, type: node.kind === 'work' ? 'item' : node.kind,
      group: node.group_id, rgb: rgb(node.color), phase
    };
  });
  const groups = nodes.filter(node => node.type === 'group');
  const byId = new Map(nodes.map(node => [node.id, node]));
  function node(id) {
    if (!byId.has(id)) throw new Error('Missing camera subject in network.json: ' + id);
    return byId.get(id);
  }
  const edgeType = {category: 'trunk', membership: 'branch', workflow: 'cross'};
  const edges = model.edges.map(edge => {
    node(edge.source); node(edge.target);
    if (!edgeType[edge.kind]) throw new Error('Unknown edge kind: ' + edge.kind);
    return {...edge, type: edgeType[edge.kind]};
  });
  let cam;
    const dust = Array.from({length: 1380}, () => ({ x: random(), y: random(), r: .47 + random() ** 3 * 1.65,
      depth: .25 + random() * .75, opacity: .19 + random() ** 1.85 * .65, phase: random() * PI2,
      color: random() < .24 ? '228,205,166' : '186,204,211' }));
    function rotate(v, yaw, pitch) {
      const c = Math.cos(yaw), s = Math.sin(yaw), u = Math.cos(pitch), t = Math.sin(pitch);
      const x = v.x*c - v.z*s, z = v.x*s + v.z*c;
      return {x,y:v.y*u-z*t,z:v.y*t+z*u};
    }
    function project(n) {
      const v = rotate({x:n.x-cam.x,y:n.y-cam.y,z:n.z-cam.z}, cam.yaw, cam.pitch);
      const depth = cam.distance - v.z;
      if (depth < 12) return null;
      const scale = focal / depth;
      return { x:width*.5 + v.x*scale, y:height*.49 - v.y*scale, depth, scale };
    }
    function radial(x,y,r,stops) {
      if (r<.2) return;
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      for (const [offset,color] of stops) g.addColorStop(offset,color);
      ctx.fillStyle=g; ctx.fillRect(x-r,y-r,2*r,2*r);
    }
    function circle(x,y,r,stroke,fill) {
      if(r<.15) return;
      ctx.beginPath();ctx.arc(x,y,r,0,PI2);
      if(fill){ctx.fillStyle=fill;ctx.fill();}
      if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
    }
    function line(x1,y1,x2,y2,color) {
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    }
    function background(t) {
      ctx.clearRect(0,0,width,height);
      const field=ctx.createLinearGradient(0,0,width*.75,height);
      field.addColorStop(0,'#050609');field.addColorStop(.55,'#030406');field.addColorStop(1,'#030406');
      ctx.fillStyle=field;ctx.fillRect(0,0,width,height);
      for(const s of dust) {
        const shiftX=cam.yaw*88*s.depth+cam.x*.22*s.depth;
        const shiftY=cam.pitch*75*s.depth+cam.y*.22*s.depth;
        let x=((s.x*width+shiftX)%width+width)%width, y=((s.y*height+shiftY)%height+height)%height;
        const a=s.opacity*(.80 + .2*Math.sin(s.phase + t*.00037));
        ctx.fillStyle=rgba(s.color,a);ctx.fillRect(x,y,s.r,s.r);
        if(s.r>1.14&&a>.41){ctx.fillStyle=rgba(s.color,a*.23);ctx.fillRect(x-1.4,y+.4,3.9,.6);}
      }
    }

    function take(camera,focus,mode,emphasis,now) {
      cam = camera;
      background(now);
      const points=new Map(), records=[];
      for(const n of nodes) {
        const p=project(n);
        if(!p) continue;
        const entry={...p,n,alpha:1};
        points.set(n.id,entry);records.push(entry);
      }
      for(const g of groups) {
        const p=points.get(g.id); if(!p) continue;
        const density=records.filter(s=>s.n.group===g.id).length;
        const cloud=clamp(79*p.scale,98,400);
        radial(p.x,p.y,cloud,[[0,rgba(p.n.rgb,.061+density*.007)],[.43,rgba(p.n.rgb,.031)],[1,rgba(p.n.rgb,0)]]);
      }
      const selected=byId.get(focus);
      const selectedItem=mode==='item'&&selected&&selected.type==='item';
      ctx.lineCap='round';
      for(const e of edges) {
        const a=points.get(e.source), b=points.get(e.target);
        if(!a||!b)continue;
        const active=e.source===focus||e.target===focus;
        const color=e.type==='cross'?'177,193,205':(e.type==='trunk'?b.n.rgb:a.n.rgb);
        const alpha=Math.min(a.alpha,b.alpha)*(active?(.45+.4*emphasis):e.type==='cross'?.20:e.type==='trunk'?.40:.34)*(selectedItem&&!active?.69:1);
        ctx.lineWidth=active?1.30+.47*emphasis:e.type==='trunk'?1.35:1.0;
        ctx.setLineDash(e.type==='cross'?[2.3,5.6]:[]);
        line(a.x,a.y,b.x,b.y,rgba(color,alpha));
        if(active && e.type!=='cross') {
          const f=((now*.00015+.24)%1);
          const x=a.x+(b.x-a.x)*f, y=a.y+(b.y-a.y)*f;
          circle(x,y,1.35,null,rgba(color,.83));
        }
      }
      ctx.setLineDash([]);
      records.sort((a,b)=>b.depth-a.depth);
      for(const p of records) {
        const {x,y,n,alpha}=p;
        if(x< -110 || x>width+110 || y< -110 || y>height+110 || alpha<=0)continue;
        const selectedNode=(mode==='item'||mode==='group')&&n.id===focus;

        const pulse=.88+.12*Math.sin(now*.0016+(n.phase||0));
        let r=n.type==='root'?5.5:n.type==='group'?5.4:3.15 + Math.min(3,Math.max(0,Number(n.importance)||0))*.25;
        r*=1.33*clamp(Math.sqrt(p.scale),.74,2.20)*(selectedNode?1+.71*emphasis:1)*(.75+.25*alpha);
        p.radius=r;
        ctx.globalAlpha=alpha;
        const glow=(selectedNode?6.1+5.8*emphasis:n.type==='item'?6.1:9.1)*r;
        radial(x,y,glow,[[0,rgba(n.rgb,.54*pulse)],[.16,rgba(n.rgb,.33*pulse)],
          [.45,rgba(n.rgb,(selectedNode?.15:.11)*pulse)],[1,rgba(n.rgb,0)]]);
        ctx.lineWidth=.8;
        if(n.type==='root'||n.type==='group') {
          const length=(n.type==='root'?5:3.6)*r;
          for(const [ux,uy,extent] of [[.968,.251,length],[.251,-.968,length], [.863,-.505,length*.50],[.505,.863,length*.50]]) {
            const beam=ctx.createLinearGradient(x-ux*extent,y-uy*extent,x+ux*extent,y+uy*extent);
            beam.addColorStop(0,rgba(n.rgb,0));beam.addColorStop(.50,rgba(n.rgb,.95));beam.addColorStop(1,rgba(n.rgb,0));
            line(x-ux*extent,y-uy*extent,x+ux*extent,y+uy*extent,beam);
          }
          ctx.lineWidth=.58;
          circle(x,y,r*2.75,rgba(n.rgb,.32));
        }
        if(selectedNode) { ctx.globalAlpha*=emphasis;
          ctx.lineWidth=selectedNode?Math.max(2.0,r*.43):1.1;circle(x,y,r*2.75,rgba(n.rgb,.96));
          ctx.lineWidth=.8;circle(x,y,r*(4.96+.12*pulse),rgba(n.rgb,.52));
          if(selectedNode){
            ctx.lineWidth=.5;circle(x,y,r*5.35,rgba(n.rgb,.16));
            for(let j=0;j<6;j++){
              const a=j*PI2/6+.18,c=Math.cos(a),s=Math.sin(a);
              line(x+c*r*4.92,y+s*r*4.92,x+c*r*5.21,y+s*r*5.21,rgba(n.rgb,.60));
            }
          }
        }
        ctx.globalAlpha=alpha; circle(x,y,r,rgba(n.rgb,.89),rgba(n.rgb,n.type==='item'?.77:.92));
        circle(x-r*.12,y-r*.12,r*(n.type==='item'?.42:.65),null,rgba('255,250,228',.99));
        ctx.globalAlpha=1;
      }

    }
    return {take, node, pos: id => project(node(id))};
};
