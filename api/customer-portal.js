const crypto=require('node:crypto');
const bankSecrets=require('../lib/bank-secret-store');

const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';
const STATE_KEY='web_state_v1017';
const ALLOWED_ORIGINS=new Set(['https://cliente.fibramais.workers.dev']);
const RESERVATION_MS=30*60*1000;

const text=value=>String(value??'').trim();
const digits=value=>text(value).replace(/\D/g,'');
const number=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const cents=value=>Math.max(0,Math.round(Number(value)||0));
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function cors(req,res){
  const origin=text(req.headers.origin);
  if(origin&&ALLOWED_ORIGINS.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','86400');
}
function oidcToken(req){return text(req.headers['x-vercel-oidc-token'])||text(process.env.VERCEL_OIDC_TOKEN)}
async function db(req,path,options={}){
  const token=oidcToken(req);
  if(!token)throw Object.assign(new Error('Banco do Provedor Plus indisponível.'),{statusCode:503});
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers,cache:'no-store'});
  let raw='';try{raw=await response.text()}catch{}
  let body=null;if(raw){try{body=JSON.parse(raw)}catch{body=raw}}
  if(!response.ok){const message=body?.message||body?.error||`Falha ao consultar o Provedor Plus (HTTP ${response.status}).`;throw Object.assign(new Error(message),{statusCode:response.status,detail:body})}
  return body;
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
function moneyCents(row){return Math.max(0,Math.round(moneyNumber(row)*100))}
function brl(value){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0)}
function invoiceReference(row){
  const explicit=text(row?.reference||row?.competency||row?.competence||row?.month||row?.period);if(explicit)return explicit;
  const raw=text(row?.due_date||row?.dueDate).slice(0,10),match=raw.match(/^(\d{4})-(\d{2})-/);return match?`${match[2]}/${match[1]}`:'';
}
function invoiceOpen(invoice){return !['pago','paid','baixado','cancelado','canceled','cancelled'].includes(text(invoice?.status).toLowerCase())}
function invoiceAmount(invoice){const amount=moneyNumber(invoice);if(!Number.isFinite(amount)||amount<=0)throw Object.assign(new Error('Esta fatura não possui valor válido para pagamento.'),{statusCode:400});return Math.round(amount*100)/100}

function stateClient(state,id){return (Array.isArray(state?.clients)?state.clients:[]).find(item=>Number(item?.id)===Number(id))||null}
function balanceCents(client){
  const direct=number(client?.cashback_balance_cents);if(direct!==null)return cents(direct);
  const plain=number(client?.cashback_balance);return plain===null?0:cents(plain*100);
}
function setBalance(client,value){const next=cents(value);client.cashback_balance_cents=next;client.cashback_balance=next/100;client.cashback_updated_at=new Date().toISOString();return next}
function settingsOf(state){return state?.settings&&typeof state.settings==='object'?state.settings:{}}
function cashbackRate(state){const n=number(settingsOf(state).cashback_rate);return n===null?0:Math.max(0,n)}
function cashbackEnabled(state){return settingsOf(state).cashback_enabled!==false&&String(settingsOf(state).cashback_enabled)!=='false'}
function reservationActive(invoice){
  if(text(invoice?.cashback_discount_status)!=='reserved')return false;
  const at=new Date(invoice?.cashback_discount_reserved_at||0).getTime();return Number.isFinite(at)&&Date.now()-at<RESERVATION_MS&&invoiceOpen(invoice);
}
function reservationsFor(state,clientId,excludeInvoiceId=''){
  return (Array.isArray(state?.invoices)?state.invoices:[]).filter(i=>Number(i?.client_id)===Number(clientId)&&String(i?.id)!==String(excludeInvoiceId)&&reservationActive(i)).reduce((sum,i)=>sum+cents(i?.cashback_discount_reserved_cents),0);
}
function cashbackUseLimitPercent(state){
  const settings=settingsOf(state),explicit=number(settings.cashback_use_limit_percent);
  if(explicit!==null)return Math.max(0,Math.min(100,explicit));
  const rate=cashbackRate(state);return Math.max(0,Math.min(100,rate||3));
}
function discountCalculation(state,clientId,invoice){
  const originalCents=moneyCents(invoice),client=stateClient(state,clientId),balance=balanceCents(client),reservedElsewhere=reservationsFor(state,clientId,invoice?.id),available=Math.max(0,balance-reservedElsewhere),eligible=cashbackEnabled(state)&&invoice?.cashback_eligible!==false;
  const limitPercent=cashbackUseLimitPercent(state),limitCents=Math.max(0,Math.floor(originalCents*limitPercent/100)),discountCents=eligible?Math.min(available,limitCents,Math.max(0,originalCents-1)):0;
  return {originalCents,balanceCents:balance,availableCents:available,limitPercent,discountCents,amountCents:Math.max(1,originalCents-discountCents)};
}
function cashbackCreditCents(state,invoice,paidCents){
  if(!cashbackEnabled(state)||invoice?.cashback_eligible===false)return 0;
  const settings=settingsOf(state),mode=text(settings.cashback_mode).toLowerCase();
  if(mode==='fixed')return cents(settings.cashback_fixed_cents);
  return cents(Math.round(cents(paidCents)*cashbackRate(state)/100));
}
function cashbackData(state,clientId){
  const client=stateClient(state,clientId)||{},balance=balanceCents(client),rows=(Array.isArray(state?.cashback_transactions)?state.cashback_transactions:[]).filter(item=>Number(item?.client_id)===Number(clientId)).sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||'')));
  const statement=rows.map(item=>({id:item.id,type:text(item.type),source:text(item.source),description:text(item.reason||item.description),amountCents:cents(item.amount_cents),balanceAfterCents:cents(item.balance_after_cents),balanceBeforeCents:cents(item.balance_before_cents),createdAt:item.created_at||item.createdAt||'',invoiceId:item.invoice_id??null}));
  const credits=rows.filter(i=>text(i.type)==='credit').reduce((s,i)=>s+cents(i.amount_cents),0),debits=rows.filter(i=>text(i.type)==='debit').reduce((s,i)=>s+cents(i.amount_cents),0);
  return {balance:balance/100,balanceCents:balance,rate:cashbackRate(state),enabled:cashbackEnabled(state),useLimitPercent:cashbackUseLimitPercent(state),statement,totalCreditsCents:credits,totalDebitsCents:debits};
}

