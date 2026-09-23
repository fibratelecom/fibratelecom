import baseWorker from './operations-entry-worker.js';
import {runBillingCron,mirrorInvoicesToD1} from './billing-cron.js';
import {neon} from '@neondatabase/serverless';
import {buildPushHTTPRequest} from '@pushforge/builder';
import {resolveRouterForService,recordTrafficForService,mirrorClientToD1} from './worker-native-api.js';
import {handleMikrotikProxy} from './worker-mikrotik-native.js';
import {beginPaymentPriority,paymentPriorityActive} from './state-write-lock.js';

const CLIENT_PUSH_PATH='/api/customer-push';
const ADMIN_PUSH_PATH='/api/push-admin';
const OPS_PATH='/api/push-operations';
const STATE_KEY='web_state_v1017';
const INVOICES_D1_KEY='billing_invoices_v1';
const FINANCIAL_D1_KEY='cashback_negotiations_v1';
const STATE_WRITE_LOCK_KEY='web_state_write_lock_v1';
const STATE_WRITE_LOCK_TTL_MS=60000;
const PORTAL_LOGIN_PATH='/api/customer-portal';
const PORTAL_LOGIN_WINDOW_MS=15*60*1000;
const PORTAL_LOGIN_BLOCK_MS=15*60*1000;
const PORTAL_LOGIN_PAIR_LIMIT=6;
const PORTAL_LOGIN_IP_LIMIT=30;
const VAPID_KEY='push_vapid_v1';
const CLIENT_APP_ORIGIN='https://cliente.fibramais.workers.dev';
const CLIENT_ORIGINS=new Set(['https://cliente.fibramais.workers.dev','https://client.fibramais.workers.dev']);
const VARIABLE_NAMES=['{nome}','{valor}','{vencimento}','{plano}','{contrato}','{cashback}'];
const NOTIFICATION_SCHEDULE_INTERVAL_MINUTES=5;
const PAYMENT_RECONCILIATION_INTERVAL_MINUTES=15;
const TRAFFIC_COLLECTION_INTERVAL_MINUTES=30;
const BILLING_INTERVAL_MINUTES=60;
const ECONOMY_CRON='*/5 * * * *';
const enc=new TextEncoder();
const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let schemaReady=false,portalLoginRateSchemaReady=false;

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}})}
function clientCors(request){const origin=text(request.headers.get('origin')),headers={'Vary':'Origin','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};if(CLIENT_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;return headers}
function parseState(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}return {}}
function cashbackBalanceSnapshot(row){const direct=Number(row?.cashback_balance_cents),amount=Number(row?.cashback_balance),cents=Number.isFinite(direct)?Math.max(0,Math.round(direct)):Number.isFinite(amount)?Math.max(0,Math.round(amount*100)):0;return {cashback_balance_cents:cents,cashback_balance:cents/100,cashback_updated_at:text(row?.cashback_updated_at)||null}}
function financialSnapshotFromState(state={}){
  const clients=(Array.isArray(state?.clients)?state.clients:[]).filter(row=>row?.id!==undefined&&row?.id!==null).map(row=>({id:row.id,...cashbackBalanceSnapshot(row)}));
  const contracts=(Array.isArray(state?.client_contracts)?state.client_contracts:[]).filter(row=>row?.id!==undefined&&row?.id!==null||text(row?.contract_number)).map(row=>({id:row?.id??null,client_id:row?.client_id??null,contract_number:text(row?.contract_number),...cashbackBalanceSnapshot(row)}));
  return {clients,contracts,cashback_transactions:Array.isArray(state?.cashback_transactions)?state.cashback_transactions:[],negotiations:Array.isArray(state?.negotiations)?state.negotiations:[]};
}
function applyFinancialSnapshot(state,snapshot={}){
  if(!state||typeof state!=='object'||Array.isArray(state))return state;
  const clientBalances=new Map((Array.isArray(snapshot?.clients)?snapshot.clients:[]).map(row=>[String(row?.id??''),row]));
  if(Array.isArray(state.clients))state.clients=state.clients.map(row=>{const saved=clientBalances.get(String(row?.id??''));return saved?{...row,...cashbackBalanceSnapshot(saved)}:row});
  const contractBalances=new Map(),contractNumbers=new Map();for(const row of Array.isArray(snapshot?.contracts)?snapshot.contracts:[]){if(row?.id!==undefined&&row?.id!==null)contractBalances.set(String(row.id),row);const number=text(row?.contract_number),clientId=String(row?.client_id??'');if(number)contractNumbers.set(`${clientId}|${number}`,row)}
  if(Array.isArray(state.client_contracts))state.client_contracts=state.client_contracts.map(row=>{const saved=(row?.id!==undefined&&row?.id!==null?contractBalances.get(String(row.id)):null)||contractNumbers.get(`${String(row?.client_id??'')}|${text(row?.contract_number)}`);return saved?{...row,...cashbackBalanceSnapshot(saved)}:row});
  state.cashback_transactions=Array.isArray(snapshot?.cashback_transactions)?snapshot.cashback_transactions:[];
  state.negotiations=Array.isArray(snapshot?.negotiations)?snapshot.negotiations:[];
  return state;
}
async function d1Rows(statement){const result=await statement.all();return Array.isArray(result?.results)?result.results:[]}
async function readFinancialSnapshotFromD1(env,fallbackState={},minimumUpdatedAt=''){
  const fallback=financialSnapshotFromState(fallbackState);
  if(!env?.PROVEDOR_DB)return {snapshot:fallback,active:false,updatedAt:''};
  try{
    const rows=await d1Rows(env.PROVEDOR_DB.prepare('SELECT value,updated_at FROM pp_settings WHERE key=? LIMIT 1').bind(FINANCIAL_D1_KEY)),row=rows?.[0];if(!row)return {snapshot:fallback,active:false,updatedAt:''};
    let value=row.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{return {snapshot:fallback,active:false,updatedAt:''}};if(!value||typeof value!=='object'||Array.isArray(value))return {snapshot:fallback,active:false,updatedAt:''};
    const snapshot={clients:Array.isArray(value.clients)?value.clients:[],contracts:Array.isArray(value.contracts)?value.contracts:[],cashback_transactions:Array.isArray(value.cashback_transactions)?value.cashback_transactions:[],negotiations:Array.isArray(value.negotiations)?value.negotiations:[]};
    const minimumTime=Date.parse(text(minimumUpdatedAt)),d1Time=Date.parse(text(row.updated_at));if(Number.isFinite(minimumTime)&&Number.isFinite(d1Time)&&d1Time<minimumTime)return {snapshot:fallback,active:false,updatedAt:text(row.updated_at)};
    return {snapshot,active:true,updatedAt:text(row.updated_at)};
  }catch(error){console.error('Provedor Plus: leitura D1 do cashback e negociações falhou; usando Neon.',error);return {snapshot:fallback,active:false,updatedAt:''}}
}
async function saveFinancialSnapshotToD1(env,state,updatedAt=new Date().toISOString()){
  if(!env?.PROVEDOR_DB)return false;const snapshot=financialSnapshotFromState(state),raw=JSON.stringify(snapshot),at=text(updatedAt)||new Date().toISOString();await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(FINANCIAL_D1_KEY,raw,at).run();return true;
}
async function loadState(sql,env=null){
  const rows=await sql`SELECT value,updated_at FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,row=rows?.[0],state=parseState(row?.value);
  if(env?.PROVEDOR_DB){const minimumUpdatedAt=row?.updated_at instanceof Date?row.updated_at.toISOString():text(row?.updated_at),[invoiceStore,financialStore]=await Promise.all([readInvoicesSnapshotFromD1(env,state?.invoices,minimumUpdatedAt),readFinancialSnapshotFromD1(env,state,minimumUpdatedAt)]);if(invoiceStore.active)state.invoices=invoiceStore.invoices;if(financialStore.active)applyFinancialSnapshot(state,financialStore.snapshot)}
  return state;
}
async function mirrorInvoicesSnapshotToD1(env){
  if(!env?.DATABASE_URL||!env?.PROVEDOR_DB)return false;
  const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value,updated_at FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,row=rows?.[0];if(!row)return false;
  const state=parseState(row.value),updatedAt=row.updated_at instanceof Date?row.updated_at.toISOString():text(row.updated_at);
  return mirrorInvoicesToD1(env,state,updatedAt||new Date().toISOString());
}
async function mirrorFinancialSnapshotToD1(env){
  if(!env?.DATABASE_URL||!env?.PROVEDOR_DB)return false;
  const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value,updated_at FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,row=rows?.[0];if(!row)return false;
  const state=parseState(row.value),updatedAt=row.updated_at instanceof Date?row.updated_at.toISOString():text(row.updated_at);return saveFinancialSnapshotToD1(env,state,updatedAt||new Date().toISOString());
}
async function currentStateUpdatedAt(env){
  if(!env?.DATABASE_URL)return '';
  try{const rows=await neon(env.DATABASE_URL)`SELECT updated_at FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,value=rows?.[0]?.updated_at;return value instanceof Date?value.toISOString():text(value)}catch{return ''}
}
async function readInvoicesSnapshotFromD1(env,fallback=[],minimumUpdatedAt=''){
  const legacy=Array.isArray(fallback)?fallback:[];
  if(!env?.PROVEDOR_DB)return {invoices:legacy,active:false,updatedAt:''};
  try{
    const rows=await d1Rows(env.PROVEDOR_DB.prepare('SELECT value,updated_at FROM pp_settings WHERE key=? LIMIT 1').bind(INVOICES_D1_KEY)),row=rows?.[0];if(!row)return {invoices:legacy,active:false,updatedAt:''};
    let value=row.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{return {invoices:legacy,active:false,updatedAt:''}};if(!Array.isArray(value))return {invoices:legacy,active:false,updatedAt:''};
    const minimumTime=Date.parse(text(minimumUpdatedAt)),d1Time=Date.parse(text(row.updated_at));if(Number.isFinite(minimumTime)&&Number.isFinite(d1Time)&&d1Time<minimumTime)return {invoices:legacy,active:false,updatedAt:text(row.updated_at)};
    return {invoices:value,active:true,updatedAt:text(row.updated_at)};
  }catch(error){console.error('Provedor Plus: leitura D1 das faturas falhou; usando Neon.',error);return {invoices:legacy,active:false,updatedAt:''}}
}
async function syncPrimarySnapshotsD1ToNeon(env,{invoices=false,financial=false}={}){
  if(!env?.DATABASE_URL||!env?.PROVEDOR_DB)return {active:false};
  const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value,updated_at FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,row=rows?.[0];if(!row)return {active:false};
  const state=parseState(row.value),neonUpdatedAt=row.updated_at instanceof Date?row.updated_at.toISOString():text(row.updated_at),stamp=neonUpdatedAt||new Date().toISOString();let changed=false,seededInvoices=false,seededFinancial=false;
  if(invoices){const store=await readInvoicesSnapshotFromD1(env,state?.invoices,neonUpdatedAt);if(store.active){const current=Array.isArray(state?.invoices)?state.invoices:[];if(JSON.stringify(current)!==JSON.stringify(store.invoices)){state.invoices=store.invoices;changed=true}}else{await mirrorInvoicesToD1(env,state,stamp);seededInvoices=true}}
  if(financial){const store=await readFinancialSnapshotFromD1(env,state,neonUpdatedAt);if(store.active){const before=JSON.stringify(financialSnapshotFromState(state));applyFinancialSnapshot(state,store.snapshot);if(before!==JSON.stringify(financialSnapshotFromState(state)))changed=true}else{await saveFinancialSnapshotToD1(env,state,stamp);seededFinancial=true}}
  if(changed){const updatedAt=new Date().toISOString(),raw=JSON.stringify(state);await sql`UPDATE pp_settings SET value=${raw}::jsonb,updated_at=${updatedAt} WHERE key=${STATE_KEY}`;if(invoices)await mirrorInvoicesToD1(env,state,updatedAt);if(financial)await saveFinancialSnapshotToD1(env,state,updatedAt)}
  return {active:true,changed,seededInvoices,seededFinancial};
}
async function syncInvoicesD1ToNeon(env){return syncPrimarySnapshotsD1ToNeon(env,{invoices:true})}
async function invoiceReadAction(request,path){
  if(request.method!=='POST'||(path!=='/api/cloud-state'&&path!=='/api/customer-portal'))return '';
  let body={};try{body=await request.clone().json()}catch{return ''};return text(body?.action);
}
async function invoiceWorkingCopyRequest(request,path){
  if(request.method!=='POST')return false;
  const url=new URL(request.url);if(path==='/api/customer-portal'&&url.searchParams.get('mp_webhook')==='1')return true;
  let body={};try{body=await request.clone().json()}catch{return false};const action=text(body?.action);
  if(path==='/api/customer-portal')return new Set(['refresh','payment-config','payment-prepare','payment-pix','payment-card','payment-status','negotiation-options','negotiate']).has(action);
  if(path==='/api/cloud-data')return action==='billing.run'||action==='negotiation.support.options'||action==='negotiation.support.create';
  if(path==='/api/customer-due-date'||path==='/api/customer-trust-release')return true;
  return false;
}
async function financialWorkingCopyRequest(request,path){
  if(request.method!=='POST')return false;const url=new URL(request.url);if(path==='/api/customer-portal'&&url.searchParams.get('mp_webhook')==='1')return true;
  let body={};try{body=await request.clone().json()}catch{return false};const action=text(body?.action);
  if(path==='/api/cloud-state')return action==='state.save';
  if(path==='/api/cloud-data')return new Set(['cashback.wallet.get','cashback.wallet.adjust','negotiation.support.options','negotiation.support.create']).has(action);
  if(path==='/api/customer-portal')return new Set(['login','refresh','payment-config','payment-prepare','payment-pix','payment-card','payment-status','negotiation-options','negotiate']).has(action);
  return false;
}
async function overlayInvoicesFromD1(response,env,path,action){
  if(!response?.ok||!env?.PROVEDOR_DB)return response;
  const panelRead=path==='/api/cloud-state'&&action==='state.get',portalRead=path==='/api/customer-portal'&&(action==='login'||action==='refresh');if(!panelRead&&!portalRead)return response;
  let parsed={};try{parsed=await response.clone().json()}catch{return response};if(!parsed?.ok)return response;
  let target=null,minimumUpdatedAt='';
  if(panelRead){target=parsed?.data?.state;if(!target||typeof target!=='object'||Array.isArray(target))return response;minimumUpdatedAt=text(parsed?.data?.updated_at)}
  else{target=parsed?.data;if(!target||typeof target!=='object'||Array.isArray(target)||!Array.isArray(target?.invoices))return response;minimumUpdatedAt=await currentStateUpdatedAt(env)}
  const store=await readInvoicesSnapshotFromD1(env,target?.invoices,minimumUpdatedAt);if(store.active)target.invoices=store.invoices;
  if(panelRead){const financialStore=await readFinancialSnapshotFromD1(env,target,minimumUpdatedAt);if(financialStore.active)applyFinancialSnapshot(target,financialStore.snapshot)}
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store, max-age=0');return new Response(JSON.stringify(parsed),{status:response.status,statusText:response.statusText,headers});
}
async function mirrorRecentClientsToD1(env,minutes=15){
  if(!env?.DATABASE_URL||!env?.PROVEDOR_DB)return {checked:0,mirrored:0,failed:0};
  const windowMinutes=Math.max(5,Math.min(60,Math.floor(Number(minutes)||15))),since=new Date(Date.now()-windowMinutes*60*1000).toISOString(),sql=neon(env.DATABASE_URL),rows=await sql`SELECT id FROM pp_clients WHERE updated_at IS NOT NULL AND updated_at>=${since} ORDER BY updated_at ASC LIMIT 500`;
  let mirrored=0,failed=0;
  for(let start=0;start<(rows||[]).length;start+=20){
    const results=await Promise.allSettled(rows.slice(start,start+20).map(row=>mirrorClientToD1(env,row.id)));
    for(const result of results)result.status==='fulfilled'?mirrored++:failed++;
  }
  return {checked:(rows||[]).length,mirrored,failed};
}
function trafficService(row,scope='primary'){
  const clientId=Number(row?.client_id??row?.id)||0,routerId=Number(row?.router_id)||0,username=text(row?.pppoe_username||row?.pppoe_user),connectionType=normalize(row?.connection_type),normalizedScope=text(scope)||'primary';
  if(!clientId||!routerId||!username||(connectionType&&connectionType!=='pppoe'))return null;
  return {clientId,routerId,username,scope:normalizedScope};
}
async function collectCustomerTraffic(env){
  if(!env?.DATABASE_URL)return {routers:0,routerErrors:0,sessions:0,recorded:0,failed:0};
  const sql=neon(env.DATABASE_URL),[clients,state]=await Promise.all([
    sql`SELECT id,router_id,connection_type,pppoe_username,pppoe_user FROM pp_clients WHERE router_id IS NOT NULL AND COALESCE(NULLIF(pppoe_username,''),NULLIF(pppoe_user,'')) IS NOT NULL`,
    loadState(sql,env)
  ]),services=[],known=new Set();
  for(const client of clients||[]){const service=trafficService(client,'primary'),key=service?`${service.clientId}|${service.scope}`:'';if(service&&!known.has(key)){known.add(key);services.push(service)}}
  for(const contract of Array.isArray(state?.client_contracts)?state.client_contracts:[]){const scope=text(contract?.id);if(!scope)continue;const service=trafficService(contract,scope),key=service?`${service.clientId}|${service.scope}`:'';if(service&&!known.has(key)){known.add(key);services.push(service)}}
  const byRouter=new Map();for(const service of services){const list=byRouter.get(service.routerId)||[];list.push(service);byRouter.set(service.routerId,list)}
  const summary={routers:byRouter.size,routerErrors:0,sessions:0,recorded:0,failed:0};
  for(const [routerId,routerServices] of byRouter){
    try{
      const router=await resolveRouterForService(env,routerId),request=new Request('https://painel.fibramais.workers.dev/api/mikrotik-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'router.ppp-active',router})}),response=await handleMikrotikProxy(request);let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body?.ok)throw new Error(text(body?.error)||`Falha ao consultar o MikroTik (HTTP ${response.status}).`);
      const active=Array.isArray(body?.data?.pppActive)?body.data.pppActive:[],sessions=new Map();summary.sessions+=active.length;
      for(const row of active){const username=text(row?.name);if(username&&!sessions.has(username))sessions.set(username,row)}
      const captures=[];
      for(const service of routerServices){
        const row=sessions.get(service.username);if(!row)continue;const sessionId=text(row?.['session-id']||row?.['.id']);if(!sessionId)continue;
        captures.push({service,live:{online:true,sessionId,downloadBytes:Math.max(0,Number(row?.downloadBytes)||0),uploadBytes:Math.max(0,Number(row?.uploadBytes)||0),checkedAt:new Date().toISOString()}});
      }
      for(let start=0;start<captures.length;start+=20){const results=await Promise.allSettled(captures.slice(start,start+20).map(item=>recordTrafficForService(env,item.service.clientId,item.live,item.service.scope)));for(const result of results)result.status==='fulfilled'?summary.recorded++:summary.failed++}
    }catch(error){summary.routerErrors++;console.error(`Provedor Plus: falha ao acumular tráfego PPPoE do MikroTik ${routerId}.`,error)}
  }
  return summary;
}
function normalize(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function paidStatus(value){const status=normalize(value);return ['pago','paga','paid','baixado','recebido','recebida','quitado','quitada'].some(item=>status.includes(item))}
function inactiveStatus(value){const status=normalize(value);return ['cancelado','canceled','renegociado','renegotiated','substituido','substituida'].some(item=>status.includes(item))}
function invoiceOpen(row){return !paidStatus(row?.status)&&!inactiveStatus(row?.status)}
function invoiceCents(row){for(const key of ['amount_cents','total_cents','value_cents','price_cents']){const n=Number(row?.[key]);if(Number.isFinite(n))return Math.max(0,Math.round(n))}for(const key of ['amount','total','value','price']){const n=Number(row?.[key]);if(Number.isFinite(n))return Math.max(0,Math.round(n*100))}return 0}
function brl(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100)}
function brDate(value){const match=text(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}/${match[2]}/${match[1]}`:'não disponível'}
function base64UrlBytes(value){const raw=text(value).replace(/-/g,'+').replace(/_/g,'/'),padded=raw+'='.repeat((4-raw.length%4)%4),bin=atob(padded),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function base64Url(value){const bytes=value instanceof Uint8Array?value:new Uint8Array(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function normalizeClickUrl(value=''){const raw=text(value);if(!raw)return `${CLIENT_APP_ORIGIN}/`;if(raw.startsWith('/'))return `${CLIENT_APP_ORIGIN}${raw}`;try{const url=new URL(raw);return CLIENT_ORIGINS.has(url.origin)?url.toString():`${CLIENT_APP_ORIGIN}/`}catch{return `${CLIENT_APP_ORIGIN}/`}}
function notificationPayload(title,body,url,tag='fibra-plus'){return {title:text(title)||'Fibra+',body:text(body),icon:`${CLIENT_APP_ORIGIN}/icons/fibra-app-192.png?v=15`,badge:`${CLIENT_APP_ORIGIN}/icons/fibra-app-192.png?v=15`,tag:text(tag)||'fibra-plus',lang:'pt-BR',data:{url:normalizeClickUrl(url)}}}
function dueEvery(scheduledAt,minutes){const interval=Math.max(1,Math.floor(Number(minutes)||1));return Math.floor(Number(scheduledAt)/(60*1000))%interval===0}

function bankFlag(source,flag,secretKey){return Object.prototype.hasOwnProperty.call(source||{},flag)?Boolean(source?.[flag]):Boolean(text(source?.[secretKey]))}
function safeBankClientSettings(value){
  const efi=value?.efi||{},mp=value?.mercadoPago||{};
  return {
    efi:{
      enabled:Boolean(efi.enabled),environment:text(efi.environment)||'sandbox',
      clientIdConfigured:bankFlag(efi,'clientIdConfigured','clientId'),clientSecretConfigured:bankFlag(efi,'clientSecretConfigured','clientSecret'),
      certificatePasswordConfigured:bankFlag(efi,'certificatePasswordConfigured','certificatePassword'),certificateConfigured:bankFlag(efi,'certificateConfigured','certificateBase64'),
      certificateName:text(efi.certificateName),pixKey:text(efi.pixKey),pixAutoReceiverAgency:text(efi.pixAutoReceiverAgency),pixAutoReceiverAccount:text(efi.pixAutoReceiverAccount),webhookUrl:text(efi.webhookUrl),
      lastTestStatus:text(efi.lastTestStatus),lastTestMessage:text(efi.lastTestMessage),lastTestAt:text(efi.lastTestAt),webhookConfiguredAt:text(efi.webhookConfiguredAt)
    },
    mercadoPago:{
      enabled:Boolean(mp.enabled),environment:text(mp.environment)||'sandbox',publicKey:text(mp.publicKey),accessTokenConfigured:bankFlag(mp,'accessTokenConfigured','accessToken'),webhookSecretConfigured:bankFlag(mp,'webhookSecretConfigured','webhookSecret'),
      lastTestStatus:text(mp.lastTestStatus),lastTestMessage:text(mp.lastTestMessage),lastTestAt:text(mp.lastTestAt)
    }
  };
}
function sanitizeBankPayload(data){
  if(!data||typeof data!=='object'||Array.isArray(data))return data;
  if(data.efi||data.mercadoPago)return safeBankClientSettings(data);
  if(data.settings&&typeof data.settings==='object')return {...data,settings:safeBankClientSettings(data.settings)};
  return data;
}
async function sanitizeBankResponse(response){
  if(!response)return response;let body={};try{body=await response.clone().json()}catch{return response}
  if(!body||typeof body!=='object'||!Object.prototype.hasOwnProperty.call(body,'data'))return response;
  const safe={...body,data:sanitizeBankPayload(body.data)},headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store, max-age=0');
  return new Response(JSON.stringify(safe),{status:response.status,statusText:response.statusText,headers});
}
async function bankRequestBody(request){let body={};try{body=await request.clone().json()}catch{}return {action:text(body?.action),data:body?.data||{}}}
async function bankVaultSettings(request,env,ctx){
  const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
  const internal=new Request(new URL('/api/bank-settings',request.url),{method:'POST',headers,body:JSON.stringify({action:'get',data:{}})}),response=await baseWorker.fetch(internal,env,ctx);let body={};try{body=await response.json()}catch{}
  if(!response.ok||!body?.ok||!body?.data)throw Object.assign(new Error(body?.error||'Não foi possível abrir as credenciais bancárias no servidor.'),{statusCode:response.status||500});
  return body.data;
}
async function handleBankServiceAction(request,env,ctx){
  if(request.method!=='POST')return null;const {action,data}=await bankRequestBody(request);if(!['efi-pix-auto-create','efi-pix-auto-refresh'].includes(action))return null;
  try{
    const settings=await bankVaultSettings(request,env,ctx),headers=new Headers(request.headers);headers.set('Content-Type','application/json');
    const proxyData=action==='efi-pix-auto-create'?{action:'efi-pix-auto-create',efi:settings.efi||{},mercadoPago:settings.mercadoPago||{},client:data?.client||{},startDate:data?.startDate,endDate:data?.endDate,amountCents:data?.amountCents}:{action:'efi-pix-auto-refresh',efi:settings.efi||{},mercadoPago:settings.mercadoPago||{},idRec:text(data?.idRec||data?.id)};
    const internal=new Request(new URL('/api/bank-proxy',request.url),{method:'POST',headers,body:JSON.stringify(proxyData)});
    return await baseWorker.fetch(internal,env,ctx);
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-bank-safe-service'})}
}

function portalLoginIp(request){const direct=text(request.headers.get('cf-connecting-ip'));if(direct)return direct;return text(request.headers.get('x-forwarded-for')).split(',')[0].trim()}
async function portalLoginHash(env,value){
  const secret=text(env?.PORTAL_SESSION_SECRET)||text(env?.DATABASE_URL);if(!secret)throw new Error('Proteção do login sem chave disponível.');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(`provedor-plus-portal-login-v1|${secret}|${value}`)));
  return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function ensurePortalLoginRateTable(sql){
  if(portalLoginRateSchemaReady)return;
  await sql`CREATE TABLE IF NOT EXISTS pp_portal_login_rate (
    key TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS pp_portal_login_rate_updated_idx ON pp_portal_login_rate (updated_at)`;
  portalLoginRateSchemaReady=true;
}
function portalLoginRateError(blockedUntil){
  const retry=Math.max(1,Math.ceil((new Date(blockedUntil).getTime()-Date.now())/1000)||60);
  return Object.assign(new Error('Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.'),{statusCode:429,retryAfterSeconds:retry});
}
function portalLoginRateResponse(request,error){
  const headers=clientCors(request);headers['Retry-After']=String(Math.max(1,Number(error?.retryAfterSeconds)||60));headers['x-provedor-plus-edge']='cloudflare-customer-login-rate';
  return json({ok:false,error:error instanceof Error?error.message:String(error)},429,headers);
}
async function portalLoginRateKeys(request,env,data){
  const ip=portalLoginIp(request),document=digits(data?.document||data?.cpf||data?.cnpj),contract=normalize(data?.contract||data?.contrato),identity=`${document}|${contract}`||'sem-identificacao';
  const pairHash=await portalLoginHash(env,`${ip||'sem-ip'}|${identity}`),ipHash=ip?await portalLoginHash(env,ip):'';
  return {pairKey:`portal_login_pair_${pairHash}`,ipKey:ipHash?`portal_login_ip_${ipHash}`:''};
}
async function portalLoginRateRows(sql,keys){
  const query=()=>keys.ipKey?sql`SELECT key,blocked_until FROM pp_portal_login_rate WHERE key=${keys.pairKey} OR key=${keys.ipKey}`:sql`SELECT key,blocked_until FROM pp_portal_login_rate WHERE key=${keys.pairKey}`;
  try{const rows=await query();portalLoginRateSchemaReady=true;return rows}
  catch(error){
    if(portalLoginRateSchemaReady||text(error?.code)!=='42P01')throw error;
    await ensurePortalLoginRateTable(sql);
    return query();
  }
}
async function checkPortalLoginRate(sql,keys){
  const rows=await portalLoginRateRows(sql,keys);
  let blockedUntil=null;
  for(const row of rows||[]){const at=row?.blocked_until?new Date(row.blocked_until):null;if(at&&!Number.isNaN(at.getTime())&&at.getTime()>Date.now()&&(!blockedUntil||at>blockedUntil))blockedUntil=at}
  if(blockedUntil)throw portalLoginRateError(blockedUntil);
  return {pairExists:(rows||[]).some(row=>text(row?.key)===keys.pairKey)};
}
async function recordPortalLoginFailure(sql,key,limit){
  const now=Date.now(),nowIso=new Date(now).toISOString(),cutoffIso=new Date(now-PORTAL_LOGIN_WINDOW_MS).toISOString(),blockIso=new Date(now+PORTAL_LOGIN_BLOCK_MS).toISOString();
  const rows=await sql`INSERT INTO pp_portal_login_rate (key,failures,window_started_at,blocked_until,updated_at)
    VALUES (${key},1,${nowIso},NULL,${nowIso})
    ON CONFLICT (key) DO UPDATE SET
      failures=CASE WHEN pp_portal_login_rate.window_started_at<${cutoffIso} THEN 1 ELSE pp_portal_login_rate.failures+1 END,
      window_started_at=CASE WHEN pp_portal_login_rate.window_started_at<${cutoffIso} THEN ${nowIso} ELSE pp_portal_login_rate.window_started_at END,
      blocked_until=CASE
        WHEN pp_portal_login_rate.blocked_until>${nowIso} THEN pp_portal_login_rate.blocked_until
        WHEN pp_portal_login_rate.window_started_at<${cutoffIso} THEN NULL
        WHEN pp_portal_login_rate.failures+1>=${Number(limit)} THEN ${blockIso}
        ELSE NULL
      END,
      updated_at=${nowIso}
    RETURNING failures,blocked_until`;
  return rows?.[0]||null;
}
async function registerPortalLoginFailure(sql,keys){
  const pair=await recordPortalLoginFailure(sql,keys.pairKey,PORTAL_LOGIN_PAIR_LIMIT),ip=keys.ipKey?await recordPortalLoginFailure(sql,keys.ipKey,PORTAL_LOGIN_IP_LIMIT):null;
  try{await sql`DELETE FROM pp_portal_login_rate WHERE updated_at<now()-interval '2 days'`}catch{}
  let blockedUntil=null;for(const row of [pair,ip]){const at=row?.blocked_until?new Date(row.blocked_until):null;if(at&&!Number.isNaN(at.getTime())&&at.getTime()>Date.now()&&(!blockedUntil||at>blockedUntil))blockedUntil=at}
  if(blockedUntil)throw portalLoginRateError(blockedUntil);
}
async function preparePortalLoginRate(request,env,path){
  if(path!==PORTAL_LOGIN_PATH||request.method!=='POST'||!env?.DATABASE_URL)return null;
  const origin=text(request.headers.get('origin'));if(origin&&!CLIENT_ORIGINS.has(origin))return null;
  let body={};try{body=await request.clone().json()}catch{return null};if(text(body?.action)!=='login')return null;
  const sql=neon(env.DATABASE_URL),keys=await portalLoginRateKeys(request,env,body?.data||{}),check=await checkPortalLoginRate(sql,keys);return {sql,keys,...check};
}
async function finishPortalLoginRate(request,response,rate,ctx){
  if(!rate)return response;
  if(response?.ok){
    if(rate.pairExists){
      const cleanup=async()=>{try{await rate.sql`DELETE FROM pp_portal_login_rate WHERE key=${rate.keys.pairKey}`}catch(error){console.error('Provedor Plus: não foi possível limpar a contagem de login válido.',error)}};
      if(typeof ctx?.waitUntil==='function')ctx.waitUntil(cleanup());else await cleanup();
    }
    return response;
  }
  if(![400,404].includes(Number(response?.status)))return response;
  try{await registerPortalLoginFailure(rate.sql,rate.keys);return response}catch(error){if(Number(error?.statusCode)===429)return portalLoginRateResponse(request,error);console.error('Provedor Plus: não foi possível registrar a tentativa de login.',error);return response}
}

async function paymentPriorityAction(request,path){
  if(path!=='/api/customer-portal'||request.method!=='POST'||new URL(request.url).searchParams.get('mp_webhook')==='1')return '';
  let body={};try{body=await request.clone().json()}catch{return ''}
  const action=text(body?.action);return ['payment-pix','payment-card','payment-status'].includes(action)?action:'';
}
async function stateMutationRequest(request,path){
  if(request.method!=='POST')return false;
  if(path==='/api/customer-portal'&&new URL(request.url).searchParams.get('mp_webhook')==='1')return true;
  let body={};try{body=await request.clone().json()}catch{return false}
  const action=text(body?.action);
  if(path==='/api/cloud-state')return action==='state.save';
  if(path==='/api/cloud-data')return action==='cashback.wallet.adjust'||action==='negotiation.support.create'||action==='billing.run';
  if(path==='/api/bank-settings')return action==='save-default';
  if(path==='/api/customer-trust-release')return action==='release';
  if(path==='/api/customer-due-date')return action==='change';
  if(path==='/api/customer-portal')return new Set(['login','refresh','payment-config','payment-prepare','negotiate','payment-pix','payment-card','payment-status']).has(action);
  return false;
}
async function acquireStateWriteLock(env,maxWaitMs=20000){
  if(!env?.DATABASE_URL)return null;
  const totalWaitMs=Math.max(1000,Number(maxWaitMs)||20000),sql=neon(env.DATABASE_URL),token=crypto.randomUUID(),deadline=Date.now()+totalWaitMs;
  while(Date.now()<deadline){
    const expiresAt=new Date(Date.now()+STATE_WRITE_LOCK_TTL_MS).toISOString(),raw=JSON.stringify({token,expires_at:expiresAt});
    const rows=await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${STATE_WRITE_LOCK_KEY},${raw}::jsonb,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at WHERE COALESCE(NULLIF(pp_settings.value->>'expires_at','')::timestamptz,to_timestamp(0))<=now() RETURNING value`;
    if(text(rows?.[0]?.value?.token)===token){
      let stopped=false,renewTimer=null;
      const renew=async()=>{
        if(stopped)return;
        try{const nextExpiry=new Date(Date.now()+STATE_WRITE_LOCK_TTL_MS).toISOString(),nextRaw=JSON.stringify({token,expires_at:nextExpiry});await sql`UPDATE pp_settings SET value=${nextRaw}::jsonb,updated_at=now() WHERE key=${STATE_WRITE_LOCK_KEY} AND value->>'token'=${token}`}catch(error){console.error('Provedor Plus: não foi possível renovar a trava de estado.',error)}
        if(!stopped)renewTimer=setTimeout(renew,20000);
      };
      renewTimer=setTimeout(renew,20000);
      return async()=>{stopped=true;if(renewTimer)clearTimeout(renewTimer);try{await sql`DELETE FROM pp_settings WHERE key=${STATE_WRITE_LOCK_KEY} AND value->>'token'=${token}`}catch(error){console.error('Provedor Plus: não foi possível liberar a trava de estado.',error)}};
    }
    const remaining=deadline-Date.now();
    if(remaining>0)await wait(Math.min(250,remaining));
  }
  throw Object.assign(new Error('O Provedor Plus está concluindo outra atualização de dados. Tente novamente em alguns segundos.'),{statusCode:409});
}
async function withStateWriteLock(env,fn,maxWaitMs=20000){
  const release=await acquireStateWriteLock(env,maxWaitMs);
  try{return await fn()}finally{if(release)await release()}
}
function stateLockErrorResponse(request,error){
  const origin=text(request.headers.get('origin')),headers=CLIENT_ORIGINS.has(origin)?clientCors(request):{};
  return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||503,headers);
}

