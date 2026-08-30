import { neon } from '@neondatabase/serverless';
import { handleNativeAuth,handleNativeCloudState,handleNativeCloudData } from './worker-native-api.js';

const SPECIALIZED_UPSTREAM='https://fibratelecom.vercel.app';
const STATE_KEY='web_state_v1017';
const BANK_SETTINGS_KEY='bank_credentials_v1';
const CUSTOMER_PORTAL_PATH='/api/customer-portal';
const SPECIALIZED_PROXY_PATHS=new Set(['/api/bank-proxy','/api/mikrotik-proxy','/api/mikrotik-proxy-v2']);
const ALLOWED_PORTAL_ORIGINS=new Set([
  'https://cliente.fibramais.workers.dev'
]);

const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const bankUtf8=new TextEncoder();
const portalUtf8=new TextEncoder();

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}
  });
}

function portalCors(request){
  const origin=text(request.headers.get('origin'));
  const headers={
    'Vary':'Origin',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'86400'
  };
  if(origin&&ALLOWED_PORTAL_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
  return headers;
}

function copyHeaders(headers){
  const next=new Headers(headers);
  next.delete('host');
  next.delete('content-length');
  next.delete('cf-connecting-ip');
  next.delete('cf-ipcountry');
  next.delete('cf-ray');
  next.delete('cf-visitor');
  return next;
}

function bankB64(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  let binary='';
  for(const byte of view)binary+=String.fromCharCode(byte);
  return btoa(binary);
}

function bankBytes(value){
  const binary=atob(text(value));
  const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}

async function bankCryptoKey(env){
  const secret=text(env.BANK_SECRET_KEY)||text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);
  if(!secret)throw Object.assign(new Error('Chave de proteção das credenciais bancárias não configurada.'),{statusCode:503});
  const raw=await crypto.subtle.digest('SHA-256',bankUtf8.encode(`provedor-plus-bank-v1|${secret}`));
  return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}

async function encryptBankSettings(env,value){
  const key=await bankCryptoKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bankUtf8.encode(JSON.stringify(value||{})));
  return {v:1,iv:bankB64(iv),data:bankB64(new Uint8Array(cipher))};
}

async function decryptBankSettings(env,record){
  if(!record?.iv||!record?.data)return {};
  try{
    const key=await bankCryptoKey(env),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bankBytes(record.iv)},key,bankBytes(record.data));
    const parsed=JSON.parse(new TextDecoder().decode(plain));
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{
    throw Object.assign(new Error('Não foi possível abrir as credenciais bancárias salvas.'),{statusCode:500});
  }
}

function emptyBankSettings(){
  return {
    efi:{enabled:false,environment:'sandbox',clientId:'',clientSecret:'',certificatePassword:'',pixKey:'',pixAutoReceiverAgency:'',pixAutoReceiverAccount:'',webhookUrl:''},
    mercadoPago:{enabled:false,environment:'sandbox',publicKey:'',accessToken:''}
  };
}

async function requireBankAdmin(request,env){
  const headers=new Headers(request.headers);
  headers.set('Content-Type','application/json');
  const authRequest=new Request(request.url,{method:'POST',headers,body:JSON.stringify({action:'status'})});
  const response=await handleNativeAuth(authRequest,env);
  let body={};
  try{body=await response.json()}catch{}
  if(!response.ok||!body.ok||body?.data?.authenticated!==true)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});
  if(text(body?.data?.user?.role).toLowerCase()!=='admin')throw Object.assign(new Error('Somente o administrador pode alterar as credenciais bancárias.'),{statusCode:403});
  return body.data.user;
}

