import { neon } from '@neondatabase/serverless';

const UPSTREAM='https://fibratelecom.vercel.app';
const STATE_KEY='web_state_v1017';
const CUSTOMER_PORTAL_PATH='/api/customer-portal';
const ALLOWED_PORTAL_ORIGINS=new Set([
  'https://cliente.fibramais.workers.dev'
]);

const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};

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

async function proxyApi(request){
  const incoming=new URL(request.url);
  const target=new URL(incoming.pathname+incoming.search,UPSTREAM);
  const headers=copyHeaders(request.headers);
  headers.set('x-forwarded-host',incoming.host);
  headers.set('x-forwarded-proto','https');
  const init={method:request.method,headers,redirect:'manual'};
  if(request.method!=='GET'&&request.method!=='HEAD')init.body=request.body;
  const response=await fetch(target.toString(),init);
  const responseHeaders=new Headers(response.headers);
  const location=responseHeaders.get('location');
  if(location&&location.startsWith(UPSTREAM))responseHeaders.set('location',location.replace(UPSTREAM,incoming.origin));
  responseHeaders.set('x-provedor-plus-edge','cloudflare-migration-fallback');
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

function brl(value){
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
}

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
    serviceName:planName,
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
    cashbackEnabled:row?.cashback_enabled!==false,
    cashbackRate:number(row?.cashback_rate??state?.settings?.cashback_rate)??null,
    cashbackPending:number(row?.cashback_pending)??null,
    cashbackBalance:number(client?.cashback_balance)??0
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

async function portalSession(client,env){
  const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);
  const payload={clientId:Number(client.id)||client.id,exp:Date.now()+30*60*1000};
  const encoded=base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(encoded));
  return `${encoded}.${base64Url(signature)}`;
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
    FROM pp_clients
    ORDER BY id ASC
  `;
  const client=(Array.isArray(clients)?clients:[]).find(item=>sameClient(item,{document,contract}));
  if(!client)throw Object.assign(new Error('Cliente não encontrado. Confira o CPF, CNPJ ou contrato informado.'),{statusCode:404});

  const stateRows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`;
  const state=parseStateValue(Array.isArray(stateRows)?stateRows[0]?.value:null);
  const invoices=(Array.isArray(state.invoices)?state.invoices:[])
    .filter(row=>Number(row?.client_id)===Number(client.id))
    .map(row=>mapInvoice(row,client,state))
    .sort((a,b)=>String(b.dueDateRaw).localeCompare(String(a.dueDateRaw)));
  const pending=invoices.filter(row=>!['pago','paid','baixado','cancelado','canceled'].includes(text(row.status).toLowerCase()));
  const current=(pending.sort((a,b)=>String(a.dueDateRaw).localeCompare(String(b.dueDateRaw)))[0]||invoices[0]||null);
  const plans=(Array.isArray(state.plans)?state.plans:[])
    .filter(plan=>plan?.active!==false&&plan?.enabled!==false&&plan?.portal_visible!==false)
    .map(mapPlan);

  const connectionStatus=text(client.mikrotik_status||client.status);
  const online=/online|conectado|ativo/i.test(connectionStatus)&&!/offline|desconectado|bloqueado/i.test(connectionStatus);

  return {
    session:await portalSession(client,env),
    client:{
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
    },
    invoice:current,
    invoices,
    plans,
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

async function handleNativeCustomerPortal(request,env){
  const cors=portalCors(request),origin=text(request.headers.get('origin'));
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  if(origin&&!ALLOWED_PORTAL_ORIGINS.has(origin))return json({ok:false,error:'Origem não autorizada.'},403,{...cors,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  try{
    let body={};
    try{body=await request.json()}catch{}
    const action=text(body?.action),data=body?.data||{};
    if(action!=='login')throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    const result=await nativePortalLogin(env,data);
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
      return json({
        ok:database.connected,
        worker:'painel',
        databaseConfigured:database.configured,
        databaseConnected:database.connected,
        customerPortalMode:'cloudflare-native',
        vercelCustomerPortalFallback:false
      },database.connected?200:503,{'x-provedor-plus-edge':'cloudflare-health'});
    }

    if(url.pathname===CUSTOMER_PORTAL_PATH)return handleNativeCustomerPortal(request,env);
    if(url.pathname.startsWith('/api/'))return proxyApi(request);
    return env.ASSETS.fetch(request);
  }
};
