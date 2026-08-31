import { neon } from '@neondatabase/serverless';
import { handleNativeAuth,handleNativeCloudState,handleNativeCloudData } from './worker-native-api.js';
import { handleBankProxy } from './worker-bank-native.js';
import { handleMikrotikProxy } from './worker-mikrotik-native.js';

const STATE_KEY='web_state_v1017';
const BANK_SETTINGS_KEY='bank_credentials_v1';
const CUSTOMER_PORTAL_PATH='/api/customer-portal';
const PROTOCOLS_PATH='/api/protocols';
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
    efi:{enabled:false,environment:'sandbox',clientId:'',clientSecret:'',certificatePassword:'',certificateBase64:'',certificateName:'',pixKey:'',pixAutoReceiverAgency:'',pixAutoReceiverAccount:'',webhookUrl:'',lastTestStatus:'',lastTestMessage:'',lastTestAt:'',webhookConfiguredAt:''},
    mercadoPago:{enabled:false,environment:'sandbox',publicKey:'',accessToken:'',lastTestStatus:'',lastTestMessage:'',lastTestAt:''}
  };
}

async function requirePanelUser(request,env){
  const headers=new Headers(request.headers);
  headers.set('Content-Type','application/json');
  const authRequest=new Request(request.url,{method:'POST',headers,body:JSON.stringify({action:'status'})});
  const response=await handleNativeAuth(authRequest,env);
  let body={};
  try{body=await response.json()}catch{}
  if(!response.ok||!body.ok||body?.data?.authenticated!==true)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});
  return body.data.user||{};
}

async function requirePanelPermission(request,env,permission){
  const user=await requirePanelUser(request,env);
  const role=text(user?.role).toLowerCase(),permissions=Array.isArray(user?.permissions)?user.permissions.map(text):[];
  if(role==='admin'||permissions.includes(text(permission)))return user;
  throw Object.assign(new Error('Seu usuário não possui permissão para esta integração.'),{statusCode:403});
}

async function requireBankAdmin(request,env){
  const user=await requirePanelUser(request,env);
  if(text(user?.role).toLowerCase()!=='admin')throw Object.assign(new Error('Somente o administrador pode alterar as credenciais bancárias.'),{statusCode:403});
  return user;
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
  const certificateBase64=data.removeCertificate===true?'':data.certificateBase64===undefined?String(previous.certificateBase64||''):String(data.certificateBase64||'');
  if(certificateBase64.length>2500000)throw Object.assign(new Error('Certificado Efí muito grande. Selecione o arquivo P12/PFX original.'),{statusCode:400});
  return {
    enabled:data.enabled===undefined?Boolean(previous.enabled):Boolean(data.enabled),
    environment:data.environment==='production'?'production':data.environment==='sandbox'?'sandbox':text(previous.environment)||'sandbox',
    clientId:text(data.clientId)||text(previous.clientId),
    clientSecret:text(data.clientSecret)||text(previous.clientSecret),
    certificatePassword:data.certificatePassword===undefined?String(previous.certificatePassword||''):String(data.certificatePassword||''),
    certificateBase64,
    certificateName:data.removeCertificate===true?'':data.certificateName===undefined?text(previous.certificateName):text(data.certificateName),
    pixKey:data.pixKey===undefined?text(previous.pixKey):text(data.pixKey),
    pixAutoReceiverAgency:data.pixAutoReceiverAgency===undefined?text(previous.pixAutoReceiverAgency):digits(data.pixAutoReceiverAgency),
    pixAutoReceiverAccount:data.pixAutoReceiverAccount===undefined?text(previous.pixAutoReceiverAccount):digits(data.pixAutoReceiverAccount),
    webhookUrl:data.webhookUrl===undefined?text(previous.webhookUrl):text(data.webhookUrl),
    lastTestStatus:text(previous.lastTestStatus),lastTestMessage:text(previous.lastTestMessage),lastTestAt:text(previous.lastTestAt),webhookConfiguredAt:text(previous.webhookConfiguredAt)
  };
}

