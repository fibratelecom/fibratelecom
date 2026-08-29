const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';
const {requireAuth}=require('../lib/cloud-auth');
const {STATE_KEY,OVERLAY_KEY,applyAutomationOverlay}=require('../lib/automation-overlay');

const text=v=>String(v??'').trim();
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

async function db(req,path,options={}){
  const token=String(req.headers['x-vercel-oidc-token']||'');
  if(!token)throw Object.assign(new Error('Autenticação da nuvem indisponível.'),{statusCode:503});
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers});
  let raw='';try{raw=await response.text()}catch{}
  let body=null;if(raw){try{body=JSON.parse(raw)}catch{body=raw}}
  if(!response.ok){const message=body?.message||body?.error||`Falha no banco da nuvem (HTTP ${response.status}).`;throw Object.assign(new Error(message),{statusCode:response.status})}
  return body;
}

function sanitize(value,depth=0){
  if(depth>30)return null;
  if(Array.isArray(value))return value.slice(0,10000).map(v=>sanitize(v,depth+1));
  if(!value||typeof value!=='object')return value;
  const blocked=new Set(['password','router_password','mikrotik_password','clientSecret','client_secret','accessToken','access_token','certificatePassword','certificate_password','certificateBase64','certificate_base64','privateKey','private_key']);
  const out={};
  for(const [key,val] of Object.entries(value)){
    if(blocked.has(key))continue;
    out[key]=sanitize(val,depth+1);
  }
  return out;
}

async function settingRow(req,key){
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}
async function upsertSetting(req,key,value){
  const payload={key,value,updated_at:new Date().toISOString()};
  const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  let row=Array.isArray(patched)?patched[0]:null;
  if(!row){const inserted=await db(req,'/pp_settings',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});row=Array.isArray(inserted)?inserted[0]:inserted}
  return row;
}
function sameValue(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function patchAcknowledged(row,patch){return Boolean(row&&patch&&typeof patch==='object'&&Object.entries(patch).every(([key,value])=>sameValue(row[key],value)))}
function pruneAcknowledged(state,overlay){
  const next=clone(overlay&&typeof overlay==='object'?overlay:{version:1,invoices:{},clients:{}}),invoices=Array.isArray(state?.invoices)?state.invoices:[],clients=Array.isArray(state?.clients)?state.clients:[];
  next.invoices=next.invoices&&typeof next.invoices==='object'?next.invoices:{};
  next.clients=next.clients&&typeof next.clients==='object'?next.clients:{};
  for(const [id,patch] of Object.entries(next.invoices)){const row=invoices.find(item=>String(item?.id)===String(id));if(patchAcknowledged(row,patch))delete next.invoices[id]}
  for(const [id,patch] of Object.entries(next.clients)){const row=clients.find(item=>String(item?.id)===String(id));if(patchAcknowledged(row,patch))delete next.clients[id]}
  return next;
}

async function getState(req){
  const [row,overlayRow]=await Promise.all([settingRow(req,STATE_KEY),settingRow(req,OVERLAY_KEY)]);
  if(!row)return {state:null,updated_at:null};
  return {state:applyAutomationOverlay(row.value||{},overlayRow?.value||{}),updated_at:row.updated_at||null};
}

async function saveState(req,state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});
  const cleanIncoming=sanitize(state),overlayRow=await settingRow(req,OVERLAY_KEY),currentOverlay=overlayRow?.value&&typeof overlayRow.value==='object'?overlayRow.value:{};
  const nextOverlay=pruneAcknowledged(cleanIncoming,currentOverlay),clean=applyAutomationOverlay(cleanIncoming,nextOverlay);
  const payload={key:STATE_KEY,value:clean,updated_at:new Date().toISOString()};
  const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  let row=Array.isArray(patched)?patched[0]:null;
  if(!row){
    const inserted=await db(req,'/pp_settings',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
    row=Array.isArray(inserted)?inserted[0]:inserted;
  }
  if(!sameValue(nextOverlay,currentOverlay))await upsertSetting(req,OVERLAY_KEY,nextOverlay);
  return {state:row?.value||clean,updated_at:row?.updated_at||payload.updated_at};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    await requireAuth(req);
    const action=text(req.body?.action),data=req.body?.data||{};
    let result;
    if(action==='state.get')result=await getState(req);
    else if(action==='state.save')result=await saveState(req,data.state);
    else if(action==='health'){const current=await getState(req);result={online:true,hasState:Boolean(current.state),updated_at:current.updated_at}}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return res.status(200).json({ok:true,data:result});
  }catch(error){
    return res.status(Number(error?.statusCode)||500).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
