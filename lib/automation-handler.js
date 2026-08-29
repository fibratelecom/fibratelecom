const crypto=require('node:crypto');
const bankHandler=require('./bank-proxy-handler');
const mikrotikHandler=require('./mikrotik-proxy');
const {STATE_KEY,OVERLAY_KEY,applyAutomationOverlay}=require('./automation-overlay');

const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';
const LAST_RUN_KEY='automation_last_run_v1';
const BANK_SECRET_PREFIX='automation_bank_secret_v1_';
const ROUTER_SECRET_PREFIX='router_secret_v1_';
const AUTO_BLOCK_DAYS=7;

const text=v=>String(v??'').trim();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const bool=(v,fallback=false)=>{if(v===undefined||v===null||v==='')return fallback;if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;const s=text(v).toLowerCase();if(['true','1','sim','yes','on'].includes(s))return true;if(['false','0','nao','não','no','off'].includes(s))return false;return fallback};

function oidcToken(req){return text(req?.headers?.['x-vercel-oidc-token']||process.env.VERCEL_OIDC_TOKEN)}
async function db(req,path,options={}){
  const token=oidcToken(req);if(!token)throw Object.assign(new Error('Autenticação da nuvem indisponível para a automação.'),{statusCode:503});
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers});
  let raw='';try{raw=await response.text()}catch{}
  let body=null;if(raw){try{body=JSON.parse(raw)}catch{body=raw}}
  if(!response.ok){const message=body?.message||body?.error||`Falha no banco da nuvem (HTTP ${response.status}).`;throw Object.assign(new Error(message),{statusCode:response.status,detail:body})}
  return body;
}
async function settingGet(req,key){const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`);return Array.isArray(rows)?rows[0]||null:null}
async function settingSet(req,key,value){
  const payload={key,value,updated_at:new Date().toISOString()};
  const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  let row=Array.isArray(patched)?patched[0]:null;
  if(!row){const inserted=await db(req,'/pp_settings',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});row=Array.isArray(inserted)?inserted[0]:inserted}
  return row;
}

function saoPauloDateParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=type=>Number(parts.find(p=>p.type===type)?.value)||0;
  return {year:get('year'),month:get('month'),day:get('day')};
}
function isoDateMinusDays(days){const p=saoPauloDateParts(),d=new Date(Date.UTC(p.year,p.month-1,p.day));d.setUTCDate(d.getUTCDate()-Math.max(0,Math.floor(Number(days)||0)));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`}
function todayIso(){return isoDateMinusDays(0)}
function hasOverdue(state,clientId,days=1){const limit=isoDateMinusDays(Math.max(1,Math.floor(Number(days)||1)));return (state.invoices||[]).some(i=>Number(i.client_id)===Number(clientId)&&i.status==='Pendente'&&text(i.due_date).slice(0,10)<=limit)}
function hasAnyOverdue(state,clientId){const today=todayIso();return (state.invoices||[]).some(i=>Number(i.client_id)===Number(clientId)&&i.status==='Pendente'&&text(i.due_date).slice(0,10)<today)}
function trustActive(client){const until=text(client?.trust_release_until);if(!until)return false;const d=new Date(until);return !Number.isNaN(d.getTime())&&d>new Date()}
function paidState(invoice,remote){if(invoice.bank_provider==='efi')return ['paid','settled','concluida'].includes(text(remote?.bank_status).toLowerCase());return text(remote?.bank_status).toLowerCase()==='processed'&&['accredited',''].includes(text(remote?.bank_status_detail).toLowerCase())}

function decryptSecret(record,key){
  try{if(!record?.iv||!record?.tag||!record?.data)return'';const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));decipher.setAuthTag(Buffer.from(record.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]).toString('utf8')}catch{return''}
}
async function usersById(req){const rows=await db(req,'/pp_users?select=id,password_hash');return new Map((Array.isArray(rows)?rows:[]).map(x=>[Number(x.id),text(x.password_hash)]).filter(x=>x[0]&&x[1]))}
async function bankVault(req){
  const [settings,users]=await Promise.all([db(req,`/pp_settings?key=like.${encodeURIComponent(BANK_SECRET_PREFIX+'*')}&select=key,value,updated_at&order=updated_at.desc`),usersById(req)]),vault={};
  for(const row of Array.isArray(settings)?settings:[]){
    const m=text(row.key).match(/^automation_bank_secret_v1_(\d+)$/);if(!m)continue;const userId=Number(m[1]),hash=users.get(userId);if(!hash)continue;
    const key=crypto.createHash('sha256').update(`provedor-plus-bank-automation-v1|${userId}|${hash}`).digest(),plain=decryptSecret(row.value,key);if(!plain)continue;
    try{const value=JSON.parse(plain);if(!vault.efi&&value?.efi)vault.efi=value.efi;if(!vault.mercadoPago&&value?.mercadoPago)vault.mercadoPago=value.mercadoPago;if(vault.efi&&vault.mercadoPago)break}catch{}
  }
  return vault;
}
async function routerPasswordMap(req){
  const [settings,users]=await Promise.all([db(req,`/pp_settings?key=like.${encodeURIComponent(ROUTER_SECRET_PREFIX+'*')}&select=key,value,updated_at&order=updated_at.desc`),usersById(req)]),out=new Map();
  for(const row of Array.isArray(settings)?settings:[]){
    const m=text(row.key).match(/^router_secret_v1_(\d+)_(\d+)$/);if(!m)continue;const userId=Number(m[1]),routerId=Number(m[2]);if(out.has(routerId))continue;const hash=users.get(userId);if(!hash)continue;
    const key=crypto.createHash('sha256').update(`provedor-plus-router-secret-v1|${userId}|${hash}`).digest(),password=decryptSecret(row.value,key);if(password)out.set(routerId,password);
  }
  return out;
}