function mergeMercadoPagoBank(current,data={}){
  const previous=current?.mercadoPago||emptyBankSettings().mercadoPago;
  return {
    enabled:data.enabled===undefined?Boolean(previous.enabled):Boolean(data.enabled),
    environment:data.environment==='production'?'production':data.environment==='sandbox'?'sandbox':text(previous.environment)||'sandbox',
    publicKey:data.publicKey===undefined?text(previous.publicKey):text(data.publicKey),
    accessToken:text(data.accessToken)||text(previous.accessToken),
    lastTestStatus:text(previous.lastTestStatus),lastTestMessage:text(previous.lastTestMessage),lastTestAt:text(previous.lastTestAt)
  };
}

function safeBankSettings(value){
  const efi=value?.efi||{},mp=value?.mercadoPago||{};
  return {
    efi:{enabled:Boolean(efi.enabled),environment:text(efi.environment)||'sandbox',clientIdConfigured:Boolean(text(efi.clientId)),clientSecretConfigured:Boolean(text(efi.clientSecret)),certificatePasswordConfigured:Boolean(String(efi.certificatePassword||'')),certificateConfigured:Boolean(String(efi.certificateBase64||'')),certificateName:text(efi.certificateName),pixKey:text(efi.pixKey),pixAutoReceiverAgency:text(efi.pixAutoReceiverAgency),pixAutoReceiverAccount:text(efi.pixAutoReceiverAccount),webhookUrl:text(efi.webhookUrl),lastTestStatus:text(efi.lastTestStatus),lastTestMessage:text(efi.lastTestMessage),lastTestAt:text(efi.lastTestAt),webhookConfiguredAt:text(efi.webhookConfiguredAt)},
    mercadoPago:{enabled:Boolean(mp.enabled),environment:text(mp.environment)||'sandbox',publicKey:text(mp.publicKey),accessTokenConfigured:Boolean(text(mp.accessToken)),lastTestStatus:text(mp.lastTestStatus),lastTestMessage:text(mp.lastTestMessage),lastTestAt:text(mp.lastTestAt)}
  };
}

async function handleBankSettings(request,env){
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-bank-settings'});
  try{
    await requireBankAdmin(request,env);
    let body={};try{body=await request.json()}catch{}
    const action=text(body?.action),data=body?.data||{};let result;
    if(action==='get')result=await readBankSettings(env);
    else if(action==='get-safe')result=safeBankSettings(await readBankSettings(env));
    else if(action==='save-efi'){
      const current=await readBankSettings(env),next={...current,efi:mergeEfiBank(current,data)};result=await writeBankSettings(env,next);
    }else if(action==='save-mercado-pago'){
      const current=await readBankSettings(env),next={...current,mercadoPago:mergeMercadoPagoBank(current,data)};result=await writeBankSettings(env,next);
    }else if(action==='save-default'){
      if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada.'),{statusCode:503});
      const provider=['efi','mercadoPago'].includes(text(data.provider))?text(data.provider):'',sql=neon(env.DATABASE_URL),state=await loadState(sql);
      state.banks={...(state.banks||{}),defaultProvider:provider};await saveState(sql,state);result={defaultProvider:provider};
    }else if(action==='test-efi'||action==='test-mercado-pago'||action==='configure-efi-webhooks'){
      if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada.'),{statusCode:503});
      const sql=neon(env.DATABASE_URL),current=await readBankSettings(env),secrets=bankSecretsFromVault(current),isEfi=action!=='test-mercado-pago';
      try{
        const proxyAction=action==='test-efi'?'efi-test':action==='test-mercado-pago'?'mp-test':'efi-webhooks';
        const tested=await bankProxyAsService(env,sql,{action:proxyAction,efi:secrets.efi,mercadoPago:secrets.mercadoPago}),now=new Date().toISOString();
        if(isEfi)current.efi={...current.efi,lastTestStatus:'success',lastTestMessage:text(tested?.message)||'Conexão Efí confirmada.',lastTestAt:now,...(action==='configure-efi-webhooks'?{webhookConfiguredAt:now}:{})};
        else current.mercadoPago={...current.mercadoPago,lastTestStatus:'success',lastTestMessage:text(tested?.message)||'Conexão Mercado Pago confirmada.',lastTestAt:now};
        await writeBankSettings(env,current);result={test:tested,settings:safeBankSettings(current)};
      }catch(error){
        const now=new Date().toISOString(),message=error instanceof Error?error.message:String(error);
        if(isEfi)current.efi={...current.efi,lastTestStatus:'error',lastTestMessage:message,lastTestAt:now};else current.mercadoPago={...current.mercadoPago,lastTestStatus:'error',lastTestMessage:message,lastTestAt:now};
        try{await writeBankSettings(env,current)}catch{};throw error;
      }
    }else throw Object.assign(new Error('Ação bancária não permitida.'),{statusCode:400});
    return json({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-bank-settings'});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-bank-settings'});}
}

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