function mapInvoice(row,client,state){
  const total=moneyNumber(row),planName=text(client.plan_name||client.plan||state?.plans?.find?.(p=>Number(p?.id)===Number(client.plan_id))?.name)||'Serviço de internet',company=state?.settings||state?.company||{},provider=text(row?.bank_provider||row?.payment_provider);
  return {
    id:row?.id??null,reference:invoiceReference(row),dueDate:formatDate(row?.due_date||row?.dueDate),dueDateRaw:text(row?.due_date||row?.dueDate),total:brl(total),totalNumber:total,status:text(row?.status)||'Pendente',
    serviceName:planName,serviceAmount:brl(total),serviceAmountRaw:brl(total),subtotal:brl(total),quantity:'1',unitAmount:brl(total),customerName:text(client.name),customerDocument:text(client.document),customerAddress:[client.address||client.street,client.city,client.state].map(text).filter(Boolean).join(' - '),customerWhatsapp:text(client.phone||client.whatsapp),contract:text(client.contract_number),companyName:text(company.company_name||company.companyName||company.name)||'Fibra+',companyCnpj:text(company.cnpj||company.company_cnpj),companyIe:text(company.ie||company.state_registration||company.inscricao_estadual),companyWhatsapp:text(company.whatsapp||company.phone)||'(92) 98486-7428',
    bankProvider:provider,bank_provider:provider,bankChargeId:text(row?.bank_charge_id),bankOrderId:text(row?.bank_order_id||row?.mercado_pago_order_id),bankStatus:text(row?.bank_status||row?.mercado_pago_status),bankStatusDetail:text(row?.bank_status_detail||row?.mercado_pago_status_detail),
    pixPaymentUrl:text(row?.pix_payment_url||row?.pixPaymentUrl||row?.pix_url||row?.pixUrl||row?.bank_ticket_url),pixCopyPaste:text(row?.pix_copy_paste||row?.pixCopyPaste||row?.pix_payload||row?.pixPayload||row?.bank_pix_code),pixQrImage:text(row?.pix_qr_image||row?.pixQrImage||row?.pix_qr_url||row?.qr_code_url),cardPaymentUrl:text(row?.card_payment_url||row?.cardPaymentUrl||row?.checkout_url||row?.payment_url),pdfUrl:text(row?.pdf_url||row?.invoice_pdf_url||row?.boleto_pdf_url||row?.bank_pdf_url),digitableLine:text(row?.digitable_line||row?.linha_digitavel||row?.bank_digitable_line),barcodeImage:text(row?.barcode_image||row?.barcode_url),bankCode:text(row?.bank_code||row?.bankCode),ourNumber:text(row?.our_number||row?.nosso_numero),documentNumber:text(row?.document_number||row?.number||row?.id),
    cashbackEnabled:row?.cashback_enabled!==false,cashbackRate:number(row?.cashback_rate??state?.settings?.cashback_rate)??null,cashbackPending:number(row?.cashback_pending)??null,cashbackBalance:balanceCents(stateClient(state,client.id))/100,cashbackDiscount:cents(row?.cashback_discount_applied_cents||row?.cashback_discount_reserved_cents)/100,
    paymentProvider:text(row?.payment_provider),paymentMethod:text(row?.payment_method),paidAt:row?.paid_at||row?.paidAt||''
  };
}
function mapPlan(plan){const c=number(plan?.price_cents),plain=number(plan?.price??plan?.amount);return {id:plan?.id??null,name:text(plan?.name||plan?.title)||'Plano Fibra+',speed:text(plan?.speed||plan?.bandwidth),description:text(plan?.description),price:c!==null?c/100:(plain??0),highlight:plan?.highlight===true,badge:text(plan?.badge||plan?.category)||'Plano Fibra+'}}
function sameClient(client,{document,contract}){const doc=digits(client?.document),stored=text(client?.contract_number),byDocument=document?doc===document:false,byContract=contract?(stored===contract||digits(stored)===digits(contract)):false;return document&&contract?byDocument&&byContract:byDocument||byContract}

