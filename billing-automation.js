(()=>{
'use strict';

if(window.__ProvedorPlusBillingAutomationInstalled)return;
window.__ProvedorPlusBillingAutomationInstalled=true;

const api=window.provedor;
if(!api?.clients?.save||!api?.invoices?.save||!api?.plans?.list)return;

const DAY=86400000;
const todayKey=()=>localDateKey(new Date());
const monthKey=value=>localDateKey(value).slice(0,7);
const text=value=>String(value??'').trim();
const num=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
const normalize=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function localDateKey(value){
  const d=value instanceof Date?new Date(value.getTime()):new Date(`${String(value).slice(0,10)}T12:00:00`);
  if(Number.isNaN(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dateFromKey(value){
  const key=String(value||'').slice(0,10),m=key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12):null;
}
function daysInMonth(year,monthIndex){return new Date(year,monthIndex+1,0,12).getDate()}
function dueFor(year,monthIndex,dueDay){
  const day=Math.max(1,Math.min(daysInMonth(year,monthIndex),Math.floor(num(dueDay)||10)));
  return new Date(year,monthIndex,day,12);
}
function addMonthsDue(date,months,dueDay){return dueFor(date.getFullYear(),date.getMonth()+months,dueDay)}
function daysBetween(a,b){return Math.max(0,Math.round((b.getTime()-a.getTime())/DAY))}
function brl(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((num(cents)||0)/100)}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]))}

function toast(message,type='ok'){
  document.querySelector('.pp-billing-auto-toast')?.remove();
  const node=document.createElement('div');
  node.className=`pp-billing-auto-toast ${type==='error'?'is-error':''}`;
  node.textContent=message;
  document.body.appendChild(node);
  setTimeout(()=>node.remove(),5200);
}

async function getSettings(){try{return await api.settings.get()}catch{return{}}}
async function saveSettings(values){return api.settings.save(values)}
async function getBanks(){try{return await api.banks.get()}catch{return{}}}
async function clients(){const rows=await api.clients.list();return Array.isArray(rows)?rows:[]}
async function plans(){const rows=await api.plans.list();return Array.isArray(rows)?rows:[]}
async function invoices(){const rows=await api.invoices.list();return Array.isArray(rows)?rows:[]}
async function cashbackRequest(action,data={}){const response=await fetch('/api/cloud-data',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok)throw new Error(body?.error||`Falha no controle de cashback (HTTP ${response.status}).`);return body.data}
function cashbackHistoryHtml(history=[]){
  if(!history.length)return '<div class="pp-cashback-empty">Nenhuma movimentação registrada para este cliente.</div>';
  return `<div class="pp-cashback-table-wrap"><table class="pp-cashback-table"><thead><tr><th>Data</th><th>Movimento</th><th>Valor</th><th>Saldo</th><th>Motivo / responsável</th></tr></thead><tbody>${history.map(item=>{const credit=item?.type==='credit',date=new Date(item?.created_at),dateLabel=Number.isNaN(date.getTime())?'-':date.toLocaleString('pt-BR');return `<tr><td>${escapeHtml(dateLabel)}</td><td><span class="pp-cashback-kind ${credit?'is-credit':'is-debit'}">${credit?'Entrada':'Saída'}</span></td><td>${credit?'+':'−'} ${escapeHtml(brl(item?.amount_cents))}</td><td>${escapeHtml(brl(item?.balance_after_cents))}</td><td>${escapeHtml(item?.reason||'-')}<small>${escapeHtml(item?.created_by_name||'Sistema')}</small></td></tr>`}).join('')}</tbody></table></div>`;
}

function sameIdentity(a,b){
  if(Number(a?.id)&&Number(b?.id)&&Number(a.id)===Number(b.id))return true;
  const ca=text(a?.contract_number),cb=text(b?.contract_number);if(ca&&ca===cb)return true;
  const da=text(a?.document).replace(/\D/g,''),db=text(b?.document).replace(/\D/g,'');return Boolean(da&&da===db);
}
function activeClient(client){return !/bloqueado|cancelado|inativo|suspenso/i.test(text(client?.status))}
function planFor(client,planRows){return planRows.find(plan=>Number(plan?.id)===Number(client?.plan_id))||null}
function bankReady(item,key){
  if(!item?.enabled)return false;
  if(key==='efi')return Boolean(item.clientIdConfigured&&item.clientSecretConfigured);
  return Boolean(item.accessTokenConfigured);
}
async function bankFor(client){
  const banks=await getBanks(),preferred=text(client?.billing_bank_provider),ready=[];
  if(bankReady(banks?.efi,'efi'))ready.push('efi');
  if(bankReady(banks?.mercadoPago,'mercadoPago'))ready.push('mercadoPago');
  if(preferred&&ready.includes(preferred))return preferred;
  const def=text(banks?.defaultProvider);if(def&&ready.includes(def))return def;
  if(ready.length===1)return ready[0];
  if(!ready.length)throw new Error('Nenhum banco está pronto para emitir cobrança. Configure Efí Bank ou Mercado Pago em Integração.');
  throw new Error('Há dois bancos ativos. Defina o banco deste cliente ou o emissor padrão em Integração.');
}