async function readBankSettings(env){
  if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada.'),{statusCode:503});
  const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${BANK_SETTINGS_KEY} LIMIT 1`;
  const encrypted=Array.isArray(rows)?rows[0]?.value:null;
  if(!encrypted)return emptyBankSettings();
  const stored=await decryptBankSettings(env,encrypted);
  return {
    ...emptyBankSettings(),
    ...stored,
    efi:{...emptyBankSettings().efi,...(stored?.efi||{})},
    mercadoPago:{...emptyBankSettings().mercadoPago,...(stored?.mercadoPago||{})}
  };
}

async function writeBankSettings(env,value){
  if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada.'),{statusCode:503});
  const sql=neon(env.DATABASE_URL),updatedAt=new Date().toISOString(),encrypted=await encryptBankSettings(env,value),raw=JSON.stringify(encrypted);
  await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${BANK_SETTINGS_KEY},${raw}::jsonb,${updatedAt}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;
  return value;
}

function mergeEfiBank(current,data={}){
  const previous=current?.efi||emptyBankSettings().efi;
  return {
    enabled:data.enabled===undefined?Boolean(previous.enabled):Boolean(data.enabled),
    environment:data.environment==='production'?'production':data.environment==='sandbox'?'sandbox':text(previous.environment)||'sandbox',
    clientId:text(data.clientId)||text(previous.clientId),
    clientSecret:text(data.clientSecret)||text(previous.clientSecret),
    certificatePassword:String(data.certificatePassword??'')?String(data.certificatePassword):String(previous.certificatePassword||''),
    pixKey:data.pixKey===undefined?text(previous.pixKey):text(data.pixKey),
    pixAutoReceiverAgency:data.pixAutoReceiverAgency===undefined?text(previous.pixAutoReceiverAgency):digits(data.pixAutoReceiverAgency),
    pixAutoReceiverAccount:data.pixAutoReceiverAccount===undefined?text(previous.pixAutoReceiverAccount):digits(data.pixAutoReceiverAccount),
    webhookUrl:data.webhookUrl===undefined?text(previous.webhookUrl):text(data.webhookUrl)
  };
}

function mergeMercadoPagoBank(current,data={}){
  const previous=current?.mercadoPago||emptyBankSettings().mercadoPago;
  return {
    enabled:data.enabled===undefined?Boolean(previous.enabled):Boolean(data.enabled),
    environment:data.environment==='production'?'production':data.environment==='sandbox'?'sandbox':text(previous.environment)||'sandbox',
    publicKey:data.publicKey===undefined?text(previous.publicKey):text(data.publicKey),
    accessToken:text(data.accessToken)||text(previous.accessToken)
  };
}

async function handleBankSettings(request,env){
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-bank-settings'});
  try{
    await requireBankAdmin(request,env);
    let body={};
    try{body=await request.json()}catch{}
    const action=text(body?.action),data=body?.data||{};
    let result;
    if(action==='get')result=await readBankSettings(env);
    else if(action==='save-efi'){
      const current=await readBankSettings(env),next={...current,efi:mergeEfiBank(current,data)};
      result=await writeBankSettings(env,next);
    }else if(action==='save-mercado-pago'){
      const current=await readBankSettings(env),next={...current,mercadoPago:mergeMercadoPagoBank(current,data)};
      result=await writeBankSettings(env,next);
    }else throw Object.assign(new Error('Ação bancária não permitida.'),{statusCode:400});
    return json({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-bank-settings'});
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-bank-settings'});
  }
}

async function proxySpecializedApi(request){
  const incoming=new URL(request.url);
  const target=new URL(incoming.pathname+incoming.search,SPECIALIZED_UPSTREAM);
  const headers=copyHeaders(request.headers);
  headers.set('x-forwarded-host',incoming.host);
  headers.set('x-forwarded-proto','https');
  const init={method:request.method,headers,redirect:'manual'};
  if(request.method!=='GET'&&request.method!=='HEAD')init.body=request.body;
  const response=await fetch(target.toString(),init);
  const responseHeaders=new Headers(response.headers);
  const location=responseHeaders.get('location');
  if(location&&location.startsWith(SPECIALIZED_UPSTREAM))responseHeaders.set('location',location.replace(SPECIALIZED_UPSTREAM,incoming.origin));
  responseHeaders.set('x-provedor-plus-edge','cloudflare-specialized-integration');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:responseHeaders});
}

function formatDate(value){
  const raw=text(value).slice(0,10);
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:text(value);
}

function moneyNumber(row){
  const centsKeys=['amount_cents','total_cents','value_cents','price_cents','service_amount_cents'];
  for(const key of centsKeys){const n=number(row?.[key]);if(n!==null)return n/100;}
  const keys=['amount','total','value','price','service_amount'];
  for(const key of keys){const n=number(row?.[key]);if(n!==null)return n;}
  return 0;
}

function invoiceCents(row){
  const centsKeys=['amount_cents','total_cents','value_cents','price_cents','service_amount_cents'];
  for(const key of centsKeys){const n=number(row?.[key]);if(n!==null)return Math.max(0,Math.round(n));}
  return Math.max(0,Math.round(moneyNumber(row)*100));
}

function brl(value){
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
}

function brlCents(value){return brl((Number(value)||0)/100)}

function invoiceReference(row){
  const explicit=text(row?.reference||row?.competency||row?.competence||row?.month||row?.period);
  if(explicit)return explicit;
  const raw=text(row?.due_date||row?.dueDate).slice(0,10),match=raw.match(/^(\d{4})-(\d{2})-/);
  return match?`${match[2]}/${match[1]}`:'';
}

function mapInvoice(row,client,state){
  const total=moneyNumber(row);
  const planName=text(client.plan_name||client.plan||state?.plans?.find?.(p=>Number(p?.id)===Number(client.plan_id))?.name)||'Serviço de internet';
  const company=state?.settings||state?.company||{};
  return {
    id:row?.id??null,
    reference:invoiceReference(row),
    dueDate:formatDate(row?.due_date||row?.dueDate),
    dueDateRaw:text(row?.due_date||row?.dueDate),
    total:brl(total),
    totalNumber:total,
    status:text(row?.status)||'Pendente',
    serviceName:text(row?.description)||planName,
    serviceAmount:brl(total),
    serviceAmountRaw:brl(total),
    subtotal:brl(total),
    quantity:'1',
    unitAmount:brl(total),
    customerName:text(client.name),
    customerDocument:text(client.document),
    customerAddress:[client.address||client.street,client.city,client.state].map(text).filter(Boolean).join(' - '),
    customerWhatsapp:text(client.phone||client.whatsapp),
    contract:text(client.contract_number),
    companyName:text(company.company_name||company.companyName||company.name)||'Fibra+',
    companyCnpj:text(company.cnpj||company.company_cnpj),
    companyIe:text(company.ie||company.state_registration||company.inscricao_estadual),
    companyWhatsapp:text(company.whatsapp||company.phone)||'(92) 98486-7428',
    pixPaymentUrl:text(row?.pix_payment_url||row?.pixPaymentUrl||row?.pix_url||row?.pixUrl),
    pixCopyPaste:text(row?.pix_copy_paste||row?.pixCopyPaste||row?.pix_payload||row?.pixPayload),
    pixQrImage:text(row?.pix_qr_image||row?.pixQrImage||row?.pix_qr_url||row?.qr_code_url),
    cardPaymentUrl:text(row?.card_payment_url||row?.cardPaymentUrl||row?.checkout_url||row?.payment_url),
    pdfUrl:text(row?.pdf_url||row?.invoice_pdf_url||row?.boleto_pdf_url||row?.bank_slip_pdf_url),
    digitableLine:text(row?.digitable_line||row?.linha_digitavel),
    barcodeImage:text(row?.barcode_image||row?.barcode_url),
    bankCode:text(row?.bank_code||row?.bankCode),
    ourNumber:text(row?.our_number||row?.nosso_numero),
    documentNumber:text(row?.document_number||row?.number||row?.id),
    cashbackEnabled:row?.cashback_enabled!==false&&row?.cashback_eligible!==false,
    cashbackRate:number(row?.cashback_rate??state?.settings?.cashback_rate)??null,
    cashbackPending:number(row?.cashback_pending)??null,
    cashbackBalance:number(client?.cashback_balance)??0,
    negotiationId:text(row?.negotiation_id),
    installmentNumber:number(row?.installment_number)??null,
    installmentTotal:number(row?.installment_total)??null
  };
}

function mapPlan(plan){
  const cents=number(plan?.price_cents),plain=number(plan?.price??plan?.amount);
  return {
    id:plan?.id??null,
    name:text(plan?.name||plan?.title)||'Plano Fibra+',
    speed:text(plan?.speed||plan?.bandwidth),
    description:text(plan?.description),
    price:cents!==null?cents/100:(plain??0),
    highlight:plan?.highlight===true,
    badge:text(plan?.badge||plan?.category)||'Plano Fibra+'
  };
}

function sameClient(client,{document,contract}){
  const doc=digits(client?.document),storedContract=text(client?.contract_number),storedContractDigits=digits(storedContract);
  const byDocument=document?doc===document:false;
  const byContract=contract?(storedContract===contract||storedContractDigits===digits(contract)):false;
  if(document&&contract)return byDocument&&byContract;
  return byDocument||byContract;
}

function parseStateValue(value){
  if(value&&typeof value==='object')return value;
  if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:{}}catch{}}
  return {};
}

function base64Url(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  let binary='';
  for(const byte of view)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64UrlBytes(value){
  let raw=text(value).replace(/-/g,'+').replace(/_/g,'/');
  while(raw.length%4)raw+='=';
  const binary=atob(raw),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}

async function portalHmacKey(env,usage=['sign','verify']){
  const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);
  if(!secret)throw Object.assign(new Error('Sessão segura do portal não configurada.'),{statusCode:503});
  return crypto.subtle.importKey('raw',portalUtf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usage);
}

async function portalSession(client,env){
  const payload={clientId:Number(client.id)||client.id,exp:Date.now()+30*60*1000};
  const encoded=base64Url(portalUtf8.encode(JSON.stringify(payload)));
  const key=await portalHmacKey(env,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,portalUtf8.encode(encoded));
  return `${encoded}.${base64Url(signature)}`;
}

async function verifyPortalSession(token,env){
  const raw=text(token),parts=raw.split('.');
  if(parts.length!==2||!parts[0]||!parts[1])throw Object.assign(new Error('Sessão do cliente inválida. Entre novamente.'),{statusCode:401});
  try{
    const key=await portalHmacKey(env,['verify']),ok=await crypto.subtle.verify('HMAC',key,base64UrlBytes(parts[1]),portalUtf8.encode(parts[0]));
    if(!ok)throw new Error('assinatura');
    const payload=JSON.parse(new TextDecoder().decode(base64UrlBytes(parts[0]))),clientId=Number(payload?.clientId)||0,exp=Number(payload?.exp)||0;
    if(!clientId||exp<=Date.now())throw new Error('expirada');
    return {clientId,exp,token:raw};
  }catch{
    throw Object.assign(new Error('Sessão do cliente expirada ou inválida. Entre novamente.'),{statusCode:401});
  }
}

async function loadState(sql){
  const rows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`;
  return parseStateValue(Array.isArray(rows)?rows[0]?.value:null);
}