function mockCall(handler,body){
  return new Promise((resolve,reject)=>{
    let done=false;const finish=(status,payload)=>{if(done)return;done=true;if(status>=200&&status<300&&payload?.ok!==false)return resolve(payload?.data??payload);reject(Object.assign(new Error(payload?.error||`Falha interna HTTP ${status}.`),{statusCode:status,payload}))};
    const res={statusCode:200,setHeader(){},status(code){this.statusCode=Number(code)||200;return this},json(payload){finish(this.statusCode,payload);return this},end(raw){let payload=raw;try{payload=raw?JSON.parse(String(raw)):{} }catch{}finish(this.statusCode,payload);return this}};
    Promise.resolve(handler({method:'POST',body,headers:{}},res)).then(()=>{if(!done)finish(res.statusCode,{ok:true,data:null})}).catch(reject);
  });
}
async function bankSync(invoice,credentials,state){
  const efiMeta=state?.banks?.efi||{},mpMeta=state?.banks?.mercadoPago||{};
  return mockCall(bankHandler,{action:'sync',invoice:clone(invoice),efi:{environment:efiMeta.environment||'sandbox',clientId:text(credentials?.efi?.clientId),clientSecret:text(credentials?.efi?.clientSecret),certificatePassword:String(credentials?.efi?.certificatePassword||''),certificateBase64:String(credentials?.efi?.certificateBase64||''),pixKey:text(efiMeta.pixKey),pixAutoReceiverAgency:text(efiMeta.pixAutoReceiverAgency),pixAutoReceiverAccount:text(efiMeta.pixAutoReceiverAccount),webhookUrl:text(efiMeta.webhookUrl)},mercadoPago:{environment:mpMeta.environment||'sandbox',publicKey:text(mpMeta.publicKey),accessToken:text(credentials?.mercadoPago?.accessToken)}});
}
function routerObject(row,password){return {id:Number(row?.id)||0,name:text(row?.name)||'MikroTik',host:text(row?.host),port:Number(row?.port)||443,username:text(row?.username),password:String(password||''),allow_self_signed:bool(row?.allow_self_signed,false)}}
async function mikrotikAction(action,router,client){return mockCall(mikrotikHandler,{action,router,data:clone(client)})}
async function patchClient(req,id,patch){
  const payload={...patch,updated_at:new Date().toISOString()};
  const rows=await db(req,`/pp_clients?id=eq.${Number(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  return Array.isArray(rows)?rows[0]||null:null;
}

async function mapConcurrent(items,limit,fn){
  const list=Array.from(items||[]),results=new Array(list.length);let cursor=0;
  async function worker(){while(true){const index=cursor++;if(index>=list.length)return;try{results[index]={ok:true,value:await fn(list[index],index)}}catch(error){results[index]={ok:false,error}}}}
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit),Math.max(1,list.length))},worker));return results;
}

async function runAutomation(req){
  const startedAt=new Date().toISOString(),[stateRow,overlayRow,credentials,clientsRows,routersRows,passwords]=await Promise.all([
    settingGet(req,STATE_KEY),settingGet(req,OVERLAY_KEY),bankVault(req),db(req,'/pp_clients?select=*&order=id.asc'),db(req,'/pp_routers?select=*&order=id.asc'),routerPasswordMap(req)
  ]);
  let overlay=overlayRow?.value&&typeof overlayRow.value==='object'?clone(overlayRow.value):{version:1,invoices:{},clients:{}};
  overlay.invoices=overlay.invoices&&typeof overlay.invoices==='object'?overlay.invoices:{};overlay.clients=overlay.clients&&typeof overlay.clients==='object'?overlay.clients:{};
  const state=applyAutomationOverlay(stateRow?.value||{},overlay),clients=Array.isArray(clientsRows)?clientsRows:[],routers=new Map((Array.isArray(routersRows)?routersRows:[]).map(r=>[Number(r.id),r]));
  const fullClients=new Map((state.clients||[]).map(c=>[Number(c.id),c]));
  const effectiveClients=clients.map(c=>({...fullClients.get(Number(c.id)),...c,pppoe_username:text(c.pppoe_username||c.pppoe_user)}));
  const paidClientIds=new Set();let checked=0,paid=0,bankFailed=0;
  const pending=(state.invoices||[]).filter(i=>i.status==='Pendente'&&['efi','mercadoPago'].includes(text(i.bank_provider)));
  const bankResults=await mapConcurrent(pending,4,async invoice=>{
    const provider=text(invoice.bank_provider),available=provider==='efi'?Boolean(text(credentials?.efi?.clientId)&&text(credentials?.efi?.clientSecret)):Boolean(text(credentials?.mercadoPago?.accessToken));
    if(!available)throw new Error(`${provider==='efi'?'Efí Bank':'Mercado Pago'}: credencial da automação ainda não foi sincronizada com o servidor.`);
    const remote=await bankSync(invoice,credentials,state);checked++;
    if(remote&&typeof remote==='object')overlay.invoices[String(invoice.id)]={...(overlay.invoices[String(invoice.id)]||{}),...clone(remote)};
    if(paidState(invoice,remote)){
      const patch={...(overlay.invoices[String(invoice.id)]||{}),status:'Pago',payment_method:`Boleto ${provider==='efi'?'Efí Bank':'Mercado Pago'} (API)`,paid_by:`API ${provider==='efi'?'Efí Bank':'Mercado Pago'}`,paid_at:remote?.paidAt||remote?.paid_at||new Date().toISOString()};
      overlay.invoices[String(invoice.id)]=patch;paidClientIds.add(Number(invoice.client_id)||0);paid++;
    }
    return remote;
  });
  bankFailed=bankResults.filter(x=>!x.ok).length;
  const effectiveState=applyAutomationOverlay(state,overlay),globalEnabled=text(effectiveState?.settings?.auto_block||'false').toLowerCase()==='true';
  let blocked=0,unblocked=0,mikrotikFailed=0;

  for(const client of effectiveClients){
    const id=Number(client.id)||0;if(!id||client.connection_type!=='PPPoE'||!client.router_id||!text(client.pppoe_username))continue;
    const routerRow=routers.get(Number(client.router_id)),password=passwords.get(Number(client.router_id));if(!routerRow||!password)continue;
    const router=routerObject(routerRow,password),overdue7=hasOverdue(effectiveState,id,AUTO_BLOCK_DAYS),automaticEnabled=globalEnabled||bool(client.auto_block,false),autoRecord=overlay.clients[String(id)]||{};
    if(automaticEnabled&&text(client.status)!=='Bloqueado'&&!trustActive(client)&&overdue7){
      try{const remote=await mikrotikAction('client.block',router,client);await patchClient(req,id,{status:'Bloqueado',mikrotik_secret_id:text(remote?.secretId),mikrotik_status:'Bloqueado no MikroTik',mikrotik_last_sync:new Date().toISOString()});overlay.clients[String(id)]={...autoRecord,status:'Bloqueado',mikrotik_secret_id:text(remote?.secretId),mikrotik_status:'Bloqueado no MikroTik',mikrotik_last_sync:new Date().toISOString(),automation_reason:'overdue_7d',automation_at:new Date().toISOString()};blocked++}catch{mikrotikFailed++}
      continue;
    }
    const shouldAutoRestore=text(client.status)==='Bloqueado'&&!overdue7&&(paidClientIds.has(id)||text(autoRecord.automation_reason)==='overdue_7d');
    if(shouldAutoRestore){
      try{const remote=await mikrotikAction('client.unblock',router,client),nextStatus=hasAnyOverdue(effectiveState,id)?'Em atraso':'Ativo';await patchClient(req,id,{status:nextStatus,mikrotik_secret_id:text(remote?.secretId),mikrotik_status:'Sincronizado',mikrotik_last_sync:new Date().toISOString()});overlay.clients[String(id)]={...autoRecord,status:nextStatus,mikrotik_secret_id:text(remote?.secretId),mikrotik_status:'Sincronizado',mikrotik_last_sync:new Date().toISOString(),automation_reason:'',automation_at:new Date().toISOString()};unblocked++}catch{mikrotikFailed++}
    }
  }

  overlay.version=1;overlay.updated_at=new Date().toISOString();await settingSet(req,OVERLAY_KEY,overlay);
  const result={ok:true,startedAt,finishedAt:new Date().toISOString(),pending:pending.length,checked,paid,bankFailed,blocked,unblocked,mikrotikFailed,autoBlockEnabled:globalEnabled};
  await settingSet(req,LAST_RUN_KEY,result);return result;
}

module.exports={runAutomation,applyAutomationOverlay,OVERLAY_KEY,STATE_KEY};
