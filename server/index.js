const express=require('express'),fs=require('fs'),path=require('path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const app=express();app.use(express.json({limit:'8mb'}));
app.use(express.static(path.join(__dirname,'../client')));
const DB=path.join(__dirname,'data.json');
const KEY=process.env.GEMINI_API_KEY,MODEL=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const load=()=>fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):seed();
const save=d=>fs.writeFileSync(DB,JSON.stringify(d));
function seed(){const base=[22.9676,76.0534];const T=['pothole','streetlight','drain','pipeline','garbage'],S=['high','medium','low'];
const d=T.concat(T).map((t,i)=>({id:'demo'+i,type:t,severity:S[i%3],lat:base[0]+(Math.random()-.5)*.08,lng:base[1]+(Math.random()-.5)*.08,place:'Dewas',
title_en:'Demo: '+t+' problem',title_hi:'à¤¡à¥‡à¤®à¥‹: '+t+' à¤¸à¤®à¤¸à¥à¤¯à¤¾',desc_en:'Demo report for testing.',desc_hi:'à¤¯à¤¹ à¤Ÿà¥‡à¤¸à¥à¤Ÿ à¤•à¥‡ à¤²à¤¿à¤ à¤¡à¥‡à¤®à¥‹ à¤°à¤¿à¤ªà¥‹à¤°à¥à¤Ÿ à¤¹à¥ˆà¥¤',image:'',status:i%4==0?'Verified Done':'Reported',likes:[],reposts:[],time:Date.now()-i*864e5}));save(d);return d}
const hav=(a,b,c,d)=>{const r=x=>x*Math.PI/180,R=6371;const h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const hits={};app.use('/api',(q,s,n)=>{const k=q.ip,t=Date.now();hits[k]=(hits[k]||[]).filter(x=>t-x<6e4);if(hits[k].length>60)return s.status(429).json({error:'Bahut requests / Too many requests'});hits[k].push(t);n()});
async function gem(parts){if(!KEY)throw new Error('GEMINI_API_KEY missing in .env');
const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}],generationConfig:{responseMimeType:'application/json'}})});
const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'Gemini error');return JSON.parse(j.candidates[0].content.parts[0].text.replace(/```json|```/g,''))}
const PROMPT=(place)=>`You are a civic infrastructure inspector in India. Look at the photo (location: ${place}). Reply ONLY JSON: {"is_infrastructure_issue":bool,"type":"pothole|streetlight|drain|pipeline|garbage|other","severity":"high|medium|low","title_hi":str,"title_en":str,"description_hi":str,"description_en":str}. Descriptions: professional, factual, polite, 2-3 sentences, mention location, what is visible, risk to public.`;
const OK=o=>o&&typeof o.is_infrastructure_issue==='boolean'&&['high','medium','low'].includes(o.severity)&&o.title_en&&o.description_en;
app.post('/api/analyze',async(q,s)=>{try{const{image,place}=q.body;const b64=(image||'').split(',')[1];if(!b64)return s.status(400).json({error:'Photo missing'});
const parts=[{text:PROMPT(place||'unknown')},{inline_data:{mime_type:'image/jpeg',data:b64}}];let o;
try{o=await gem(parts);if(!OK(o))throw 0}catch(e){o=await gem(parts);if(!OK(o))throw new Error('AI response invalid, try again')}
s.json(o)}catch(e){s.status(500).json({error:e.message})}});
const BAD=['gali','chutiya','madarchod','bhosdi','harami','idiot','stupid','fuck'];
app.post('/api/polish',async(q,s)=>{try{const{text,lang}=q.body;if(BAD.some(w=>(text||'').toLowerCase().includes(w)))return s.status(400).json({error:'Kripya saaf bhasha use karein / Please use clean language'});
const o=await gem([{text:`Rewrite this citizen complaint in professional, polite ${lang==='hi'?'Hindi':'English'}. Remove abuse and off-topic content. Keep facts. Reply JSON {"text":str}. Text: ${text}`}]);s.json({text:o.text})}catch(e){s.status(500).json({error:e.message})}});
let last=0;const cache={};
app.get('/api/geo',async(q,s)=>{const k=(+q.query.lat).toFixed(3)+','+(+q.query.lng).toFixed(3);if(cache[k])return s.json(cache[k]);
try{const w=Math.max(0,1100-(Date.now()-last));await new Promise(r=>setTimeout(r,w));last=Date.now();
const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${q.query.lat}&lon=${q.query.lng}&accept-language=en`,{headers:{'User-Agent':'GramSevak/1.0 ('+(process.env.CONTACT_EMAIL||'none')+')'}});
const j=await r.json();cache[k]={address:j.display_name||''};s.json(cache[k])}catch(e){s.json({address:''})}});
const day={};
app.post('/api/reports',(q,s)=>{const b=q.body,d=load(),u=b.uid;if(!u||!b.image)return s.status(400).json({error:'Invalid'});
const t=Date.now();day[u]=(day[u]||[]).filter(x=>t-x<864e5);if(day[u].length>=10)return s.status(429).json({error:'Roz ke 10 report ki limit / Daily limit 10'});
const dup=d.find(r=>r.type===b.type&&r.status!=='Verified Done'&&hav(r.lat,r.lng,b.lat,b.lng)<.1);
if(dup)return s.json({duplicate:true,report:dup});
if(!fs.existsSync(path.join(__dirname,'../client/uploads')))fs.mkdirSync(path.join(__dirname,'../client/uploads'));
const id='r'+t,f='uploads/'+id+'.jpg';fs.writeFileSync(path.join(__dirname,'../client/',f),Buffer.from(b.image.split(',')[1],'base64'));
const r={id,type:b.type,severity:b.severity,lat:+b.lat,lng:+b.lng,place:String(b.place||'').slice(0,80),title_hi:b.title_hi,title_en:b.title_en,desc_hi:String(b.desc_hi||'').slice(0,800),desc_en:String(b.desc_en||'').slice(0,800),image:f,status:'Reported',likes:[],reposts:[],time:t};
d.push(r);save(d);day[u].push(t);s.json({report:r})});
app.get('/api/reports',(q,s)=>{const{lat,lng,km=5,type,severity}=q.query;let d=load();
d=d.filter(r=>(!lat||hav(+lat,+lng,r.lat,r.lng)<=+km)&&(!type||r.type===type)&&(!severity||r.severity===severity));
const W={high:3,medium:2,low:1};d.forEach(r=>r.score=W[r.severity]*10+r.reposts.length*2+Math.floor((Date.now()-r.time)/864e5));
d.sort((a,b)=>b.score-a.score);s.json(d.map(r=>({...r,likes:r.likes.length,reposts:r.reposts.length})))});
app.post('/api/reports/:id/:act',(q,s)=>{const d=load(),r=d.find(x=>x.id===q.params.id),a=q.params.act,u=q.body.uid;if(!r||!u||!['likes','reposts'].includes(a))return s.status(400).json({error:'Invalid'});
if(!r[a].includes(u))r[a].push(u);save(d);s.json({ok:true})});
app.listen(process.env.PORT||3000,()=>console.log('Gram Sevak chalu: http://localhost:'+(process.env.PORT||3000)));

async function gem(parts){
  const k=process.env.OPENROUTER_API_KEY;if(!k)throw new Error('OPENROUTER_API_KEY missing');
  const content=parts.map(p=>p.text?{type:'text',text:p.text+'\nReply with JSON only.'}:{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+p.inline_data.data}});
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+k},body:JSON.stringify({model:process.env.OPENROUTER_MODEL||'openrouter/free',messages:[{role:'user',content}]})});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||'OpenRouter error');
  const m=j.choices[0].message.content.match(/\{[\s\S]*\}/);return JSON.parse(m[0])}