async function saveState(sql,state){
  const raw=JSON.stringify(state||{}),updatedAt=new Date().toISOString();
  await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${STATE_KEY},${raw}::jsonb,${updatedAt}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;
  return {state,updated_at:updatedAt};
}

async function portalClientById(sql,clientId){
  const rows=await sql`
    SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,
           router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync
    FROM pp_clients WHERE id=${Number(clientId)} LIMIT 1
  `;
  return Array.isArray(rows)?rows[0]||null:null;
}

function portalClientData(client){
  return {
    id:client.id,
    name:text(client.name),
    firstName:text(client.name).split(/\s+/)[0]||'',
    document:text(client.document),
    contract:text(client.contract_number),
    whatsapp:text(client.phone),
    email:text(client.email),
    address:[client.address,client.city,client.state].map(text).filter(Boolean).join(' - '),
    status:text(client.status),
    plan:text(client.plan)
  };
}

function safeNegotiation(item){
  return {
    id:text(item?.id),
    status:text(item?.status),
    createdAt:text(item?.created_at),
    originalAmountCents:Number(item?.original_amount_cents)||0,
    discountCents:Number(item?.discount_cents)||0,
    negotiatedAmountCents:Number(item?.negotiated_amount_cents)||0,
    installmentTotal:Number(item?.installment_total)||0,
    originalInvoiceIds:Array.isArray(item?.original_invoice_ids)?item.original_invoice_ids:[],
    newInvoiceIds:Array.isArray(item?.new_invoice_ids)?item.new_invoice_ids:[]
  };
}

