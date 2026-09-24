import coreWorker from './negotiation-worker.js';
import {buildPushHTTPRequest} from '@pushforge/builder';

const CLIENT_PUSH_PATH='/api/customer-push';
const ADMIN_PUSH_PATH='/api/push-admin';
const VAPID_KEY='push_vapid_v1';
const VAPID_D1_KEY='push_vapid_d1_v1';
const STATE_KEY='web_state_v1017';
const CLIENT_ORIGINS=new Set(['https://cliente.fibramais.workers.dev','https://client.fibramais.workers.dev']);
const CLIENT_APP_ORIGIN='https://cliente.fibramais.workers.dev';
const AUTOMATIC_SCAN_PORTAL_ACTIONS=new Set(['payment-pix','payment-card','payment-status','negotiate']);
const DAY=86400000;
const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const enc=new TextEncoder();
let schemaReady=false;

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}})}
function clientCors(request){const origin=text(request.headers.get('origin')),headers={'Vary':'Origin','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};if(CLIENT_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;return headers}
function base64Url(bytes){const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let raw='';for(let i=0;i<view.length;i+=0x8000)raw+=String.fromCharCode(...view.subarray(i,Math.min(i+0x8000,view.length)));return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function base64UrlBytes(value){const raw=text(value).replace(/-/g,'+').replace(/_/g,'/'),padded=raw+'='.repeat((4-raw.length%4)%4),bin=atob(padded),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
function parseState(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}return {}}
async function loadState(env){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Estado D1 das notificações não está disponível.'),{statusCode:503});
  try{const rows=await d1Rows(env.PROVEDOR_DB.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(STATE_KEY)),row=rows?.[0];return parseState(row?.value)}catch(error){console.error('Provedor Plus: leitura D1 do estado para notificações falhou.',error);throw error}
}
function normalizeStatus(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function paidStatus(value){const status=normalizeStatus(value);return ['pago','paga','paid','baixado','recebido','recebida','quitado','quitada'].some(item=>status.includes(item))}
function inactiveStatus(value){const status=normalizeStatus(value);return ['cancelado','canceled','renegociado','renegotiated','substituido','substituida'].some(item=>status.includes(item))}
function invoiceOpen(invoice){return !paidStatus(invoice?.status)&&!inactiveStatus(invoice?.status)}
function invoiceCents(invoice){for(const key of ['amount_cents','total_cents','value_cents','price_cents']){const n=Number(invoice?.[key]);if(Number.isFinite(n))return Math.max(0,Math.round(n))}for(const key of ['amount','total','value','price']){const n=Number(invoice?.[key]);if(Number.isFinite(n))return Math.max(0,Math.round(n*100))}return 0}
function brl(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100)}
function brazilDateKey(date=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};for(const part of parts)map[part.type]=part.value;return `${map.year}-${map.month}-${map.day}`}
function dateFromKey(value){const match=text(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12)):null}
function addDaysKey(value,days){const date=dateFromKey(value);if(!date)return'';date.setUTCDate(date.getUTCDate()+Number(days||0));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`}
function brDate(value){const match=text(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}/${match[2]}/${match[1]}`:text(value)}
function recentTimestamp(value,hours=36){const time=new Date(value).getTime();return Number.isFinite(time)&&Date.now()-time>=0&&Date.now()-time<=hours*60*60*1000}
async function d1Rows(statement){const result=await statement.all();return Array.isArray(result?.results)?result.results:[]}

async function ensurePushTables(db){
  if(schemaReady)return;
  if(!db)throw Object.assign(new Error('Banco D1 das notificações não configurado.'),{statusCode:503});
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NULL,
      platform TEXT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_success_at TEXT NULL,
      last_error TEXT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_push_subscriptions_client_active_idx ON pp_push_subscriptions (client_id,active)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_push_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_client_id INTEGER NULL,
      target_mode TEXT NOT NULL DEFAULT 'client',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      click_url TEXT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_by_name TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_push_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      click_url TEXT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT NULL,
      sent_at TEXT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_push_events_client_created_idx ON pp_push_events (client_id,created_at DESC)')
  ]);
  schemaReady=true;
}

