import baseWorker from './trust-release-worker.js';
import {neon} from '@neondatabase/serverless';

const STATE_KEY='web_state_v1017';
const DUE_PATH='/api/customer-due-date';
const PORTAL_PATH='/api/customer-portal';
const TRUST_PATH='/api/customer-trust-release';
const ALLOWED_DUE_DAYS=[5,10,15,20,25];
const COOLDOWN_DAYS=90;
const DAY=86400000;
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
function localClientIndex(state,id){return (Array.isArray(state?.clients)?state.clients:[]).findIndex(row=>Number(row?.id)===Number(id))}
function localClient(state,id){const index=localClientIndex(state,id);return index>=0?state.clients[index]:null}
function planFor(client,state){const plans=Array.isArray(state?.plans)?state.plans:[],id=Number(client?.plan_id)||0,name=normalize(client?.plan||client?.plan_name);return plans.find(plan=>id&&Number(plan?.id)===id)||plans.find(plan=>name&&normalize(plan?.name)===name)||null}
function planPriceCents(client,state){const plan=planFor(client,state),local=localClient(state,client?.id);for(const value of [plan?.price_cents,local?.plan_price_cents,local?.price_cents]){const n=Number(value);if(Number.isFinite(n)&&n>0)return Math.round(n)}return 0}
function nextInvoiceId(state){const invoices=Array.isArray(state?.invoices)?state.invoices:[],max=Math.max(Number(state?.seq?.invoices)||0,...invoices.map(row=>Number(row?.id)||0)),id=max+1;state.seq={...(state.seq||{}),invoices:id};return id}

function brazilParts(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};for(const part of parts)map[part.type]=part.value;return {year:Number(map.year),month:Number(map.month),day:Number(map.day)}}
function keyFromParts(year,month,day){return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}
function todayKey(){const p=brazilParts();return keyFromParts(p.year,p.month,p.day)}
function dateFromKey(value){const match=text(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),12)):null}
function daysInMonth(year,month){return new Date(Date.UTC(year,month,0,12)).getUTCDate()}
function dueKey(year,month,day){return keyFromParts(year,month,Math.max(1,Math.min(daysInMonth(year,month),Number(day)||1)))}
function nextOccurrenceAfter(baseKey,day){const base=dateFromKey(baseKey);if(!base)return '';let year=base.getUTCFullYear(),month=base.getUTCMonth()+1,candidate=dueKey(year,month,day);if(candidate<=baseKey){month++;if(month===13){month=1;year++}candidate=dueKey(year,month,day)}return candidate}
function daysBetween(fromKey,toKey){const a=dateFromKey(fromKey),b=dateFromKey(toKey);return a&&b?Math.round((b-a)/DAY):0}
function addDaysIso(value,days){const date=new Date(value);if(Number.isNaN(date.getTime()))return '';date.setUTCDate(date.getUTCDate()+Number(days||0));return date.toISOString()}
function brDate(value){if(!value)return '';const date=new Date(value.length===10?`${value}T12:00:00Z`:value);if(Number.isNaN(date.getTime()))return '';return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(date)}
function brMoney(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100)}

