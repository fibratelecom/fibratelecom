const fs=require('fs');
const zlib=require('zlib');

const files=['01','02','03'].map(n=>`packed/proxygz-${n}.txt`);
const chunks=files.map(f=>fs.readFileSync(f,'utf8').trim()).join('');
let source=zlib.gunzipSync(Buffer.from(chunks,'base64')).toString('utf8');
let lines=source.split('\n');

if(!lines.some(line=>line.includes('async function issueMp('))){
  const testIndex=lines.findIndex(line=>line.startsWith('async function testMp('));
  if(testIndex<0)throw new Error('testMp não encontrado.');
  const mpHelpers=[
    "function mpAccessToken(m){const token=String(m?.accessToken||'').trim();if(!token)throw new Error('Mercado Pago: informe o Access Token.');return token;}",
    "function mpEnvironment(m){const value=String(m?.environment||'production').trim().toLowerCase();return ['test','teste','sandbox','homologation','homologacao'].includes(value)?'test':'production';}",
    "async function testMp(m){const token=mpAccessToken(m);const r=await jsonRequest('https://api.mercadolibre.com/users/me',{headers:{Authorization:`Bearer ${token}`},timeout:15000});if(r.status===401||r.status===403)throw new Error('Mercado Pago: Access Token não autorizado. Verifique se o token foi copiado completo, se pertence à aplicação correta e, em Produção, se as credenciais de produção foram ativadas.');if(r.status<200||r.status>=300||!r.data?.id)throw new Error(errMsg('Mercado Pago',r.status,r.data));return {connected:true,accountId:String(r.data.id),nickname:String(r.data.nickname||''),countryId:String(r.data.country_id||''),environment:mpEnvironment(m),message:`Conectado à conta Mercado Pago${r.data.nickname?` (${r.data.nickname})`:''}.`,checkedAt:new Date().toISOString()};}"
  ];
  lines.splice(testIndex,1,...mpHelpers);

  const syncIndex=lines.findIndex(line=>line.startsWith('async function syncInvoice('));
  if(syncIndex<0)throw new Error('syncInvoice não encontrado.');
  const issueMp="async function issueMp(invoice,client,m){const token=mpAccessToken(m),env=mpEnvironment(m),c=customer(client,'Mercado Pago'),ext=external(invoice),amountCents=Math.floor(Number(invoice?.amount_cents)||0);if(amountCents<=0)throw new Error('Mercado Pago: o valor da cobrança precisa ser maior que zero.');const days=mpDays(invoice?.due_date);if(!Number.isFinite(days)||days<1||days>30)throw new Error('Mercado Pago: o vencimento do boleto precisa ficar entre 1 e 30 dias a partir da emissão.');const amount=(amountCents/100).toFixed(2),name=String(c.name||'').trim(),parts=name.split(/\\s+/).filter(Boolean),firstName=parts.shift()||name,lastName=parts.join(' ')||firstName,email=env==='test'?'test_user_br@testuser.com':c.email;const body={type:'online',external_reference:String(ext).slice(0,64),processing_mode:'automatic',total_amount:amount,description:String(invoice.description||invoice.billing_type||'Mensalidade Provedor Plus').slice(0,255),payer:{email,first_name:firstName,last_name:lastName,identification:{type:c.documentType,number:c.document},address:{street_name:c.street,street_number:String(c.addressNumber||'S/N'),zip_code:c.cep,neighborhood:c.neighborhood,state:c.state,city:c.city}},transactions:{payments:[{amount,payment_method:{id:'boleto',type:'ticket'},expiration_time:`P${days}D`}]}};const r=await jsonRequest('https://api.mercadopago.com/v1/orders',{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Idempotency-Key':crypto.randomUUID()},body,timeout:18000});if(r.status<200||r.status>=300||!r.data?.id)throw new Error(errMsg('Mercado Pago',r.status,r.data));const p=r.data?.transactions?.payments?.[0]||{},method=p.payment_method||{};return {bank_provider:'mercadoPago',bank_environment:env,bank_charge_id:String(p.id||r.data.id),bank_order_id:String(r.data.id),bank_payment_id:String(p.id||''),bank_external_reference:String(r.data.external_reference||ext),bank_status:String(r.data.status||p.status||'action_required'),bank_status_detail:String(r.data.status_detail||p.status_detail||'waiting_payment'),bank_barcode:String(method.barcode_content||''),bank_digitable_line:String(method.digitable_line||method.barcode_content||''),bank_ticket_url:String(method.ticket_url||''),bank_pdf_url:'',bank_pix_code:'',bank_last_sync_at:new Date().toISOString()};}";
  lines.splice(syncIndex,0,issueMp);

  lines=lines.map(line=>{
    if(line.startsWith('async function syncInvoice(')||line.startsWith('async function cancelInvoice(')){
      line=line.replace("if(invoice.bank_provider==='mercadoPago'){if(!m?.accessToken)throw new Error('Mercado Pago: Access Token não configurado.');","if(invoice.bank_provider==='mercadoPago'){const token=mpAccessToken(m);");
      line=line.replaceAll('Bearer ${m.accessToken}','Bearer ${token}');
    }
    return line;
  });
  source=lines.join('\n');
}

new Function('require','module','exports','__filename','__dirname',source);
const required=[
  "function mpAccessToken",
  "https://api.mercadolibre.com/users/me",
  "async function issueMp",
  "https://api.mercadopago.com/v1/orders",
  "payment_method:{id:'boleto',type:'ticket'}",
  "'X-Idempotency-Key':crypto.randomUUID()",
  "expiration_time:`P${days}D`"
];
for(const text of required)if(!source.includes(text))throw new Error(`Validação ausente: ${text}`);
if(source.includes('https://api.mercadopago.com/users/me'))throw new Error('Endpoint antigo de teste Mercado Pago ainda presente.');
if((source.match(/async function issueMp\(/g)||[]).length!==1)throw new Error('issueMp duplicado ou ausente.');

const compressed=zlib.gzipSync(Buffer.from(source,'utf8')).toString('base64');
if(compressed.length>10500)throw new Error(`Proxy compactado excedeu 3 partes: ${compressed.length}`);
for(let i=0;i<3;i++)fs.writeFileSync(files[i],compressed.slice(i*3500,(i+1)*3500)+'\n');
fs.writeFileSync('/tmp/bank-proxy-source.js',source);
console.log('Mercado Pago corrigido e validado.');