async function pushCryptoKey(env){
  const secret=text(env.BANK_SECRET_KEY)||text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);
  if(!secret)throw Object.assign(new Error('Chave de proteção das notificações não configurada.'),{statusCode:503});
  const raw=await crypto.subtle.digest('SHA-256',enc.encode(`provedor-plus-push-v1|${secret}`));
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptVapid(env,value){const key=await pushCryptoKey(env),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(value)));return {v:1,iv:base64Url(iv),data:base64Url(new Uint8Array(cipher))}}
async function decryptVapid(env,record){if(!record?.iv||!record?.data)throw new Error('Chaves push inválidas.');const key=await pushCryptoKey(env),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64UrlBytes(record.iv)},key,base64UrlBytes(record.data));return JSON.parse(new TextDecoder().decode(plain))}
async function readD1VapidRecord(db,key=VAPID_D1_KEY){
  if(!db)return null;const rows=await d1Rows(db.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(key)),row=rows?.[0];if(!row)return null;let value=row.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{return null};return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
}
async function saveD1VapidRecord(db,record){
  if(!db||!record)return false;const raw=JSON.stringify(record),now=new Date().toISOString();await db.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(VAPID_D1_KEY,raw,now).run();return true;
}
export async function vapidKeys(env,sql=null){
  const db=env?.PROVEDOR_DB||null;if(!db)throw Object.assign(new Error('Banco D1 das notificações não configurado.'),{statusCode:503});
  const d1Record=await readD1VapidRecord(db);if(d1Record)return decryptVapid(env,d1Record);
  const legacyRecord=await readD1VapidRecord(db,VAPID_KEY);
  if(legacyRecord){await saveD1VapidRecord(db,legacyRecord);const stored=await readD1VapidRecord(db);return decryptVapid(env,stored||legacyRecord)}
  const subscriptions=await d1Rows(db.prepare('SELECT COUNT(*) AS total FROM pp_push_subscriptions WHERE active=1'));if((Number(subscriptions?.[0]?.total)||0)>0)throw new Error('Chaves de notificação existentes não puderam ser recuperadas com segurança.');
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),privateJWK=await crypto.subtle.exportKey('jwk',pair.privateKey),publicRaw=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
  const created={publicKey:base64Url(publicRaw),privateJWK,subject:'mailto:adrianomoreirausuarios@gmail.com'},encrypted=await encryptVapid(env,created),raw=JSON.stringify(encrypted),now=new Date().toISOString();
  await db.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING').bind(VAPID_D1_KEY,raw,now).run();const stored=await readD1VapidRecord(db);if(!stored)throw new Error('Não foi possível preparar as chaves de notificação no D1.');return decryptVapid(env,stored);
}

async function portalKey(env){const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);if(!secret)throw Object.assign(new Error('Sessão segura do portal não configurada.'),{statusCode:503});return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])}
async function verifySession(token,env){
  const parts=text(token).split('.');if(parts.length!==2)throw Object.assign(new Error('Sessão do cliente inválida. Entre novamente.'),{statusCode:401});
  try{const key=await portalKey(env),ok=await crypto.subtle.verify('HMAC',key,base64UrlBytes(parts[1]),enc.encode(parts[0]));if(!ok)throw new Error('assinatura');const payload=JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[0]))),clientId=Number(payload?.clientId)||0,exp=Number(payload?.exp)||0;if(!clientId||exp<=Date.now())throw new Error('expirada');return {clientId}}catch{throw Object.assign(new Error('Sessão do cliente expirada ou inválida. Entre novamente.'),{statusCode:401})}}