async function portalSnapshot(client,state,env,sessionToken=''){
  const invoices=(Array.isArray(state.invoices)?state.invoices:[])
    .filter(row=>Number(row?.client_id)===Number(client.id))
    .map(row=>mapInvoice(row,client,state))
    .sort((a,b)=>String(b.dueDateRaw).localeCompare(String(a.dueDateRaw)));
  const inactiveStatuses=new Set(['pago','paid','baixado','cancelado','canceled','renegociado','renegotiated','substituido','substituida']);
  const pending=invoices.filter(row=>!inactiveStatuses.has(text(row.status).toLowerCase()));
  const current=(pending.sort((a,b)=>String(a.dueDateRaw).localeCompare(String(b.dueDateRaw)))[0]||invoices[0]||null);
  const plans=(Array.isArray(state.plans)?state.plans:[])
    .filter(plan=>plan?.active!==false&&plan?.enabled!==false&&plan?.portal_visible!==false)
    .map(mapPlan);
  const connectionStatus=text(client.mikrotik_status||client.status);
  const online=/online|conectado|ativo/i.test(connectionStatus)&&!/offline|desconectado|bloqueado/i.test(connectionStatus);
  const negotiations=(Array.isArray(state.negotiations)?state.negotiations:[])
    .filter(item=>Number(item?.client_id)===Number(client.id))
    .slice(-20).reverse().map(safeNegotiation);
  return {
    session:sessionToken||await portalSession(client,env),
    client:portalClientData(client),
    invoice:current,
    invoices,
    plans,
    negotiations,
    connection:{
      status:connectionStatus||'Aguardando dados',
      pppoeStatus:client.connection_type==='PPPoE'?(online?'Conectado':'Aguardando confirmação'):'Não se aplica',
      pppoeConnected:client.connection_type==='PPPoE'?online:null,
      ip:text(client.ip)||'Aguardando dados',
      lastConnection:text(client.mikrotik_last_sync)||'Aguardando dados',
      quality:online?'Boa':'Aguardando dados',
      regionIssue:{active:false,status:'clear',title:'Nenhum problema informado na região',message:'Não há manutenção ou indisponibilidade geral informada no momento.'}
    }
  };
}

function boolValue(value,fallback){
  if(value===undefined||value===null||value==='')return fallback;
  if(typeof value==='boolean')return value;
  const v=text(value).toLowerCase();
  if(['true','1','sim','yes','on'].includes(v))return true;
  if(['false','0','nao','não','no','off'].includes(v))return false;
  return fallback;
}

function bounded(value,fallback,min,max){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

function negotiationRules(state){
  const settings=state?.settings||{};
  return {
    enabled:boolValue(settings.negotiation_auto_enabled,true),
    minOverdueDays:Math.floor(bounded(settings.negotiation_min_overdue_days,1,0,365)),
    cashDiscountPercent:bounded(settings.negotiation_cash_discount_percent,10,0,100),
    installmentDiscountPercent:bounded(settings.negotiation_installment_discount_percent,0,0,100),
    maxInstallments:Math.floor(bounded(settings.negotiation_max_installments,6,1,12)),
    entryPercent:bounded(settings.negotiation_entry_percent,20,0,100),
    firstDueDays:Math.floor(bounded(settings.negotiation_first_due_days,5,0,30))
  };
}

function dateKey(date=new Date()){
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
}

function dateFromKeyUtc(value){
  const m=text(value).slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12)):null;
}