async function ensureTables(db){
  if(schemaReady)return;
  if(!db)throw Object.assign(new Error('Banco D1 das notificações não configurado.'),{statusCode:503});
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_notification_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      source_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      click_url TEXT NULL,
      read_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (client_id,source_key)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_notification_inbox_client_created_idx ON pp_notification_inbox (client_id,created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_notification_inbox_unread_idx ON pp_notification_inbox (client_id,read_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_notification_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_mode TEXT NOT NULL DEFAULT 'client',
      target_client_id INTEGER NULL,
      target_identifier TEXT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      click_url TEXT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_by_name TEXT NULL,
      last_error TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT NULL,
      canceled_at TEXT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_notification_schedules_due_idx ON pp_notification_schedules (status,scheduled_for)')
  ]);
  schemaReady=true;
}

async function requireAdmin(request,env,ctx){
  const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
  const probe=new Request(new URL('/api/auth',request.url),{method:'POST',headers,body:JSON.stringify({action:'status'})});
  const response=await baseWorker.fetch(probe,env,ctx);let body={};try{body=await response.json()}catch{}
  const user=body?.data?.user;
  if(!response.ok||!body?.ok||body?.data?.authenticated!==true)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});
  if(text(user?.role).toLowerCase()!=='admin')throw Object.assign(new Error('Somente o administrador pode gerenciar notificações.'),{statusCode:403});
  return user||{};
}