function protocolCode(id,createdAt){
  const d=new Date(createdAt||Date.now()),stamp=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  return `PP-${stamp}-${String(Number(id)||0).padStart(6,'0')}`;
}

function safeProtocol(item){
  return {
    id:Number(item?.id)||0,
    protocol:text(item?.protocol),
    clientId:Number(item?.client_id)||null,
    category:text(item?.category),
    subject:text(item?.subject),
    source:text(item?.source),
    status:text(item?.status),
    createdByName:text(item?.created_by_name),
    createdAt:text(item?.created_at),
    closedAt:text(item?.closed_at)
  };
}

async function createProtocolRecord(sql,{clientId=null,category='Atendimento',subject='Atendimento',source='provedor-plus',status='Aberto',createdByUserId=null,createdByName='',details={}}={}){
  await ensureProtocolTable(sql);
  const client=Number(clientId)||null,userId=Number(createdByUserId)||null,cat=text(category)||'Atendimento',title=text(subject)||'Atendimento',origin=text(source)||'provedor-plus',state=text(status)||'Aberto',name=text(createdByName),raw=JSON.stringify(details&&typeof details==='object'?details:{});
  const rows=await sql`INSERT INTO pp_protocols (client_id,category,subject,source,status,created_by_user_id,created_by_name,details) VALUES (${client},${cat},${title},${origin},${state},${userId},${name||null},${raw}::jsonb) RETURNING *`;
  const created=Array.isArray(rows)?rows[0]:null;
  if(!created?.id)throw Object.assign(new Error('Não foi possível gerar o protocolo do atendimento.'),{statusCode:500});
  const code=protocolCode(created.id,created.created_at),updated=await sql`UPDATE pp_protocols SET protocol=${code} WHERE id=${Number(created.id)} RETURNING *`;
  return safeProtocol(updated?.[0]||{...created,protocol:code});
}

async function listProtocolRecords(sql,clientId=null,limit=50){
  await ensureProtocolTable(sql);
  const safeLimit=Math.max(1,Math.min(200,Math.floor(Number(limit)||50))),client=Number(clientId)||0;
  const rows=client?await sql`SELECT * FROM pp_protocols WHERE client_id=${client} ORDER BY created_at DESC LIMIT ${safeLimit}`:await sql`SELECT * FROM pp_protocols ORDER BY created_at DESC LIMIT ${safeLimit}`;
  return (Array.isArray(rows)?rows:[]).map(safeProtocol);
}

async function closeProtocolRecord(sql,protocol,status='Concluído'){
  await ensureProtocolTable(sql);
  const code=text(protocol);if(!code)throw Object.assign(new Error('Protocolo inválido.'),{statusCode:400});
  const rows=await sql`UPDATE pp_protocols SET status=${text(status)||'Concluído'},closed_at=now() WHERE protocol=${code} RETURNING *`;
  if(!rows?.[0])throw Object.assign(new Error('Protocolo não encontrado.'),{statusCode:404});
  return safeProtocol(rows[0]);
}

