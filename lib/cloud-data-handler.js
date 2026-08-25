const crypto=require('node:crypto');
const {currentSession}=require('./cloud-auth');
const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';

const text=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.trunc(n):null};
const nullableText=v=>{const s=text(v);return s||null};

async function db(req,path,options={}){
  const token=String(req.headers['x-vercel-oidc-token']||'');
  if(!token)throw Object.assign(new Error('Autenticação da nuvem indisponível.'),{statusCode:503});
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers});
  let raw='';
  try{raw=await response.text()}catch{}
  let body=null;
  if(raw){try{body=JSON.parse(raw)}catch{body=raw}}
  if(!response.ok){
    const message=body?.message||body?.error||`Falha no banco da nuvem (HTTP ${response.status}).`;
    throw Object.assign(new Error(message),{statusCode:response.status,detail:body});
  }
  return body;
}

async function settingGet(req,key){
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}

async function settingSet(req,key,value){
  const payload={key,value,updated_at:new Date().toISOString()};
  const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{
    method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)
  });
  let row=Array.isArray(patched)?patched[0]:null;
  if(!row){
    const inserted=await db(req,'/pp_settings',{
      method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)
    });
    row=Array.isArray(inserted)?inserted[0]:inserted;
  }
  return row;
}

async function settingDelete(req,key){
  await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
}

function routerPayload(data={}){
  const id=num(data.id);
  const out={
    name:text(data.name)||'MikroTik',
    host:text(data.host),
    port:num(data.port)||443,
    username:text(data.username),
    connection_method:'rest',
    allow_self_signed:Boolean(data.allow_self_signed),
    active:data.active===undefined?true:Boolean(data.active),
    last_status:text(data.last_status),
    updated_at:new Date().toISOString()
  };
  if(id)out.id=id;
  if(data.last_sync)out.last_sync=data.last_sync;
  return out;
}

function clientPayload(data={}){
  const id=num(data.id),routerId=num(data.router_id);
  const pppoeUser=text(data.pppoe_username||data.pppoe_user);
  const out={
    name:text(data.name),
    document:text(data.document),
    contract_number:text(data.contract_number),
    plan:text(data.plan||data.plan_name),
    plan_id:num(data.plan_id),
    due_day:num(data.due_day),
    status:text(data.status)||'Ativo',
    email:text(data.email),
    phone:text(data.phone),
    address:text(data.address||data.street),
    city:text(data.city),
    state:text(data.state),
    zip_code:text(data.zip_code||data.cep),
    pppoe_user:pppoeUser,
    pppoe_password:text(data.pppoe_password),
    auto_block:Boolean(data.auto_block),
    block_after_days:num(data.block_after_days)||7,
    notes:text(data.notes),
    router_id:routerId,
    connection_type:nullableText(data.connection_type),
    pppoe_username:nullableText(pppoeUser),
    mikrotik_profile:nullableText(data.mikrotik_profile),
    ip:nullableText(data.ip),
    mac_address:nullableText(data.mac_address),
    mikrotik_secret_id:nullableText(data.mikrotik_secret_id||data.secret_id),
    mikrotik_status:nullableText(data.mikrotik_status),
    mikrotik_last_sync:data.mikrotik_last_sync||data.last_mikrotik_sync||null,
    updated_at:new Date().toISOString()
  };
  if(id)out.id=id;
  return out;
}

async function upsert(req,table,payload,{keepIdOnInsert=true}={}){
  const id=num(payload.id);
  if(id){
    const patched=await db(req,`/${table}?id=eq.${id}`,{
      method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)
    });
    if(Array.isArray(patched)&&patched.length)return patched[0];
  }
  const insertPayload={...payload};
  if(!keepIdOnInsert)delete insertPayload.id;
  const inserted=await db(req,`/${table}`,{
    method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(insertPayload)
  });
  return Array.isArray(inserted)?inserted[0]:inserted;
}

async function findExistingClient(req,payload){
  const filters=[];
  if(payload.contract_number)filters.push(['contract_number',payload.contract_number]);
  if(payload.document)filters.push(['document',payload.document]);
  for(const [field,value] of filters){
    const rows=await db(req,`/pp_clients?select=id&${field}=eq.${encodeURIComponent(value)}&limit=1`);
    if(Array.isArray(rows)&&rows[0]?.id)return num(rows[0].id);
  }
  return null;
}

async function secretContext(req,routerId){
  const current=await currentSession(req);
  if(!current?.user?.id)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});
  const users=await db(req,`/pp_users?id=eq.${Number(current.user.id)}&select=password_hash&limit=1`);
  const passwordHash=Array.isArray(users)?text(users[0]?.password_hash):'';
  if(!passwordHash)throw Object.assign(new Error('Não foi possível proteger a credencial do MikroTik.'),{statusCode:500});
  const key=crypto.createHash('sha256').update(`provedor-plus-router-secret-v1|${current.user.id}|${passwordHash}`).digest();
  return {userId:Number(current.user.id),key,settingKey:`router_secret_v1_${Number(current.user.id)}_${Number(routerId)}`};
}