function inactiveInvoice(row){const value=normalize(row?.status);return ['cancelado','canceled','renegociado','renegotiated','substituido','substituida'].some(status=>value.includes(status))}
function settledInvoice(row){const value=normalize(row?.status);return ['pago','paga','paid','baixado','recebido','recebida','quitado','quitada'].some(status=>value.includes(status))}
function hasOverdue(state,clientId){const today=todayKey();return (Array.isArray(state?.invoices)?state.invoices:[]).some(row=>Number(row?.client_id)===Number(clientId)&&!inactiveInvoice(row)&&!settledInvoice(row)&&text(row?.due_date||row?.dueDate).slice(0,10)&&text(row?.due_date||row?.dueDate).slice(0,10)<today)}
function cycleInvoice(row,clientId){if(Number(row?.client_id)!==Number(clientId)||inactiveInvoice(row))return false;const origin=normalize(row?.billing_origin),type=normalize(row?.billing_type),description=normalize(row?.description);return ['monthly_auto','first_prorated','due_date_change'].includes(origin)||type.includes('mensalidade')||description.includes('mensalidade')}
function latestCycleInvoice(state,clientId){return (Array.isArray(state?.invoices)?state.invoices:[]).filter(row=>cycleInvoice(row,clientId)&&dateFromKey(row?.due_date||row?.dueDate)).sort((a,b)=>text(b?.due_date||b?.dueDate).slice(0,10).localeCompare(text(a?.due_date||a?.dueDate).slice(0,10)))[0]||null}
function invoiceConflict(state,clientId,dueDate){return (Array.isArray(state?.invoices)?state.invoices:[]).find(row=>Number(row?.client_id)===Number(clientId)&&!inactiveInvoice(row)&&text(row?.due_date||row?.dueDate).slice(0,10)===dueDate)||null}
function activeClient(client){return !['cancelado','inativo','suspenso'].some(status=>normalize(client?.status).includes(status))}
function appendHistory(client,action,detail){const current=Array.isArray(client?.access_history)?client.access_history:[];return [{at:new Date().toISOString(),action,user:'Área do Cliente',detail},...current].slice(0,30)}

function b64urlBytes(value){let raw=text(value).replace(/-/g,'+').replace(/_/g,'/');while(raw.length%4)raw+='=';const bin=atob(raw),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
async function portalKey(env){const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);if(!secret)throw Object.assign(new Error('Sessão segura da Área do Cliente não configurada.'),{statusCode:503});return crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])}
async function verifySession(token,env){const parts=text(token).split('.');if(parts.length!==2)throw Object.assign(new Error('Sessão do cliente inválida. Entre novamente.'),{statusCode:401});try{const key=await portalKey(env),ok=await crypto.subtle.verify('HMAC',key,b64urlBytes(parts[1]),utf8.encode(parts[0]));if(!ok)throw new Error('assinatura');const payload=JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0]))),clientId=Number(payload?.clientId)||0,exp=Number(payload?.exp)||0;if(!clientId||exp<=Date.now())throw new Error('expirada');return {clientId}}catch{throw Object.assign(new Error('Sessão do cliente expirada ou inválida. Entre novamente.'),{statusCode:401})}}

function corsFor(request){const origin=text(request.headers.get('origin'));if(!PORTAL_ORIGINS.has(origin))return {'Vary':'Origin'};return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}})}

async function ensureProtocolTable(sql){
  await sql`CREATE TABLE IF NOT EXISTS pp_protocols (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    protocol TEXT UNIQUE,
    client_id BIGINT NULL REFERENCES pp_clients(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'provedor-plus',
    status TEXT NOT NULL DEFAULT 'Aberto',
    created_by_user_id BIGINT NULL REFERENCES pp_users(id) ON DELETE SET NULL,
    created_by_name TEXT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS pp_protocols_client_created_idx ON pp_protocols (client_id,created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS pp_protocols_category_created_idx ON pp_protocols (category,created_at DESC)`;
}
function protocolCode(id,createdAt){const d=new Date(createdAt||Date.now()),stamp=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;return `PP-${stamp}-${String(Number(id)||0).padStart(6,'0')}`}
function safeProtocol(row){return {id:Number(row?.id)||0,protocol:text(row?.protocol),clientId:Number(row?.client_id)||null,category:text(row?.category),subject:text(row?.subject),source:text(row?.source),status:text(row?.status),details:row?.details&&typeof row.details==='object'?row.details:{},createdAt:text(row?.created_at),closedAt:text(row?.closed_at)}}
async function createProtocol(sql,{clientId,category,subject,status='Concluído',details={}}){await ensureProtocolTable(sql);const raw=JSON.stringify(details||{}),rows=await sql`INSERT INTO pp_protocols (client_id,category,subject,source,status,created_by_name,details) VALUES (${Number(clientId)||null},${text(category)||'Área do Cliente'},${text(subject)||'Ação do cliente'},'area-cliente',${text(status)||'Concluído'},'Área do Cliente',${raw}::jsonb) RETURNING *`,created=rows?.[0];if(!created?.id)throw new Error('Não foi possível gerar o protocolo.');const code=protocolCode(created.id,created.created_at),updated=await sql`UPDATE pp_protocols SET protocol=${code} WHERE id=${Number(created.id)} RETURNING *`;return safeProtocol(updated?.[0]||{...created,protocol:code})}
async function finishProtocol(sql,protocol,status,details={}){const raw=JSON.stringify(details||{}),rows=await sql`UPDATE pp_protocols SET status=${status},details=${raw}::jsonb,closed_at=now() WHERE protocol=${protocol} RETURNING *`;return rows?.[0]?safeProtocol(rows[0]):null}
async function lastDueChange(sql,clientId){await ensureProtocolTable(sql);const rows=await sql`SELECT protocol,created_at FROM pp_protocols WHERE client_id=${Number(clientId)} AND category='Vencimento' AND subject='Alteração de vencimento' AND status='Concluído' ORDER BY created_at DESC LIMIT 1`;return rows?.[0]||null}