function addDaysKey(key,days){
  const date=dateFromKeyUtc(key)||new Date();date.setUTCDate(date.getUTCDate()+Number(days||0));return dateKey(date);
}

function addMonthsKey(key,months){
  const date=dateFromKeyUtc(key)||new Date(),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+Number(months||0));
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12)).getUTCDate();
  date.setUTCDate(Math.min(day,last));return dateKey(date);
}

function overdueDays(dueKey){
  const due=dateFromKeyUtc(dueKey),today=dateFromKeyUtc(dateKey());
  if(!due||!today||due.getTime()>=today.getTime())return 0;
  return Math.floor((today.getTime()-due.getTime())/86400000);
}

function negotiationInvoiceEligible(row,clientId,rules){
  if(Number(row?.client_id)!==Number(clientId))return false;
  const status=text(row?.status).toLowerCase();
  if(['pago','paid','baixado','cancelado','canceled','renegociado','renegotiated','substituido','substituida'].some(value=>status.includes(value)))return false;
  if(text(row?.negotiation_id))return false;
  const due=text(row?.due_date||row?.dueDate).slice(0,10),days=overdueDays(due);
  return Boolean(due)&&days>=rules.minOverdueDays&&days>0&&invoiceCents(row)>0;
}

function installmentSchedule(totalCents,count,entryPercent,firstDueDate){
  const total=Math.max(1,Math.round(Number(totalCents)||0)),qty=Math.max(1,Math.round(Number(count)||1));
  if(qty===1)return [{number:1,dueDate:firstDueDate,amountCents:total}];
  let entry=Number(entryPercent)>0?Math.round(total*Number(entryPercent)/100):Math.floor(total/qty);
  entry=Math.max(1,Math.min(total-(qty-1),entry));
  const remaining=total-entry,parts=qty-1,base=Math.floor(remaining/parts),extra=remaining-base*parts,out=[{number:1,dueDate:firstDueDate,amountCents:entry}];
  for(let i=0;i<parts;i++)out.push({number:i+2,dueDate:addMonthsKey(firstDueDate,i+1),amountCents:base+(i<extra?1:0)});
  return out;
}

function buildNegotiationOptions(state,client,invoiceIds){
  const rules=negotiationRules(state),all=Array.isArray(state.invoices)?state.invoices:[],eligible=all.filter(row=>negotiationInvoiceEligible(row,client.id,rules));
  const explicit=Array.isArray(invoiceIds),wanted=new Set((invoiceIds||[]).map(value=>String(value)));
  const selected=explicit?eligible.filter(row=>wanted.has(String(row.id))):eligible;
  const originalCents=selected.reduce((sum,row)=>sum+invoiceCents(row),0),firstDueDate=addDaysKey(dateKey(),rules.firstDueDays),options=[];
  if(originalCents>0){
    const cashDiscountCents=Math.min(originalCents-1,Math.max(0,Math.round(originalCents*rules.cashDiscountPercent/100))),cashTotal=Math.max(1,originalCents-cashDiscountCents);
    options.push({id:'cash',label:'À vista',installments:1,discountPercent:rules.cashDiscountPercent,discountCents:cashDiscountCents,totalCents:cashTotal,entryCents:cashTotal,firstDueDate,schedule:installmentSchedule(cashTotal,1,100,firstDueDate)});
    for(let qty=2;qty<=rules.maxInstallments;qty++){
      const discountCents=Math.min(originalCents-1,Math.max(0,Math.round(originalCents*rules.installmentDiscountPercent/100))),totalCents=Math.max(qty,originalCents-discountCents),schedule=installmentSchedule(totalCents,qty,rules.entryPercent,firstDueDate);
      options.push({id:`p${qty}`,label:`${qty} parcelas`,installments:qty,discountPercent:rules.installmentDiscountPercent,discountCents,totalCents,entryCents:schedule[0]?.amountCents||0,firstDueDate,schedule});
    }
  }
  return {
    enabled:rules.enabled,
    rules,
    eligibleInvoices:eligible.map(row=>({id:row.id,reference:invoiceReference(row),dueDate:formatDate(row.due_date||row.dueDate),dueDateRaw:text(row.due_date||row.dueDate),daysOverdue:overdueDays(text(row.due_date||row.dueDate).slice(0,10)),amountCents:invoiceCents(row),total:brlCents(invoiceCents(row)),status:text(row.status)||'Pendente'})),
    selectedInvoiceIds:selected.map(row=>row.id),
    originalCents,
    originalTotal:brlCents(originalCents),
    options
  };
}

function stateClient(state,client){return (Array.isArray(state?.clients)?state.clients:[]).find(row=>Number(row?.id)===Number(client.id))||{}}

