const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';
const STATE_KEY='web_state_v1017';
const {requireAuth}=require('../lib/cloud-auth');

const text=v=>String(v??'').trim();

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

async function getState(req){
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}&select=value,updated_at&limit=1`);
  const row=Array.isArray(rows)?rows[0]:null;
  return row?{state:row.value||{},updated_at:row.updated_at||null}:{state:null,updated_at:null};
}

async function saveState(req,state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});
  const clean=sanitize(state);
  const payload={key:STATE_KEY,value:clean,updated_at:new Date().toISOString()};
  const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  let row=Array.isArray(patched)?patched[0]:null;
  if(!row){
    const inserted=await db(req,'/pp_settings',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
    row=Array.isArray(inserted)?inserted[0]:inserted;
  }
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
