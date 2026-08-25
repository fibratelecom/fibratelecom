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
    plan:text(data.plan),
    due_day:num(data.due_day),
    status:text(data.status)||'Ativo',
    email:text(data.email),
    phone:text(data.phone),
    address:text(data.address),
    city:text(data.city),
    state:text(data.state),
    zip_code:text(data.zip_code),
    pppoe_user:pppoeUser,
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
    mikrotik_last_sync:data.mikrotik_last_sync||null,
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
    }else if(action==='clients.list')result=await db(req,'/pp_clients?select=*&order=id.asc');
    else if(action==='clients.save'){
      const payload=clientPayload(data);
      if(!payload.name)throw Object.assign(new Error('Nome do cliente é obrigatório.'),{statusCode:400});
      if(!payload.id){const existingId=await findExistingClient(req,payload);if(existingId)payload.id=existingId;}
      result=await upsert(req,'pp_clients',payload,{keepIdOnInsert:false});
    }else if(action==='clients.delete'){
      const id=num(data.id);if(!id)throw Object.assign(new Error('Cliente inválido.'),{statusCode:400});
      await db(req,`/pp_clients?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});result={deleted:true,id};
    }else if(action==='health'){
      const routers=await db(req,'/pp_routers?select=id&limit=1');result={online:true,routers:Array.isArray(routers)};
    }else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return res.status(200).json({ok:true,data:result});
  }catch(error){
    const status=Number(error?.statusCode)||500;
    return res.status(status).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
