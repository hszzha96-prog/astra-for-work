'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const createScene = require('./scene.cjs');
const { values } = parseArgs({options: {
  out: {type: 'string', default: 'frames'},
  from: {type: 'string', default: '0'},
  to: {type: 'string', default: '1800'},
  model: {type: 'string', default: path.join(__dirname, '../../model/network.json')},
  font: {type: 'string'}
}});
const from = Number(values.from), to = Number(values.to);
if (![from, to].every(Number.isInteger) || from < 0 || from >= to || to > 1800) {
  throw new Error('The frame range must satisfy 0 <= from < to <= 1800.');
}
let titleFont = 'Baskerville, "Times New Roman", serif';
if (values.font) {
  if (!GlobalFonts.registerFromPath(path.resolve(values.font), 'Astra Serif')) {
    throw new Error('Could not load the supplied title font.');
  }
  titleFont = '"Astra Serif", serif';
}
const model = JSON.parse(fs.readFileSync(values.model, 'utf8'));
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
const sky = createScene(canvas, model);
const fps = 60;

// mark(timeSeconds, target, distance, yaw, pitch) defines the camera path.
const n=id=>sky.node(id),mix=(a,b,p)=>({x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,z:a.z+(b.z-a.z)*p});
const root={x:0,y:-1,z:0},office=n('office'),teams=n('teams'),slides=n('slides'),pal=n('pal'),career=n('career');
const mid=(a,b,p=.5)=>mix(n(a),n(b),p);
const keys=[];
function mark(t,p,d,yaw,pitch){keys.push({t,x:p.x,y:p.y,z:p.z,distance:d,yaw,pitch})}
mark(0,root,528,-.34,.13);
mark(2.6,root,501,-.10,.075);
mark(5.2,mix(teams,office,.32),259,.20,.036);
mark(7.0,mix(teams,office,.23),250,.33,.012);
mark(9.7,mid('teams','slides',.37),418,.17,.14);
mark(11.1,mid('teams','slides',.56),425,.01,.17);
mark(13.7,mid('slides','design',.22),258,-.22,.074);
mark(15.45,mid('slides','design',.29),266,-.33,.042);
mark(17.9,mid('slides','pal',.56),448,-.10,.105);
mark(20.0,mid('pal','learn',.23),265,.24,-.055);
mark(21.7,mid('pal','learn',.27),274,.38,-.050);
mark(23.8,mid('learn','career',.54),442,.29,.092);
mark(25.5,mix(career,root,.24),342,.095,.125);
mark(27.3,mix(career,root,.66),458,-.046,.15);
mark(30,root,519,-.26,.14);
const fields=['x','y','z','distance','yaw','pitch'],clamp=x=>Math.max(0,Math.min(1,x));
function slope(i,k){
 const last=keys.length-1;
 const sec=j=>(keys[j+1][k]-keys[j][k])/(keys[j+1].t-keys[j].t);
 if(i===0||i===last)return .65*sec(i===0?0:last-1);
 const a=sec(i-1),b=sec(i);if(a*b<=0)return 0;
 const da=keys[i].t-keys[i-1].t,db=keys[i+1].t-keys[i].t,w1=2*db+da,w2=2*da+db;
 return (w1+w2)/(w1/a+w2/b);
}
function camera(t){
 let i=0;while(i<keys.length-2&&keys[i+1].t<t)i++;
 const a=keys[i],b=keys[i+1],h=b.t-a.t,u=(t-a.t)/h,u2=u*u,u3=u2*u,cam={};
 for(const k of fields)cam[k]=(2*u3-3*u2+1)*a[k]+(u3-2*u2+u)*h*slope(i,k)+(-2*u3+3*u2)*b[k]+(u3-u2)*h*slope(i+1,k);
 return cam;
}
const scenes=[['teams','item',3.7,8.55],['slides','item',11.4,16.8],['pal','item',18.0,23],['career','group',24,27.6]];
const ease=t=>{t=clamp(t);return t*t*(3-2*t)};
function stream(a,b,start,end,c,t){
 if(t<start||t>end)return;
 const u=(t-start)/(end-start),opacity=ease(u*5)*ease((1-u)*5);
 const p=sky.pos(a),q=sky.pos(b);if(!p||!q)return;
 const at=ease(u),x=p.x+(q.x-p.x)*at,y=p.y+(q.y-p.y)*at;
 ctx.save();ctx.globalAlpha=opacity;
 ctx.lineWidth=1.55;ctx.setLineDash([5,9]);ctx.strokeStyle='rgba('+c+',0.62)';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);
 const glow=ctx.createRadialGradient(x,y,0,x,y,19);glow.addColorStop(0,'rgba('+c+',.85)');glow.addColorStop(.22,'rgba('+c+',.38)');glow.addColorStop(1,'rgba('+c+',0)');ctx.fillStyle=glow;ctx.fillRect(x-19,y-19,38,38);
 ctx.beginPath();ctx.fillStyle='#f5eedd';ctx.arc(x,y,3.6,0,2*Math.PI);ctx.fill();ctx.restore();
}
function title(){
 ctx.save();
 const shade=ctx.createRadialGradient(199,86,0,199,86,368);shade.addColorStop(0,'rgba(3,4,6,.98)');shade.addColorStop(.37,'rgba(3,4,6,.96)');shade.addColorStop(.68,'rgba(3,4,6,.32)');shade.addColorStop(1,'rgba(3,4,6,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,570,458);
 ctx.font='42px '+titleFont+' ';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#e5ddcc';ctx.fillText('Astra for Work',82,101);ctx.restore();
}
function render(i){
 const t=i/fps,sc=scenes.find(s=>t>=s[2]&&t<s[3]);const e=sc?ease((t-sc[2])/.70)*ease((sc[3]-t)/.72):0;
 sky.take(camera(t),sc?.[0]??'codex',sc?.[1]??'overview',e,t*1000);
 stream('teams','slides',8.4,13.85,'239,189,118',t);
 stream('slides','pal',16,20.7,'122,202,192',t);
 title();
}

fs.mkdirSync(values.out, {recursive: true});
for (let frame = from; frame < to; frame++) {
  render(frame);
  const name = String(frame).padStart(5, '0') + '.jpg';
  fs.writeFileSync(path.join(values.out, name), canvas.toBuffer('image/jpeg', 90));
}
