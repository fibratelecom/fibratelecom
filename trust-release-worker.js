import billingWorker,{runBillingCron} from './billing-cron.js';
import {neon} from '@neondatabase/serverless';
import {resolveRouterForService} from './worker-native-api.js';
import {handleMikrotikProxy} from './worker-mikrotik-native.js';

const STATE_KEY='web_state_v1017';
const TRUST_PATH='/api/customer-trust-release';
const PORTAL_ORIGINS=new Set([
  'https://cliente.fibramais.workers.dev',
  'https://client.fibramais.workers.dev'
]);
const utf8=new TextEncoder();
const text=value=>String(value??'').trim();
const normalize=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function parseStateValue(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}
  return {};
}
async function loadState(sql){const rows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`;return parseStateValue(Array.isArray(rows)?rows[0]?.value:null)}
async function saveState(sql,state){const updatedAt=new Date().toISOString(),raw=JSON.stringify(state||{});await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${STATE_KEY},${raw}::jsonb,${updatedAt}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;return updatedAt}
function localClient(state,id){return (Array.isArray(state?.clients)?state.clients:[]).find(row=>Number(row?.id)===Number(id))||null}
function localClientIndex(state,id){return (Array.isArray(state?.clients)?state.clients:[]).findIndex(row=>Number(row?.id)===Number(id))}
function monthKey(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(date),map={};for(const part of parts)map[part.type]=part.value;return `${map.year}-${map.month}`}
function dateKeyBrazil(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};for(const part of parts)map[part.type]=part.value;return `${map.year}-${map.month}-${map.day}`}
function nextMonthIso(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date()),map={};for(const part of parts)map[part.type]=part.value;let year=Number(map.year),month=Number(map.month)+1;if(month===13){month=1;year++}return new Date(`${year}-${String(month).padStart(2,'0')}-01T03:00:00.000Z`).toISOString()}
function portalDate(value){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(date)}
function hasOverdue(state,clientId){const today=dateKeyBrazil();return (Array.isArray(state?.invoices)?state.invoices:[]).some(row=>Number(row?.client_id)===Number(clientId)&&['pendente','pending','vencida','vencido','overdue','open','aberta','aberto'].some(status=>normalize(row?.status).includes(status))&&text(row?.due_date||row?.dueDate).slice(0,10)<today)}
function appendAccessHistory(client,action,detail){const current=Array.isArray(client?.access_history)?client.access_history:[];return [{at:new Date().toISOString(),action,user:'Área do Cliente',detail},...current].slice(0,20)}

function b64urlBytes(value){let raw=text(value).replace(/-/g,'+').replace(/_/g,'/');while(raw.length%4)raw+='=';const bin=atob(raw),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
async function portalKey(env){const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);if(!secret)throw Object.assign(new Error('Sessão segura da Área do Cliente não configurada.'),{statusCode:503});return crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])}
async function verifySession(token,env){const parts=text(token).split('.');if(parts.length!==2)throw Object.assign(new Error('Sessão do cliente inválida. Entre novamente.'),{statusCode:401});try{const key=await portalKey(env),ok=await crypto.subtle.verify('HMAC',key,b64urlBytes(parts[1]),utf8.encode(parts[0]));if(!ok)throw new Error('assinatura');const payload=JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0]))),clientId=Number(payload?.clientId)||0,exp=Number(payload?.exp)||0;if(!clientId||exp<=Date.now())throw new Error('expirada');return {clientId}}catch{throw Object.assign(new Error('Sessão do cliente expirada ou inválida. Entre novamente.'),{statusCode:401})}}

function corsFor(request){const origin=text(request.headers.get('origin'));if(!PORTAL_ORIGINS.has(origin))return {'Vary':'Origin'};return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}})}
async function mikrotikAction(env,action,client){const router=await resolveRouterForService(env,client.router_id),request=new Request('https://painel.fibramais.workers.dev/api/mikrotik-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,router,data:client})}),response=await handleMikrotikProxy(request);let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok)throw Object.assign(new Error(text(body?.error)||`Falha no MikroTik (HTTP ${response.status}).`),{statusCode:409});return body.data||{}}

function trustInfo(remote,local,state){
  const merged={...(local||{}),...(remote||{})},untilRaw=text(local?.trust_release_until),until=untilRaw?new Date(untilRaw):null,active=Boolean(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()),usedMonth=text(local?.trust_release_used_month)||text(local?.trust_release_at).slice(0,7),usedThisMonth=usedMonth===monthKey(),status=normalize(merged.status),nextAvailableAt=usedThisMonth?nextMonthIso():'';
  let eligible=false,reasonCode='eligible',message='Você pode liberar sua conexão por 48 horas. Este benefício pode ser usado somente uma vez por mês.';
  if(active){reasonCode='active';message=`Sua liberação em confiança já está ativa até ${portalDate(untilRaw)}.`}
  else if(usedThisMonth){reasonCode='used_month';message=`A liberação em confiança já foi utilizada neste mês. Ela ficará disponível novamente em ${portalDate(nextAvailableAt)}.`}
  else if(status!=='bloqueado'){reasonCode='not_blocked';message='Sua conexão não está bloqueada. A liberação em confiança só é necessária quando o acesso estiver bloqueado.'}
  else if(text(merged.connection_type).toUpperCase()!=='PPPOE'){reasonCode='not_pppoe';message='A liberação em confiança está disponível somente para clientes com conexão PPPoE.'}
  else if(!Number(merged.router_id)||!text(merged.pppoe_username||merged.pppoe_user)){reasonCode='missing_configuration';message='Não foi possível liberar porque o acesso PPPoE ainda não está vinculado corretamente ao MikroTik. Entre em contato com o suporte.'}
  else eligible=true;
  return {eligible,active,usedThisMonth,usedMonth,startedAt:text(local?.trust_release_at),until:untilRaw,nextAvailableAt,reasonCode,message,status:text(merged.status),hasOverdue:hasOverdue(state,merged.id)};
}

async function portalClient(sql,id){const rows=await sql`SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync FROM pp_clients WHERE id=${Number(id)} LIMIT 1`;return Array.isArray(rows)?rows[0]||null:null}

async function handleTrust(request,env){
  const cors=corsFor(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,cors);
  try{
    const origin=text(request.headers.get('origin'));if(!PORTAL_ORIGINS.has(origin))throw Object.assign(new Error('Origem não autorizada.'),{statusCode:403});
    if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Provedor Plus não configurada.'),{statusCode:503});
    let body={};try{body=await request.json()}catch{}const action=text(body?.action),session=await verifySession(body?.data?.session,env),sql=neon(env.DATABASE_URL),remote=await portalClient(sql,session.clientId);if(!remote)throw Object.assign(new Error('Cliente não encontrado.'),{statusCode:404});
    const state=await loadState(sql),local=localClient(state,remote.id),info=trustInfo(remote,local,state);
    if(action==='status')return json({ok:true,data:info},200,cors);
    if(action!=='release')throw Object.assign(new Error('Ação de liberação não permitida.'),{statusCode:400});
    if(!info.eligible)return json({ok:false,error:info.message,data:info},409,cors);
    const index=localClientIndex(state,remote.id);if(index<0)throw Object.assign(new Error('Cadastro do cliente ainda não está sincronizado com a Área do Cliente.'),{statusCode:409});
    const before=JSON.parse(JSON.stringify(state)),merged={...state.clients[index],...remote},at=new Date(),until=new Date(at.getTime()+48*3600000),releaseMonth=monthKey(at),nextStatus=hasOverdue(state,remote.id)?'Em atraso':'Ativo';
    let unblocked=false;
    try{
      await mikrotikAction(env,'client.unblock',merged);unblocked=true;
      state.clients[index]={...state.clients[index],status:nextStatus,trust_release_used_month:releaseMonth,trust_release_at:at.toISOString(),trust_release_until:until.toISOString(),trust_release_source:'area-cliente',access_history:appendAccessHistory(state.clients[index],'Liberação em confiança','Liberação temporária de 48 horas solicitada pela Área do Cliente')};
      await saveState(sql,state);
      await sql`UPDATE pp_clients SET status=${nextStatus},mikrotik_status='Sincronizado',mikrotik_last_sync=${at.toISOString()},updated_at=${at.toISOString()} WHERE id=${Number(remote.id)}`;
    }catch(error){
      if(unblocked)try{await mikrotikAction(env,'client.block',merged)}catch{}
      try{await saveState(sql,before)}catch{}
      try{await sql`UPDATE pp_clients SET status='Bloqueado',updated_at=${new Date().toISOString()} WHERE id=${Number(remote.id)}`}catch{}
      throw error;
    }
    const freshLocal=localClient(state,remote.id),fresh={...remote,status:nextStatus};return json({ok:true,data:trustInfo(fresh,freshLocal,state)},200,cors);
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,cors)}
}

async function processExpiredTrust(env){
  if(!env.DATABASE_URL)return {checked:0,reblocked:0,releasedByPayment:0,failed:0};
  const sql=neon(env.DATABASE_URL),state=await loadState(sql),clients=Array.isArray(state.clients)?state.clients:[],expired=clients.filter(client=>{const until=new Date(text(client?.trust_release_until));return text(client?.trust_release_until)&&!Number.isNaN(until.getTime())&&until.getTime()<=Date.now()});
  let reblocked=0,releasedByPayment=0,failed=0,changed=false;
  for(const local of expired){
    const id=Number(local?.id)||0;if(!id)continue;
    try{
      const remote=await portalClient(sql,id);if(!remote){failed++;continue}
      const index=localClientIndex(state,id);if(index<0)continue;
      if(!hasOverdue(state,id)){
        const at=new Date().toISOString();state.clients[index]={...state.clients[index],status:'Ativo',trust_release_until:'',trust_release_completed_at:at,trust_release_completion_reason:'payment',access_history:appendAccessHistory(state.clients[index],'Fim da liberação em confiança','Prazo encerrado sem novo bloqueio porque não há fatura vencida')};
        await sql`UPDATE pp_clients SET status='Ativo',updated_at=${at} WHERE id=${id}`;releasedByPayment++;changed=true;continue;
      }
      const merged={...state.clients[index],...remote};await mikrotikAction(env,'client.block',merged);const at=new Date().toISOString();state.clients[index]={...state.clients[index],status:'Bloqueado',trust_release_until:'',trust_release_reblocked_at:at,trust_release_completion_reason:'expired',access_history:appendAccessHistory(state.clients[index],'Fim da liberação em confiança','48 horas encerradas; acesso PPPoE bloqueado novamente')};
      await sql`UPDATE pp_clients SET status='Bloqueado',mikrotik_status='Sincronizado',mikrotik_last_sync=${at},updated_at=${at} WHERE id=${id}`;reblocked++;changed=true;
    }catch(error){failed++;console.error(`Provedor Plus: falha ao encerrar confiança do cliente ${id}.`,error)}
  }
  if(changed)await saveState(sql,state);
  return {checked:expired.length,reblocked,releasedByPayment,failed};
}

export default {
  fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname===TRUST_PATH)return handleTrust(request,env);return billingWorker.fetch(request,env,ctx)},
  scheduled(controller,env,ctx){
    const task=(async()=>{await processExpiredTrust(env);if(controller?.cron==='5 6 * * *')await runBillingCron(env)})();
    ctx.waitUntil(task.catch(error=>console.error('Provedor Plus: falha na rotina agendada.',error)));
  }
};