function nextDueAfter(start,dueDay){
  let due=dueFor(start.getFullYear(),start.getMonth(),dueDay);
  if(due.getTime()<=start.getTime())due=addMonthsDue(due,1,dueDay);
  return due;
}
function previousDue(due,dueDay){return addMonthsDue(due,-1,dueDay)}
function firstProration(client,plan){
  const activation=dateFromKey(client?.installation_date)||dateFromKey(client?.created_at)||new Date();
  const due=nextDueAfter(activation,num(client?.due_day)||10),previous=previousDue(due,num(client?.due_day)||10);
  const cycleDays=Math.max(1,daysBetween(previous,due));
  const serviceDays=Math.max(1,Math.min(cycleDays,daysBetween(activation,due)));
  const base=Math.max(0,Math.round(num(plan?.price_cents)));
  const amount=Math.max(1,Math.min(base,Math.round(base*serviceDays/cycleDays)));
  return {activation,due,cycleDays,serviceDays,base,amount};
}
function invoiceExists(rows,clientId,dueDate){return rows.some(row=>Number(row?.client_id)===Number(clientId)&&String(row?.due_date||'').slice(0,10)===dueDate&&normalize(row?.status)!=='cancelado')}
function firstInvoiceExists(rows,clientId){return rows.some(row=>Number(row?.client_id)===Number(clientId)&&(row?.billing_origin==='first_prorated'||row?.prorated_first_invoice===true))}

async function issueFirstProrated(client,{silent=false}={}){
  const [planRows,invoiceRows]=await Promise.all([plans(),invoices()]),plan=planFor(client,planRows);
  if(!plan||num(plan.price_cents)<=0)throw new Error('Cadastre um plano com valor antes de gerar a primeira cobrança.');
  if(firstInvoiceExists(invoiceRows,client.id))return {skipped:true,reason:'already_exists'};
  const calc=firstProration(client,plan),dueDate=localDateKey(calc.due);
  if(invoiceExists(invoiceRows,client.id,dueDate))return {skipped:true,reason:'due_exists'};
  const provider=await bankFor(client);
  const saved=await api.invoices.save({
    client_id:Number(client.id),due_date:dueDate,amount_cents:calc.amount,
    document_type:'Boleto',billing_type:'Primeira mensalidade proporcional',
    description:`Primeira mensalidade proporcional · ${calc.serviceDays} dia${calc.serviceDays===1?'':'s'} de serviço`,
    bank_provider:provider,billing_origin:'first_prorated',prorated_first_invoice:true,
    service_days:calc.serviceDays,cycle_days:calc.cycleDays,base_amount_cents:calc.base,
    cashback_eligible:false,cashback_reason:'primeira_cobranca_proporcional',
    competency:monthKey(calc.due),reference:monthKey(calc.due)
  });
  if(!silent)toast(`Primeiro boleto gerado: ${calc.serviceDays} dias de serviço · ${brl(calc.amount)}.`);
  return {saved,calculation:calc};
}

function dueCandidate(client,reference=new Date(),daysBefore=7){
  const dueDay=num(client?.due_day)||10,installation=dateFromKey(client?.installation_date||client?.created_at);
  let current=dueFor(reference.getFullYear(),reference.getMonth(),dueDay);
  if(installation&&current.getTime()<=installation.getTime())current=nextDueAfter(installation,dueDay);
  const diff=daysBetween(reference,current);
  if(current.getTime()>=reference.getTime()&&diff<=daysBefore)return current;
  if(current.getTime()<reference.getTime())return current;
  return null;
}
function nextUnbilledDue(client,invoiceRows,reference=new Date()){
  const dueDay=num(client?.due_day)||10,dates=invoiceRows.filter(row=>Number(row?.client_id)===Number(client.id)&&normalize(row?.status)!=='cancelado').map(row=>dateFromKey(row?.due_date)).filter(Boolean).sort((a,b)=>b-a);
  if(dates.length)return addMonthsDue(dates[0],1,dueDay);
  const installation=dateFromKey(client?.installation_date||client?.created_at)||reference;
  return nextDueAfter(installation,dueDay);
}

async function issueMonthly(client,due,{origin='manual_now',invoiceRows=null,planRows=null,silent=false}={}){
  invoiceRows=invoiceRows||await invoices();planRows=planRows||await plans();
  const dueDate=localDateKey(due),plan=planFor(client,planRows);
  if(!plan||num(plan.price_cents)<=0)throw new Error(`${client.name||'Cliente'} está sem plano com valor.`);
  if(invoiceExists(invoiceRows,client.id,dueDate))return {skipped:true,reason:'already_exists',client,dueDate};
  const provider=await bankFor(client),amount=Math.max(1,Math.round(num(plan.price_cents)));
  const saved=await api.invoices.save({
    client_id:Number(client.id),due_date:dueDate,amount_cents:amount,document_type:'Boleto',billing_type:'Mensalidade',
    description:`Mensalidade ${monthKey(due)}`,bank_provider:provider,billing_origin:origin,
    auto_generated:origin==='monthly_auto',competency:monthKey(due),reference:monthKey(due),
    base_amount_cents:amount,cashback_eligible:true,cashback_reason:'mensalidade_normal'
  });
  if(!silent)toast(`Boleto de ${client.name||'cliente'} gerado para ${dueDate.split('-').reverse().join('/')} · ${brl(amount)}.`);
  return {saved,client,dueDate};
}

