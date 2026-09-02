import baseWorker from './worker.js';
import { neon } from '@neondatabase/serverless';
import { handleBankProxy } from './worker-bank-native.js';

const STATE_KEY='web_state_v1017';
const BANK_SETTINGS_KEY='bank_credentials_v1';
const DAY=86400000;
const utf8=new TextEncoder();
const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
const normalize=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function parseStateValue(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value==='string'){
    try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}
  }
  return {};
}

async function loadState(sql){
  const rows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`;
  return parseStateValue(Array.isArray(rows)?rows[0]?.value:null);
}

async function saveState(sql,state){
  const updatedAt=new Date().toISOString(),raw=JSON.stringify(state||{});
  await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${STATE_KEY},${raw}::jsonb,${updatedAt}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;
  return updatedAt;
}

function bankB64Bytes(value){
  const binary=atob(text(value)),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}

async function bankCryptoKey(env){
  const secret=text(env.BANK_SECRET_KEY)||text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);
  if(!secret)throw new Error('Chave de proteção das credenciais bancárias não configurada.');
  const raw=await crypto.subtle.digest('SHA-256',utf8.encode(`provedor-plus-bank-v1|${secret}`));
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
}

async function readBankSettings(env,sql){
  const rows=await sql`SELECT value FROM pp_settings WHERE key=${BANK_SETTINGS_KEY} LIMIT 1`,record=Array.isArray(rows)?rows[0]?.value:null;
  if(!record?.iv||!record?.data)return {efi:{},mercadoPago:{}};
  const key=await bankCryptoKey(env),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bankB64Bytes(record.iv)},key,bankB64Bytes(record.data));
  const parsed=JSON.parse(new TextDecoder().decode(plain));
  return parsed&&typeof parsed==='object'?parsed:{efi:{},mercadoPago:{}};
}

function brazilParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};
  for(const part of parts)map[part.type]=part.value;
  return {year:Number(map.year),month:Number(map.month),day:Number(map.day)};
}

function keyFromParts(year,month,day){return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}
function dateFromKey(value){const m=text(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12)):null}
function daysInMonth(year,month){return new Date(Date.UTC(year,month,0,12)).getUTCDate()}
function dueKey(year,month,dueDay){const day=Math.max(1,Math.min(daysInMonth(year,month),Math.floor(num(dueDay)||10)));return keyFromParts(year,month,day)}
function addMonthsDue(value,months,dueDay){const date=dateFromKey(value);if(!date)return '';const target=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+Number(months||0),1,12));return dueKey(target.getUTCFullYear(),target.getUTCMonth()+1,dueDay)}
function daysBetween(fromKey,toKey){const a=dateFromKey(fromKey),b=dateFromKey(toKey);return a&&b?Math.round((b-a)/DAY):9999}
function activeClient(client){return !/bloqueado|cancelado|inativo|suspenso/i.test(text(client?.status))}
function planFor(client,state){return (Array.isArray(state?.plans)?state.plans:[]).find(plan=>Number(plan?.id)===Number(client?.plan_id))||null}
function invoiceActive(row){return normalize(row?.status)!=='cancelado'&&normalize(row?.status)!=='canceled'}
function invoiceForDue(state,clientId,dueDate){return (Array.isArray(state?.invoices)?state.invoices:[]).find(row=>Number(row?.client_id)===Number(clientId)&&text(row?.due_date).slice(0,10)===dueDate&&invoiceActive(row))||null}
function firstInvoiceExists(state,clientId){return (Array.isArray(state?.invoices)?state.invoices:[]).some(row=>Number(row?.client_id)===Number(clientId)&&(row?.billing_origin==='first_prorated'||row?.prorated_first_invoice===true)&&invoiceActive(row))}
function nextInvoiceId(state){const invoices=Array.isArray(state?.invoices)?state.invoices:[],max=Math.max(Number(state?.seq?.invoices)||0,...invoices.map(row=>Number(row?.id)||0)),id=max+1;state.seq={...(state.seq||{}),invoices:id};return id}

function clientLocal(state,id){return (Array.isArray(state?.clients)?state.clients:[]).find(row=>Number(row?.id)===Number(id))||{}}
function mergedClient(remote,state){
  const local=clientLocal(state,remote.id),plan=planFor({...local,...remote},state);
  return {
    ...local,...remote,
    id:Number(remote.id),
    document:text(remote.document||local.document),
    contract_number:text(remote.contract_number||local.contract_number),
    due_day:Number(remote.due_day||local.due_day)||10,
    email:text(remote.email||local.email),
    phone:text(remote.phone||local.phone||local.whatsapp),
    whatsapp:text(local.whatsapp||remote.phone),
    street:text(local.street||remote.address||local.address),
    address:text(remote.address||local.address||local.street),
    address_number:text(local.address_number),
    neighborhood:text(local.neighborhood),
    cep:digits(local.cep||remote.zip_code||local.zip_code),
    zip_code:digits(remote.zip_code||local.zip_code||local.cep),
    city:text(remote.city||local.city),
    state:text(remote.state||local.state).toUpperCase(),
    installation_date:text(local.installation_date||local.activation_date),
    created_at:text(local.created_at),
    billing_bank_provider:text(local.billing_bank_provider||remote.billing_bank_provider),
    plan_id:Number(remote.plan_id||local.plan_id)||null,
    plan_name:text(plan?.name||remote.plan||local.plan)||'Plano Fibra+',
    plan_price_cents:Math.max(0,Math.round(num(plan?.price_cents)))
  };
}

function readyProviders(vault){
  const ready=[];
  if(vault?.efi?.enabled&&text(vault.efi.clientId)&&text(vault.efi.clientSecret))ready.push('efi');
  if(vault?.mercadoPago?.enabled&&text(vault.mercadoPago.accessToken))ready.push('mercadoPago');
  return ready;
}

function providerFor(client,state,vault,existing=''){
  const ready=readyProviders(vault),candidates=[text(existing),text(client.billing_bank_provider),text(state?.banks?.defaultProvider)];
  const selected=candidates.find(item=>ready.includes(item));
  if(selected)return selected;
  if(ready.length===1)return ready[0];
  if(!ready.length)throw new Error('Nenhum banco está pronto para emissão automática. Configure Efí Bank ou Mercado Pago.');
  throw new Error('Há dois bancos ativos. Defina o banco do cliente ou o emissor padrão.');
}

function bankSecrets(vault){
  return {
    efi:{environment:text(vault?.efi?.environment)||'sandbox',clientId:text(vault?.efi?.clientId),clientSecret:text(vault?.efi?.clientSecret),certificatePassword:String(vault?.efi?.certificatePassword||''),certificateBase64:String(vault?.efi?.certificateBase64||''),pixKey:text(vault?.efi?.pixKey),pixAutoReceiverAgency:text(vault?.efi?.pixAutoReceiverAgency),pixAutoReceiverAccount:text(vault?.efi?.pixAutoReceiverAccount),webhookUrl:text(vault?.efi?.webhookUrl)},
    mercadoPago:{environment:text(vault?.mercadoPago?.environment)||'sandbox',publicKey:text(vault?.mercadoPago?.publicKey),accessToken:text(vault?.mercadoPago?.accessToken)}
  };
}

async function bankAction(env,payload){
  const response=await handleBankProxy(new Request('https://painel.fibramais.workers.dev/api/bank-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),env);
  let body={};try{body=await response.json()}catch{}
  if(!response.ok||!body.ok)throw new Error(body?.error||`Falha bancária HTTP ${response.status}.`);
  return body.data||{};
}

async function issueRealBoleto(env,invoice,client,state,vault){
  const provider=providerFor(client,state,vault,invoice.bank_provider),secrets=bankSecrets(vault),source={...invoice,bank_provider:provider,client_name:client.name,client_contract_number:client.contract_number};
  const remote=await bankAction(env,{action:'issue',provider,invoice:source,client,efi:secrets.efi,mercadoPago:secrets.mercadoPago,pixAutoRecord:null});
  Object.assign(invoice,{bank_provider:provider},remote||{});
  return {provider,secrets};
}

async function cancelIssued(env,invoice,client,vault){
  if(!text(invoice?.bank_provider)||!text(invoice?.bank_charge_id))return;
  const secrets=bankSecrets(vault);
  await bankAction(env,{action:'cancel',invoice:{...invoice,client_name:client.name,client_contract_number:client.contract_number},efi:secrets.efi,mercadoPago:secrets.mercadoPago});
}

function currentDueCandidate(client,today,daysBefore){
  const p=brazilParts(dateFromKey(today)||new Date()),candidate=dueKey(p.year,p.month,client.due_day),installation=dateFromKey(client.installation_date||client.created_at);
  let due=candidate;
  if(installation&&dateFromKey(due)?.getTime()<=installation.getTime()){
    const installKey=keyFromParts(installation.getUTCFullYear(),installation.getUTCMonth()+1,installation.getUTCDate());
    due=dueKey(installation.getUTCFullYear(),installation.getUTCMonth()+1,client.due_day);
    if(dateFromKey(due)?.getTime()<=installation.getTime())due=addMonthsDue(due,1,client.due_day);
    if(daysBetween(today,due)<0)return null;
    if(daysBetween(today,due)>daysBefore)return null;
    return due;
  }
  const diff=daysBetween(today,due);
  if(diff<0||diff>daysBefore)return null;
  return due;
}

function firstProrated(client,plan){
  const activation=dateFromKey(client.installation_date||client.created_at);if(!activation)return null;
  const activationKey=keyFromParts(activation.getUTCFullYear(),activation.getUTCMonth()+1,activation.getUTCDate());
  let due=dueKey(activation.getUTCFullYear(),activation.getUTCMonth()+1,client.due_day);
  if(dateFromKey(due)?.getTime()<=activation.getTime())due=addMonthsDue(due,1,client.due_day);
  const previous=addMonthsDue(due,-1,client.due_day),cycleDays=Math.max(1,daysBetween(previous,due)),serviceDays=Math.max(1,Math.min(cycleDays,daysBetween(activationKey,due))),base=Math.max(0,Math.round(num(plan?.price_cents))),amount=Math.max(1,Math.min(base,Math.round(base*serviceDays/cycleDays)));
  return {due,serviceDays,cycleDays,base,amount};
}

function makeInvoice(state,client,dueDate,amountCents,{first=false,serviceDays=0,cycleDays=0,baseAmount=0}={}){
  const now=new Date().toISOString(),id=nextInvoiceId(state),reference=dueDate.slice(0,7);
  return {
    id,client_id:Number(client.id),due_date:dueDate,amount_cents:Math.max(1,Math.round(amountCents)),status:'Pendente',document_type:'Boleto',
    billing_type:first?'Primeira mensalidade proporcional':'Mensalidade',
    description:first?`Primeira mensalidade proporcional · ${serviceDays} dia${serviceDays===1?'':'s'} de serviço`:`Mensalidade ${reference}`,
    billing_origin:first?'first_prorated':'monthly_auto',auto_generated:true,prorated_first_invoice:first===true,
    competency:reference,reference,base_amount_cents:Math.max(1,Math.round(baseAmount||amountCents)),cashback_eligible:!first,cashback_reason:first?'primeira_cobranca_proporcional':'mensalidade_normal',
    payment_method:'',paid_by:'',paid_at:null,created_at:now,
    ...(first?{service_days:serviceDays,cycle_days:cycleDays}:{})
  };
}

async function persistIssued(sql,state,invoice,client,vault){
  state.invoices=Array.isArray(state.invoices)?state.invoices:[];
  state.invoices.push(invoice);
  try{await saveState(sql,state)}catch(error){
    state.invoices=state.invoices.filter(row=>String(row?.id)!==String(invoice.id));
    try{await cancelIssued(null,invoice,client,vault)}catch{}
    throw error;
  }
}

async function runBillingCron(env){
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL não configurada para a geração automática.');
  const sql=neon(env.DATABASE_URL),state=await loadState(sql);state.settings={...(state.settings||{})};
  const enabled=state.settings.billing_auto_enabled!==false&&String(state.settings.billing_auto_enabled)!=='false';
  if(!enabled)return {enabled:false,generated:0,issued:0,failed:0};
  const todayParts=brazilParts(),today=keyFromParts(todayParts.year,todayParts.month,todayParts.day),daysBefore=Math.max(1,Math.min(30,Math.floor(num(state.settings.billing_auto_days_before)||7));
  if(text(state.settings.billing_cloudflare_last_run)===today)return {alreadyRan:true,date:today};
  const vault=await readBankSettings(env,sql),rows=await sql`SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code FROM pp_clients ORDER BY id ASC`;
  let generated=0,issued=0,skipped=0,failed=0;const errors=[];
  for(const remote of Array.isArray(rows)?rows:[]){
    const client=mergedClient(remote,state);if(!activeClient(client)){skipped++;continue}
    const plan=planFor(client,state);if(!plan||num(plan.price_cents)<=0){failed++;errors.push(`${client.name||client.id}: cliente sem plano com valor.`);continue}
    try{
      let dueDate='',existing=null,invoice=null;
      if(!firstInvoiceExists(state,client.id)&&dateFromKey(client.installation_date||client.created_at)){
        const calc=firstProrated(client,plan);if(!calc){skipped++;continue}
        const diff=daysBetween(today,calc.due);if(diff<1||diff>30){skipped++;continue}
        dueDate=calc.due;existing=invoiceForDue(state,client.id,dueDate);
        if(existing)invoice=existing;else invoice=makeInvoice(state,client,dueDate,calc.amount,{first:true,serviceDays:calc.serviceDays,cycleDays:calc.cycleDays,baseAmount:calc.base});
      }else{
        dueDate=currentDueCandidate(client,today,daysBefore);if(!dueDate){skipped++;continue}
        existing=invoiceForDue(state,client.id,dueDate);
        if(existing)invoice=existing;else invoice=makeInvoice(state,client,dueDate,Math.max(1,Math.round(num(plan.price_cents))),{baseAmount:plan.price_cents});
      }
      if(text(invoice.status).toLowerCase().includes('pago')||text(invoice.bank_charge_id)){skipped++;continue}
      await issueRealBoleto(env,invoice,client,state,vault);issued++;
      if(!existing){state.invoices=Array.isArray(state.invoices)?state.invoices:[];state.invoices.push(invoice);generated++}
      await saveState(sql,state);
    }catch(error){failed++;errors.push(`${client.name||client.id}: ${error instanceof Error?error.message:String(error)}`)}
  }
  state.settings.billing_auto_enabled=true;
  state.settings.billing_auto_days_before=daysBefore;
  state.settings.billing_auto_last_run=today;
  state.settings.billing_cloudflare_last_run=today;
  state.settings.billing_cloudflare_last_result={generated,issued,skipped,failed,at:new Date().toISOString(),errors:errors.slice(0,50)};
  await saveState(sql,state);
  return {date:today,generated,issued,skipped,failed,errors};
}

export { runBillingCron };

export default {
  fetch(request,env,ctx){return baseWorker.fetch(request,env,ctx)},
  scheduled(controller,env,ctx){ctx.waitUntil(runBillingCron(env).catch(error=>console.error('Provedor Plus: falha no cron de mensalidades.',error)))}
};