function portalSecret(){return text(process.env.PORTAL_SESSION_SECRET)||'provedor-plus-portal-session-v1'}
function portalSession(client){const payload={clientId:Number(client.id)||client.id,exp:Date.now()+30*60*1000},encoded=Buffer.from(JSON.stringify(payload)).toString('base64url'),signature=crypto.createHmac('sha256',portalSecret()).update(encoded).digest('base64url');return `${encoded}.${signature}`}
function verifyPortalSession(value){
  const token=text(value),parts=token.split('.');if(parts.length!==2)throw Object.assign(new Error('Sessão da Área do Cliente inválida. Entre novamente.'),{statusCode:401});
  const [encoded,signature]=parts,expected=crypto.createHmac('sha256',portalSecret()).update(encoded).digest('base64url'),got=Buffer.from(signature),wanted=Buffer.from(expected);
  if(got.length!==wanted.length||!crypto.timingSafeEqual(got,wanted))throw Object.assign(new Error('Sessão da Área do Cliente inválida. Entre novamente.'),{statusCode:401});
  let payload;try{payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'))}catch{payload=null}
  if(!payload?.clientId||Number(payload.exp)<=Date.now())throw Object.assign(new Error('Sessão da Área do Cliente expirou. Entre novamente.'),{statusCode:401});return payload;
}
async function stateRow(req){const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}&select=value,updated_at&limit=1`);return Array.isArray(rows)?rows[0]||null:null}
async function stateGet(req){const row=await stateRow(req);return row?.value&&typeof row.value==='object'?row.value:{}}
async function mutateState(req,mutator){
  for(let attempt=0;attempt<6;attempt++){
    const row=await stateRow(req);if(!row)throw Object.assign(new Error('Estado do Provedor Plus não encontrado.'),{statusCode:500});
    const current=row.value&&typeof row.value==='object'?row.value:{},next=await mutator(clone(current));if(!next||typeof next!=='object')return current;
    const updatedAt=new Date().toISOString(),filter=row.updated_at?`&updated_at=eq.${encodeURIComponent(row.updated_at)}`:'',patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(STATE_KEY)}${filter}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({value:next,updated_at:updatedAt})});
    if(Array.isArray(patched)&&patched[0])return patched[0].value||next;
    await new Promise(resolve=>setTimeout(resolve,70*(attempt+1)));
  }
  throw Object.assign(new Error('O estado mudou durante a operação. Tente novamente.'),{statusCode:409});
}
async function clientById(req,id){const rows=await db(req,`/pp_clients?id=eq.${encodeURIComponent(String(id))}&select=id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync&limit=1`),client=Array.isArray(rows)?rows[0]:null;if(!client)throw Object.assign(new Error('Cliente não encontrado.'),{statusCode:404});return client}
async function sessionContext(req,data){const session=verifyPortalSession(data?.session),[client,state]=await Promise.all([clientById(req,session.clientId),stateGet(req)]);return {session,client,state}}
function rawInvoice(state,clientId,invoiceId){const id=text(invoiceId),row=(Array.isArray(state?.invoices)?state.invoices:[]).find(item=>String(item?.id)===id&&Number(item?.client_id)===Number(clientId));if(!row)throw Object.assign(new Error('Fatura não encontrada para este cliente.'),{statusCode:404});return row}

function connectionData(client){const status=text(client.mikrotik_status||client.status),online=/online|conectado|ativo/i.test(status)&&!/offline|desconectado|bloqueado/i.test(status);return {status:status||'Aguardando dados',pppoeStatus:client.connection_type==='PPPoE'?(online?'Conectado':'Aguardando confirmação'):'Não se aplica',pppoeConnected:client.connection_type==='PPPoE'?online:null,ip:text(client.ip)||'Aguardando dados',lastConnection:text(client.mikrotik_last_sync)||'Aguardando dados',quality:online?'Boa':'Aguardando dados',regionIssue:{active:false,status:'clear',title:'Nenhum problema informado na região',message:'Não há manutenção ou indisponibilidade geral informada no momento.'}}}
function portalData(client,state,{includeSession=false}={}){
  const invoices=(Array.isArray(state.invoices)?state.invoices:[]).filter(row=>Number(row?.client_id)===Number(client.id)).map(row=>mapInvoice(row,client,state)).sort((a,b)=>String(b.dueDateRaw).localeCompare(String(a.dueDateRaw))),pending=invoices.filter(row=>!['pago','paid','baixado','cancelado','canceled'].includes(text(row.status).toLowerCase())),current=(pending.sort((a,b)=>String(a.dueDateRaw).localeCompare(String(b.dueDateRaw)))[0]||invoices[0]||null),plans=(Array.isArray(state.plans)?state.plans:[]).filter(plan=>plan?.active!==false&&plan?.enabled!==false&&plan?.portal_visible!==false).map(mapPlan),cashback=cashbackData(state,client.id);
  const result={client:{id:client.id,name:text(client.name),firstName:text(client.name).split(/\s+/)[0]||'',document:text(client.document),contract:text(client.contract_number),whatsapp:text(client.phone),email:text(client.email),address:[client.address,client.city,client.state].map(text).filter(Boolean).join(' - '),status:text(client.status),plan:text(client.plan)},invoice:current,invoices,plans,connection:connectionData(client),cashback,negotiations:[],protocols:[]};if(includeSession)result.session=portalSession(client);return result;
}
async function login(req,data){const document=digits(data?.document||data?.cpf||data?.cnpj),contract=text(data?.contract||data?.contrato);if(!document&&!contract)throw Object.assign(new Error('Informe CPF, CNPJ ou contrato.'),{statusCode:400});if(document&&![11,14].includes(document.length))throw Object.assign(new Error('CPF ou CNPJ inválido.'),{statusCode:400});if(contract&&digits(contract).length<6)throw Object.assign(new Error('Contrato inválido.'),{statusCode:400});const clients=await db(req,'/pp_clients?select=id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,router_id,connection_type,pppoe_username,ip,mikrotik_status,mikrotik_last_sync&order=id.asc'),client=(Array.isArray(clients)?clients:[]).find(item=>sameClient(item,{document,contract}));if(!client)throw Object.assign(new Error('Cliente não encontrado. Confira o CPF, CNPJ ou contrato informado.'),{statusCode:404});return portalData(client,await stateGet(req),{includeSession:true})}
async function refresh(req,data){const {client,state}=await sessionContext(req,data);return portalData(client,state)}
async function connectionTest(req,data){const {client,state}=await sessionContext(req,data),connection=connectionData(client),online=connection.pppoeConnected===true;connection.diagnostic={ok:online,success:online,status:online?'success':'error',state:online?'complete':'error',completed:online,done:online,checking:false,loading:false,summary:online?'Conexão autenticada':'Conexão não confirmada',message:online?'O Provedor Plus confirmou a sessão PPPoE e os dados sincronizados do MikroTik.':'A sessão PPPoE não está confirmada nos dados mais recentes do MikroTik.',authentication:online?'Autenticada':'Não confirmada',communication:text(client.mikrotik_last_sync)?'Sincronizada':'Aguardando sincronização'};return {...portalData(client,state),connection}}
async function negotiationOptions(req,data){await sessionContext(req,data);return {enabled:false,eligibleInvoices:[],options:[],bankReady:false,bankMessage:'Negociação automática temporariamente desativada durante a consolidação bancária.'}}
async function negotiate(req,data){await sessionContext(req,data);throw Object.assign(new Error('Negociação automática temporariamente desativada durante a consolidação bancária.'),{statusCode:409})}

async function mercadoPagoContext(req,state){const mp=state?.banks?.mercadoPago||{},secret=await bankSecrets.get(req,'mercadoPago'),accessToken=text(secret?.accessToken),publicKey=text(mp?.publicKey),production=mp?.environment==='production',enabled=Boolean(mp?.enabled&&production&&accessToken);return {mp,accessToken,publicKey,production,enabled}}
async function paymentConfig(req,data){const {state}=await sessionContext(req,data),cfg=await mercadoPagoContext(req,state),efi=state?.banks?.efi||{};return {cardEnabled:Boolean(cfg.enabled&&cfg.publicKey),pixEnabled:Boolean(cfg.enabled),boletoEnabled:Boolean(efi?.enabled&&efi?.clientIdConfigured&&efi?.clientSecretConfigured),mercadoPagoPublicKey:cfg.publicKey,pixProvider:'mercadoPago',pixProviderLabel:'Mercado Pago',boletoProvider:'efi',boletoProviderLabel:'Efí Bank',environment:cfg.production?'production':'sandbox',cashbackUseLimitPercent:cashbackUseLimitPercent(state)}}
function paymentPreparation(state,client,invoice,method){if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível para pagamento.'),{statusCode:409});const original=invoiceAmount(invoice),calc=method==='pix'?discountCalculation(state,client.id,invoice):{discountCents:0,amountCents:cents(original*100),balanceCents:balanceCents(stateClient(state,client.id)),limitPercent:cashbackUseLimitPercent(state)},identification=payerIdentification(client),names=splitName(client.name),payer={email:text(client.email),firstName:names.firstName,lastName:names.lastName};if(identification)payer.identification=identification;return {invoiceId:invoice.id,reference:invoiceReference(invoice)||String(invoice.id),dueDate:formatDate(invoice?.due_date||invoice?.dueDate),originalAmount:original,cashbackDiscount:calc.discountCents/100,cashbackDiscountCents:calc.discountCents,cashbackBalance:calc.balanceCents/100,cashbackUseLimitPercent:calc.limitPercent,amount:calc.amountCents/100,method,payer}}
async function paymentPrepare(req,data){const {client,state}=await sessionContext(req,data),invoice=rawInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state),method=text(data?.method).toLowerCase()==='card'?'card':'pix';if(method==='card'&&!(cfg.enabled&&cfg.publicKey))throw Object.assign(new Error('Cartão via Mercado Pago não está habilitado no Provedor Plus.'),{statusCode:409});if(method==='pix'&&!cfg.enabled)throw Object.assign(new Error('Pix via Mercado Pago não está habilitado no Provedor Plus.'),{statusCode:409});return paymentPreparation(state,client,invoice,method)}
function payerIdentification(client){const document=digits(client?.document);if(document.length===11)return {type:'CPF',number:document};if(document.length===14)return {type:'CNPJ',number:document};return null}
function splitName(value){const parts=text(value).split(/\s+/).filter(Boolean);return {firstName:parts.shift()||'Cliente',lastName:parts.join(' ')||'Fibra+'}}
function mpError(body,status){const cause=Array.isArray(body?.cause)?body.cause.map(item=>item?.description||item?.code).filter(Boolean).join(' · '):'';return text(cause||body?.message||body?.error||body?.status_detail)||`Mercado Pago recusou a solicitação (HTTP ${status}).`}
async function mpRequest(accessToken,path,{method='GET',body=null,idempotencyKey=''}={}){const headers={Accept:'application/json',Authorization:`Bearer ${accessToken}`};if(body!==null)headers['Content-Type']='application/json';if(idempotencyKey)headers['X-Idempotency-Key']=idempotencyKey;const response=await fetch(`https://api.mercadopago.com${path}`,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store'});let result={};try{result=await response.json()}catch{}if(!response.ok)throw Object.assign(new Error(mpError(result,response.status)),{statusCode:response.status>=400&&response.status<500?400:502,providerStatus:response.status});return result||{}}
function idempotencyKey(parts){return crypto.createHash('sha256').update(parts.map(v=>String(v??'')).join('|')).digest('hex')}
function mpTransaction(order){const list=order?.transactions?.payments;return Array.isArray(list)?list[0]||{}:{}}
function normalizedStatus(order){const payment=mpTransaction(order),raw=text(payment?.status||order?.status).toLowerCase(),detail=text(payment?.status_detail||order?.status_detail).toLowerCase();if(raw==='processed'||raw==='approved'||raw==='paid'||detail==='accredited')return 'approved';if(['rejected','failed','cancelled','canceled'].includes(raw)||/rejected|cancel|failed|error/.test(detail))return 'rejected';return 'pending'}
function paymentResponse(order,amount,extra={}){const payment=mpTransaction(order),method=payment?.payment_method||{},status=normalizedStatus(order);return {orderId:text(order?.id),paymentId:text(order?.id),transactionId:text(payment?.id),status,rawStatus:text(payment?.status||order?.status),statusDetail:text(payment?.status_detail||order?.status_detail),amount:Number(amount)||number(payment?.amount)||number(order?.total_amount)||0,qrCode:text(method?.qr_code),qrCodeBase64:text(method?.qr_code_base64),paymentUrl:text(method?.ticket_url),provider:'mercadoPago',providerLabel:'Mercado Pago',...extra}}

async function reservePix(req,clientId,invoiceId){let reservation=null;await mutateState(req,state=>{const invoice=rawInvoice(state,clientId,invoiceId);if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível.'),{statusCode:409});const calc=discountCalculation(state,clientId,invoice),existingActive=reservationActive(invoice),discount=existingActive?Math.min(cents(invoice.cashback_discount_reserved_cents),calc.originalCents-1):calc.discountCents,amountCents=Math.max(1,calc.originalCents-discount),at=new Date().toISOString();invoice.cashback_discount_reserved_cents=discount;invoice.cashback_discount_reserved_at=at;invoice.cashback_discount_status=discount>0?'reserved':'none';invoice.cashback_original_cents=calc.originalCents;invoice.cashback_pix_amount_cents=amountCents;reservation={discountCents:discount,amountCents,originalCents:calc.originalCents,limitPercent:calc.limitPercent};return state});return reservation}
async function attachOrder(req,clientId,invoiceId,order,result){await mutateState(req,state=>{const invoice=rawInvoice(state,clientId,invoiceId);invoice.payment_provider='mercadoPago';invoice.mercado_pago_order_id=text(order?.id);invoice.mercado_pago_payment_id=text(mpTransaction(order)?.id);invoice.mercado_pago_status=text(mpTransaction(order)?.status||order?.status);invoice.mercado_pago_status_detail=text(mpTransaction(order)?.status_detail||order?.status_detail);invoice.payment_pending=result.status==='pending';invoice.updated_at=new Date().toISOString();return state})}
async function releaseReservation(req,clientId,invoiceId,reason='released'){await mutateState(req,state=>{const invoice=rawInvoice(state,clientId,invoiceId);if(text(invoice.cashback_discount_status)==='reserved'){invoice.cashback_discount_status=reason;invoice.cashback_discount_reserved_cents=0;invoice.cashback_discount_released_at=new Date().toISOString()}return state}).catch(()=>{})}
function hasTx(state,clientId,invoiceId,source){return (Array.isArray(state.cashback_transactions)?state.cashback_transactions:[]).some(t=>Number(t?.client_id)===Number(clientId)&&String(t?.invoice_id)===String(invoiceId)&&text(t?.source)===source)}
function pushTx(state,tx){state.cashback_transactions=Array.isArray(state.cashback_transactions)?state.cashback_transactions:[];state.cashback_transactions.push(tx)}
async function markInvoicePaid(req,clientId,invoiceId,{method,order,amount}){let finalState=null;finalState=await mutateState(req,state=>{const invoice=rawInvoice(state,clientId,invoiceId);if(['pago','paid','baixado'].includes(text(invoice?.status).toLowerCase()))return state;const payment=mpTransaction(order),paidAt=new Date().toISOString(),client=stateClient(state,clientId),paidCents=cents((Number(amount)||moneyNumber(invoice))*100);if(!client)throw Object.assign(new Error('Cliente da fatura não foi encontrado no estado.'),{statusCode:500});let balance=balanceCents(client),discount=method==='pix'?Math.min(cents(invoice.cashback_discount_reserved_cents),balance):0;if(discount>0&&!hasTx(state,clientId,invoiceId,'pix_discount')){const before=balance;balance=Math.max(0,balance-discount);pushTx(state,{id:`mp-discount-${invoiceId}`,type:'debit',reason:`Desconto usado no Pix da fatura ${invoiceReference(invoice)||invoiceId}`,source:'pix_discount',client_id:Number(clientId),invoice_id:invoice.id,created_at:paidAt,payment_at:paidAt,amount_cents:discount,created_by_name:'Pagamento Pix Mercado Pago',balance_before_cents:before,balance_after_cents:balance})}
    let credit=0;if(method==='pix'){credit=cashbackCreditCents(state,invoice,paidCents);if(credit>0&&!hasTx(state,clientId,invoiceId,'pix_paid')){const before=balance;balance+=credit;pushTx(state,{id:`mp-credit-${invoiceId}`,type:'credit',reason:`Cashback automático do Pix da fatura ${invoiceReference(invoice)||invoiceId}`,source:'pix_paid',client_id:Number(clientId),invoice_id:invoice.id,created_at:paidAt,payment_at:paidAt,amount_cents:credit,created_by_name:'Pagamento Pix Mercado Pago',balance_before_cents:before,balance_after_cents:balance})}}
    setBalance(client,balance);invoice.status='Pago';invoice.paid_at=paidAt;invoice.paid_date=paidAt;invoice.paid_by='Área do Cliente';invoice.payment_provider='mercadoPago';invoice.payment_method=method==='pix'?'Pix Mercado Pago':'Cartão Mercado Pago';invoice.payment_origin='area-cliente';invoice.payment_amount_cents=paidCents;invoice.payment_pending=false;invoice.mercado_pago_order_id=text(order?.id);invoice.mercado_pago_payment_id=text(payment?.id);invoice.mercado_pago_status=text(payment?.status||order?.status);invoice.mercado_pago_status_detail=text(payment?.status_detail||order?.status_detail);invoice.cashback_discount_applied_cents=discount;invoice.cashback_discount_status=discount>0?'used':'none';invoice.cashback_discount_used_at=discount>0?paidAt:'';invoice.cashback_credit_cents=credit;invoice.cashback_credited_at=credit>0?paidAt:'';invoice.cashback_pix_amount_cents=method==='pix'?paidCents:invoice.cashback_pix_amount_cents;invoice.updated_at=paidAt;return state});return finalState}

async function paymentPix(req,data){const {client,state}=await sessionContext(req,data),invoice=rawInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state);if(!cfg.enabled)throw Object.assign(new Error('Mercado Pago não está habilitado para Pix.'),{statusCode:409});if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível.'),{statusCode:409});const email=text(client.email);if(!email||!email.includes('@'))throw Object.assign(new Error('Cadastre um e-mail válido para o cliente antes de gerar o Pix pelo Mercado Pago.'),{statusCode:400});const reservation=await reservePix(req,client.id,invoice.id),amount=reservation.amountCents/100,amountText=amount.toFixed(2),identification=payerIdentification(client),payer={email};if(identification)payer.identification=identification;const body={type:'online',total_amount:amountText,external_reference:`PP-INV-${String(invoice.id)}`,processing_mode:'automatic',transactions:{payments:[{amount:amountText,payment_method:{id:'pix',type:'bank_transfer'}}]},payer},key=idempotencyKey(['provedor-plus','pix',invoice.id,amountText,reservation.discountCents,text(invoice?.due_date||invoice?.dueDate)]);let order;try{order=await mpRequest(cfg.accessToken,'/v1/orders',{method:'POST',body,idempotencyKey:key})}catch(error){await releaseReservation(req,client.id,invoice.id,'released_error');throw error}const result=paymentResponse(order,amount,{originalAmount:reservation.originalCents/100,cashbackDiscount:reservation.discountCents/100,cashbackUseLimitPercent:reservation.limitPercent});await attachOrder(req,client.id,invoice.id,order,result);if(result.status==='approved')await markInvoicePaid(req,client.id,invoice.id,{method:'pix',order,amount});return result}
function cardPaymentData(data,client,amount){const form=data?.paymentData&&typeof data.paymentData==='object'?data.paymentData:{},token=text(form.token),methodId=text(form.payment_method_id||form.paymentMethodId),installments=Math.max(1,Math.floor(number(form.installments)||1));if(!token)throw Object.assign(new Error('O Mercado Pago não retornou o token do cartão. Confira os dados e tente novamente.'),{statusCode:400});if(!methodId)throw Object.assign(new Error('O Mercado Pago não identificou a bandeira do cartão.'),{statusCode:400});const payerForm=form.payer&&typeof form.payer==='object'?form.payer:{},email=text(payerForm.email||client.email),identification=payerForm.identification&&typeof payerForm.identification==='object'?payerForm.identification:payerIdentification(client);if(!email||!email.includes('@'))throw Object.assign(new Error('Informe um e-mail válido no pagamento com cartão.'),{statusCode:400});const payer={email};if(identification?.type&&identification?.number)payer.identification={type:text(identification.type),number:digits(identification.number)};return {token,methodId,installments,payer,amountText:amount.toFixed(2)}}
async function paymentCard(req,data){const {client,state}=await sessionContext(req,data),invoice=rawInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state);if(!(cfg.enabled&&cfg.publicKey))throw Object.assign(new Error('Mercado Pago não está habilitado para cartão.'),{statusCode:409});if(!invoiceOpen(invoice))throw Object.assign(new Error('Esta fatura já está paga ou não está disponível.'),{statusCode:409});await releaseReservation(req,client.id,invoice.id,'released_card');const amount=invoiceAmount(invoice),card=cardPaymentData(data,client,amount),body={type:'online',processing_mode:'automatic',total_amount:card.amountText,external_reference:`PP-INV-${String(invoice.id)}`,payer:card.payer,transactions:{payments:[{amount:card.amountText,payment_method:{id:card.methodId,type:'credit_card',token:card.token,installments:card.installments}}]}},key=idempotencyKey(['provedor-plus','card',invoice.id,card.amountText,card.token]),order=await mpRequest(cfg.accessToken,'/v1/orders',{method:'POST',body,idempotencyKey:key}),result=paymentResponse(order,amount);await attachOrder(req,client.id,invoice.id,order,result);if(result.status==='approved'){await markInvoicePaid(req,client.id,invoice.id,{method:'card',order,amount});result.message='Pagamento aprovado e fatura baixada no Provedor Plus.'}else if(result.status==='rejected')result.message='Pagamento não aprovado pelo Mercado Pago.';return result}
async function paymentStatus(req,data){const {client,state}=await sessionContext(req,data),invoice=rawInvoice(state,client.id,data?.invoiceId),cfg=await mercadoPagoContext(req,state),orderId=text(data?.paymentId||data?.orderId||invoice?.mercado_pago_order_id);if(!orderId){return {status:text(invoice.status).toLowerCase()==='pago'?'approved':'pending',state:text(invoice.status),portal:portalData(client,state),provider:text(invoice.bank_provider||invoice.payment_provider)}}if(!cfg.enabled)throw Object.assign(new Error('Mercado Pago não está habilitado.'),{statusCode:409});const order=await mpRequest(cfg.accessToken,`/v1/orders/${encodeURIComponent(orderId)}`),amount=number(invoice?.payment_amount_cents)!==null?Number(invoice.payment_amount_cents)/100:(number(invoice?.cashback_pix_amount_cents)!==null?Number(invoice.cashback_pix_amount_cents)/100:invoiceAmount(invoice)),result=paymentResponse(order,amount);if(result.status==='approved'&&invoiceOpen(invoice)){const payment=mpTransaction(order),type=text(payment?.payment_method?.type).toLowerCase(),method=type==='bank_transfer'?'pix':'card';await markInvoicePaid(req,client.id,invoice.id,{method,order,amount});const latest=await stateGet(req);result.state='Pago';result.message='Pagamento confirmado. Fatura baixada no Provedor Plus.';result.portal=portalData(client,latest)}else if(result.status==='rejected'){await releaseReservation(req,client.id,invoice.id,'released_rejected');const latest=await stateGet(req);result.portal=portalData(client,latest)}else result.portal=portalData(client,state);return result}

function queryValue(req,key){
  const direct=req?.query?.[key];if(Array.isArray(direct))return text(direct[0]);if(direct!==undefined&&direct!==null)return text(direct);
  try{return text(new URL(req?.url||'','https://provedor-plus.local').searchParams.get(key))}catch{return''}
}
function webhookDataId(req){
  const direct=queryValue(req,'data.id')||text(req?.body?.data?.id||req?.body?.id);
  return direct.toLowerCase();
}
function isMercadoPagoWebhook(req){return queryValue(req,'mp_webhook')==='1'}
function parseSignature(value){
  const out={};for(const part of text(value).split(',')){const index=part.indexOf('=');if(index>0)out[text(part.slice(0,index))]=text(part.slice(index+1))}return out;
}
function validateMercadoPagoWebhook(req,secret){
  const signature=parseSignature(req?.headers?.['x-signature']),ts=text(signature.ts),received=text(signature.v1).toLowerCase(),id=webhookDataId(req),requestId=text(req?.headers?.['x-request-id']);
  if(!ts||!received||!id)return false;
  let manifest=`id:${id};`;if(requestId)manifest+=`request-id:${requestId};`;manifest+=`ts:${ts};`;
  const expected=crypto.createHmac('sha256',text(secret)).update(manifest).digest('hex'),a=Buffer.from(received),b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function findInvoiceForOrder(state,order,orderId){
  const invoices=Array.isArray(state?.invoices)?state.invoices:[],external=text(order?.external_reference),match=external.match(/^PP-INV-(.+)$/i),invoiceId=match?.[1]||'';
  return invoices.find(invoice=>String(invoice?.mercado_pago_order_id||'')===String(orderId))||invoices.find(invoice=>invoiceId&&String(invoice?.id)===String(invoiceId))||null;
}
async function handleMercadoPagoWebhook(req,res){
  const secret=await bankSecrets.get(req,'mercadoPago'),accessToken=text(secret?.accessToken),webhookSecret=text(secret?.webhookSecret);
  if(!accessToken||!webhookSecret)return res.status(503).json({ok:false,error:'Webhook Mercado Pago ainda não configurado no Provedor Plus.'});
  if(!validateMercadoPagoWebhook(req,webhookSecret))return res.status(401).json({ok:false,error:'Assinatura do Webhook Mercado Pago inválida.'});
  const orderId=webhookDataId(req);let order;
  try{order=await mpRequest(accessToken,`/v1/orders/${encodeURIComponent(orderId)}`)}catch(error){
    if(Number(error?.providerStatus)===404)return res.status(200).json({ok:true,data:{received:true,reconciled:false,simulation:true}});
    throw error;
  }
  const state=await stateGet(req),invoice=findInvoiceForOrder(state,order,orderId);
  if(!invoice)return res.status(200).json({ok:true,data:{received:true,reconciled:false}});
  const result=paymentResponse(order,number(mpTransaction(order)?.amount)??number(order?.total_amount)??invoiceAmount(invoice));
  await attachOrder(req,invoice.client_id,invoice.id,order,result);
  if(result.status==='approved'&&invoiceOpen(invoice)){
    const type=text(mpTransaction(order)?.payment_method?.type).toLowerCase(),method=type==='bank_transfer'?'pix':'card';
    await markInvoicePaid(req,invoice.client_id,invoice.id,{method,order,amount:result.amount});
  }else if(result.status==='rejected')await releaseReservation(req,invoice.client_id,invoice.id,'released_rejected');
  return res.status(200).json({ok:true,data:{received:true,reconciled:true,status:result.status}});
}

module.exports=async function handler(req,res){
  cors(req,res);res.setHeader('Cache-Control','no-store, max-age=0');if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  const origin=text(req.headers.origin);if(origin&&!ALLOWED_ORIGINS.has(origin))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
  try{
    if(isMercadoPagoWebhook(req))return await handleMercadoPagoWebhook(req,res);
    const action=text(req.body?.action),data=req.body?.data||{};let result;
    if(action==='login')result=await login(req,data);else if(action==='refresh')result=await refresh(req,data);else if(action==='connection-test')result=await connectionTest(req,data);else if(action==='negotiation-options')result=await negotiationOptions(req,data);else if(action==='negotiate')result=await negotiate(req,data);else if(action==='payment-config')result=await paymentConfig(req,data);else if(action==='payment-prepare')result=await paymentPrepare(req,data);else if(action==='payment-pix')result=await paymentPix(req,data);else if(action==='payment-card')result=await paymentCard(req,data);else if(action==='payment-status')result=await paymentStatus(req,data);else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return res.status(200).json({ok:true,data:result});
  }catch(error){const status=Number(error?.statusCode)||500;return res.status(status).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
