const crypto=require('node:crypto');

const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';
const STATE_KEY='web_state_v1017';
const ALLOWED_ORIGINS=new Set([
  'https://cliente.fibramais.workers.dev'
]);

const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};

function cors(req,res){
  const origin=text(req.headers.origin);
  if(origin&&ALLOWED_ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
}

function oidcToken(req){
  return text(req.headers['x-vercel-oidc-token'])||text(process.env.VERCEL_OIDC_TOKEN);
}

async function db(req,path){
  const token=oidcToken(req);
  if(!token)throw Object.assign(new Error('Banco do Provedor Plus indisponível.'),{statusCode:503});
  const response=await fetch(`${DATA_API}${path}`,{
    headers:{Accept:'application/json',Authorization:`Bearer ${token}`},
    cache:'no-store'
  });
  let body=null;
  try{body=await response.json()}catch{}
  if(!response.ok){
    const message=body?.message||body?.error||`Falha ao consultar o Provedor Plus (HTTP ${response.status}).`;
    throw Object.assign(new Error(message),{statusCode:response.status});
  }
  return body;
}

function formatDate(value){
  const raw=text(value).slice(0,10);
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?`${match[3]}/${match[2]}/${match[1]}`:text(value);
}

function moneyNumber(row){
  const centsKeys=['amount_cents','total_cents','value_cents','price_cents','service_amount_cents'];
  for(const key of centsKeys){
    const n=number(row?.[key]);
    if(n!==null)return n/100;
  }
  const keys=['amount','total','value','price','service_amount'];
  for(const key of keys){
    const n=number(row?.[key]);
    if(n!==null)return n;
  }
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

function sameClient(client,{cpf,contract}){
  const doc=digits(client?.document),storedContract=text(client?.contract_number);
  const contractDigits=digits(storedContract);
  const byCpf=cpf?doc===cpf:false;
  const byContract=contract?(storedContract===contract||contractDigits===digits(contract)):false;
  if(cpf&&contract)return byCpf&&byContract;
  return byCpf||byContract;
}

function portalSession(client){
  const secret=text(process.env.PORTAL_SESSION_SECRET)||text(process.env.VERCEL_OIDC_TOKEN)||'provedor-plus-portal';
  const payload={clientId:Number(client.id)||client.id,exp:Date.now()+30*60*1000};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function stateGet(req){
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}&select=value&limit=1`);
  return Array.isArray(rows)&&rows[0]?.value&&typeof rows[0].value==='object'?rows[0].value:{};
}

async function login(req,data){
  const cpf=digits(data?.cpf),contract=text(data?.contract||data?.contrato);
  if(!cpf&&!contract)throw Object.assign(new Error('Informe CPF ou contrato.'),{statusCode:400});
  if(cpf&&cpf.length!==11)throw Object.assign(new Error('CPF inválido.'),{statusCode:400});
  if(contract&&digits(contract).length<6)throw Object.assign(new Error('Contrato inválido.'),{statusCode:400});

  const clients=await db(req,'/pp_clients?select=id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync&order=id.asc');
  const client=(Array.isArray(clients)?clients:[]).find(item=>sameClient(item,{cpf,contract}));
  if(!client)throw Object.assign(new Error('Cliente não encontrado. Confira o CPF ou contrato informado.'),{statusCode:404});

  const state=await stateGet(req);
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
    session:portalSession(client),
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

module.exports=async function handler(req,res){
  cors(req,res);
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  const origin=text(req.headers.origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
  try{
    const action=text(req.body?.action),data=req.body?.data||{};
    if(action!=='login')throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    const result=await login(req,data);
    return res.status(200).json({ok:true,data:result});
  }catch(error){
    const status=Number(error?.statusCode)||500;
    return res.status(status).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