function privateHost(host=''){const h=host.toLowerCase();if(!h||h==='localhost'||h==='::1'||h.endsWith('.local')||h.endsWith('.internal'))return true;if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return true;const match=h.match(/^172\.(\d+)\./);if(match&&Number(match[1])>=16&&Number(match[1])<=31)return true;if(/^(fc|fd|fe80)/i.test(h))return true;return false}
function normalizeSubscription(value){
  const endpoint=text(value?.endpoint),p256dh=text(value?.keys?.p256dh),auth=text(value?.keys?.auth);let parsed;
  try{parsed=new URL(endpoint)}catch{throw Object.assign(new Error('Assinatura de notificação inválida.'),{statusCode:400})}
  if(parsed.protocol!=='https:'||privateHost(parsed.hostname)||!p256dh||!auth||endpoint.length>3000||p256dh.length>500||auth.length>300)throw Object.assign(new Error('Assinatura de notificação inválida.'),{statusCode:400});
  return {endpoint,p256dh,auth};
}
function normalizeClickUrl(value=''){const raw=text(value);if(!raw)return `${CLIENT_APP_ORIGIN}/`;if(raw.startsWith('/'))return `${CLIENT_APP_ORIGIN}${raw}`;try{const url=new URL(raw);return CLIENT_ORIGINS.has(url.origin)?url.toString():`${CLIENT_APP_ORIGIN}/`}catch{return `${CLIENT_APP_ORIGIN}/`}}
function notificationPayload(title,body,url,tag='fibra-plus'){return {title:text(title)||'Fibra+',body:text(body),icon:`${CLIENT_APP_ORIGIN}/icons/fibra-app-192.png?v=15`,badge:`${CLIENT_APP_ORIGIN}/icons/fibra-app-192.png?v=15`,tag:text(tag)||'fibra-plus',lang:'pt-BR',data:{url:normalizeClickUrl(url)}}}