async function portalClient(sql,id){const rows=await sql`SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code FROM pp_clients WHERE id=${Number(id)} LIMIT 1`;return rows?.[0]||null}
async function dueEligibility(sql,client,state,targetDay=null){
  const local=localClient(state,client.id),currentDay=Number(client?.due_day||local?.due_day)||10,priceCents=planPriceCents(client,state),last=await lastDueChange(sql,client.id),lastAt=last?.created_at?new Date(last.created_at):null,nextAvailableAt=lastAt&&!Number.isNaN(lastAt.getTime())?new Date(lastAt.getTime()+COOLDOWN_DAYS*DAY).toISOString():'',cooldownActive=Boolean(nextAvailableAt&&new Date(nextAvailableAt).getTime()>Date.now());
  const base={eligible:true,currentDay,allowedDays:ALLOWED_DUE_DAYS,planPriceCents:priceCents,planPrice:brMoney(priceCents),cooldownDays:COOLDOWN_DAYS,lastChangedAt:lastAt?.toISOString?.()||'',lastProtocol:text(last?.protocol),nextAvailableAt,hasOverdue:hasOverdue(state,client.id),message:'Escolha um novo dia de vencimento. O cálculo proporcional é feito somente pelo Provedor Plus.'};
  if(!local)return {...base,eligible:false,reasonCode:'not_synced',message:'O cadastro ainda não está sincronizado para alteração de vencimento. Entre em contato com o suporte.'};
  if(!activeClient(client))return {...base,eligible:false,reasonCode:'inactive',message:'A alteração de vencimento não está disponível para este cadastro no momento.'};
  if(base.hasOverdue)return {...base,eligible:false,reasonCode:'overdue',message:'Regularize sua fatura vencida antes de alterar o vencimento.'};
  if(cooldownActive)return {...base,eligible:false,reasonCode:'cooldown',message:`O vencimento já foi alterado recentemente. Uma nova alteração ficará disponível em ${brDate(nextAvailableAt)}.`};
  if(priceCents<=0)return {...base,eligible:false,reasonCode:'no_plan_price',message:'Não foi possível identificar o valor mensal do seu plano. Entre em contato com o suporte.'};
  if(targetDay!==null){const day=Number(targetDay);if(!ALLOWED_DUE_DAYS.includes(day))return {...base,eligible:false,reasonCode:'invalid_day',message:'Escolha um dos dias de vencimento disponíveis.'};if(day===currentDay)return {...base,eligible:false,reasonCode:'same_day',message:`Seu vencimento já é no dia ${String(currentDay).padStart(2,'0')}.`}}
  return {...base,reasonCode:'eligible'};
}
function transitionPreview(client,state,targetDay,eligibility){
  if(!eligibility.eligible)return eligibility;
  const latest=latestCycleInvoice(state,client.id),currentDay=eligibility.currentDay,newDay=Number(targetDay),priceCents=eligibility.planPriceCents;
  if(!latest)return {...eligibility,newDay,transitionType:'first_invoice',transitionDueDate:'',serviceDays:0,transitionAmountCents:0,transitionAmount:'',nextNormalDueDate:'',message:`O vencimento será alterado do dia ${String(currentDay).padStart(2,'0')} para o dia ${String(newDay).padStart(2,'0')}. Como ainda não há mensalidade de ciclo gerada, o novo dia será usado no cálculo proporcional da primeira cobrança. Faturas já existentes não serão modificadas.`};
  const anchorDue=text(latest?.due_date||latest?.dueDate).slice(0,10),base=todayKey()>anchorDue?todayKey():anchorDue,transitionDue=nextOccurrenceAfter(base,newDay),serviceDays=daysBetween(anchorDue,transitionDue);
  if(serviceDays<1||serviceDays>60)return {...eligibility,eligible:false,newDay,reasonCode:'cycle_out_of_range',message:'O intervalo encontrado para a troca de vencimento ficou fora do limite automático. Entre em contato com o suporte para ajustar sem risco de cobrança incorreta.'};
  const conflict=invoiceConflict(state,client.id,transitionDue);if(conflict)return {...eligibility,eligible:false,newDay,reasonCode:'invoice_conflict',message:`Já existe uma cobrança ativa com vencimento em ${brDate(transitionDue)}. Para não duplicar valores, esta alteração precisa ser revisada pelo suporte.`};
  const amountCents=Math.max(1,Math.round(priceCents*serviceDays/30)),nextNormalDueDate=nextOccurrenceAfter(transitionDue,newDay),differenceCents=amountCents-priceCents;
  return {...eligibility,newDay,transitionType:'proportional',anchorDueDate:anchorDue,transitionDueDate:transitionDue,serviceDays,cycleDays:30,transitionAmountCents:amountCents,transitionAmount:brMoney(amountCents),differenceCents,nextNormalDueDate,message:`Faturas já geradas continuam iguais. A transição para o dia ${String(newDay).padStart(2,'0')} terá ${serviceDays} dia${serviceDays===1?'':'s'} proporcionais, no valor de ${brMoney(amountCents)}, com vencimento em ${brDate(transitionDue)}. Depois disso, a mensalidade volta ao valor normal de ${brMoney(priceCents)} e vence todo dia ${String(newDay).padStart(2,'0')}.`};
}
async function previewFor(sql,client,state,targetDay){const eligibility=await dueEligibility(sql,client,state,targetDay);return transitionPreview(client,state,targetDay,eligibility)}

