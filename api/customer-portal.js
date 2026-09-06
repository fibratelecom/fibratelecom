const crypto=require('node:crypto');
const bankSecrets=require('../lib/bank-secret-store');

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

async function db(req,path,options={}){
  const token=oidcToken(req);
  if(!token)throw Object.assign(new Error('Banco do Provedor Plus indisponível.'),{statusCode:503});
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers,cache:'no-store'});
  let raw='';try{raw=await response.text()}catch{}
  let body=null;if(raw){try{body=JSON.parse(raw)}catch{body=raw}}
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

function sameClient(client,{document,contract}){
  const doc=digits(client?.document),storedContract=text(client?.contract_number),storedContractDigits=digits(storedContract);
  const byDocument=document?doc===document:false;
  const byContract=contract?(storedContract===contract||storedContractDigits===digits(contract)):false;
  if(document&&contract)return byDocument&&byContract;
  return byDocument||byContract;
}

function portalSecret(){
  return text(process.env.PORTAL_SESSION_SECRET)||text(process.env.VERCEL_OIDC_TOKEN)||'provedor-plus-portal';
}

function portalSession(client){
  const payload={clientId:Number(client.id)||client.id,exp:Date.now()+30*60*1000};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=crypto.createHmac('sha256',portalSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyPortalSession(value){
  const token=text(value),parts=token.split('.');
  if(parts.length!==2)throw Object.assign(new Error('Sessão da Área do Cliente inválida. Entre novamente.'),{statusCode:401});
  const [encoded,signature]=parts,expected=crypto.createHmac('sha256',portalSecret()).update(encoded).digest('base64url');
  const gotBuffer=Buffer.from(signature),expectedBuffer=Buffer.from(expected);
  if(gotBuffer.length!==expectedBuffer.length||!crypto.timingSafeEqual(gotBuffer,expectedBuffer))throw Object.assign(new Error('Sessão da Área do Cliente inválida. Entre novamente.'),{statusCode:401});
  let payload;try{payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}catch{payload=null}
  if(!payload?.clientId||Number(payload.exp)<=Date.now())throw Object.assign(new Error('Sessão da Área do Cliente expirou. Entre novamente.'),{statusCode:401});
  return payload;
}

async function stateRow(req){
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}&select=value,updated_at&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}

async function stateGet(req){
  const row=await stateRow(req);
  return row?.value&&typeof row.value==='object'?row.value:{};
}

async function mutateState(req,mutator){
  for(let attempt=0;attempt<4;attempt++){
    const row=await stateRow(req);
    if(!row)throw Object.assign(new Error('Estado do Provedor Plus não encontrado.'),{statusCode:500});
    const current=row.value&&typeof row.value==='object'?row.value:{};
    const next=await mutator(JSON.parse(JSON.stringify(current)));
    if(!next||typeof next!=='object')return current;
    const updatedAt=new Date().toISOString();
    const filter=row.updated_at?`&updated_at=eq.${encodeURIComponent(row.updated_at)}`:'';
    const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}${filter}`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify({value:next,updated_at:updatedAt})
    });
    if(Array.isArray(patched)&&patched[0])return patched[0].value||next;
    await new Promise(resolve=>setTimeout(resolve,80*(attempt+1)));
  }
  throw Object.assign(new Error('O estado mudou durante a confirmação do pagamento. Tente novamente.'),{statusCode:409});
}

async function clientById(req,id){
  const rows=await db(req,`/pp_clients?id=eq.${encodeURIComponent(String(id))}&select=id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync&limit=1`);
  const client=Array.isArray(rows)?rows[0]:null;
  if(!client)throw Object.assign(new Error('Cliente não encontrado.'),{statusCode:404});
  return client;
}

async function sessionContext(req,data){
  const session=verifyPortalSession(data?.session);
  const [client,state]=await Promise.all([clientById(req,session.clientId),stateGet(req)]);
  return {session,client,state};
}

function findInvoice(state,clientId,invoiceId){
  const id=text(invoiceId);
  const row=(Array.isArray(state?.invoices)?state.invoices:[]).find(item=>String(item?.id)===id&&Number(item?.client_id)===Number(clientId));
  if(!row)throw Object.assign(new Error('Fatura não encontrada para este cliente.'),{statusCode:404});
  return row;
}

function invoiceOpen(invoice){
  const status=text(invoice?.status).toLowerCase();
  return !['pago','paid','baixado','cancelado','canceled','cancelled'].includes(status);
}

function invoiceAmount(invoice){
  const amount=moneyNumber(invoice);
  if(!Number.isFinite(amount)||amount<=0)throw Object.assign(new Error('Esta fatura não possui valor válido para pagamento.'),{statusCode:400});
  return Math.round(amount*100)/100;
}

function payerIdentification(client){
  const document=digits(client?.document);
  if(document.length===11)return {type:'CPF',number:document};
  if(document.length===14)return {type:'CNPJ',number:document};
  return null;
}

function splitName(value){
  const parts=text(value).split(/\s+/).filter(Boolean);
  return {firstName:parts.shift()||'Cliente',lastName:parts.join(' ')||'Fibra+'};
}

function portalData(client,state,{includeSession=false}={}){
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
  const result={
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
  if(includeSession)result.session=portalSession(client);
  return result;
}

async function login(req,data){
  const document=digits(data?.document||data?.cpf||data?.cnpj),contract=text(data?.contract||data?.contrato);
  if(!document&&!contract)throw Object.assign(new Error('Informe CPF, CNPJ ou contrato.'),{statusCode:400});
  if(document&&![11,14].includes(document.length))throw Object.assign(new Error('CPF ou CNPJ inválido.'),{statusCode:400});
  if(contract&&digits(contract).length<6)throw Object.assign(new Error('Contrato inválido.'),{statusCode:400});

  const clients=await db(req,'/pp_clients?select=id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync&order=id.asc');
  const client=(Array.isArray(clients)?clients:[]).find(item=>sameClient(item,{document,contract}));
  if(!client)throw Object.assign(new Error('Cliente não encontrado. Confira o CPF, CNPJ ou contrato informado.'),{statusCode:404});
  const state=await stateGet(req);
  return portalData(client,state,{includeSession:true});
}

async function refresh(req,data){
  const {client,state}=await sessionContext(req,data);
  return portalData(client,state);
}

async function mercadoPagoContext(req,state){
  const mp=state?.banks?.mercadoPago||{};
  const secret=await bankSecrets.get(req,'mercadoPago');
  const accessToken=text(secret?.accessToken),publicKey=text(mp?.publicKey);
  const production=mp?.environment==='production';
  const enabled=Boolean(mp?.enabled&&production&&accessToken);
  return {mp,accessToken,publicKey,production,enabled};
}

async function paymentConfig(req,data){
  const {state}=await sessionContext(req,data),cfg=await mercadoPagoContext(req,state);
  return {
    cardEnabled:Boolean(cfg.enabled&&cfg.publicKey),
    pixEnabled:Boolean(cfg.enabled),
    mercadoPagoPublicKey:cfg.publicKey,
    pixProvider:'mercadoPago',
    pixProviderLabel:'Mercado Pago',
    environment:cfg.production?'production':'sandbox'
  };
}

function paymentPreparation(client,invoice,method){
  if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível para pagamento.'),{statusCode:409});
  const amount=invoiceAmount(invoice),identification=payerIdentification(client),names=splitName(client.name);
  const payer={email:text(client.email),firstName:names.firstName,lastName:names.lastName};
  if(identification)payer.identification=identification;
  return {
    invoiceId:invoice.id,
    reference:invoiceReference(invoice)||String(invoice.id),
    dueDate:formatDate(invoice?.due_date||invoice?.dueDate),
    originalAmount:amount,
    cashbackDiscount:0,
    amount,
    method:text(method)||'pix',
    payer
  };
}

async function paymentPrepare(req,data){
  const {client,state}=await sessionContext(req,data),invoice=findInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state);
  const method=text(data?.method).toLowerCase()==='card'?'card':'pix';
  if(method==='card'&&!(cfg.enabled&&cfg.publicKey))throw Object.assign(new Error('Cartão via Mercado Pago não está habilitado no Provedor Plus.'),{statusCode:409});
  if(method==='pix'&&!cfg.enabled)throw Object.assign(new Error('Pix via Mercado Pago não está habilitado no Provedor Plus.'),{statusCode:409});
  return paymentPreparation(client,invoice,method);
}

function mpError(body,status){
  const cause=Array.isArray(body?.cause)?body.cause.map(item=>item?.description||item?.code).filter(Boolean).join(' · '):'';
  return text(cause||body?.message||body?.error||body?.status_detail)||`Mercado Pago recusou a solicitação (HTTP ${status}).`;
}

async function mpRequest(accessToken,path,{method='GET',body=null,idempotencyKey=''}={}){
  const headers={Accept:'application/json',Authorization:`Bearer ${accessToken}`};
  if(body!==null)headers['Content-Type']='application/json';
  if(idempotencyKey)headers['X-Idempotency-Key']=idempotencyKey;
  const response=await fetch(`https://api.mercadopago.com${path}`,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store'});
  let result={};try{result=await response.json()}catch{}
  if(!response.ok)throw Object.assign(new Error(mpError(result,response.status)),{statusCode:response.status>=400&&response.status<500?400:502,providerStatus:response.status});
  return result||{};
}

function idempotencyKey(parts){
  return crypto.createHash('sha256').update(parts.map(v=>String(v??'')).join('|')).digest('hex');
}

function mpTransaction(order){
  const list=order?.transactions?.payments;
  return Array.isArray(list)?list[0]||{}:{};
}

function normalizedStatus(order){
  const payment=mpTransaction(order),raw=text(payment?.status||order?.status).toLowerCase(),detail=text(payment?.status_detail||order?.status_detail).toLowerCase();
  if(raw==='processed'||raw==='approved'||raw==='paid'||detail==='accredited')return 'approved';
  if(['rejected','failed','cancelled','canceled'].includes(raw)||/rejected|cancel|failed|error/.test(detail))return 'rejected';
  return 'pending';
}

function paymentResponse(order,amount,extra={}){
  const payment=mpTransaction(order),method=payment?.payment_method||{},status=normalizedStatus(order);
  return {
    orderId:text(order?.id),
    paymentId:text(order?.id),
    transactionId:text(payment?.id),
    status,
    rawStatus:text(payment?.status||order?.status),
    statusDetail:text(payment?.status_detail||order?.status_detail),
    amount:Number(amount)||number(payment?.amount)||number(order?.total_amount)||0,
    qrCode:text(method?.qr_code),
    qrCodeBase64:text(method?.qr_code_base64),
    paymentUrl:text(method?.ticket_url),
    provider:'mercadoPago',
    providerLabel:'Mercado Pago',
    ...extra
  };
}

async function markInvoicePaid(req,clientId,invoiceId,{method,order,amount}){
  const payment=mpTransaction(order),paidAt=new Date().toISOString();
  await mutateState(req,state=>{
    const invoices=Array.isArray(state.invoices)?state.invoices:[];
    const index=invoices.findIndex(item=>String(item?.id)===String(invoiceId)&&Number(item?.client_id)===Number(clientId));
    if(index<0)throw Object.assign(new Error('Fatura não encontrada durante a baixa.'),{statusCode:404});
    const current=invoices[index];
    if(['pago','paid','baixado'].includes(text(current?.status).toLowerCase()))return state;
    invoices[index]={
      ...current,
      status:'Pago',
      paid_at:paidAt,
      paid_date:paidAt,
      payment_provider:'mercadoPago',
      payment_method:method,
      payment_amount_cents:Math.round((Number(amount)||moneyNumber(current))*100),
      mercado_pago_order_id:text(order?.id),
      mercado_pago_payment_id:text(payment?.id),
      mercado_pago_status:text(payment?.status||order?.status),
      mercado_pago_status_detail:text(payment?.status_detail||order?.status_detail),
      updated_at:paidAt
    };
    state.invoices=invoices;
    return state;
  });
}

async function paymentPix(req,data){
  const {client,state}=await sessionContext(req,data),invoice=findInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state);
  if(!cfg.enabled)throw Object.assign(new Error('Mercado Pago não está habilitado para Pix.'),{statusCode:409});
  if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível.'),{statusCode:409});
  const email=text(client.email);
  if(!email||!email.includes('@'))throw Object.assign(new Error('Cadastre um e-mail válido para o cliente antes de gerar o Pix pelo Mercado Pago.'),{statusCode:400});
  const amount=invoiceAmount(invoice),amountText=amount.toFixed(2),identification=payerIdentification(client),payer={email};
  if(identification)payer.identification=identification;
  const body={
    type:'online',
    total_amount:amountText,
    external_reference:`PP-INV-${String(invoice.id)}`,
    processing_mode:'automatic',
    transactions:{payments:[{amount:amountText,payment_method:{id:'pix',type:'bank_transfer'}}]},
    payer
  };
  const key=idempotencyKey(['provedor-plus','pix',invoice.id,amountText,text(invoice?.due_date||invoice?.dueDate)]),order=await mpRequest(cfg.accessToken,'/v1/orders',{method:'POST',body,idempotencyKey:key}),result=paymentResponse(order,amount);
  if(result.status==='approved')await markInvoicePaid(req,client.id,invoice.id,{method:'pix',order,amount});
  return result;
}

