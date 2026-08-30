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
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

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
.pp-billing-auto-fab{cursor:pointer}
.pp-billing-auto-layer{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:rgba(16,32,28,.38);backdrop-filter:blur(2px)}
.pp-billing-auto-modal{width:min(820px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.2);color:#304b45;font-family:Segoe UI,Arial,sans-serif}
.pp-billing-auto-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #e3ece9}.pp-billing-auto-head h2{margin:0;font-size:18px}.pp-billing-auto-close{border:0;background:#eef5f3;border-radius:8px;width:32px;height:32px;cursor:pointer}
.pp-billing-auto-body{display:grid;gap:14px;padding:18px 20px}.pp-billing-auto-card{padding:14px;border:1px solid #dfeae7;border-radius:12px;background:#fbfdfc}.pp-billing-auto-card h3{margin:0 0 10px;font-size:14px}
.pp-billing-auto-row{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.pp-billing-auto-row label{display:grid;gap:5px;font-size:11px;font-weight:700}.pp-billing-auto-row input,.pp-billing-auto-row select{height:36px;box-sizing:border-box;border:1px solid #cbded9;border-radius:8px;padding:0 9px;background:#fff;color:#304b45}.pp-billing-auto-row button,.pp-billing-auto-actions button{height:36px;border:0;border-radius:8px;padding:0 12px;background:#0d8b78;color:#fff;font-weight:750;cursor:pointer}.pp-billing-auto-row button.secondary{background:#edf4f2;color:#35534c}
.pp-billing-auto-note{margin:8px 0 0;color:#6b7f79;font-size:10px;line-height:1.45}.pp-billing-auto-clients{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:230px;overflow:auto;margin-top:10px}.pp-billing-auto-client{display:flex;align-items:center;gap:7px;padding:7px 8px;border:1px solid #e2ebe8;border-radius:8px;font-size:11px}.pp-billing-auto-client input{accent-color:#0d8b78}.pp-billing-auto-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.pp-billing-auto-toast{position:fixed;left:50%;bottom:18px;z-index:12000;max-width:min(620px,90vw);transform:translateX(-50%);padding:11px 15px;border-radius:10px;background:#174f44;color:#fff;font:700 11px/1.4 Segoe UI,Arial;box-shadow:0 12px 35px rgba(0,0,0,.2)}.pp-billing-auto-toast.is-error{background:#9b2c2c}
@media(max-width:650px){.pp-billing-auto-clients{grid-template-columns:1fr}}
`;document.head.appendChild(style);
}

async function openManager(){
  injectStyle();document.querySelector('.pp-billing-auto-layer')?.remove();
  const [settings,clientRows]=await Promise.all([getSettings(),clients()]),days=Math.max(0,Math.min(30,Math.floor(num(settings.billing_auto_days_before)||7))),enabled=settings.billing_auto_enabled!==false&&String(settings.billing_auto_enabled)!=='false';
  const active=clientRows.filter(activeClient),layer=document.createElement('div');layer.className='pp-billing-auto-layer';
  layer.innerHTML=`<section class="pp-billing-auto-modal" role="dialog" aria-modal="true"><header class="pp-billing-auto-head"><h2>Geração de mensalidades</h2><button class="pp-billing-auto-close" type="button">×</button></header><div class="pp-billing-auto-body">
  <section class="pp-billing-auto-card"><h3>Automática mensal</h3><div class="pp-billing-auto-row"><label><span>Ativa</span><select class="pp-auto-enabled"><option value="true">Sim</option><option value="false">Não</option></select></label><label><span>Gerar quantos dias antes</span><input class="pp-auto-days" type="number" min="0" max="30" value="${days}"></label><button class="pp-auto-save" type="button">Salvar</button><button class="pp-auto-run secondary" type="button">Verificar agora</button></div><p class="pp-billing-auto-note">Evita duplicidade por cliente + vencimento. A primeira cobrança proporcional é gerada no cadastro e não participa do cashback.</p></section>
  <section class="pp-billing-auto-card"><h3>Gerar agora</h3><div class="pp-billing-auto-row"><label style="flex:1;min-width:230px"><span>Cliente</span><select class="pp-now-client"><option value="">Selecione</option>${active.map(c=>`<option value="${Number(c.id)}">${escapeHtml(c.name||`Cliente ${c.id}`)} · ${escapeHtml(c.contract_number||'sem contrato')}</option>`).join('')}</select></label><button class="pp-now-generate" type="button">Gerar agora</button></div></section>
  <section class="pp-billing-auto-card"><h3>Gerar em lote</h3><div class="pp-billing-auto-row"><label><span>Competência</span><input class="pp-batch-month" type="month" value="${monthKey(new Date())}"></label><button class="pp-batch-all secondary" type="button">Selecionar todos</button></div><div class="pp-billing-auto-clients">${active.map(c=>`<label class="pp-billing-auto-client"><input type="checkbox" value="${Number(c.id)}"><span>${escapeHtml(c.name||`Cliente ${c.id}`)}</span></label>`).join('')||'<span>Nenhum cliente ativo.</span>'}</div><div class="pp-billing-auto-actions"><button class="pp-batch-generate" type="button">Gerar selecionados</button></div></section>
  </div></section>`;
  document.body.appendChild(layer);
  layer.querySelector('.pp-auto-enabled').value=enabled?'true':'false';
  layer.querySelector('.pp-billing-auto-close').onclick=()=>layer.remove();layer.addEventListener('click',event=>{if(event.target===layer)layer.remove()});
  layer.querySelector('.pp-auto-save').onclick=async()=>{try{const nextEnabled=layer.querySelector('.pp-auto-enabled').value==='true',nextDays=Math.max(0,Math.min(30,Math.floor(num(layer.querySelector('.pp-auto-days').value)||7)));await saveSettings({billing_auto_enabled:nextEnabled,billing_auto_days_before:nextDays});toast('Configuração da geração automática salva.')}catch(error){toast(error.message||String(error),'error')}};
  layer.querySelector('.pp-auto-run').onclick=async()=>{try{await runAutomatic({force:true,notify:true})}catch(error){toast(error.message||String(error),'error')}};
  layer.querySelector('.pp-now-generate').onclick=async()=>{const id=Number(layer.querySelector('.pp-now-client').value);if(!id)return toast('Selecione um cliente.','error');try{await generateNow(id)}catch(error){toast(error.message||String(error),'error')}};
  layer.querySelector('.pp-batch-all').onclick=()=>{const boxes=[...layer.querySelectorAll('.pp-billing-auto-client input')],all=boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all)};
  layer.querySelector('.pp-batch-generate').onclick=async()=>{const ids=[...layer.querySelectorAll('.pp-billing-auto-client input:checked')].map(x=>Number(x.value)),month=layer.querySelector('.pp-batch-month').value;try{await generateBatch(ids,month)}catch(error){toast(error.message||String(error),'error')}};
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
  if(!template){if(button?.isConnected)button.remove();return false}
  if(!button||button.dataset.ppMenuClone!=='financeiro'){
    if(button?.isConnected)button.remove();
    button=template.cloneNode(true);
    button.classList.remove('active');
    button.classList.add('pp-billing-auto-fab');
    button.dataset.ppMenuClone='financeiro';
    button.removeAttribute('id');
    button.removeAttribute('aria-current');
    replaceMenuLabel(button);
    button.title='Geração automática, gerar agora e gerar em lote';
    button.setAttribute('aria-label','Mensalidades');
    button.onclick=event=>{event.preventDefault();event.stopPropagation();openManager().catch(error=>toast(error.message||String(error),'error'))};
  }
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

window.ProvedorPlusBillingAutomation={run:runAutomatic,generateNow,generateBatch,generateFirst:issueFirstProrated,open:openManager};

observeMenu();
setTimeout(()=>{if(!document.querySelector('.pp-billing-auto-fab'))observeMenu()},600);
setTimeout(()=>runAutomatic().catch(error=>console.error('Provedor Plus: falha na geração automática de mensalidades.',error)),5000);
setInterval(()=>runAutomatic().catch(error=>console.error('Provedor Plus: falha na verificação diária de mensalidades.',error)),30*60*1000);
})();