async function changeDueDate(sql,client,state,targetDay){
  const preview=await previewFor(sql,client,state,targetDay);if(!preview.eligible)throw Object.assign(new Error(preview.message),{statusCode:409,data:preview});
  const oldDay=preview.currentDay,newDay=Number(targetDay),protocol=await createProtocol(sql,{clientId:client.id,category:'Vencimento',subject:'Alteração de vencimento',status:'Em processamento',details:{oldDay,newDay,requestedAt:new Date().toISOString()}});
  const active=await sql`SELECT id,protocol,status FROM pp_protocols WHERE client_id=${Number(client.id)} AND category='Vencimento' AND subject='Alteração de vencimento' AND status IN ('Concluído','Em processamento') AND created_at>=now()-interval '90 days' ORDER BY id ASC LIMIT 1`;
  if(Number(active?.[0]?.id)!==Number(protocol.id)){await finishProtocol(sql,protocol.protocol,'Negado',{oldDay,newDay,reason:'cooldown_or_parallel_request'});throw Object.assign(new Error('Já existe uma alteração de vencimento recente ou em processamento para este cliente.'),{statusCode:409})}
  const before=JSON.parse(JSON.stringify(state)),index=localClientIndex(state,client.id),now=new Date().toISOString();let invoice=null,dbChanged=false;
  try{
    if(index<0)throw new Error('Cadastro local do cliente não encontrado.');
    if(preview.transitionType==='proportional'){
      invoice={id:nextInvoiceId(state),client_id:Number(client.id),due_date:preview.transitionDueDate,amount_cents:preview.transitionAmountCents,status:'Pendente',document_type:'Boleto',billing_type:'Ajuste proporcional de vencimento',description:`Ajuste proporcional de vencimento · dia ${String(oldDay).padStart(2,'0')} → ${String(newDay).padStart(2,'0')} · ${preview.serviceDays} dias`,billing_origin:'due_date_change',auto_generated:true,competency:preview.transitionDueDate.slice(0,7),reference:preview.transitionDueDate.slice(0,7),base_amount_cents:preview.planPriceCents,cashback_eligible:false,cashback_reason:'alteracao_vencimento',payment_method:'',paid_by:'',paid_at:null,created_at:now,service_days:preview.serviceDays,cycle_days:30,due_change_from_day:oldDay,due_change_to_day:newDay,due_change_protocol:protocol.protocol};
      state.invoices=Array.isArray(state.invoices)?state.invoices:[];state.invoices.push(invoice);
    }
    state.clients[index]={...state.clients[index],due_day:newDay,due_date_change_last_at:now,due_date_change_from_day:oldDay,due_date_change_to_day:newDay,due_date_change_protocol:protocol.protocol,due_date_change_transition_invoice_id:invoice?.id||null,access_history:appendHistory(state.clients[index],'Alteração de vencimento',`Vencimento alterado do dia ${oldDay} para o dia ${newDay}. Protocolo ${protocol.protocol}`)};
    await saveState(sql,state);
    await sql`UPDATE pp_clients SET due_day=${newDay},updated_at=${now} WHERE id=${Number(client.id)}`;dbChanged=true;
    const completed=await finishProtocol(sql,protocol.protocol,'Concluído',{oldDay,newDay,planPriceCents:preview.planPriceCents,transitionType:preview.transitionType,transitionInvoiceId:invoice?.id||null,transitionDueDate:preview.transitionDueDate||'',serviceDays:preview.serviceDays||0,transitionAmountCents:preview.transitionAmountCents||0,nextNormalDueDate:preview.nextNormalDueDate||'',changedAt:now});
    return {...preview,eligible:false,reasonCode:'changed',changed:true,protocol:completed?.protocol||protocol.protocol,protocolRecord:completed,transitionInvoice:invoice?{id:invoice.id,dueDate:invoice.due_date,amountCents:invoice.amount_cents,total:brMoney(invoice.amount_cents)}:null,message:`Vencimento alterado para o dia ${String(newDay).padStart(2,'0')}. ${preview.transitionType==='proportional'?`A cobrança proporcional de ${brMoney(preview.transitionAmountCents)} foi criada para ${brDate(preview.transitionDueDate)}.`:'A próxima cobrança utilizará o novo vencimento.'} Protocolo ${completed?.protocol||protocol.protocol}.`};
  }catch(error){
    if(dbChanged)try{await sql`UPDATE pp_clients SET due_day=${oldDay},updated_at=${new Date().toISOString()} WHERE id=${Number(client.id)}`}catch{}
    try{await saveState(sql,before)}catch{}
    try{await finishProtocol(sql,protocol.protocol,'Falhou',{oldDay,newDay,error:error instanceof Error?error.message:String(error),failedAt:new Date().toISOString()})}catch{}
    throw error;
  }
}