async function portalKey(env){const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);if(!secret)throw Object.assign(new Error('Sessão segura do portal não configurada.'),{statusCode:503});return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function portalServiceSession(env,clientId){const payload=base64Url(enc.encode(JSON.stringify({clientId:Number(clientId),exp:Date.now()+5*60*1000}))),key=await portalKey(env),signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(payload)));return `${payload}.${base64Url(signature)}`}
async function verifySession(token,env){
  const parts=text(token).split('.');if(parts.length!==2)throw Object.assign(new Error('Sessão do cliente inválida. Entre novamente.'),{statusCode:401});
  try{const key=await portalKey(env),ok=await crypto.subtle.verify('HMAC',key,base64UrlBytes(parts[1]),enc.encode(parts[0]));if(!ok)throw new Error('assinatura');const payload=JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[0]))),clientId=Number(payload?.clientId)||0,exp=Number(payload?.exp)||0;if(!clientId||exp<=Date.now())throw new Error('expirada');return {clientId}}catch{throw Object.assign(new Error('Sessão do cliente expirada ou inválida. Entre novamente.'),{statusCode:401})}
}
async function reconcilePendingPayments(env){
  if(!env?.DATABASE_URL)return {checked:0,confirmed:0,failed:0};
  const sql=neon(env.DATABASE_URL),state=await loadState(sql,env),candidates=(Array.isArray(state?.invoices)?state.invoices:[]).filter(row=>{
    if(!invoiceOpen(row))return false;
    const provider=text(row?.bank_provider).toLowerCase(),detail=normalize(row?.bank_status_detail),paymentId=text(row?.bank_payment_id||row?.bank_charge_id);
    return paymentId&&detail.includes('pix')&&(provider==='mercadopago'||provider==='efi');
  }).sort((a,b)=>text(a?.bank_last_sync_at).localeCompare(text(b?.bank_last_sync_at))).slice(0,1);
  let checked=0,confirmed=0,failed=0;
  for(const invoice of candidates){
    const clientId=Number(invoice?.client_id)||0,paymentId=text(invoice?.bank_payment_id||invoice?.bank_charge_id);if(!clientId||!paymentId)continue;
    try{
      const session=await portalServiceSession(env,clientId),request=new Request('https://painel.fibramais.workers.dev/api/customer-portal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'payment-status',data:{session,invoiceId:invoice.id,paymentId}})}),response=await baseWorker.fetch(request,env,{});let body={};try{body=await response.json()}catch{}
      checked++;if(!response.ok||!body?.ok){failed++;continue}const status=normalize(body?.data?.status),current=normalize(body?.data?.state);if(['approved','paid','pago','baixado'].includes(status)||paidStatus(current))confirmed++;
    }catch(error){failed++;console.error(`Provedor Plus: falha ao conciliar automaticamente a fatura ${text(invoice?.id)}.`,error)}
  }
  return {checked,confirmed,failed};
}
async function tryBackgroundStateLock(env,fn,label){
  if(await paymentPriorityActive(env))return null;
  try{return await withStateWriteLock(env,async()=>{if(await paymentPriorityActive(env))return null;return fn()},1000)}catch(error){if(Number(error?.statusCode)===409)return null;console.error(label,error);return null}
}
async function runScheduledStateMaintenance(env,scheduledAt){
  if(dueEvery(scheduledAt,PAYMENT_RECONCILIATION_INTERVAL_MINUTES)){
    await tryBackgroundStateLock(env,async()=>{try{await syncPrimarySnapshotsD1ToNeon(env,{invoices:true,financial:true});await reconcilePendingPayments(env);await mirrorInvoicesSnapshotToD1(env);await mirrorFinancialSnapshotToD1(env)}catch(error){console.error('Provedor Plus: falha na conciliação automática de pagamentos pendentes.',error)}},'Provedor Plus: conciliação automática não pôde obter a trava de estado.');
  }
  if(!dueEvery(scheduledAt,BILLING_INTERVAL_MINUTES))return;
  await tryBackgroundStateLock(env,async()=>{await syncPrimarySnapshotsD1ToNeon(env,{invoices:true,financial:true});await runBillingCron(env);await mirrorFinancialSnapshotToD1(env)},'Provedor Plus: geração automática de mensalidades aguardará a próxima checagem.');
}

async function pushCryptoKey(env){const secret=text(env.BANK_SECRET_KEY)||text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);if(!secret)throw new Error('Chave de proteção das notificações não configurada.');const raw=await crypto.subtle.digest('SHA-256',enc.encode(`provedor-plus-push-v1|${secret}`));return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt'])}
async function readVapid(env,sql){const rows=await sql`SELECT value FROM pp_settings WHERE key=${VAPID_KEY} LIMIT 1`,record=rows?.[0]?.value;if(!record?.iv||!record?.data)return null;const key=await pushCryptoKey(env),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64UrlBytes(record.iv)},key,base64UrlBytes(record.data));return JSON.parse(new TextDecoder().decode(plain))}