function encryptSecret(value,key){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
}

function decryptSecret(record,key){
  try{
    if(!record?.iv||!record?.tag||!record?.data)return '';
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));
    decipher.setAuthTag(Buffer.from(record.tag,'base64'));
    return Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]).toString('utf8');
  }catch{return ''}
}

async function routerSecretGet(req,routerId){
  const id=num(routerId);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});
  const ctx=await secretContext(req,id),row=await settingGet(req,ctx.settingKey);
  const password=decryptSecret(row?.value,ctx.key);
  return {configured:Boolean(password),password};
}

async function routerSecretSave(req,routerId,password){
  const id=num(routerId),value=String(password||'');
  if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});
  if(!value)throw Object.assign(new Error('Informe a senha do MikroTik.'),{statusCode:400});
  const ctx=await secretContext(req,id);
  await settingSet(req,ctx.settingKey,encryptSecret(value,ctx.key));
  return {configured:true,id};
}

async function routerSecretDelete(req,routerId){
  const id=num(routerId);if(!id)return {deleted:false,id:null};
  const ctx=await secretContext(req,id);
  await settingDelete(req,ctx.settingKey);
  return {deleted:true,id};
}

function trafficEmpty(){return {month:new Date().toISOString().slice(0,7),download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0,history:[]}}

async function trafficRecord(req,data={}){
  const clientId=num(data.clientId);if(!clientId)throw Object.assign(new Error('Cliente inválido para registrar tráfego.'),{statusCode:400});
  const key=`client_traffic_v1_${clientId}`,row=await settingGet(req,key),all=row?.value&&typeof row.value==='object'?row.value:trafficEmpty();
  const live=data.live&&typeof data.live==='object'?data.live:{},month=new Date().toISOString().slice(0,7),t=Date.now();
  let x={...trafficEmpty(),...all};
  if(x.month!==month){
    const history=x.month?[{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},...(Array.isArray(x.history)?x.history:[])].slice(0,12):(Array.isArray(x.history)?x.history:[]);
    x={...trafficEmpty(),history};
  }
  let downloadBps=Number(live.downloadBps)||0,uploadBps=Number(live.uploadBps)||0;
  if(live.online&&live.sessionId){
    const d=Math.max(0,Number(live.downloadBytes)||0),u=Math.max(0,Number(live.uploadBytes)||0),same=x.lastSession===String(live.sessionId);
    const dd=same?Math.max(0,d-(Number(x.lastDownload)||0)):d,du=same?Math.max(0,u-(Number(x.lastUpload)||0)):u;
    if(!downloadBps&&same&&x.lastAt){const seconds=Math.max(.25,(t-Number(x.lastAt))/1000);downloadBps=Math.round(dd*8/seconds);uploadBps=Math.round(du*8/seconds)}
    x.download_bytes=(Number(x.download_bytes)||0)+dd;x.upload_bytes=(Number(x.upload_bytes)||0)+du;
    x.lastSession=String(live.sessionId);x.lastDownload=d;x.lastUpload=u;x.lastAt=t;
  }
  await settingSet(req,key,x);
  return {current:{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},history:Array.isArray(x.history)?x.history:[],downloadBps,uploadBps};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    const action=text(req.body?.action),data=req.body?.data||{};
    let result;
    if(action==='routers.list')result=await db(req,'/pp_routers?select=*&order=id.asc');
    else if(action==='routers.save'){
      const payload=routerPayload(data);
      if(!payload.host||!payload.username)throw Object.assign(new Error('Informe o endereço e o usuário do MikroTik.'),{statusCode:400});
      result=await upsert(req,'pp_routers',payload);
    }else if(action==='routers.delete'){
      const id=num(data.id);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});
      await db(req,`/pp_routers?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});result={deleted:true,id};
    }else if(action==='routers.secret.get')result=await routerSecretGet(req,data.id);
    else if(action==='routers.secret.save')result=await routerSecretSave(req,data.id,data.password);
    else if(action==='routers.secret.delete')result=await routerSecretDelete(req,data.id);
    else if(action==='clients.list')result=await db(req,'/pp_clients?select=*&order=id.asc');
    else if(action==='clients.save'){
      const payload=clientPayload(data);
      if(!payload.name)throw Object.assign(new Error('Nome do cliente é obrigatório.'),{statusCode:400});
      if(!payload.id){const existingId=await findExistingClient(req,payload);if(existingId)payload.id=existingId;}
      result=await upsert(req,'pp_clients',payload,{keepIdOnInsert:false});
    }else if(action==='clients.delete'){
      const id=num(data.id);if(!id)throw Object.assign(new Error('Cliente inválido.'),{statusCode:400});
      await db(req,`/pp_clients?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});result={deleted:true,id};
    }else if(action==='traffic.record')result=await trafficRecord(req,data);
    else if(action==='health'){
      const routers=await db(req,'/pp_routers?select=id&limit=1');result={online:true,routers:Array.isArray(routers)};
    }else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return res.status(200).json({ok:true,data:result});
  }catch(error){
    const status=Number(error?.statusCode)||500;
    return res.status(status).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