function cardPaymentData(data,client,amount){
  const form=data?.paymentData&&typeof data.paymentData==='object'?data.paymentData:{},token=text(form.token),methodId=text(form.payment_method_id||form.paymentMethodId),installments=Math.max(1,Math.floor(number(form.installments)||1));
  if(!token)throw Object.assign(new Error('O Mercado Pago não retornou o token do cartão. Confira os dados e tente novamente.'),{statusCode:400});
  if(!methodId)throw Object.assign(new Error('O Mercado Pago não identificou a bandeira do cartão.'),{statusCode:400});
  const payerForm=form.payer&&typeof form.payer==='object'?form.payer:{},email=text(payerForm.email||client.email),identification=payerForm.identification&&typeof payerForm.identification==='object'?payerForm.identification:payerIdentification(client);
  if(!email||!email.includes('@'))throw Object.assign(new Error('Informe um e-mail válido no pagamento com cartão.'),{statusCode:400});
  const payer={email};if(identification?.type&&identification?.number)payer.identification={type:text(identification.type),number:digits(identification.number)};
  const amountText=amount.toFixed(2);
  return {token,methodId,installments,payer,amountText};
}

async function paymentCard(req,data){
  const {client,state}=await sessionContext(req,data),invoice=findInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state);
  if(!(cfg.enabled&&cfg.publicKey))throw Object.assign(new Error('Mercado Pago não está habilitado para cartão.'),{statusCode:409});
  if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível.'),{statusCode:409});
  const amount=invoiceAmount(invoice),card=cardPaymentData(data,client,amount),body={
    type:'online',
    processing_mode:'automatic',
    total_amount:card.amountText,
    external_reference:`PP-INV-${String(invoice.id)}`,
    payer:card.payer,
    transactions:{payments:[{amount:card.amountText,payment_method:{id:card.methodId,type:'credit_card',token:card.token,installments:card.installments}}]}
  };
  const key=idempotencyKey(['provedor-plus','card',invoice.id,card.amountText,card.token]),order=await mpRequest(cfg.accessToken,'/v1/orders',{method:'POST',body,idempotencyKey:key}),result=paymentResponse(order,amount);
  if(result.status==='approved'){
    await markInvoicePaid(req,client.id,invoice.id,{method:'card',order,amount});
    result.message='Pagamento aprovado e fatura baixada no Provedor Plus.';
  }else if(result.status==='rejected')result.message='Pagamento não aprovado pelo Mercado Pago.';
  return result;
}