function bankClient(client,state){
  const local=stateClient(state,client),plan=state?.plans?.find?.(item=>Number(item?.id)===Number(local.plan_id||client.plan_id));
  return {...local,...client,plan_name:text(plan?.name||client.plan||local.plan)||'Sem plano',plan_speed:text(plan?.speed)};
}

function bankInvoice(invoice,client,state){
  const local=stateClient(state,client),plan=state?.plans?.find?.(item=>Number(item?.id)===Number(local.plan_id||client.plan_id));
  return {
    ...invoice,
    client_name:text(client.name),
    client_phone:text(client.phone),
    client_whatsapp:text(local.whatsapp||client.phone),
    client_document:text(client.document),
    client_email:text(client.email),
    client_neighborhood:text(local.neighborhood),
    client_cep:text(local.cep||client.zip_code),
    client_street:text(local.street||client.address),
    client_address_number:text(local.address_number),
    client_complement:text(local.complement),
    client_city:text(client.city),
    client_state:text(client.state),
    client_contract_number:text(client.contract_number),
    client_status:text(client.status),
    client_plan:text(plan?.name||client.plan)||'Sem plano'
  };
}

function bankSecretsFromVault(vault){
  return {
    efi:{environment:text(vault?.efi?.environment)||'sandbox',clientId:text(vault?.efi?.clientId),clientSecret:text(vault?.efi?.clientSecret),certificatePassword:String(vault?.efi?.certificatePassword||''),certificateBase64:String(vault?.efi?.certificateBase64||''),pixKey:text(vault?.efi?.pixKey),pixAutoReceiverAgency:text(vault?.efi?.pixAutoReceiverAgency),pixAutoReceiverAccount:text(vault?.efi?.pixAutoReceiverAccount),webhookUrl:text(vault?.efi?.webhookUrl)},
    mercadoPago:{environment:text(vault?.mercadoPago?.environment)||'sandbox',publicKey:text(vault?.mercadoPago?.publicKey),accessToken:text(vault?.mercadoPago?.accessToken)}
  };
}

async function negotiationBankContext(env,state,client,selectedRows){
  const vault=await readBankSettings(env),ready=[];
  if(vault?.efi?.enabled&&text(vault.efi.clientId)&&text(vault.efi.clientSecret))ready.push('efi');
  if(vault?.mercadoPago?.enabled&&text(vault.mercadoPago.accessToken))ready.push('mercadoPago');
  if(!ready.length)throw Object.assign(new Error('A negociação automática está aguardando a configuração do banco no Provedor Plus.'),{statusCode:409});
  const local=stateClient(state,client),original=[...new Set((selectedRows||[]).map(row=>text(row?.bank_provider)).filter(provider=>ready.includes(provider)))];
  const candidates=[text(local.billing_bank_provider),text(state?.banks?.defaultProvider),original.length===1?original[0]:''];
  let provider=candidates.find(value=>ready.includes(value))||'';
  if(!provider&&ready.length===1)provider=ready[0];
  if(!provider)throw Object.assign(new Error('Defina o banco emissor padrão em Integração antes de liberar a negociação automática.'),{statusCode:409});
  return {provider,vault,secrets:bankSecretsFromVault(vault)};
}

async function sha256Hex(value){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',portalUtf8.encode(String(value||''))));
  return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function serviceToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return base64Url(bytes)}

async function bankProxyAsService(env,sql,payload){
  const admins=await sql`SELECT id FROM pp_users WHERE role='admin' ORDER BY id ASC LIMIT 1`,adminId=Number(admins?.[0]?.id)||0;
  if(!adminId)throw Object.assign(new Error('Administrador do Provedor Plus não encontrado para autorizar a emissão bancária.'),{statusCode:503});
  const token=serviceToken(),tokenHash=await sha256Hex(token),expires=new Date(Date.now()+2*60*1000).toISOString();
  await sql`INSERT INTO pp_sessions (user_id,token_hash,expires_at) VALUES (${adminId},${tokenHash},${expires})`;
  try{
    const response=await fetch(`${SPECIALIZED_UPSTREAM}/api/bank-proxy`,{method:'POST',headers:{'Content-Type':'application/json','Cookie':`pp_session=${encodeURIComponent(token)}`},body:JSON.stringify(payload)});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw Object.assign(new Error(body?.error||`Falha na integração bancária (HTTP ${response.status}).`),{statusCode:response.status>=400&&response.status<500?409:502});
    return body.data||{};
  }finally{
    try{await sql`DELETE FROM pp_sessions WHERE token_hash=${tokenHash}`}catch{}
  }
}

function nextInvoiceId(state){
  const rows=Array.isArray(state.invoices)?state.invoices:[],seq=Math.max(Number(state?.seq?.invoices)||0,...rows.map(row=>Number(row?.id)||0)),next=seq+1;
  state.seq={...(state.seq||{}),invoices:next};return next;
}