async function generateNow(clientId){
  const [clientRows,invoiceRows,planRows]=await Promise.all([clients(),invoices(),plans()]),client=clientRows.find(row=>Number(row.id)===Number(clientId));
  if(!client)throw new Error('Cliente não encontrado.');
  if(!activeClient(client))throw new Error('O cliente não está ativo para geração de mensalidade.');
  const due=nextUnbilledDue(client,invoiceRows,new Date());
  return issueMonthly(client,due,{origin:'manual_now',invoiceRows,planRows});
}

async function generateBatch(clientIds,targetMonth){
  const ids=new Set((clientIds||[]).map(Number).filter(Boolean));
  if(!ids.size)throw new Error('Selecione pelo menos um cliente.');
  if(!/^\d{4}-\d{2}$/.test(String(targetMonth||'')))throw new Error('Selecione a competência do lote.');
  const [year,month]=targetMonth.split('-').map(Number),[clientRows,planRows]=await Promise.all([clients(),plans()]);
  let invoiceRows=await invoices(),generated=0,skipped=0,failed=0,errors=[];
  for(const client of clientRows.filter(row=>ids.has(Number(row.id)))){
    if(!activeClient(client)){skipped++;continue}
    const due=dueFor(year,month-1,num(client.due_day)||10),installation=dateFromKey(client.installation_date||client.created_at);
    if(installation&&due.getTime()<=installation.getTime()){skipped++;continue}
    try{
      const result=await issueMonthly(client,due,{origin:'manual_batch',invoiceRows,planRows,silent:true});
      if(result.skipped)skipped++;else{generated++;invoiceRows=[...invoiceRows,result.saved]}
    }catch(error){failed++;errors.push(`${client.name||client.id}: ${error.message||error}`)}
  }
  toast(`Lote concluído: ${generated} gerado(s), ${skipped} já existente(s)/ignorado(s)${failed?`, ${failed} erro(s)`:''}.`,failed?'error':'ok');
  return {generated,skipped,failed,errors};
}

let autoRunning=false;
async function runAutomatic({force=false,notify=false}={}){
  if(autoRunning)return {running:true};
  autoRunning=true;
  try{
    const settings=await getSettings(),enabled=settings.billing_auto_enabled!==false&&String(settings.billing_auto_enabled)!=='false';
    if(!enabled&&!force)return {enabled:false};
    const today=todayKey();
    if(!force&&String(settings.billing_auto_last_run||'')===today)return {alreadyRan:true,date:today};
    const daysBefore=Math.max(0,Math.min(30,Math.floor(num(settings.billing_auto_days_before)||7)));
    const [clientRows,planRows]=await Promise.all([clients(),plans()]);let invoiceRows=await invoices(),generated=0,skipped=0,failed=0,errors=[];
    for(const client of clientRows.filter(activeClient)){
      const firstMissing=!firstInvoiceExists(invoiceRows,client.id)&&dateFromKey(client.installation_date||client.created_at);
      if(firstMissing){
        try{
          const result=await issueFirstProrated(client,{silent:true});
          if(result?.saved){generated++;invoiceRows=[...invoiceRows,result.saved]}else skipped++;
        }catch(error){failed++;errors.push(`${client.name||client.id}: ${error.message||error}`)}
        continue;
      }
      const due=dueCandidate(client,new Date(),daysBefore);if(!due){skipped++;continue}
      try{
        const result=await issueMonthly(client,due,{origin:'monthly_auto',invoiceRows,planRows,silent:true});
        if(result.skipped)skipped++;else{generated++;invoiceRows=[...invoiceRows,result.saved]}
      }catch(error){failed++;errors.push(`${client.name||client.id}: ${error.message||error}`)}
    }
    await saveSettings({billing_auto_enabled:true,billing_auto_days_before:daysBefore,billing_auto_last_run:today,billing_auto_last_result:{generated,skipped,failed,at:new Date().toISOString()}});
    if(notify||generated||failed)toast(`Mensalidades automáticas: ${generated} gerada(s)${failed?`, ${failed} erro(s)`:''}.`,failed?'error':'ok');
    return {generated,skipped,failed,errors,date:today};
  }finally{autoRunning=false}
}

const originalClientSave=api.clients.save.bind(api.clients);
api.clients.save=async data=>{
  const before=await clients().catch(()=>[]),existing=before.find(row=>sameIdentity(row,data));
  const isNew=!data?.id&&!existing;
  const payload=isNew&&!text(data?.installation_date)?{...data,installation_date:todayKey()}:data;
  const saved=await originalClientSave(payload);
  if(isNew&&activeClient(saved)){
    setTimeout(()=>issueFirstProrated(saved).catch(error=>toast(`Cliente cadastrado, mas o primeiro boleto não foi emitido: ${error.message||error}`,'error')),0);
  }
  return saved;
};