async function handleProtocols(request,env){
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-protocols'});
  try{
    const user=await requirePanelUser(request,env);
    if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada.'),{statusCode:503});
    let body={};try{body=await request.json()}catch{}
    const action=text(body?.action),data=body?.data||{},sql=neon(env.DATABASE_URL);let result;
    if(action==='create')result=await createProtocolRecord(sql,{clientId:data.clientId,category:data.category,subject:data.subject,source:'provedor-plus',status:data.status||'Aberto',createdByUserId:user?.id,createdByName:user?.name,details:data.details});
    else if(action==='list')result=await listProtocolRecords(sql,data.clientId,data.limit);
    else if(action==='close')result=await closeProtocolRecord(sql,data.protocol,data.status||'Concluído');
    else throw Object.assign(new Error('Ação de protocolo não permitida.'),{statusCode:400});
    return json({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-protocols'});
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-protocols'});
  }
}

async function handleSpecializedNative(request,env){
  const path=new URL(request.url).pathname;
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-integration'});
  try{
    if(path==='/api/bank-proxy')await requirePanelPermission(request,env,'billing');
    else await requirePanelPermission(request,env,'network');
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||401,{'x-provedor-plus-edge':'cloudflare-native-integration'})}
  if(path==='/api/bank-proxy')return handleBankProxy(request);
  return handleMikrotikProxy(request);
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
    protocol:text(item?.protocol),
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
  let protocols=[];
  try{if(env.DATABASE_URL)protocols=await listProtocolRecords(neon(env.DATABASE_URL),client.id,20)}catch{}
  return {
    session:sessionToken||await portalSession(client,env),
    client:portalClientData(client),
    invoice:current,
    invoices,
    plans,
    negotiations,
    protocols,
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
  const response=await handleBankProxy(new Request('https://painel.fibramais.workers.dev/api/bank-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
  let body={};try{body=await response.json()}catch{}
  if(!response.ok||!body.ok)throw Object.assign(new Error(body?.error||`Falha na integração bancária Cloudflare (HTTP ${response.status}).`),{statusCode:response.status>=400&&response.status<500?409:502});
  return body.data||{};
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
  const protocol=await createProtocolRecord(sql,{clientId:client.id,category:'Negociação',subject:'Negociação automática de débitos',source:'area-cliente',status:'Concluído',createdByName:`Área do Cliente · ${text(client.name)}`,details:{agreementId,originalInvoiceIds:[...preview.selectedInvoiceIds],originalAmountCents:preview.originalCents,discountCents:option.discountCents,negotiatedAmountCents:option.totalCents,installmentTotal:option.installments,newInvoiceIds:replacementIds}});
  agreement.protocol=protocol.protocol;
  nextState.negotiations.push(agreement);nextState.negotiations=nextState.negotiations.slice(-1000);
  nextState.audit=Array.isArray(nextState.audit)?nextState.audit:[];nextState.audit.unshift({id:Date.now(),action:'customer_portal_negotiation',entity:'negotiation',entity_id:agreementId,client_id:Number(client.id),protocol:protocol.protocol,created_at:createdAt});nextState.audit=nextState.audit.slice(0,1000);
  await saveState(sql,nextState);
  const portal=await portalSnapshot(client,nextState,env,session.token);
  return {agreement:safeNegotiation(agreement),protocol,portal};
}

async function dbHealth(env){
  if(!env.DATABASE_URL)return {configured:false,connected:false,protocolsReady:false};
  try{
    const sql=neon(env.DATABASE_URL);
    const rows=await sql`SELECT 1 AS ok`;
    await ensureProtocolTable(sql);
    return {configured:true,connected:Number(rows?.[0]?.ok)===1,protocolsReady:true};
  }catch(error){
    return {configured:true,connected:false,protocolsReady:false,error:'Falha de conexão com o Neon'};
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

function portalPaymentInactiveStatus(value){
  const status=text(value).toLowerCase();
  return ['pago','paid','baixado','cancelado','canceled','renegociado','renegotiated','substituido','substituida'].some(item=>status.includes(item));
}
function portalPaymentInvoice(state,client,invoiceId,{allowInactive=false}={}){
  const row=(Array.isArray(state?.invoices)?state.invoices:[]).find(item=>String(item?.id)===String(invoiceId)&&Number(item?.client_id)===Number(client.id));
  if(!row)throw Object.assign(new Error('Fatura não encontrada para este cliente.'),{statusCode:404});
  if(!allowInactive&&portalPaymentInactiveStatus(row.status))throw Object.assign(new Error('Esta fatura não está disponível para pagamento.'),{statusCode:409});
  if(invoiceCents(row)<=0)throw Object.assign(new Error('A fatura não possui valor válido para pagamento.'),{statusCode:409});
  return row;
}
function portalBankAvailability(state,client,vault){
  const local=stateClient(state,client),efi=vault?.efi||{},mp=vault?.mercadoPago||{},ready={efi:Boolean(efi.enabled&&text(efi.clientId)&&text(efi.clientSecret)),efiPix:Boolean(efi.enabled&&text(efi.clientId)&&text(efi.clientSecret)&&String(efi.certificateBase64||'')&&text(efi.pixKey)),mercadoPago:Boolean(mp.enabled&&text(mp.accessToken)),mercadoPagoCard:Boolean(mp.enabled&&text(mp.accessToken)&&text(mp.publicKey))};
  const preferred=[text(local.billing_bank_provider),text(state?.banks?.defaultProvider)].find(value=>value==='efi'||value==='mercadoPago')||'';let pixProvider='';
  if(preferred==='efi'&&ready.efiPix)pixProvider='efi';else if(preferred==='mercadoPago'&&ready.mercadoPago)pixProvider='mercadoPago';else if(ready.efiPix)pixProvider='efi';else if(ready.mercadoPago)pixProvider='mercadoPago';
  return {ready,preferred,pixProvider,cardProvider:ready.mercadoPagoCard?'mercadoPago':'',secrets:bankSecretsFromVault(vault)};
}
async function portalPaymentContext(env,data){
  if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão nativa com o Neon não configurada na Cloudflare.'),{statusCode:503});
  const session=await verifyPortalSession(data?.session,env),sql=neon(env.DATABASE_URL),client=await portalClientById(sql,session.clientId);if(!client)throw Object.assign(new Error('Cliente da sessão não foi encontrado.'),{statusCode:404});
  const state=await loadState(sql),vault=await readBankSettings(env),banks=portalBankAvailability(state,client,vault);return {session,sql,client,state,vault,banks};
}
async function paymentConfigForSession(env,data){const ctx=await portalPaymentContext(env,data),mp=ctx.vault?.mercadoPago||{};return {pixEnabled:Boolean(ctx.banks.pixProvider),pixProvider:ctx.banks.pixProvider,pixProviderLabel:ctx.banks.pixProvider==='efi'?'Efí Bank':ctx.banks.pixProvider==='mercadoPago'?'Mercado Pago':'',cardEnabled:Boolean(ctx.banks.cardProvider),cardProvider:'mercadoPago',cardProviderLabel:'Mercado Pago',mercadoPagoPublicKey:ctx.banks.cardProvider?text(mp.publicKey):'',defaultProvider:ctx.banks.preferred,efiConfigured:ctx.banks.ready.efiPix,mercadoPagoConfigured:ctx.banks.ready.mercadoPago};}
async function paymentPrepareForSession(env,data){const ctx=await portalPaymentContext(env,data),invoice=portalPaymentInvoice(ctx.state,ctx.client,data?.invoiceId);return {invoiceId:invoice.id,reference:invoiceReference(invoice),dueDate:formatDate(invoice.due_date||invoice.dueDate),amount:invoiceCents(invoice)/100,payer:{name:text(ctx.client.name),email:text(ctx.client.email),identification:{type:digits(ctx.client.document).length===14?'CNPJ':'CPF',number:digits(ctx.client.document)}}};}
function mpPaid(value){const s=text(value).toLowerCase();return ['approved','paid','pago','concluido','concluído'].some(item=>s.includes(item));}
function mpRejected(value){const s=text(value).toLowerCase();return ['rejected','cancelled','canceled','recusado','cancelado','refunded','charged_back'].some(item=>s.includes(item));}
function markPortalInvoicePaid(invoice,method,paidAt=''){invoice.status='Pago';invoice.payment_method=method;invoice.paid_by='Área do Cliente';invoice.paid_at=text(paidAt)||new Date().toISOString();invoice.bank_last_sync_at=new Date().toISOString();}
async function mercadoPagoRequest(vault,path,{method='GET',body=null,idempotencyKey=''}={}){
  const token=text(vault?.mercadoPago?.accessToken);if(!token)throw Object.assign(new Error('Mercado Pago não está configurado para este pagamento.'),{statusCode:409});
  const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};if(body!==null)headers['Content-Type']='application/json';if(idempotencyKey)headers['X-Idempotency-Key']=idempotencyKey;
  const response=await fetch(`https://api.mercadopago.com${path}`,{method,headers,body:body===null?undefined:JSON.stringify(body)});let result={};try{result=await response.json()}catch{};if(!response.ok)throw Object.assign(new Error(text(result?.message||result?.error)||`Mercado Pago retornou HTTP ${response.status}.`),{statusCode:response.status>=400&&response.status<500?409:502});return result;
}
function mpPaymentFields(remote,detail,environment='sandbox'){
  const tx=remote?.point_of_interaction?.transaction_data||{};return {bank_provider:'mercadoPago',bank_environment:environment,bank_charge_id:text(remote?.id),bank_order_id:'',bank_payment_id:text(remote?.id),bank_external_reference:text(remote?.external_reference),bank_status:text(remote?.status),bank_status_detail:detail,bank_ticket_url:text(tx?.ticket_url),bank_pix_code:text(tx?.qr_code),bank_last_sync_at:new Date().toISOString(),pix_payment_url:text(tx?.ticket_url),pix_copy_paste:text(tx?.qr_code),pix_qr_image:tx?.qr_code_base64?`data:image/png;base64,${text(tx.qr_code_base64)}`:''};
}
function requireMpEmail(client){const email=text(client?.email);if(!email)throw Object.assign(new Error('Cadastre o e-mail do cliente antes de usar Mercado Pago.'),{statusCode:409});return email;}
async function paymentPixForSession(env,data){
  const ctx=await portalPaymentContext(env,data),invoice=portalPaymentInvoice(ctx.state,ctx.client,data?.invoiceId),provider=ctx.banks.pixProvider;if(!provider)throw Object.assign(new Error('Nenhum banco está pronto para gerar Pix. Configure Efí ou Mercado Pago em API Bancos.'),{statusCode:409});
  if(provider==='efi'){
    if(text(invoice.bank_provider)==='efi'&&text(invoice.bank_status_detail)==='efi_pix_cobv'&&text(invoice.bank_charge_id)){try{Object.assign(invoice,await bankProxyAsService(env,ctx.sql,{action:'sync',invoice:bankInvoice(invoice,ctx.client,ctx.state),efi:ctx.banks.secrets.efi,mercadoPago:ctx.banks.secrets.mercadoPago})||{})}catch{}}
    if(!text(invoice.bank_pix_code)){const source={...invoice,billing_type:'Pix com vencimento'},remote=await bankProxyAsService(env,ctx.sql,{action:'issue',provider:'efi',invoice:bankInvoice(source,ctx.client,ctx.state),client:bankClient(ctx.client,ctx.state),efi:ctx.banks.secrets.efi,mercadoPago:ctx.banks.secrets.mercadoPago,pixAutoRecord:null});Object.assign(invoice,remote||{});}
    invoice.pix_copy_paste=text(invoice.bank_pix_code);invoice.pix_payment_url=text(invoice.bank_ticket_url);invoice.payment_origin='area-cliente';
  }else{
    const email=requireMpEmail(ctx.client),environment=text(ctx.vault?.mercadoPago?.environment)||'sandbox';let mp=null;
    if(text(invoice.bank_provider)==='mercadoPago'&&text(invoice.bank_status_detail)==='mercado_pago_pix'&&text(invoice.bank_payment_id)){try{mp=await mercadoPagoRequest(ctx.vault,`/v1/payments/${encodeURIComponent(invoice.bank_payment_id)}`)}catch{}}
    if(!mp||mpRejected(mp.status)){const name=text(ctx.client.name),parts=name.split(/\s+/).filter(Boolean),first=parts.shift()||name,last=parts.join(' ')||first,payload={transaction_amount:invoiceCents(invoice)/100,description:text(invoice.description)||`Fatura ${invoiceReference(invoice)}`,payment_method_id:'pix',external_reference:`PP-INV-${invoice.id}-CLI-${ctx.client.id}`,payer:{email,first_name:first,last_name:last,identification:{type:digits(ctx.client.document).length===14?'CNPJ':'CPF',number:digits(ctx.client.document)}}};mp=await mercadoPagoRequest(ctx.vault,'/v1/payments',{method:'POST',body:payload,idempotencyKey:crypto.randomUUID()});}
    Object.assign(invoice,mpPaymentFields(mp,'mercado_pago_pix',environment));invoice.payment_origin='area-cliente';if(mpPaid(mp.status))markPortalInvoicePaid(invoice,'Pix Mercado Pago',mp.date_approved||mp.date_last_updated);
  }
  await saveState(ctx.sql,ctx.state);const portal=await portalSnapshot(ctx.client,ctx.state,env,ctx.session.token);return {provider,providerLabel:provider==='efi'?'Efí Bank':'Mercado Pago',paymentId:text(invoice.bank_payment_id||invoice.bank_charge_id),status:text(invoice.bank_status||invoice.status),qrCode:text(invoice.pix_copy_paste||invoice.bank_pix_code),qrCodeBase64:text(invoice.pix_qr_image).replace(/^data:image\/[^;]+;base64,/,''),paymentUrl:text(invoice.pix_payment_url||invoice.bank_ticket_url),portal};
}
async function paymentCardForSession(env,data){
  const ctx=await portalPaymentContext(env,data),invoice=portalPaymentInvoice(ctx.state,ctx.client,data?.invoiceId);if(!ctx.banks.cardProvider)throw Object.assign(new Error('Mercado Pago não está pronto para cartão. Configure Public Key e Access Token em API Bancos.'),{statusCode:409});
  const pd=data?.paymentData&&typeof data.paymentData==='object'?data.paymentData:{};if(!text(pd.token)||!text(pd.payment_method_id))throw Object.assign(new Error('Os dados tokenizados do cartão não foram recebidos.'),{statusCode:400});
  const payer={...(pd.payer&&typeof pd.payer==='object'?pd.payer:{}),email:text(pd?.payer?.email)||requireMpEmail(ctx.client)};if(!payer.identification?.number&&digits(ctx.client.document))payer.identification={type:digits(ctx.client.document).length===14?'CNPJ':'CPF',number:digits(ctx.client.document)};
  const payload={token:text(pd.token),transaction_amount:invoiceCents(invoice)/100,installments:Math.max(1,Number(pd.installments)||1),payment_method_id:text(pd.payment_method_id),description:text(invoice.description)||`Fatura ${invoiceReference(invoice)}`,external_reference:`PP-INV-${invoice.id}-CLI-${ctx.client.id}`,payer};if(pd.issuer_id)payload.issuer_id=String(pd.issuer_id);
  const idem=(await sha256Hex(`card|${ctx.client.id}|${invoice.id}|${text(pd.token)}`)).slice(0,64),mp=await mercadoPagoRequest(ctx.vault,'/v1/payments',{method:'POST',body:payload,idempotencyKey:idem}),environment=text(ctx.vault?.mercadoPago?.environment)||'sandbox';Object.assign(invoice,mpPaymentFields(mp,'mercado_pago_card',environment));invoice.payment_method='Cartão Mercado Pago';invoice.payment_origin='area-cliente';if(mpPaid(mp.status))markPortalInvoicePaid(invoice,'Cartão Mercado Pago',mp.date_approved||mp.date_last_updated);
  await saveState(ctx.sql,ctx.state);const portal=await portalSnapshot(ctx.client,ctx.state,env,ctx.session.token);return {provider:'mercadoPago',providerLabel:'Mercado Pago',paymentId:text(mp.id),status:text(mp.status),statusDetail:text(mp.status_detail),message:text(mp.status_detail),portal};
}
async function paymentStatusForSession(env,data){
  const ctx=await portalPaymentContext(env,data),invoice=portalPaymentInvoice(ctx.state,ctx.client,data?.invoiceId,{allowInactive:true});if(text(invoice.status).toLowerCase().includes('pago'))return {provider:text(invoice.bank_provider),status:'approved',state:text(invoice.status),paymentId:text(invoice.bank_payment_id||invoice.bank_charge_id),portal:await portalSnapshot(ctx.client,ctx.state,env,ctx.session.token)};
  let changed=false,provider=text(invoice.bank_provider),status=text(invoice.bank_status||invoice.status),paidAt='';
  if(provider==='mercadoPago'&&text(invoice.bank_payment_id||data?.paymentId)){const mp=await mercadoPagoRequest(ctx.vault,`/v1/payments/${encodeURIComponent(invoice.bank_payment_id||data.paymentId)}`),environment=text(ctx.vault?.mercadoPago?.environment)||'sandbox';Object.assign(invoice,mpPaymentFields(mp,text(invoice.bank_status_detail)||'mercado_pago_payment',environment));status=text(mp.status);paidAt=text(mp.date_approved||mp.date_last_updated);changed=true;if(mpPaid(status))markPortalInvoicePaid(invoice,text(invoice.bank_status_detail)==='mercado_pago_card'?'Cartão Mercado Pago':'Pix Mercado Pago',paidAt);}
  else if(provider==='efi'&&text(invoice.bank_charge_id)){const remote=await bankProxyAsService(env,ctx.sql,{action:'sync',invoice:bankInvoice(invoice,ctx.client,ctx.state),efi:ctx.banks.secrets.efi,mercadoPago:ctx.banks.secrets.mercadoPago});Object.assign(invoice,remote||{});status=text(remote?.bank_status||invoice.bank_status);paidAt=text(remote?.paidAt);changed=true;const paid=Boolean(paidAt)||['paid','pago','settled','concluida','concluída','concluido','concluído'].some(value=>status.toLowerCase().includes(value));if(paid)markPortalInvoicePaid(invoice,'Pix Efí',paidAt);}
  if(changed)await saveState(ctx.sql,ctx.state);const portal=await portalSnapshot(ctx.client,ctx.state,env,ctx.session.token);return {provider,status:text(invoice.status).toLowerCase().includes('pago')?'approved':status,state:text(invoice.status),paymentId:text(invoice.bank_payment_id||invoice.bank_charge_id),portal};
}
async function refreshPortalForSession(env,data){const ctx=await portalPaymentContext(env,data);return portalSnapshot(ctx.client,ctx.state,env,ctx.session.token);}

async function handleNativeCustomerPortal(request,env){
  const cors=portalCors(request),origin=text(request.headers.get('origin'));
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  if(origin&&!ALLOWED_PORTAL_ORIGINS.has(origin))return json({ok:false,error:'Origem não autorizada.'},403,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  try{
    let body={};try{body=await request.json()}catch{}
    const action=text(body?.action),data=body?.data||{};let result;
    if(action==='login')result=await nativePortalLogin(env,data);
    else if(action==='refresh')result=await refreshPortalForSession(env,data);
    else if(action==='payment-config')result=await paymentConfigForSession(env,data);
    else if(action==='payment-prepare')result=await paymentPrepareForSession(env,data);
    else if(action==='payment-pix')result=await paymentPixForSession(env,data);
    else if(action==='payment-card')result=await paymentCardForSession(env,data);
    else if(action==='payment-status')result=await paymentStatusForSession(env,data);
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
      return json({ok:database.connected,worker:'painel',databaseConfigured:database.configured,databaseConnected:database.connected,protocolsReady:database.protocolsReady,coreApiMode:'cloudflare-native',customerPortalMode:'cloudflare-native',vercelCoreFallback:false,vercelCustomerPortalFallback:false,specializedIntegrationProxy:'bank-and-mikrotik-only'},database.connected?200:503,{'x-provedor-plus-edge':'cloudflare-health'});
    }
    if(url.pathname==='/api/auth')return handleNativeAuth(request,env);
    if(url.pathname==='/api/cloud-state')return handleNativeCloudState(request,env);
    if(url.pathname==='/api/cloud-data')return handleNativeCloudData(request,env);
    if(url.pathname==='/api/bank-settings')return handleBankSettings(request,env);
    if(url.pathname===PROTOCOLS_PATH)return handleProtocols(request,env);
    if(url.pathname===CUSTOMER_PORTAL_PATH)return handleNativeCustomerPortal(request,env);
    if(url.pathname==='/api/bank-proxy'||url.pathname==='/api/mikrotik-proxy'||url.pathname==='/api/mikrotik-proxy-v2')return handleSpecializedNative(request,env);
    if(url.pathname.startsWith('/api/'))return json({ok:false,error:'API não encontrada no Provedor Plus Cloudflare.'},404,{'x-provedor-plus-edge':'cloudflare-native-routing'});
    return env.ASSETS.fetch(request);
  }
};