async function negotiationOptionsForSession(env,data){
  if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão nativa com o Neon não configurada na Cloudflare.'),{statusCode:503});
  const session=await verifyPortalSession(data?.session,env),sql=neon(env.DATABASE_URL),client=await portalClientById(sql,session.clientId);
  if(!client)throw Object.assign(new Error('Cliente da sessão não foi encontrado.'),{statusCode:404});
  const state=await loadState(sql),preview=buildNegotiationOptions(state,client,Array.isArray(data?.invoiceIds)?data.invoiceIds:undefined);
  let bankReady=false,bankMessage='';
  if(preview.enabled&&preview.selectedInvoiceIds.length){
    const ids=new Set(preview.selectedInvoiceIds.map(value=>String(value))),selected=(state.invoices||[]).filter(row=>ids.has(String(row.id)));
    try{await negotiationBankContext(env,state,client,selected);bankReady=true}catch(error){bankMessage=error instanceof Error?error.message:String(error)}
  }
  return {...preview,bankReady,bankMessage};
}

async function negotiateForSession(env,data){
  if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão nativa com o Neon não configurada na Cloudflare.'),{statusCode:503});
  const session=await verifyPortalSession(data?.session,env),sql=neon(env.DATABASE_URL),client=await portalClientById(sql,session.clientId);
  if(!client)throw Object.assign(new Error('Cliente da sessão não foi encontrado.'),{statusCode:404});
  const state=await loadState(sql),preview=buildNegotiationOptions(state,client,Array.isArray(data?.invoiceIds)?data.invoiceIds:[]),rules=preview.rules;
  if(!rules.enabled)throw Object.assign(new Error('A negociação automática não está disponível no momento.'),{statusCode:409});
  if(!preview.selectedInvoiceIds.length)throw Object.assign(new Error('Selecione pelo menos uma fatura vencida disponível para negociação.'),{statusCode:400});
  const option=preview.options.find(item=>item.id===text(data?.optionId));
  if(!option)throw Object.assign(new Error('Escolha uma condição de acordo válida.'),{statusCode:400});
  const selectedKeys=new Set(preview.selectedInvoiceIds.map(value=>String(value))),selected=(state.invoices||[]).filter(row=>selectedKeys.has(String(row.id)));
  if(selected.length!==preview.selectedInvoiceIds.length)throw Object.assign(new Error('Uma das faturas mudou. Atualize as condições antes de confirmar.'),{statusCode:409});
  const bank=await negotiationBankContext(env,state,client,selected),nextState=JSON.parse(JSON.stringify(state||{}));
  nextState.invoices=Array.isArray(nextState.invoices)?nextState.invoices:[];nextState.negotiations=Array.isArray(nextState.negotiations)?nextState.negotiations:[];
  const agreementId=`NEG-${Number(client.id)}-${Date.now().toString(36).toUpperCase()}`,createdAt=new Date().toISOString(),newInvoices=[];
  for(const part of option.schedule){
    const id=nextInvoiceId(nextState),invoice={
      id,client_id:Number(client.id),due_date:part.dueDate,amount_cents:Number(part.amountCents)||0,status:'Pendente',document_type:'Boleto',billing_type:'Renegociação',
      description:`Acordo ${agreementId} · Parcela ${part.number}/${option.installments}`,installment_group:agreementId,installment_number:part.number,installment_total:option.installments,
      payment_method:'',paid_by:'',paid_at:null,created_at:createdAt,bank_provider:bank.provider,negotiation_id:agreementId,negotiation_origin:'customer_portal_auto',
      negotiated_invoice_ids:[...preview.selectedInvoiceIds],cashback_eligible:false,cashback_enabled:false,cashback_reason:'renegociacao',reference:part.dueDate.slice(0,7),competency:part.dueDate.slice(0,7)
    };
    newInvoices.push(invoice);
  }
  const issued=[];
  try{
    for(const invoice of newInvoices){
      const remote=await bankProxyAsService(env,sql,{action:'issue',provider:bank.provider,invoice:bankInvoice(invoice,client,nextState),client:bankClient(client,nextState),efi:bank.secrets.efi,mercadoPago:bank.secrets.mercadoPago,pixAutoRecord:null});
      Object.assign(invoice,remote||{});issued.push(invoice);
    }
    for(const old of selected){
      if(!text(old?.bank_provider))continue;
      await bankProxyAsService(env,sql,{action:'cancel',invoice:bankInvoice(old,client,state),efi:bank.secrets.efi,mercadoPago:bank.secrets.mercadoPago});
    }
  }catch(error){
    let rollbackFailed=false;
    for(const invoice of issued.reverse()){
      try{await bankProxyAsService(env,sql,{action:'cancel',invoice:bankInvoice(invoice,client,nextState),efi:bank.secrets.efi,mercadoPago:bank.secrets.mercadoPago})}catch{rollbackFailed=true}
    }
    const message=error instanceof Error?error.message:String(error);
    throw Object.assign(new Error(rollbackFailed?`${message} A emissão foi interrompida e precisa ser conferida no banco antes de tentar novamente.`:message),{statusCode:Number(error?.statusCode)||502});
  }
  nextState.invoices.push(...newInvoices);
  const replacementIds=newInvoices.map(row=>row.id);
  for(const old of nextState.invoices){
    if(!selectedKeys.has(String(old.id)))continue;
    Object.assign(old,{status:'Renegociado',negotiation_id:agreementId,negotiated_at:createdAt,negotiated_by:'Portal do cliente',replaced_by_invoice_ids:replacementIds,cashback_eligible:false,cashback_enabled:false});
  }
  const agreement={id:agreementId,client_id:Number(client.id),original_invoice_ids:[...preview.selectedInvoiceIds],original_amount_cents:preview.originalCents,discount_cents:option.discountCents,negotiated_amount_cents:option.totalCents,entry_cents:option.entryCents,installment_total:option.installments,bank_provider:bank.provider,origin:'customer_portal_auto',status:'Ativo',created_at:createdAt,new_invoice_ids:replacementIds};
  nextState.negotiations.push(agreement);nextState.negotiations=nextState.negotiations.slice(-1000);
  nextState.audit=Array.isArray(nextState.audit)?nextState.audit:[];nextState.audit.unshift({id:Date.now(),action:'customer_portal_negotiation',entity:'negotiation',entity_id:agreementId,client_id:Number(client.id),created_at:createdAt});nextState.audit=nextState.audit.slice(0,1000);
  await saveState(sql,nextState);
  const portal=await portalSnapshot(client,nextState,env,session.token);
  return {agreement:safeNegotiation(agreement),portal};
}