async function paymentStatus(req,data){
  const {client,state}=await sessionContext(req,data),invoice=findInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state);
  if(!cfg.enabled)throw Object.assign(new Error('Mercado Pago não está habilitado.'),{statusCode:409});
  const orderId=text(data?.paymentId||data?.orderId);
  if(!orderId||!/^ORD/i.test(orderId))throw Object.assign(new Error('Identificador do pagamento inválido.'),{statusCode:400});
  const order=await mpRequest(cfg.accessToken,`/v1/orders/${encodeURIComponent(orderId)}`),amount=invoiceAmount(invoice),result=paymentResponse(order,amount);
  if(result.status==='approved'&&invoiceOpen(invoice)){
    const payment=mpTransaction(order),type=text(payment?.payment_method?.type).toLowerCase(),method=type==='bank_transfer'?'pix':'card';
    await markInvoicePaid(req,client.id,invoice.id,{method,order,amount});
    result.state='Pago';result.message='Pagamento confirmado. Fatura baixada no Provedor Plus.';
  }
  return result;
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
    let result;
    if(action==='login')result=await login(req,data);
    else if(action==='refresh')result=await refresh(req,data);
    else if(action==='payment-config')result=await paymentConfig(req,data);
    else if(action==='payment-prepare')result=await paymentPrepare(req,data);
    else if(action==='payment-pix')result=await paymentPix(req,data);
    else if(action==='payment-card')result=await paymentCard(req,data);
    else if(action==='payment-status')result=await paymentStatus(req,data);
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return res.status(200).json({ok:true,data:result});
  }catch(error){
    const status=Number(error?.statusCode)||500;
    return res.status(status).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};