function injectStyle(){
  if(document.getElementById('pp-billing-auto-style'))return;
  const style=document.createElement('style');style.id='pp-billing-auto-style';style.textContent=`
.content{position:relative}
.pp-billing-auto-fab{cursor:pointer}
.pp-billing-auto-layer{position:absolute;inset:0;z-index:18;background:#f6f8f7;overflow:auto;color:#304b45;font-family:Segoe UI,Arial,sans-serif}
.pp-billing-auto-page{padding:26px 28px 48px;max-width:1500px;margin:0 auto}
.pp-billing-auto-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}
.pp-billing-auto-head-text>span{display:block;font-size:10px;letter-spacing:1.2px;font-weight:800;color:#0d8b78}.pp-billing-auto-head h2{margin:4px 0 5px;font-size:25px;color:#24332f}.pp-billing-auto-head p{margin:0;color:#7a8985;font-size:12px}
.pp-billing-auto-close{height:36px;border-radius:8px;border:1px solid #dbe5e2;background:#fff;color:#52645f;font-size:11px;font-weight:750;padding:0 13px;cursor:pointer}
.pp-billing-auto-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pp-billing-auto-card{padding:17px 18px;border:1px solid #dfe8e5;border-radius:12px;background:#fff}.pp-billing-auto-card:first-child,.pp-billing-negotiation-card,.pp-cashback-card{grid-column:1/-1}.pp-billing-auto-card h3{margin:0 0 10px;font-size:15px;color:#2e433d}
.pp-billing-auto-row{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.pp-billing-auto-row label{display:grid;gap:5px;font-size:11px;font-weight:700}.pp-billing-auto-row input,.pp-billing-auto-row select{height:36px;box-sizing:border-box;border:1px solid #cbded9;border-radius:8px;padding:0 9px;background:#fff;color:#304b45}.pp-billing-auto-row button,.pp-billing-auto-actions button{height:36px;border:0;border-radius:8px;padding:0 12px;background:#0d8b78;color:#fff;font-weight:750;cursor:pointer}.pp-billing-auto-row button.secondary{background:#edf4f2;color:#35534c}
.pp-negotiation-grid{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px;align-items:end}.pp-negotiation-grid label{display:grid;gap:5px;font-size:11px;font-weight:700}.pp-negotiation-grid input,.pp-negotiation-grid select{width:100%;height:36px;box-sizing:border-box;border:1px solid #cbded9;border-radius:8px;padding:0 9px;background:#fff;color:#304b45}.pp-negotiation-grid .pp-negotiation-save{height:36px;border:0;border-radius:8px;padding:0 14px;background:#0d8b78;color:#fff;font-weight:750;cursor:pointer}.pp-negotiation-highlight{margin:0 0 12px;padding:10px 12px;border-radius:9px;background:#eef8f5;color:#2d6056;font-size:11px;line-height:1.45}.pp-negotiation-highlight strong{color:#087c6b}
.pp-cashback-settings{padding-bottom:14px;border-bottom:1px solid #e4ecea}.pp-cashback-wallet{padding-top:14px}.pp-cashback-balance{min-width:140px;padding:9px 12px;border-radius:9px;background:#eef8f5;color:#087c6b;font-size:17px;font-weight:800}.pp-cashback-balance small{display:block;margin-bottom:2px;color:#66827b;font-size:9px;text-transform:uppercase;letter-spacing:.7px}.pp-cashback-history{margin-top:12px}.pp-cashback-empty{padding:12px;border-radius:8px;background:#f5f8f7;color:#71817d;font-size:11px}.pp-cashback-table-wrap{max-height:260px;overflow:auto;border:1px solid #e3ebe9;border-radius:9px}.pp-cashback-table{width:100%;border-collapse:collapse;font-size:10px}.pp-cashback-table th,.pp-cashback-table td{padding:8px 9px;border-bottom:1px solid #edf2f1;text-align:left;vertical-align:top}.pp-cashback-table th{position:sticky;top:0;background:#f5f8f7;color:#63756f}.pp-cashback-table td small{display:block;margin-top:2px;color:#83908d}.pp-cashback-kind{display:inline-block;padding:3px 6px;border-radius:99px;font-weight:800}.pp-cashback-kind.is-credit{background:#e7f7f1;color:#087c6b}.pp-cashback-kind.is-debit{background:#fff0ed;color:#a34035}
.pp-billing-auto-note{margin:8px 0 0;color:#6b7f79;font-size:10px;line-height:1.45}.pp-billing-auto-clients{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:360px;overflow:auto;margin-top:10px}.pp-billing-auto-client{display:flex;align-items:center;gap:7px;padding:7px 8px;border:1px solid #e2ebe8;border-radius:8px;font-size:11px}.pp-billing-auto-client input{accent-color:#0d8b78}.pp-billing-auto-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.pp-billing-auto-toast{position:fixed;left:50%;bottom:18px;z-index:12000;max-width:min(620px,90vw);transform:translateX(-50%);padding:11px 15px;border-radius:10px;background:#174f44;color:#fff;font:700 11px/1.4 Segoe UI,Arial;box-shadow:0 12px 35px rgba(0,0,0,.2)}.pp-billing-auto-toast.is-error{background:#9b2c2c}
@media(max-width:1050px){.pp-negotiation-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:900px){.pp-billing-auto-layer{position:fixed;inset:60px 0 0}.pp-billing-auto-page{padding:18px 13px 36px}.pp-billing-auto-head{flex-direction:column}.pp-billing-auto-body{grid-template-columns:1fr}.pp-billing-auto-card:first-child,.pp-billing-negotiation-card,.pp-cashback-card{grid-column:auto}}
@media(max-width:650px){.pp-billing-auto-clients,.pp-negotiation-grid{grid-template-columns:1fr}}
`;document.head.appendChild(style);
}