async function sendOne(db,row,vapid,payload){
  try{
    const built=await buildPushHTTPRequest({privateJWK:vapid.privateJWK,subscription:{endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},message:{payload,adminContact:vapid.subject||'mailto:adrianomoreirausuarios@gmail.com',options:{ttl:86400,urgency:'normal',topic:text(payload.tag).replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)||'fibra-plus'}}});
    const response=await fetch(built.endpoint,{method:'POST',headers:built.headers,body:built.body,redirect:'manual'}),now=new Date().toISOString();
    if(response.ok){await db.prepare('UPDATE pp_push_subscriptions SET active=1,last_success_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(now,now,Number(row.id)).run();return {ok:true}}
    const error=`Push HTTP ${response.status}`;if(response.status===404||response.status===410)await db.prepare('UPDATE pp_push_subscriptions SET active=0,last_error=?,updated_at=? WHERE id=?').bind(error,now,Number(row.id)).run();else await db.prepare('UPDATE pp_push_subscriptions SET last_error=?,updated_at=? WHERE id=?').bind(error,now,Number(row.id)).run();return {ok:false,error};
  }catch(error){const message=error instanceof Error?error.message:String(error),now=new Date().toISOString();try{await db.prepare('UPDATE pp_push_subscriptions SET last_error=?,updated_at=? WHERE id=?').bind(message.slice(0,500),now,Number(row.id)).run()}catch{}return {ok:false,error:message}}
}
async function sendRows(db,rows,vapid,payload){let sent=0,failed=0;for(let start=0;start<rows.length;start+=10){const results=await Promise.all(rows.slice(start,start+10).map(row=>sendOne(db,row,vapid,payload)));for(const result of results)result.ok?sent++:failed++}return {sent,failed,total:rows.length}}

function localClient(state,clientId){return (Array.isArray(state?.clients)?state.clients:[]).find(row=>Number(row?.id)===Number(clientId))||{}}
function planName(state,client,local){const direct=text(client?.plan||local?.plan);if(direct)return direct;const id=Number(client?.plan_id||local?.plan_id)||0,plan=(Array.isArray(state?.plans)?state.plans:[]).find(row=>id&&Number(row?.id)===id);return text(plan?.name)||'não disponível'}
function nextInvoice(state,clientId){return (Array.isArray(state?.invoices)?state.invoices:[]).filter(row=>Number(row?.client_id)===Number(clientId)&&invoiceOpen(row)&&row?.bank_issue_deferred!==true).sort((a,b)=>text(a?.due_date||a?.dueDate).localeCompare(text(b?.due_date||b?.dueDate)))[0]||null}
function cashbackBalance(local){const cents=Number(local?.cashback_balance_cents);if(Number.isFinite(cents))return Math.max(0,Math.round(cents));const amount=Number(local?.cashback_balance);return Number.isFinite(amount)?Math.max(0,Math.round(amount*100)):0}
function variableContext(state,client){
  const local=localClient(state,client.id),invoice=nextInvoice(state,client.id),amount=invoice?invoiceCents(invoice):null,due=invoice?text(invoice?.due_date||invoice?.dueDate).slice(0,10):'';
  return {
    nome:text(client?.name||local?.name)||'Cliente',
    valor:amount!==null?brl(amount):'não disponível',
    vencimento:due?brDate(due):'não disponível',
    plano:planName(state,client,local),
    contrato:text(client?.contract_number||local?.contract_number||local?.contract)||'não disponível',
    cashback:brl(cashbackBalance(local))
  };
}
function renderVariables(value,context){return text(value).replace(/\{(nome|valor|vencimento|plano|contrato|cashback)\}/gi,(_,key)=>context[String(key).toLowerCase()]??'')}

async function resolveClient(sql,identifier){const raw=text(identifier),doc=digits(raw);if(!raw&&!doc)return null;const rows=await sql`SELECT id,name,contract_number,document,plan,plan_id,due_day FROM pp_clients WHERE contract_number=${raw} OR regexp_replace(COALESCE(contract_number,''),'[^0-9]','','g')=${doc} OR regexp_replace(COALESCE(document,''),'[^0-9]','','g')=${doc} ORDER BY id ASC LIMIT 1`;return rows?.[0]||null}
async function clientById(sql,id){const rows=await sql`SELECT id,name,contract_number,document,plan,plan_id,due_day FROM pp_clients WHERE id=${Number(id)} LIMIT 1`;return rows?.[0]||null}
async function allAuthorizedClients(sql,db){
  const authorized=await d1Rows(db.prepare('SELECT DISTINCT client_id FROM pp_push_subscriptions WHERE active=1 ORDER BY client_id ASC')),ids=new Set(authorized.map(row=>Number(row?.client_id)).filter(Boolean));if(!ids.size)return [];
  const rows=await sql`SELECT id,name,contract_number,document,plan,plan_id,due_day FROM pp_clients ORDER BY id ASC`;
  return (rows||[]).filter(row=>ids.has(Number(row?.id)));
}
async function subscriptionsFor(db,clientId){return d1Rows(db.prepare('SELECT id,client_id,endpoint,p256dh,auth FROM pp_push_subscriptions WHERE client_id=? AND active=1 ORDER BY id ASC').bind(Number(clientId)))}
async function recordInbox(db,clientId,sourceKey,title,body,clickUrl,createdAt=null){
  if(!clientId||!sourceKey||!title||!body)return;
  await ensureTables(db);
  const at=createdAt||new Date().toISOString();
  await db.prepare('INSERT INTO pp_notification_inbox (client_id,source_key,title,body,click_url,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(client_id,source_key) DO NOTHING').bind(Number(clientId),text(sourceKey).slice(0,180),text(title).slice(0,90),text(body).slice(0,500),normalizeClickUrl(clickUrl),at).run();
}

async function syncInboxFromMessages(env,db){
  if(!env?.PROVEDOR_DB)return 0;
  await ensureTables(db);
  const threshold=new Date(Date.now()-30*86400000).toISOString(),result=await db.prepare(`INSERT OR IGNORE INTO pp_notification_inbox (client_id,source_key,title,body,click_url,created_at)
    SELECT target_client_id,'message:'||CAST(id AS TEXT),substr(title,1,90),substr(body,1,500),click_url,created_at
    FROM pp_push_messages
    WHERE target_client_id IS NOT NULL AND datetime(created_at)>=datetime(?)
    ORDER BY id ASC LIMIT 200`).bind(threshold).run();
  return Number(result?.meta?.changes)||0;
}

async function deliver(db,sql,env,{mode='client',identifier='',clientId=null,title,body,url='/',createdBy='Administrador',source='manual'}){
  await ensureTables(db);
  const templateTitle=text(title).slice(0,90),templateBody=text(body).slice(0,500),clickUrl=normalizeClickUrl(url);
  if(!templateTitle||!templateBody)throw Object.assign(new Error('Informe o título e a mensagem da notificação.'),{statusCode:400});
  let clients=[],targetClient=null;
  if(mode==='all')clients=await allAuthorizedClients(sql,db);
  else{
    targetClient=clientId?await clientById(sql,clientId):await resolveClient(sql,identifier);
    if(!targetClient)throw Object.assign(new Error('Cliente não encontrado pelo CPF/CNPJ ou contrato informado.'),{statusCode:404});
    clients=[targetClient];
  }
  if(!clients.length)throw Object.assign(new Error(mode==='all'?'Nenhum dispositivo autorizou notificações ainda.':'Cliente não encontrado.'),{statusCode:409});
  const state=await loadState(sql,env),vapid=await readVapid(env,sql);
  if(!vapid?.privateJWK)throw Object.assign(new Error('As chaves de notificação não estão disponíveis.'),{statusCode:503});
  const deliveryKey=`${source}:${crypto.randomUUID()}`,perClient=[];let sent=0,failed=0,total=0;
  for(const client of clients){
    const context=variableContext(state,client),renderedTitle=renderVariables(templateTitle,context).slice(0,90),renderedBody=renderVariables(templateBody,context).slice(0,500),subscriptions=await subscriptionsFor(db,client.id),payload=notificationPayload(renderedTitle,renderedBody,clickUrl,`fibra-${crypto.randomUUID().replace(/-/g,'').slice(0,18)}`),result=subscriptions.length?await sendRows(db,subscriptions,vapid,payload):{sent:0,failed:0,total:0};
    sent+=result.sent;failed+=result.failed;total+=result.total;perClient.push({client,renderedTitle,renderedBody,result});
  }
  if(mode==='client'&&total===0&&source==='manual')throw Object.assign(new Error('Este cliente ainda não autorizou notificações em nenhum dispositivo.'),{statusCode:409});
  const createdAt=new Date().toISOString(),history=await db.prepare('INSERT INTO pp_push_messages (target_client_id,target_mode,title,body,click_url,sent_count,failed_count,created_by_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(mode==='client'?Number(targetClient.id):null,mode,templateTitle,templateBody,clickUrl,sent,failed,text(createdBy).slice(0,160)||'Administrador',createdAt).run(),historyId=Number(history?.meta?.last_row_id)||0;
  for(const item of perClient){const key=historyId?`message:${historyId}${mode==='all'?`:${item.client.id}`:''}`:`${deliveryKey}:${item.client.id}`;await recordInbox(db,item.client.id,key,item.renderedTitle,item.renderedBody,clickUrl,createdAt)}
  return {sent,failed,total,clients:perClient.length,targetClient:targetClient?{id:Number(targetClient.id),name:text(targetClient.name),contract:text(targetClient.contract_number)}:null};
}

async function listSchedules(db){
  await ensureTables(db);
  const threshold=new Date(Date.now()-90*86400000).toISOString();
  return d1Rows(db.prepare('SELECT id,target_mode,target_client_id,target_identifier,title,body,click_url,scheduled_for,status,sent_count,failed_count,created_by_name,last_error,created_at,sent_at,canceled_at FROM pp_notification_schedules WHERE datetime(created_at)>=datetime(?) ORDER BY scheduled_for DESC LIMIT 60').bind(threshold));
}

async function createSchedule(request,env,ctx,data){
  const user=await requireAdmin(request,env,ctx);if(!env?.DATABASE_URL||!env?.PROVEDOR_DB)throw Object.assign(new Error('Conexão com o Provedor Plus não configurada.'),{statusCode:503});const sql=neon(env.DATABASE_URL),db=env.PROVEDOR_DB;await ensureTables(db);
  const mode=data?.mode==='all'?'all':'client',title=text(data?.title).slice(0,90),body=text(data?.body).slice(0,500),url=normalizeClickUrl(data?.url),identifier=text(data?.identifier).slice(0,120),when=new Date(data?.scheduledFor),now=Date.now();
  if(!title||!body)throw Object.assign(new Error('Informe o título e a mensagem da notificação.'),{statusCode:400});
  if(Number.isNaN(when.getTime())||when.getTime()<now+15000)throw Object.assign(new Error('Escolha uma data e hora futura para o agendamento.'),{statusCode:400});
  if(when.getTime()>now+366*86400000)throw Object.assign(new Error('O agendamento pode ser feito para até 1 ano.'),{statusCode:400});
  let targetClient=null;
  if(mode==='client'){targetClient=await resolveClient(sql,identifier);if(!targetClient)throw Object.assign(new Error('Cliente não encontrado pelo CPF/CNPJ ou contrato informado.'),{statusCode:404})}
  const createdAt=new Date().toISOString(),inserted=await db.prepare('INSERT INTO pp_notification_schedules (target_mode,target_client_id,target_identifier,title,body,click_url,scheduled_for,status,created_by_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(mode,targetClient?Number(targetClient.id):null,mode==='client'?identifier:null,title,body,url,when.toISOString(),'pending',text(user?.name)||'Administrador',createdAt).run(),id=Number(inserted?.meta?.last_row_id)||0,schedule=id?(await d1Rows(db.prepare('SELECT * FROM pp_notification_schedules WHERE id=? LIMIT 1').bind(id)))?.[0]||null:null;
  return {schedule,schedules:await listSchedules(db)};
}

async function cancelSchedule(request,env,ctx,data){
  await requireAdmin(request,env,ctx);if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 das notificações não configurado.'),{statusCode:503});const db=env.PROVEDOR_DB;await ensureTables(db);const id=Number(data?.id)||0;if(!id)throw Object.assign(new Error('Agendamento inválido.'),{statusCode:400});
  const result=await db.prepare("UPDATE pp_notification_schedules SET status='canceled',canceled_at=? WHERE id=? AND status='pending'").bind(new Date().toISOString(),id).run();
  if(!(Number(result?.meta?.changes)||0))throw Object.assign(new Error('Este agendamento não está mais pendente.'),{statusCode:409});
  return {schedules:await listSchedules(db)};
}

async function processDueSchedules(env){
  if(!env?.DATABASE_URL||!env?.PROVEDOR_DB)return {processed:0,sent:0,failed:0};
  const sql=neon(env.DATABASE_URL),db=env.PROVEDOR_DB;await ensureTables(db);const now=new Date().toISOString(),rows=await d1Rows(db.prepare("SELECT * FROM pp_notification_schedules WHERE status='pending' AND datetime(scheduled_for)<=datetime(?) ORDER BY scheduled_for ASC LIMIT 20").bind(now));
  let processed=0,sent=0,failed=0;
  for(const row of rows||[]){
    const claimed=await db.prepare("UPDATE pp_notification_schedules SET status='sending' WHERE id=? AND status='pending'").bind(Number(row.id)).run();if(!(Number(claimed?.meta?.changes)||0))continue;processed++;
    try{
      const result=await deliver(db,sql,env,{mode:row.target_mode==='all'?'all':'client',clientId:row.target_client_id,title:row.title,body:row.body,url:row.click_url,createdBy:`Agendado · ${text(row.created_by_name)||'Administrador'}`,source:`schedule-${row.id}`});
      sent+=Number(result.sent)||0;failed+=Number(result.failed)||0;
      const noDevice=row.target_mode!=='all'&&Number(result.total)===0;
      await db.prepare('UPDATE pp_notification_schedules SET status=?,sent_count=?,failed_count=?,sent_at=?,last_error=? WHERE id=?').bind(noDevice?'failed':'sent',Number(result.sent)||0,Number(result.failed)||(noDevice?1:0),new Date().toISOString(),noDevice?'Cliente sem dispositivo autorizado no horário do envio.':null,Number(row.id)).run();
    }catch(error){failed++;await db.prepare("UPDATE pp_notification_schedules SET status='failed',failed_count=failed_count+1,last_error=?,sent_at=? WHERE id=?").bind(text(error instanceof Error?error.message:error).slice(0,500),new Date().toISOString(),Number(row.id)).run()}
  }
  return {processed,sent,failed};
}

async function handleInbox(request,env,data,cors){
  if(!env.DATABASE_URL||!env.PROVEDOR_DB)throw Object.assign(new Error('Conexão com o Provedor Plus não configurada.'),{statusCode:503});
  const session=await verifySession(data?.session,env),db=env.PROVEDOR_DB;await ensureTables(db);
  const action=text(data?._action);
  if(action==='inbox'){
    await syncInboxFromMessages(env,db);
    const items=await d1Rows(db.prepare('SELECT id,title,body,click_url,read_at,created_at FROM pp_notification_inbox WHERE client_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(session.clientId)),count=await d1Rows(db.prepare('SELECT COUNT(*) AS unread FROM pp_notification_inbox WHERE client_id=? AND read_at IS NULL').bind(session.clientId));
    return json({ok:true,data:{items:(items||[]).map(row=>({id:Number(row.id),title:text(row.title),body:text(row.body),clickUrl:text(row.click_url),readAt:row.read_at,createdAt:row.created_at})),unread:Number(count?.[0]?.unread)||0}},200,cors);
  }
  if(action==='read'){
    const id=Number(data?.id)||0;if(!id)throw Object.assign(new Error('Notificação inválida.'),{statusCode:400});
    await db.prepare('UPDATE pp_notification_inbox SET read_at=COALESCE(read_at,?) WHERE id=? AND client_id=?').bind(new Date().toISOString(),id,session.clientId).run();
    const count=await d1Rows(db.prepare('SELECT COUNT(*) AS unread FROM pp_notification_inbox WHERE client_id=? AND read_at IS NULL').bind(session.clientId));
    return json({ok:true,data:{unread:Number(count?.[0]?.unread)||0}},200,cors);
  }
  if(action==='read-all'){
    await db.prepare('UPDATE pp_notification_inbox SET read_at=COALESCE(read_at,?) WHERE client_id=? AND read_at IS NULL').bind(new Date().toISOString(),session.clientId).run();
    return json({ok:true,data:{unread:0}},200,cors);
  }
  throw Object.assign(new Error('Ação da caixa de notificações não permitida.'),{statusCode:400});
}

async function handleCustomerPush(request,env){
  const cors=clientCors(request);if(request.method==='OPTIONS')return null;if(request.method!=='POST')return null;
  const origin=text(request.headers.get('origin'));if(!CLIENT_ORIGINS.has(origin))return null;
  let body={};try{body=await request.clone().json()}catch{return null}
  const action=text(body?.action);if(!['inbox','read','read-all'].includes(action))return null;
  try{return await handleInbox(request,env,{...(body?.data||{}),_action:action},cors)}catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,cors)}
}

async function handleAdminSend(request,env,ctx){
  if(request.method!=='POST')return null;let body={};try{body=await request.clone().json()}catch{return null};if(text(body?.action)!=='send')return null;
  try{
    const user=await requireAdmin(request,env,ctx);if(!env.DATABASE_URL||!env.PROVEDOR_DB)throw Object.assign(new Error('Conexão com o Provedor Plus não configurada.'),{statusCode:503});
    const sql=neon(env.DATABASE_URL),db=env.PROVEDOR_DB,data=body?.data||{},result=await deliver(db,sql,env,{mode:data?.mode==='all'?'all':'client',identifier:data?.identifier,title:data?.title,body:data?.body,url:data?.url,createdBy:text(user?.name)||'Administrador',source:'manual'});
    return json({ok:true,data:result});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500)}
}

async function handleOperations(request,env,ctx){
  if(request.method!=='POST')return null;let body={};try{body=await request.clone().json()}catch{return null};const action=text(body?.action),data=body?.data||{};
  if(action==='schedule-notification'){
    try{return json({ok:true,data:await createSchedule(request,env,ctx,data)})}catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500)}
  }
  if(action==='cancel-schedule'){
    try{return json({ok:true,data:await cancelSchedule(request,env,ctx,data)})}catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500)}
  }
  if(action==='get'){
    const response=await baseWorker.fetch(request,env,ctx);if(!response?.ok||!env?.PROVEDOR_DB)return response;let parsed={};try{parsed=await response.clone().json()}catch{return response};if(!parsed?.ok)return response;
    try{const db=env.PROVEDOR_DB;await ensureTables(db);parsed.data={...(parsed.data||{}),variables:VARIABLE_NAMES,schedules:await listSchedules(db)};const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store, max-age=0');return new Response(JSON.stringify(parsed),{status:response.status,headers})}catch{return response}
  }
  return null;
}