async function dbHealth(env){
  if(!env.DATABASE_URL)return {configured:false,connected:false};
  try{
    const sql=neon(env.DATABASE_URL);
    const rows=await sql`SELECT 1 AS ok`;
    return {configured:true,connected:Number(rows?.[0]?.ok)===1};
  }catch(error){
    return {configured:true,connected:false,error:'Falha de conexão com o Neon'};
  }
}

async function nativePortalLogin(env,data){
  if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão nativa com o Neon não configurada na Cloudflare.'),{statusCode:503});
  const document=digits(data?.document||data?.cpf||data?.cnpj),contract=text(data?.contract||data?.contrato);
  if(!document&&!contract)throw Object.assign(new Error('Informe CPF, CNPJ ou contrato.'),{statusCode:400});
  if(document&&![11,14].includes(document.length))throw Object.assign(new Error('CPF ou CNPJ inválido.'),{statusCode:400});
  if(contract&&digits(contract).length<6)throw Object.assign(new Error('Contrato inválido.'),{statusCode:400});
  const sql=neon(env.DATABASE_URL);
  const clients=await sql`
    SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,
           router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync
    FROM pp_clients ORDER BY id ASC
  `;
  const client=(Array.isArray(clients)?clients:[]).find(item=>sameClient(item,{document,contract}));
  if(!client)throw Object.assign(new Error('Cliente não encontrado. Confira o CPF, CNPJ ou contrato informado.'),{statusCode:404});
  const state=await loadState(sql);
  return portalSnapshot(client,state,env);
}

async function handleNativeCustomerPortal(request,env){
  const cors=portalCors(request),origin=text(request.headers.get('origin'));
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  if(origin&&!ALLOWED_PORTAL_ORIGINS.has(origin))return json({ok:false,error:'Origem não autorizada.'},403,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  try{
    let body={};try{body=await request.json()}catch{}
    const action=text(body?.action),data=body?.data||{};let result;
    if(action==='login')result=await nativePortalLogin(env,data);
    else if(action==='negotiation-options')result=await negotiationOptionsForSession(env,data);
    else if(action==='negotiate')result=await negotiateForSession(env,data);
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return json({ok:true,data:result},200,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/cloudflare-health'){
      const database=await dbHealth(env);
      return json({ok:database.connected,worker:'painel',databaseConfigured:database.configured,databaseConnected:database.connected,coreApiMode:'cloudflare-native',customerPortalMode:'cloudflare-native',vercelCoreFallback:false,vercelCustomerPortalFallback:false,specializedIntegrationProxy:'bank-and-mikrotik-only'},database.connected?200:503,{'x-provedor-plus-edge':'cloudflare-health'});
    }
    if(url.pathname==='/api/auth')return handleNativeAuth(request,env);
    if(url.pathname==='/api/cloud-state')return handleNativeCloudState(request,env);
    if(url.pathname==='/api/cloud-data')return handleNativeCloudData(request,env);
    if(url.pathname==='/api/bank-settings')return handleBankSettings(request,env);
    if(url.pathname===CUSTOMER_PORTAL_PATH)return handleNativeCustomerPortal(request,env);
    if(SPECIALIZED_PROXY_PATHS.has(url.pathname))return proxySpecializedApi(request);
    if(url.pathname.startsWith('/api/'))return json({ok:false,error:'API não encontrada no Provedor Plus Cloudflare.'},404,{'x-provedor-plus-edge':'cloudflare-native-routing'});
    return env.ASSETS.fetch(request);
  }
};