let navButton=null;
function closeManager({goDashboard=false}={}){
  document.querySelector('.pp-billing-auto-layer')?.remove();
  navButton?.classList.remove('active');
  if(goDashboard){
    const dashboard=[...document.querySelectorAll('.sidebar nav button,aside nav button,nav button')].find(button=>{const value=normalize(button.textContent);return value.includes('dashboard')||value.includes('visao geral')});
    dashboard?.click();
  }
}
function activateManagerNav(){
  document.querySelectorAll('.sidebar nav button.active,aside nav button.active,nav button.active').forEach(button=>button.classList.remove('active'));
  navButton?.classList.add('active');
}

async function openManager(){
  injectStyle();
  closeManager();
  activateManagerNav();
  const content=document.querySelector('.content')||document.body,layer=document.createElement('div');
  layer.className='pp-billing-auto-layer';
  layer.innerHTML='<div class="pp-billing-auto-page"><header class="pp-billing-auto-head"><div class="pp-billing-auto-head-text"><span>FINANCEIRO E COBRANÇAS</span><h2>Mensalidades</h2><p>Gerencie mensalidades, negociação e cashback dos clientes.</p></div><button class="pp-billing-auto-close" type="button">Voltar</button></header><section class="pp-billing-auto-card"><h3>Carregando mensalidades...</h3></section></div>';
  content.appendChild(layer);
  layer.querySelector('.pp-billing-auto-close').onclick=()=>closeManager({goDashboard:true});
  try{
    const [settings,clientRows]=await Promise.all([getSettings(),clients()]),days=Math.max(0,Math.min(30,Math.floor(num(settings.billing_auto_days_before)||7))),enabled=settings.billing_auto_enabled!==false&&String(settings.billing_auto_enabled)!=='false';
    const negotiation={enabled:settings.negotiation_auto_enabled!==false&&String(settings.negotiation_auto_enabled)!=='false',minDays:Math.max(0,Math.min(365,Math.floor(Number(settings.negotiation_min_overdue_days??1)||0))),cashDiscount:Math.max(0,Math.min(100,Number(settings.negotiation_cash_discount_percent??10)||0)),installmentDiscount:Math.max(0,Math.min(100,Number(settings.negotiation_installment_discount_percent??0)||0)),maxInstallments:Math.max(1,Math.min(12,Math.floor(Number(settings.negotiation_max_installments??6)||1))),entryPercent:Math.max(0,Math.min(100,Number(settings.negotiation_entry_percent??20)||0)),firstDueDays:Math.max(0,Math.min(30,Math.floor(Number(settings.negotiation_first_due_days??5)||0)))};
    const cashback={enabled:settings.cashback_enabled===true||String(settings.cashback_enabled)==='true',mode:String(settings.cashback_mode)==='fixed'?'fixed':'percent',rate:Math.max(0,Math.min(100,Number(settings.cashback_rate)||0)),fixedCents:Math.max(0,Math.round(Number(settings.cashback_fixed_cents)||0))};
    if(!layer.isConnected)return;
    const active=clientRows.filter(activeClient),page=layer.querySelector('.pp-billing-auto-page');
    page.innerHTML=`<header class="pp-billing-auto-head"><div class="pp-billing-auto-head-text"><span>FINANCEIRO E COBRANÇAS</span><h2>Mensalidades</h2><p>Gerencie mensalidades, negociação e cashback dos clientes.</p></div><button class="pp-billing-auto-close" type="button">Voltar</button></header><div class="pp-billing-auto-body">
    <section class="pp-billing-auto-card"><h3>Automática mensal</h3><div class="pp-billing-auto-row"><label><span>Ativa</span><select class="pp-auto-enabled"><option value="true">Sim</option><option value="false">Não</option></select></label><label><span>Gerar quantos dias antes</span><input class="pp-auto-days" type="number" min="0" max="30" value="${days}"></label><button class="pp-auto-save" type="button">Salvar</button><button class="pp-auto-run secondary" type="button">Verificar agora</button></div><p class="pp-billing-auto-note">Evita duplicidade por cliente + vencimento. A primeira cobrança proporcional é gerada no cadastro e não participa do cashback.</p></section>
    <section class="pp-billing-auto-card pp-billing-negotiation-card"><h3>Negociação automática na Área do Cliente</h3><p class="pp-negotiation-highlight"><strong>Sem aprovação manual:</strong> o cliente poderá selecionar faturas vencidas, escolher uma das condições abaixo e fechar o acordo sozinho. O sistema cancela as cobranças antigas e emite os novos boletos automaticamente.</p><div class="pp-negotiation-grid"><label><span>Negociação automática</span><select class="pp-neg-enabled"><option value="true">Ativa</option><option value="false">Desativada</option></select></label><label><span>Atraso mínimo (dias)</span><input class="pp-neg-min-days" type="number" min="0" max="365" value="${negotiation.minDays}"></label><label><span>Desconto à vista (%)</span><input class="pp-neg-cash" type="number" min="0" max="100" step="0.1" value="${negotiation.cashDiscount}"></label><label><span>Desconto parcelado (%)</span><input class="pp-neg-installment-discount" type="number" min="0" max="100" step="0.1" value="${negotiation.installmentDiscount}"></label><label><span>Máximo de parcelas</span><input class="pp-neg-max" type="number" min="1" max="12" value="${negotiation.maxInstallments}"></label><label><span>Entrada mínima (%)</span><input class="pp-neg-entry" type="number" min="0" max="100" step="0.1" value="${negotiation.entryPercent}"></label><label><span>1º vencimento em (dias)</span><input class="pp-neg-first-due" type="number" min="0" max="30" value="${negotiation.firstDueDays}"></label><button class="pp-negotiation-save" type="button">Salvar regras</button></div><p class="pp-billing-auto-note">As regras são aplicadas automaticamente no portal. Faturas pagas, canceladas ou já renegociadas não entram em um novo acordo. Cobranças de renegociação não geram novo cashback.</p></section>
    <section class="pp-billing-auto-card pp-cashback-card"><h3>Controle de cashback</h3><div class="pp-cashback-settings"><div class="pp-billing-auto-row"><label><span>Cashback por Pix</span><select class="pp-cashback-enabled"><option value="true">Ativo</option><option value="false">Desativado</option></select></label><label><span>Como calcular</span><select class="pp-cashback-mode"><option value="percent">Percentual da fatura</option><option value="fixed">Valor fixo por Pix</option></select></label><label><span class="pp-cashback-value-label">Percentual (%)</span><input class="pp-cashback-value" type="number" min="0" step="0.01"></label><button class="pp-cashback-save" type="button">Salvar regra</button></div><p class="pp-billing-auto-note">O crédito acontece uma única vez quando o Pix é confirmado como pago. Primeira cobrança proporcional e cobranças de renegociação continuam fora do cashback.</p></div><div class="pp-cashback-wallet"><div class="pp-billing-auto-row"><label style="flex:1;min-width:230px"><span>Carteira do cliente</span><select class="pp-cashback-client"><option value="">Selecione</option>${clientRows.map(c=>`<option value="${Number(c.id)}">${escapeHtml(c.name||`Cliente ${c.id}`)} · ${escapeHtml(c.contract_number||'sem contrato')}</option>`).join('')}</select></label><div class="pp-cashback-balance"><small>Saldo disponível</small><span>R$ 0,00</span></div><label><span>Movimento</span><select class="pp-cashback-operation"><option value="add">Adicionar</option><option value="remove">Remover</option></select></label><label><span>Valor (R$)</span><input class="pp-cashback-amount" type="number" min="0.01" step="0.01" placeholder="0,00"></label><label style="flex:1;min-width:220px"><span>Motivo</span><input class="pp-cashback-reason" type="text" maxlength="160" placeholder="Ex.: bônus comercial"></label><button class="pp-cashback-adjust" type="button">Aplicar</button></div><div class="pp-cashback-history"><div class="pp-cashback-empty">Selecione um cliente para consultar a carteira e o histórico.</div></div></div></section>
    <section class="pp-billing-auto-card"><h3>Gerar agora</h3><div class="pp-billing-auto-row"><label style="flex:1;min-width:230px"><span>Cliente</span><select class="pp-now-client"><option value="">Selecione</option>${active.map(c=>`<option value="${Number(c.id)}">${escapeHtml(c.name||`Cliente ${c.id}`)} · ${escapeHtml(c.contract_number||'sem contrato')}</option>`).join('')}</select></label><button class="pp-now-generate" type="button">Gerar agora</button></div></section>
    <section class="pp-billing-auto-card"><h3>Gerar em lote</h3><div class="pp-billing-auto-row"><label><span>Competência</span><input class="pp-batch-month" type="month" value="${monthKey(new Date())}"></label><button class="pp-batch-all secondary" type="button">Selecionar todos</button></div><div class="pp-billing-auto-clients">${active.map(c=>`<label class="pp-billing-auto-client"><input type="checkbox" value="${Number(c.id)}"><span>${escapeHtml(c.name||`Cliente ${c.id}`)}</span></label>`).join('')||'<span>Nenhum cliente ativo.</span>'}</div><div class="pp-billing-auto-actions"><button class="pp-batch-generate" type="button">Gerar selecionados</button></div></section>
    </div>`;
    layer.querySelector('.pp-auto-enabled').value=enabled?'true':'false';layer.querySelector('.pp-neg-enabled').value=negotiation.enabled?'true':'false';layer.querySelector('.pp-cashback-enabled').value=cashback.enabled?'true':'false';layer.querySelector('.pp-cashback-mode').value=cashback.mode;
    layer.querySelector('.pp-billing-auto-close').onclick=()=>closeManager({goDashboard:true});
    layer.querySelector('.pp-auto-save').onclick=async()=>{try{const nextEnabled=layer.querySelector('.pp-auto-enabled').value==='true',nextDays=Math.max(0,Math.min(30,Math.floor(num(layer.querySelector('.pp-auto-days').value)||7)));await saveSettings({billing_auto_enabled:nextEnabled,billing_auto_days_before:nextDays});toast('Configuração da geração automática salva.')}catch(error){toast(error.message||String(error),'error')}};
    layer.querySelector('.pp-negotiation-save').onclick=async()=>{try{const values={negotiation_auto_enabled:layer.querySelector('.pp-neg-enabled').value==='true',negotiation_min_overdue_days:Math.max(0,Math.min(365,Math.floor(Number(layer.querySelector('.pp-neg-min-days').value)||0))),negotiation_cash_discount_percent:Math.max(0,Math.min(100,Number(layer.querySelector('.pp-neg-cash').value)||0)),negotiation_installment_discount_percent:Math.max(0,Math.min(100,Number(layer.querySelector('.pp-neg-installment-discount').value)||0)),negotiation_max_installments:Math.max(1,Math.min(12,Math.floor(Number(layer.querySelector('.pp-neg-max').value)||1))),negotiation_entry_percent:Math.max(0,Math.min(100,Number(layer.querySelector('.pp-neg-entry').value)||0)),negotiation_first_due_days:Math.max(0,Math.min(30,Math.floor(Number(layer.querySelector('.pp-neg-first-due').value)||0)))};await saveSettings(values);toast('Regras da negociação automática salvas.')}catch(error){toast(error.message||String(error),'error')}};
    const cashbackMode=layer.querySelector('.pp-cashback-mode'),cashbackValue=layer.querySelector('.pp-cashback-value'),cashbackValueLabel=layer.querySelector('.pp-cashback-value-label'),cashbackHistory=layer.querySelector('.pp-cashback-history'),cashbackBalance=layer.querySelector('.pp-cashback-balance span'),cashbackClient=layer.querySelector('.pp-cashback-client');
    const applyCashbackMode=()=>{const fixed=cashbackMode.value==='fixed';cashbackValueLabel.textContent=fixed?'Valor por Pix (R$)':'Percentual da fatura (%)';cashbackValue.max=fixed?'':'100';cashbackValue.value=fixed?(cashback.fixedCents/100).toFixed(2):String(cashback.rate)};applyCashbackMode();cashbackMode.onchange=applyCashbackMode;
    const loadCashbackWallet=async()=>{const clientId=Number(cashbackClient.value);if(!clientId){cashbackBalance.textContent='R$ 0,00';cashbackHistory.innerHTML='<div class="pp-cashback-empty">Selecione um cliente para consultar a carteira e o histórico.</div>';return null}cashbackHistory.innerHTML='<div class="pp-cashback-empty">Carregando carteira...</div>';const wallet=await cashbackRequest('cashback.wallet.get',{clientId});cashbackBalance.textContent=brl(wallet.balance_cents);cashbackHistory.innerHTML=cashbackHistoryHtml(wallet.history);return wallet};cashbackClient.onchange=()=>loadCashbackWallet().catch(error=>{cashbackHistory.innerHTML=`<div class="pp-cashback-empty">${escapeHtml(error.message||String(error))}</div>`});
    layer.querySelector('.pp-cashback-save').onclick=async()=>{try{const mode=cashbackMode.value,value=Math.max(0,Number(cashbackValue.value)||0),values={cashback_enabled:layer.querySelector('.pp-cashback-enabled').value==='true',cashback_mode:mode,cashback_rate:mode==='percent'?Math.min(100,value):cashback.rate,cashback_fixed_cents:mode==='fixed'?Math.round(value*100):cashback.fixedCents};if(values.cashback_enabled&&((mode==='percent'&&values.cashback_rate<=0)||(mode==='fixed'&&values.cashback_fixed_cents<=0)))throw new Error('Informe um valor de cashback maior que zero antes de ativar.');await saveSettings(values);cashback.enabled=values.cashback_enabled;cashback.mode=mode;cashback.rate=values.cashback_rate;cashback.fixedCents=values.cashback_fixed_cents;toast('Regra de cashback por Pix salva.')}catch(error){toast(error.message||String(error),'error')}};
    layer.querySelector('.pp-cashback-adjust').onclick=async()=>{const clientId=Number(cashbackClient.value),operation=layer.querySelector('.pp-cashback-operation').value,amount=Math.round((Number(layer.querySelector('.pp-cashback-amount').value)||0)*100),reason=text(layer.querySelector('.pp-cashback-reason').value);if(!clientId)return toast('Selecione um cliente.','error');if(amount<=0)return toast('Informe um valor maior que zero.','error');if(reason.length<3)return toast('Informe o motivo da movimentação.','error');try{const wallet=await cashbackRequest('cashback.wallet.adjust',{clientId,operation,amount_cents:amount,reason});cashbackBalance.textContent=brl(wallet.balance_cents);cashbackHistory.innerHTML=cashbackHistoryHtml(wallet.history);layer.querySelector('.pp-cashback-amount').value='';layer.querySelector('.pp-cashback-reason').value='';toast(operation==='add'?'Cashback adicionado à carteira.':'Cashback removido da carteira.')}catch(error){toast(error.message||String(error),'error')}};
    layer.querySelector('.pp-auto-run').onclick=async()=>{try{await runAutomatic({force:true,notify:true})}catch(error){toast(error.message||String(error),'error')}};
    layer.querySelector('.pp-now-generate').onclick=async()=>{const id=Number(layer.querySelector('.pp-now-client').value);if(!id)return toast('Selecione um cliente.','error');try{await generateNow(id)}catch(error){toast(error.message||String(error),'error')}};
    layer.querySelector('.pp-batch-all').onclick=()=>{const boxes=[...layer.querySelectorAll('.pp-billing-auto-client input')],all=boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all)};
    layer.querySelector('.pp-batch-generate').onclick=async()=>{const ids=[...layer.querySelectorAll('.pp-billing-auto-client input:checked')].map(x=>Number(x.value)),month=layer.querySelector('.pp-batch-month').value;try{await generateBatch(ids,month)}catch(error){toast(error.message||String(error),'error')}};
  }catch(error){
    if(layer.isConnected){const page=layer.querySelector('.pp-billing-auto-page');page.innerHTML=`<header class="pp-billing-auto-head"><div class="pp-billing-auto-head-text"><span>FINANCEIRO E COBRANÇAS</span><h2>Mensalidades</h2><p>Não foi possível carregar esta área.</p></div><button class="pp-billing-auto-close" type="button">Voltar</button></header><section class="pp-billing-auto-card"><h3>${escapeHtml(error.message||String(error))}</h3></section>`;layer.querySelector('.pp-billing-auto-close').onclick=()=>closeManager({goDashboard:true})}
  }
}
function menuButtonTemplate(){
  const buttons=[...document.querySelectorAll('.sidebar nav button,aside nav button,nav button')];
  return buttons.find(button=>normalize(button.textContent)==='financeiro')||buttons.find(button=>normalize(button.textContent).includes('financeiro'))||null;
}
function replaceMenuLabel(button){
  const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node,changed=false;
  while((node=walker.nextNode())){
    const value=String(node.nodeValue||'');
    if(/financeiro/i.test(value)){node.nodeValue=value.replace(/financeiro/gi,'Mensalidades');changed=true}
  }
  if(!changed){
    const label=[...button.querySelectorAll('span,strong,b,em')].find(el=>normalize(el.textContent)==='financeiro');
    if(label)label.textContent='Mensalidades';
  }
}
function mountButton(){
  injectStyle();
  const template=menuButtonTemplate();
  let button=document.querySelector('.pp-billing-auto-fab');
  if(!template){if(button?.isConnected)button.remove();navButton=null;return false}
  if(!button||button.dataset.ppMenuClone!=='financeiro'){
    if(button?.isConnected)button.remove();
    button=template.cloneNode(true);
    button.classList.remove('active');
    button.classList.add('pp-billing-auto-fab');
    button.dataset.ppMenuClone='financeiro';
    button.removeAttribute('id');
    button.removeAttribute('aria-current');
    replaceMenuLabel(button);
    button.title='Mensalidades, negociação e cashback';
    button.setAttribute('aria-label','Mensalidades');
    button.onclick=event=>{event.preventDefault();event.stopPropagation();navButton=button;openManager().catch(error=>toast(error.message||String(error),'error'))};
  }
  navButton=button;
  if(button.previousElementSibling!==template)template.insertAdjacentElement('afterend',button);
  return true;
}
let menuObserver=null,menuWaitObserver=null,observedNav=null;
function connectMenuObserver(){
  const nav=document.querySelector('.sidebar nav,aside nav,nav');
  if(!nav)return false;
  if(observedNav!==nav){
    menuObserver?.disconnect();
    observedNav=nav;
    let scheduled=false;
    menuObserver=new MutationObserver(()=>{
      if(scheduled)return;
      scheduled=true;
      requestAnimationFrame(()=>{scheduled=false;mountButton()});
    });
    menuObserver.observe(nav,{childList:true,subtree:true});
  }
  mountButton();
  return true;
}
function observeMenu(){
  if(connectMenuObserver())return;
  if(menuWaitObserver)return;
  menuWaitObserver=new MutationObserver(()=>{
    if(!connectMenuObserver())return;
    menuWaitObserver?.disconnect();
    menuWaitObserver=null;
  });
  menuWaitObserver.observe(document.documentElement,{childList:true,subtree:true});
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('.sidebar nav button,aside nav button,nav button');
  if(button&&button!==navButton&&document.querySelector('.pp-billing-auto-layer'))closeManager();
},true);

window.ProvedorPlusBillingAutomation={run:runAutomatic,generateNow,generateBatch,generateFirst:issueFirstProrated,open:openManager};

observeMenu();
setTimeout(()=>{if(!document.querySelector('.pp-billing-auto-fab'))observeMenu()},600);
setTimeout(()=>runAutomatic().catch(error=>console.error('Provedor Plus: falha na geração automática de mensalidades.',error)),5000);
setInterval(()=>runAutomatic().catch(error=>console.error('Provedor Plus: falha na verificação diária de mensalidades.',error)),30*60*1000);
})();