export default {
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(path===CLIENT_PUSH_PATH){const response=await handleCustomerPush(request,env);if(response)return response}
    if(path===ADMIN_PUSH_PATH){const response=await handleAdminSend(request,env,ctx);if(response)return response}
    if(path===OPS_PATH){const response=await handleOperations(request,env,ctx);if(response)return response}
    if(path==='/api/bank-settings'){const service=await handleBankServiceAction(request,env,ctx);if(service)return service}
    let portalLoginRate=null,priorityStop=null;
    try{portalLoginRate=await preparePortalLoginRate(request,env,path)}catch(error){if(Number(error?.statusCode)===429)return portalLoginRateResponse(request,error);console.error('Provedor Plus: proteção de tentativas do login não pôde ser preparada.',error)}
    try{
      const priorityAction=await paymentPriorityAction(request,path),readAction=await invoiceReadAction(request,path),invoiceWorkingCopy=await invoiceWorkingCopyRequest(request,path),financialWorkingCopy=await financialWorkingCopyRequest(request,path),mutation=await stateMutationRequest(request,path);if(priorityAction)priorityStop=await beginPaymentPriority(env);
      const forward=async()=>{if(mutation||invoiceWorkingCopy||financialWorkingCopy)await syncPrimarySnapshotsD1ToNeon(env,{invoices:mutation||invoiceWorkingCopy,financial:mutation||financialWorkingCopy});let response=await baseWorker.fetch(request,env,ctx);if(portalLoginRate)response=await finishPortalLoginRate(request,response,portalLoginRate,ctx);if(path==='/api/bank-settings')response=await sanitizeBankResponse(response);return overlayInvoicesFromD1(response,env,path,readAction)};
      if(mutation){
        const response=await withStateWriteLock(env,forward,priorityAction?60000:20000);
        if(response?.ok&&env?.PROVEDOR_DB){
          try{await mirrorInvoicesSnapshotToD1(env)}catch(error){console.error('Provedor Plus: falha ao confirmar alteração de faturas no D1; cópia Neon preservada para recuperação.',error)}
          try{await mirrorFinancialSnapshotToD1(env)}catch(error){console.error('Provedor Plus: falha ao confirmar cashback e negociações no D1; cópia Neon preservada para recuperação.',error)}
          const clientsTask=mirrorRecentClientsToD1(env).catch(error=>console.error('Provedor Plus: falha ao espelhar alterações recentes de clientes no D1.',error));if(typeof ctx?.waitUntil==='function')ctx.waitUntil(clientsTask);else await clientsTask;
        }
        return response;
      }
      return forward();
    }catch(error){return stateLockErrorResponse(request,error)}finally{if(priorityStop)await priorityStop()}
  },
  async scheduled(controller,env,ctx){
    const cron=text(controller?.cron);
    if(cron===ECONOMY_CRON){
      if(env?.DATABASE_URL&&typeof ctx?.waitUntil==='function'){
        const scheduledAt=Number(controller?.scheduledTime)||Date.now();
        if(dueEvery(scheduledAt,NOTIFICATION_SCHEDULE_INTERVAL_MINUTES)&&env?.PROVEDOR_DB)ctx.waitUntil(processDueSchedules(env).catch(error=>console.error('Provedor Plus: falha nos agendamentos de notificações.',error)));
        if(dueEvery(scheduledAt,TRAFFIC_COLLECTION_INTERVAL_MINUTES))ctx.waitUntil(collectCustomerTraffic(env).catch(error=>console.error('Provedor Plus: falha na coleta automática do consumo PPPoE.',error)));
        if(dueEvery(scheduledAt,PAYMENT_RECONCILIATION_INTERVAL_MINUTES))ctx.waitUntil(runScheduledStateMaintenance(env,scheduledAt).catch(error=>console.error('Provedor Plus: falha na manutenção automática de pagamentos e mensalidades.',error)));
        if(env?.PROVEDOR_DB)ctx.waitUntil(mirrorRecentClientsToD1(env).catch(error=>console.error('Provedor Plus: falha ao sincronizar clientes recentes com o D1.',error)));
      }
      return;
    }
    if(!(await paymentPriorityActive(env))){
      try{
        await withStateWriteLock(env,async()=>{
          if(await paymentPriorityActive(env))return;
          await syncPrimarySnapshotsD1ToNeon(env,{invoices:true,financial:true});
          const result=baseWorker.scheduled(controller,env,ctx);
          if(result&&typeof result.then==='function')await result;
          if(env?.PROVEDOR_DB){try{await mirrorInvoicesSnapshotToD1(env)}catch(error){console.error('Provedor Plus: falha ao confirmar faturas da rotina agendada no D1.',error)}try{await mirrorFinancialSnapshotToD1(env)}catch(error){console.error('Provedor Plus: falha ao confirmar cashback e negociações da rotina agendada no D1.',error)}}
        },1000);
      }catch(error){if(Number(error?.statusCode)!==409)console.error('Provedor Plus: rotina agendada não pôde executar a gravação de estado.',error)}
    }
  }
};