async function handleDueDate(request,env){
  const cors=corsFor(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,cors);
  try{
    const origin=text(request.headers.get('origin'));if(!PORTAL_ORIGINS.has(origin))throw Object.assign(new Error('Origem não autorizada.'),{statusCode:403});if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Provedor Plus não configurada.'),{statusCode:503});
    let body={};try{body=await request.json()}catch{}const action=text(body?.action),data=body?.data||{},session=await verifySession(data.session,env),sql=neon(env.DATABASE_URL),client=await portalClient(sql,session.clientId);if(!client)throw Object.assign(new Error('Cliente não encontrado.'),{statusCode:404});const state=await loadState(sql);
    if(action==='status')return json({ok:true,data:await dueEligibility(sql,client,state)},200,cors);
    if(action==='preview')return json({ok:true,data:await previewFor(sql,client,state,Number(data.day))},200,cors);
    if(action==='change')return json({ok:true,data:await changeDueDate(sql,client,state,Number(data.day))},200,cors);
    throw Object.assign(new Error('Ação de vencimento não permitida.'),{statusCode:400});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error),data:error?.data||null},Number(error?.statusCode)||500,cors)}
}

function portalAuditDefinition(path,action){
  if(path===TRUST_PATH&&action==='release')return {category:'Conexão',subject:'Liberação em confiança',details:{hours:48}};
  if(path!==PORTAL_PATH)return null;
  if(action==='login')return {category:'Acesso',subject:'Login na Área do Cliente'};
  if(action==='payment-pix')return {category:'Financeiro',subject:'Pix solicitado'};
  if(action==='payment-card')return {category:'Financeiro',subject:'Pagamento com cartão'};
  if(action==='negotiate')return {category:'Financeiro',subject:'Negociação realizada'};
  if(['connection-test','test-connection','connection-status','connection-diagnostic','diagnostic','diagnose','connection-check','check-connection','diagnostic-connection'].includes(action)||/(connection|diagnostic|diagnose|diagnost|conex[aã]o|teste.*conex)/i.test(action))return {category:'Conexão',subject:'Diagnóstico da conexão'};
  const passive=new Set(['refresh','payment-config','payment-prepare','payment-status','negotiation-options']);
  if(passive.has(action))return null;
  return action?{category:'Área do Cliente',subject:`Ação: ${action}`} : null;
}
function safeAuditDetails(action,requestData,responseData,base={}){
  const out={...base,action,recordedAt:new Date().toISOString()};
  const invoiceId=Number(requestData?.invoiceId||requestData?.invoice_id||responseData?.invoice?.id||responseData?.invoiceId)||0;if(invoiceId)out.invoiceId=invoiceId;
  const amount=Number(responseData?.amountCents||responseData?.amount_cents||responseData?.invoice?.amountCents||responseData?.invoice?.amount_cents);if(Number.isFinite(amount)&&amount>0)out.amountCents=Math.round(amount);
  const status=text(responseData?.status||responseData?.paymentStatus||responseData?.diagnosticStatus);if(status)out.resultStatus=status;
  const provider=text(responseData?.provider||responseData?.bankProvider||responseData?.bank_provider);if(provider)out.provider=provider;
  const installments=Number(requestData?.installments||responseData?.installments);if(Number.isFinite(installments)&&installments>0)out.installments=Math.round(installments);
  const latency=Number(responseData?.latencyMs);if(Number.isFinite(latency))out.latencyMs=Math.round(latency);
  const loss=Number(responseData?.packetLoss);if(Number.isFinite(loss))out.packetLoss=loss;
  return out;
}
async function clientIdForAudit(body,responseData,env){const direct=Number(responseData?.client?.id)||0;if(direct)return direct;const token=body?.data?.session;if(token)try{return (await verifySession(token,env)).clientId}catch{}return 0}
async function augmentResponseWithProtocol(response,protocol){if(!protocol)return response;let body={};try{body=await response.clone().json()}catch{return response}if(!body||typeof body!=='object')return response;body.data=body.data&&typeof body.data==='object'?{...body.data,protocol:protocol.protocol,protocolRecord:protocol}:{protocol:protocol.protocol,protocolRecord:protocol};const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers})}
async function auditedBaseFetch(request,env,ctx){
  let body={};try{body=await request.clone().json()}catch{}const action=text(body?.action),path=new URL(request.url).pathname,definition=portalAuditDefinition(path,action),response=await baseWorker.fetch(request,env,ctx);if(!definition||!response.ok||!env.DATABASE_URL)return response;
  try{let responseData={};try{const parsed=await response.clone().json();responseData=parsed?.data||{}}catch{}const clientId=await clientIdForAudit(body,responseData,env);if(!clientId)return response;const protocol=await createProtocol(neon(env.DATABASE_URL),{clientId,category:definition.category,subject:definition.subject,status:'Concluído',details:safeAuditDetails(action,body?.data||{},responseData,definition.details||{})});return augmentResponseWithProtocol(response,protocol)}catch(error){console.error('Provedor Plus: ação da Área do Cliente concluída, mas o protocolo não pôde ser registrado.',error);return response}
}

export default {
  fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path===DUE_PATH)return handleDueDate(request,env);if(path===PORTAL_PATH||path===TRUST_PATH)return auditedBaseFetch(request,env,ctx);return baseWorker.fetch(request,env,ctx)},
  scheduled(controller,env,ctx){return baseWorker.scheduled(controller,env,ctx)}
};