async function sendOne(db,row,vapid,payload){
  try{
    const built=await buildPushHTTPRequest({privateJWK:vapid.privateJWK,subscription:{endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},message:{payload,adminContact:vapid.subject||'mailto:adrianomoreirausuarios@gmail.com',options:{ttl:86400,urgency:'normal',topic:text(payload.tag).replace(/[^A-Za-z0-9_-]/g,'').slice(0,32)||'fibra-plus'}}});
    const response=await fetch(built.endpoint,{method:'POST',headers:built.headers,body:built.body,redirect:'manual'}),now=new Date().toISOString();
    if(response.ok){await db.prepare('UPDATE pp_push_subscriptions SET active=1,last_success_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(now,now,Number(row.id)).run();return {ok:true}}
    const error=`Push HTTP ${response.status}`;
    if(response.status===404||response.status===410)await db.prepare('UPDATE pp_push_subscriptions SET active=0,last_error=?,updated_at=? WHERE id=?').bind(error,now,Number(row.id)).run();
    else await db.prepare('UPDATE pp_push_subscriptions SET last_error=?,updated_at=? WHERE id=?').bind(error,now,Number(row.id)).run();
    return {ok:false,error};
  }catch(error){const message=error instanceof Error?error.message:String(error),now=new Date().toISOString();try{await db.prepare('UPDATE pp_push_subscriptions SET last_error=?,updated_at=? WHERE id=?').bind(message.slice(0,500),now,Number(row.id)).run()}catch{}return {ok:false,error:message}}
}
async function sendRows(db,rows,vapid,payload){let sent=0,failed=0;for(let start=0;start<rows.length;start+=10){const batch=rows.slice(start,start+10),results=await Promise.all(batch.map(row=>sendOne(db,row,vapid,payload)));for(const result of results)result.ok?sent++:failed++}return {sent,failed,total:rows.length}}

async function sendAutomaticEvent(db,vapidSql,env,event){
  const clientId=Number(event?.clientId)||0,key=text(event?.key),type=text(event?.type),title=text(event?.title).slice(0,90),message=text(event?.body).slice(0,500),clickUrl=normalizeClickUrl(event?.url||'/');
  if(!clientId||!key||!title||!message)return {skipped:true};
  const subscriptions=await d1Rows(db.prepare('SELECT id,client_id,endpoint,p256dh,auth FROM pp_push_subscriptions WHERE client_id=? AND active=1 ORDER BY id ASC').bind(clientId));
  if(!subscriptions.length)return {skipped:true,reason:'no-subscriptions'};
  const createdAt=new Date().toISOString();
  await db.prepare(`INSERT INTO pp_push_events (event_key,client_id,event_type,title,body,click_url,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING`).bind(key,clientId,type||'automatic',title,message,clickUrl,createdAt).run();
  const cutoff=new Date(Date.now()-2*60*1000).toISOString(),attemptAt=new Date().toISOString(),claimed=await db.prepare('UPDATE pp_push_events SET attempts=attempts+1,last_attempt_at=? WHERE event_key=? AND completed=0 AND (last_attempt_at IS NULL OR last_attempt_at<?)').bind(attemptAt,key,cutoff).run();
  if(!(Number(claimed?.meta?.changes)||0))return {skipped:true,reason:'duplicate-or-running'};
  const vapid=await vapidKeys(env,vapidSql),tag=`auto-${key.replace(/[^A-Za-z0-9_-]/g,'-').slice(-42)}`,payload=notificationPayload(title,message,clickUrl,tag),result=await sendRows(db,subscriptions,vapid,payload),completed=result.sent>0,sentAt=completed?new Date().toISOString():null;
  await db.prepare('UPDATE pp_push_events SET sent_count=?,failed_count=?,completed=?,sent_at=? WHERE event_key=?').bind(result.sent,result.failed,completed?1:0,sentAt,key).run();
  if(completed)await db.prepare('INSERT INTO pp_push_messages (target_client_id,target_mode,title,body,click_url,sent_count,failed_count,created_by_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(clientId,'client',title,message,clickUrl,result.sent,result.failed,`Automático · ${type||'notificação'}`,new Date().toISOString()).run();
  return result;
}

function invoiceAutomaticEvents(invoice,today,tomorrow,yesterday){
  const clientId=Number(invoice?.client_id)||0,id=text(invoice?.id),due=text(invoice?.due_date||invoice?.dueDate).slice(0,10),amount=invoiceCents(invoice),part=Math.max(0,Math.round(Number(invoice?.installment_number)||0)),total=Math.max(part,Math.round(Number(invoice?.installment_total)||part)),combined=invoice?.combined_billing===true,deferred=invoice?.bank_issue_deferred===true,events=[];
  if(!clientId||!id||deferred)return events;
  const paid=paidStatus(invoice?.status),open=invoiceOpen(invoice),createdAt=text(invoice?.created_at),paidAt=text(invoice?.paid_at);
  if(open&&recentTimestamp(createdAt,36)){
    let title='Nova fatura disponível',body=`Sua fatura de ${brl(amount)} foi gerada${due?` e vence em ${brDate(due)}`:''}.`;
    if(combined&&part){title='Nova cobrança disponível';body=`Sua mensalidade + parcela ${part}/${total} do acordo foi gerada no valor de ${brl(amount)}${due?` e vence em ${brDate(due)}`:''}.`}
    else if(part){title='Parcela do acordo disponível';body=`A parcela ${part}/${total} do seu acordo está disponível no valor de ${brl(amount)}${due?` e vence em ${brDate(due)}`:''}.`}
    events.push({key:`invoice-created:${id}`,clientId,type:'fatura gerada',title,body,url:'/#faturas'});
  }
  if(open&&due===tomorrow){
    let title='Sua fatura vence amanhã',body=`Sua fatura de ${brl(amount)} vence amanhã, ${brDate(due)}.`;
    if(combined&&part){title='Mensalidade + acordo vencem amanhã';body=`Sua mensalidade + parcela ${part}/${total} do acordo, no total de ${brl(amount)}, vencem amanhã.`}
    else if(part){title='Parcela do acordo vence amanhã';body=`A parcela ${part}/${total} do seu acordo, no valor de ${brl(amount)}, vence amanhã.`}
    events.push({key:`due-tomorrow:${id}:${due}`,clientId,type:'vencimento próximo',title,body,url:'/#faturas'});
  }
  if(open&&due===yesterday){
    let title='Fatura vencida',body=`Sua fatura de ${brl(amount)} venceu ontem. Consulte a cobrança na Área do Cliente.`;
    if(combined&&part){title='Cobrança vencida';body=`Sua mensalidade + parcela ${part}/${total} do acordo venceram ontem. Consulte a cobrança na Área do Cliente.`}
    else if(part){title='Parcela do acordo vencida';body=`A parcela ${part}/${total} do seu acordo venceu ontem. Consulte a cobrança na Área do Cliente.`}
    events.push({key:`overdue:${id}:${due}`,clientId,type:'fatura vencida',title,body,url:'/#faturas'});
  }
  if(paid&&paidAt&&recentTimestamp(paidAt,36)){
    let body=`Recebemos seu pagamento de ${brl(amount)}. Obrigado!`;
    if(combined&&part)body=`Pagamento confirmado: ${brl(amount)} da mensalidade + parcela ${part}/${total} do acordo.`;
    else if(part)body=`Pagamento confirmado: parcela ${part}/${total} do acordo no valor de ${brl(amount)}.`;
    events.push({key:`payment:${id}:${paidAt}`,clientId,type:'pagamento confirmado',title:'Pagamento confirmado',body,url:'/#faturas'});
  }
  return events;
}

function cashbackAutomaticEvents(state){
  const transactions=Array.isArray(state?.cashback_transactions)?state.cashback_transactions:[],events=[];
  for(const item of transactions){
    if(text(item?.type).toLowerCase()!=='credit'||!recentTimestamp(item?.created_at,36))continue;
    const clientId=Number(item?.client_id)||0,amount=Math.max(0,Math.round(Number(item?.amount_cents)||0)),balance=Math.max(0,Math.round(Number(item?.balance_after_cents)||0)),id=text(item?.id)||`${item?.invoice_id||'cashback'}:${item?.created_at||''}`;
    if(!clientId||!amount)continue;
    events.push({key:`cashback:${id}`,clientId,type:'cashback recebido',title:'Cashback recebido',body:`Você recebeu ${brl(amount)} de cashback. Seu saldo agora é ${brl(balance)}.`,url:'/#cashback'});
  }
  return events;
}

async function scanAutomaticEvents(env){
  if(!env?.PROVEDOR_DB)return {scanned:false};
  const sql=null,db=env.PROVEDOR_DB;await ensurePushTables(db);const state=await loadState(env),today=brazilDateKey(),tomorrow=addDaysKey(today,1),yesterday=addDaysKey(today,-1),events=[];
  for(const invoice of Array.isArray(state?.invoices)?state.invoices:[])events.push(...invoiceAutomaticEvents(invoice,today,tomorrow,yesterday));
  events.push(...cashbackAutomaticEvents(state));
  const unique=[...new Map(events.map(event=>[event.key,event])).values()].slice(0,250);let sent=0,failed=0,skipped=0;
  for(const event of unique){try{const result=await sendAutomaticEvent(db,sql,env,event);if(result?.skipped)skipped++;else{sent+=Number(result?.sent)||0;failed+=Number(result?.failed)||0}}catch(error){failed++;console.error('Provedor Plus: falha ao enviar notificação automática.',event?.type,error)}}
  return {scanned:true,events:unique.length,sent,failed,skipped};
}

async function shouldScanAfterRequest(request){
  if(request.method!=='POST')return false;
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/customer-portal'&&url.searchParams.get('mp_webhook')==='1')return true;
  let action='';try{const body=await request.clone().json();action=text(body?.action).toLowerCase()}catch{}
  if(path==='/api/cloud-state')return action==='state.save';
  if(path!=='/api/customer-portal')return false;
  return AUTOMATIC_SCAN_PORTAL_ACTIONS.has(action);
}

async function requirePanelAdmin(request,env,ctx){
  const origin=new URL(request.url).origin,headers=new Headers(request.headers);headers.set('Content-Type','application/json');const authRequest=new Request(`${origin}/api/auth`,{method:'POST',headers,body:JSON.stringify({action:'status'})}),response=await coreWorker.fetch(authRequest,env,ctx);let body={};try{body=await response.json()}catch{}const user=body?.data?.user;if(!response.ok||!body?.ok||body?.data?.authenticated!==true)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});if(text(user?.role).toLowerCase()!=='admin')throw Object.assign(new Error('Somente o administrador pode enviar notificações.'),{statusCode:403});return user}

async function handleCustomerPush(request,env,ctx){
  const cors=clientCors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,cors);
  const origin=text(request.headers.get('origin'));if(!CLIENT_ORIGINS.has(origin))return json({ok:false,error:'Origem não autorizada.'},403,cors);
  try{
    if(!env.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 das notificações não configurado.'),{statusCode:503});let body={};try{body=await request.json()}catch{}const action=text(body?.action),data=body?.data||{},sql=null,db=env.PROVEDOR_DB;await ensurePushTables(db);
    if(action==='config'){const vapid=await vapidKeys(env,sql);return json({ok:true,data:{publicKey:vapid.publicKey,supported:true}},200,cors)}
    const session=await verifySession(data?.session,env),clientId=session.clientId;
    if(action==='subscribe'){
      const subscription=normalizeSubscription(data?.subscription),ua=text(data?.userAgent||request.headers.get('user-agent')).slice(0,800),platform=text(data?.platform).slice(0,120),now=new Date().toISOString();
      await db.prepare(`INSERT INTO pp_push_subscriptions (client_id,endpoint,p256dh,auth,user_agent,platform,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(endpoint) DO UPDATE SET client_id=excluded.client_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,platform=excluded.platform,active=1,updated_at=excluded.updated_at,last_error=NULL`).bind(clientId,subscription.endpoint,subscription.p256dh,subscription.auth,ua||null,platform||null,now,now).run();
      const rows=await d1Rows(db.prepare('SELECT id,endpoint,p256dh,auth FROM pp_push_subscriptions WHERE client_id=? AND endpoint=? AND active=1 LIMIT 1').bind(clientId,subscription.endpoint)),vapid=await vapidKeys(env,sql),payload=notificationPayload('Notificações Fibra+ ativadas','Pronto. Você receberá avisos importantes da sua conta diretamente neste dispositivo.','/','fibra-ativada');
      if(rows?.[0]){const task=sendRows(db,rows,vapid,payload);if(typeof ctx?.waitUntil==='function')ctx.waitUntil(task);else await task}
      const count=await d1Rows(db.prepare('SELECT COUNT(*) AS total FROM pp_push_subscriptions WHERE client_id=? AND active=1').bind(clientId));
      return json({ok:true,data:{active:true,devices:Number(count?.[0]?.total)||1}},200,cors);
    }
    if(action==='unsubscribe'){
      const endpoint=text(data?.endpoint),now=new Date().toISOString();if(endpoint)await db.prepare('UPDATE pp_push_subscriptions SET active=0,updated_at=? WHERE client_id=? AND endpoint=?').bind(now,clientId,endpoint).run();else await db.prepare('UPDATE pp_push_subscriptions SET active=0,updated_at=? WHERE client_id=?').bind(now,clientId).run();
      return json({ok:true,data:{active:false}},200,cors);
    }
    if(action==='status'){
      const endpoint=text(data?.endpoint),rows=endpoint?await d1Rows(db.prepare('SELECT COUNT(*) AS total FROM pp_push_subscriptions WHERE client_id=? AND endpoint=? AND active=1').bind(clientId,endpoint)):await d1Rows(db.prepare('SELECT COUNT(*) AS total FROM pp_push_subscriptions WHERE client_id=? AND active=1').bind(clientId));
      return json({ok:true,data:{active:(Number(rows?.[0]?.total)||0)>0,devices:Number(rows?.[0]?.total)||0}},200,cors);
    }
    throw Object.assign(new Error('Ação de notificação não permitida.'),{statusCode:400});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,cors)}
}

