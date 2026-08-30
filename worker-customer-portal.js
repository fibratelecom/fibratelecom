import { neon } from '@neondatabase/serverless';

const text=value=>String(value??'').trim();
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}});}
function sqlFor(env){if(!env?.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada na Cloudflare.'),{statusCode:503});return neon(env.DATABASE_URL);}

const STATE_KEY='web_state_v1017';
const ALLOWED_ORIGINS=new Set(['https://cliente.fibramais.workers.dev']);
const digits=value=>text(value).replace(/\D/g,'');
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};

function cors(request){
  const origin=text(request.headers.get('origin')),headers={'Vary':'Origin','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};
  if(origin&&ALLOWED_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
  return headers;
}
function formatDate(value){
  const raw=text(value).slice(0,10),match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:text(value);
}
function moneyNumber(row){
  for(const key of ['amount_cents','total_cents','value_cents','price_cents','service_amount_cents']){const n=number(row?.[key]);if(n!==null)return n/100}
  for(const key of ['amount','total','value','price','service_amount']){const n=number(row?.[key]);if(n!==null)return n}
  return 0;
}
const brl=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
function invoiceReference(row){
  const explicit=text(row?.reference||row?.competency||row?.competence||row?.month||row?.period);if(explicit)return explicit;
  const match=text(row?.due_date||row?.dueDate).slice(0,10).match(/^(\d{4})-(\d{2})-/);return match?`${match[2]}/${match[1]}`:'';
}
function mapInvoice(row,client,state){
  const total=moneyNumber(row),planName=text(client.plan_name||client.plan||state?.plans?.find?.(p=>Number(p?.id)===Number(client.plan_id))?.name)||'Serviço de internet',company=state?.settings||state?.company||{};
  return {
    id:row?.id??null,reference:invoiceReference(row),dueDate:formatDate(row?.due_date||row?.dueDate),dueDateRaw:text(row?.due_date||row?.dueDate),
    total:brl(total),totalNumber:total,status:text(row?.status)||'Pendente',serviceName:planName,serviceAmount:brl(total),serviceAmountRaw:brl(total),
    subtotal:brl(total),quantity:'1',unitAmount:brl(total),customerName:text(client.name),customerDocument:text(client.document),
    customerAddress:[client.address||client.street,client.city,client.state].map(text).filter(Boolean).join(' - '),
    customerWhatsapp:text(client.phone||client.whatsapp),contract:text(client.contract_number),
    companyName:text(company.company_name||company.companyName||company.name)||'Fibra+',companyCnpj:text(company.cnpj||company.company_cnpj),
    companyIe:text(company.ie||company.state_registration||company.inscricao_estadual),companyWhatsapp:text(company.whatsapp||company.phone)||'(92) 98486-7428',
    pixPaymentUrl:text(row?.pix_payment_url||row?.pixPaymentUrl||row?.pix_url||row?.pixUrl),
    pixCopyPaste:text(row?.pix_copy_paste||row?.pixCopyPaste||row?.pix_payload||row?.pixPayload),
    pixQrImage:text(row?.pix_qr_image||row?.pixQrImage||row?.pix_qr_url||row?.qr_code_url),
    cardPaymentUrl:text(row?.card_payment_url||row?.cardPaymentUrl||row?.checkout_url||row?.payment_url),
    pdfUrl:text(row?.pdf_url||row?.invoice_pdf_url||row?.boleto_pdf_url||row?.bank_slip_pdf_url),
    digitableLine:text(row?.digitable_line||row?.linha_digitavel),barcodeImage:text(row?.barcode_image||row?.barcode_url),
    bankCode:text(row?.bank_code||row?.bankCode),ourNumber:text(row?.our_number||row?.nosso_numero),documentNumber:text(row?.document_number||row?.number||row?.id),
    cashbackEnabled:row?.cashback_enabled!==false,cashbackRate:number(row?.cashback_rate??state?.settings?.cashback_rate)??null,
    cashbackPending:number(row?.cashback_pending)??null,cashbackBalance:number(client?.cashback_balance)??0
  };
}
function mapPlan(plan){
  const cents=number(plan?.price_cents),plain=number(plan?.price??plan?.amount);
  return {id:plan?.id??null,name:text(plan?.name||plan?.title)||'Plano Fibra+',speed:text(plan?.speed||plan?.bandwidth),description:text(plan?.description),price:cents!==null?cents/100:(plain??0),highlight:plan?.highlight===true,badge:text(plan?.badge||plan?.category)||'Plano Fibra+'};
}
function sameClient(client,{document,contract}){
  const doc=digits(client?.document),stored=text(client?.contract_number),storedDigits=digits(stored);
  const byDoc=document?doc===document:false,byContract=contract?(stored===contract||storedDigits===digits(contract)):false;
  return document&&contract?byDoc&&byContract:byDoc||byContract;
}
function parseState(value){
  if(value&&typeof value==='object')return value;
  if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:{}}catch{}}
  return {};
}
function base64Url(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let binary='';
  for(const byte of view)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function portalSession(client,env){
  const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);
  if(!secret)throw Object.assign(new Error('Segredo da sessão do portal indisponível.'),{statusCode:503});
  const payload={clientId:Number(client.id)||client.id,exp:Date.now()+30*60*1000},encoded=base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(encoded));
  return `${encoded}.${base64Url(signature)}`;
}
async function login(env,data){
  const document=digits(data?.document||data?.cpf||data?.cnpj),contract=text(data?.contract||data?.contrato);
  if(!document&&!contract)throw Object.assign(new Error('Informe CPF, CNPJ ou contrato.'),{statusCode:400});
  if(document&&![11,14].includes(document.length))throw Object.assign(new Error('CPF ou CNPJ inválido.'),{statusCode:400});
  if(contract&&digits(contract).length<6)throw Object.assign(new Error('Contrato inválido.'),{statusCode:400});
  const sql=sqlFor(env),clients=await sql`
    SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,
           router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync
    FROM pp_clients ORDER BY id ASC
  `,client=(clients||[]).find(item=>sameClient(item,{document,contract}));
  if(!client)throw Object.assign(new Error('Cliente não encontrado. Confira o CPF, CNPJ ou contrato informado.'),{statusCode:404});
  const stateRows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,state=parseState(stateRows?.[0]?.value);
  const invoices=(Array.isArray(state.invoices)?state.invoices:[]).filter(row=>Number(row?.client_id)===Number(client.id)).map(row=>mapInvoice(row,client,state)).sort((a,b)=>String(b.dueDateRaw).localeCompare(String(a.dueDateRaw)));
  const pending=invoices.filter(row=>!['pago','paid','baixado','cancelado','canceled'].includes(text(row.status).toLowerCase()));
  const current=pending.sort((a,b)=>String(a.dueDateRaw).localeCompare(String(b.dueDateRaw)))[0]||invoices[0]||null;
  const plans=(Array.isArray(state.plans)?state.plans:[]).filter(plan=>plan?.active!==false&&plan?.enabled!==false&&plan?.portal_visible!==false).map(mapPlan);
  const connectionStatus=text(client.mikrotik_status||client.status),online=/online|conectado|ativo/i.test(connectionStatus)&&!/offline|desconectado|bloqueado/i.test(connectionStatus);
  return {
    session:await portalSession(client,env),
    client:{id:client.id,name:text(client.name),firstName:text(client.name).split(/\s+/)[0]||'',document:text(client.document),contract:text(client.contract_number),whatsapp:text(client.phone),email:text(client.email),address:[client.address,client.city,client.state].map(text).filter(Boolean).join(' - '),status:text(client.status),plan:text(client.plan)},
    invoice:current,invoices,plans,
    connection:{status:connectionStatus||'Aguardando dados',pppoeStatus:client.connection_type==='PPPoE'?(online?'Conectado':'Aguardando confirmação'):'Não se aplica',pppoeConnected:client.connection_type==='PPPoE'?online:null,ip:text(client.ip)||'Aguardando dados',lastConnection:text(client.mikrotik_last_sync)||'Aguardando dados',quality:online?'Boa':'Aguardando dados',regionIssue:{active:false,status:'clear',title:'Nenhum problema informado na região',message:'Não há manutenção ou indisponibilidade geral informada no momento.'}}
  };
}
export async function handleCustomerPortal(request,env){
  const headers=cors(request),origin=text(request.headers.get('origin'));
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{...headers,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:'Origem não autorizada.'},403,{...headers,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  try{
    const body=await request.json().catch(()=>({})),action=text(body?.action);
    if(action!=='login')throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return json({ok:true,data:await login(env,body?.data||{})},200,{...headers,'x-provedor-plus-edge':'cloudflare-native-customer-portal'});
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{...headers,'x-provedor-plus-edge':'cloudflare-native-customer-portal'})}
}