async function resolveTargetClient(db,identifier){
  const raw=text(identifier),doc=digits(raw);if(!raw&&!doc)return null;
  const clean="replace(replace(replace(replace(replace(replace(COALESCE(%s,''),'.',''),'-',''),'/',''),'(',''),')',''),' ','')";
  const rows=await d1Rows(db.prepare(`SELECT id,name,contract_number,document FROM pp_clients WHERE contract_number=? OR document=? OR ${clean.replace('%s','contract_number')}=? OR ${clean.replace('%s','document')}=? ORDER BY id ASC LIMIT 1`).bind(raw,raw,doc,doc));return rows?.[0]||null;
}
async function handleAdminPush(request,env,ctx){
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405);
  try{
    const user=await requirePanelAdmin(request,env,ctx);if(!env.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 das notificações não configurado.'),{statusCode:503});let body={};try{body=await request.json()}catch{}const action=text(body?.action),data=body?.data||{},db=env.PROVEDOR_DB;await ensurePushTables(db);
    if(action==='stats'){
      const stats=await d1Rows(db.prepare('SELECT SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS devices,COUNT(DISTINCT CASE WHEN active=1 THEN client_id END) AS clients FROM pp_push_subscriptions')),history=await d1Rows(db.prepare('SELECT id,target_mode,title,body,sent_count,failed_count,created_by_name,created_at FROM pp_push_messages ORDER BY id DESC LIMIT 10'));
      return json({ok:true,data:{devices:Number(stats?.[0]?.devices)||0,clients:Number(stats?.[0]?.clients)||0,history:history||[]}});
    }
    if(action==='send'){
      const title=text(data?.title).slice(0,90),message=text(data?.body).slice(0,500),mode=data?.mode==='all'?'all':'client',clickUrl=normalizeClickUrl(data?.url);if(!title||!message)throw Object.assign(new Error('Informe o título e a mensagem da notificação.'),{statusCode:400});let targetClient=null,subscriptions=[];
      if(mode==='all')subscriptions=await d1Rows(db.prepare('SELECT id,client_id,endpoint,p256dh,auth FROM pp_push_subscriptions WHERE active=1 ORDER BY id ASC'));
      else{targetClient=await resolveTargetClient(db,data?.identifier);if(!targetClient)throw Object.assign(new Error('Cliente não encontrado pelo CPF/CNPJ ou contrato informado.'),{statusCode:404});subscriptions=await d1Rows(db.prepare('SELECT id,client_id,endpoint,p256dh,auth FROM pp_push_subscriptions WHERE client_id=? AND active=1 ORDER BY id ASC').bind(Number(targetClient.id)));}
      if(!subscriptions.length)throw Object.assign(new Error(mode==='all'?'Nenhum dispositivo autorizou notificações ainda.':'Este cliente ainda não autorizou notificações em nenhum dispositivo.'),{statusCode:409});
      const vapid=await vapidKeys(env),payload=notificationPayload(title,message,clickUrl,`fibra-${Date.now().toString(36)}`),result=await sendRows(db,subscriptions,vapid,payload),createdBy=text(user?.name)||'Administrador';
      await db.prepare('INSERT INTO pp_push_messages (target_client_id,target_mode,title,body,click_url,sent_count,failed_count,created_by_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(targetClient?Number(targetClient.id):null,mode,title,message,clickUrl,result.sent,result.failed,createdBy,new Date().toISOString()).run();
      return json({ok:true,data:{...result,targetClient:targetClient?{id:Number(targetClient.id),name:text(targetClient.name),contract:text(targetClient.contract_number)}:null}});
    }
    throw Object.assign(new Error('Ação administrativa de notificação não permitida.'),{statusCode:400});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500)}
}

async function handleCoreFetch(request,env,ctx){
  const scan=env?.PROVEDOR_DB?await shouldScanAfterRequest(request):false;
  const response=await coreWorker.fetch(request,env,ctx);
  if(scan&&response?.ok){const task=scanAutomaticEvents(env).catch(error=>console.error('Provedor Plus: falha na verificação automática de notificações após ação.',error));if(typeof ctx?.waitUntil==='function')ctx.waitUntil(task)}
  return response;
}

export default {
  fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path===CLIENT_PUSH_PATH)return handleCustomerPush(request,env,ctx);if(path===ADMIN_PUSH_PATH)return handleAdminPush(request,env,ctx);return handleCoreFetch(request,env,ctx)},
  scheduled(controller,env,ctx){const result=coreWorker.scheduled(controller,env,ctx);if(env?.PROVEDOR_DB&&typeof ctx?.waitUntil==='function')ctx.waitUntil(scanAutomaticEvents(env).catch(error=>console.error('Provedor Plus: falha no ciclo automático de notificações.',error)));return result}
};