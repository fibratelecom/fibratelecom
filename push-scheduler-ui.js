(()=>{
'use strict';
const OPS_API='/api/push-operations';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const VARIABLES=[
  ['{nome}','Nome do cliente'],
  ['{valor}','Valor da próxima fatura'],
  ['{vencimento}','Vencimento da próxima fatura'],
  ['{plano}','Plano atual'],
  ['{contrato}','Número do contrato'],
  ['{cashback}','Saldo de cashback']
];
let activeTextField=null;

async function ops(action,data={}){const response=await fetch(OPS_API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok)throw new Error(body.error||`Falha ao acessar agendamentos (HTTP ${response.status}).`);return body.data||{}}
function localDateInput(date){const d=date||new Date(),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function statusLabel(value){return {pending:'Agendada',sending:'Enviando',sent:'Enviada',failed:'Falhou',canceled:'Cancelada'}[String(value||'').toLowerCase()]||String(value||'')}
function ensureStyle(){if($('#pp-push-scheduler-style'))return;const style=document.createElement('style');style.id='pp-push-scheduler-style';style.textContent=`
.pp-push-variable-help{padding:12px 14px;border:1px dashed #d7e4e1;border-radius:12px;background:#fff}.pp-push-variable-help h3{margin:0 0 4px;font-size:11px}.pp-push-variable-help p{margin:0 0 9px;color:#7a8c87;font-size:9px}.pp-push-variable-chips{display:flex;gap:6px;flex-wrap:wrap}.pp-push-variable-chip{border:1px solid #d8e5e1;border-radius:999px;background:#f7fbfa;color:#286f63;padding:6px 9px;font:800 9px Segoe UI,Arial,sans-serif;cursor:pointer}.pp-push-variable-chip:hover{background:#eaf6f2}.pp-push-variable-caption{display:block;margin-top:3px;font-weight:500;color:#7b8b87;font-size:8px}
.pp-push-schedule-box{display:grid;gap:8px;padding:11px 12px;border:1px solid #e2ebe9;border-radius:11px;background:#fbfdfc}.pp-push-schedule-switch{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:800;color:#526963;cursor:pointer}.pp-push-schedule-switch input{accent-color:#0b8f7c}.pp-push-schedule-when{display:grid;gap:5px}.pp-push-schedule-when span{font-size:9px;font-weight:800;color:#60736f}.pp-push-schedule-when input{width:100%;box-sizing:border-box;border:1px solid #d9e4e1;border-radius:9px;background:#fff;color:#263a36;padding:9px 10px;font:11px Segoe UI,Arial,sans-serif}.pp-push-schedule-note{font-size:8px;color:#84938f}
.pp-push-scheduled-list{display:grid;gap:7px}.pp-push-scheduled-item{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:center;padding:10px 11px;border:1px solid #e6eeec;border-radius:10px;background:#fff}.pp-push-scheduled-item b,.pp-push-scheduled-item small,.pp-push-scheduled-item span{display:block}.pp-push-scheduled-item b{font-size:10px}.pp-push-scheduled-item span{margin-top:2px;color:#6f817d;font-size:9px}.pp-push-scheduled-item small{margin-top:3px;color:#8c9a97;font-size:8px}.pp-push-scheduled-actions{display:flex;align-items:center;gap:6px}.pp-push-scheduled-status{font-size:9px;font-weight:800;color:#277366}.pp-push-scheduled-cancel{border:1px solid #edd9d5;border-radius:8px;background:#fff;color:#a45145;padding:6px 8px;font:800 8px Segoe UI,Arial,sans-serif;cursor:pointer}.pp-push-scheduled-empty{padding:10px;text-align:center;color:#8a9995;font-size:9px}
@media(max-width:620px){.pp-push-scheduled-item{grid-template-columns:1fr}.pp-push-scheduled-actions{justify-content:flex-start}}
`;document.head.appendChild(style)}

function insertVariable(field,value){if(!field)return;const start=Number.isFinite(field.selectionStart)?field.selectionStart:field.value.length,end=Number.isFinite(field.selectionEnd)?field.selectionEnd:start;field.value=field.value.slice(0,start)+value+field.value.slice(end);const pos=start+value.length;field.focus();try{field.setSelectionRange(pos,pos)}catch{}field.dispatchEvent(new Event('input',{bubbles:true}))}

function renderSchedules(modal,items=[]){
  const host=$('[data-pp-scheduled-list]',modal);if(!host)return;
  const list=Array.isArray(items)?items:[];
  host.innerHTML=list.length?list.map(item=>`<div class="pp-push-scheduled-item"><div><b>${esc(item.title)}</b><span>${esc(item.target_mode==='all'?'Todos os clientes autorizados':`Cliente ${item.target_identifier||'#'+item.target_client_id}`)}</span><small>${esc(fmt(item.scheduled_for))} · ${esc(item.body)}</small></div><div class="pp-push-scheduled-actions"><span class="pp-push-scheduled-status">${esc(statusLabel(item.status))}</span>${item.status==='pending'?`<button class="pp-push-scheduled-cancel" type="button" data-pp-cancel-schedule="${Number(item.id)}">Cancelar</button>`:''}</div></div>`).join(''):'<div class="pp-push-scheduled-empty">Nenhuma notificação agendada.</div>';
}
async function refreshSchedules(modal){try{const data=await ops('get');renderSchedules(modal,data.schedules||[])}catch(error){const host=$('[data-pp-scheduled-list]',modal);if(host)host.innerHTML=`<div class="pp-push-scheduled-empty">${esc(error.message||String(error))}</div>`}}

function enhanceModal(modal){
  if(!modal||modal.dataset.ppScheduleEnhanced==='1')return;modal.dataset.ppScheduleEnhanced='1';ensureStyle();
  const form=$('.pp-push-form',modal),history=$('.pp-push-history',modal);if(!form)return;activeTextField=form.elements.body||null;
  const quick=$('.pp-push-templates',modal)?.closest('.pp-push-section');
  const variables=document.createElement('section');variables.className='pp-push-variable-help';variables.innerHTML=`<h3>Variáveis personalizadas</h3><p>Use nos modelos ou mensagens. O Provedor Plus preenche automaticamente para cada cliente no momento do envio.</p><div class="pp-push-variable-chips">${VARIABLES.map(([token,label])=>`<button type="button" class="pp-push-variable-chip" data-pp-variable="${esc(token)}">${esc(token)}<span class="pp-push-variable-caption">${esc(label)}</span></button>`).join('')}</div>`;
  quick?quick.insertAdjacentElement('afterend',variables):form.insertAdjacentElement('beforebegin',variables);

  const send=$('.pp-push-send',form),schedule=document.createElement('div');schedule.className='pp-push-schedule-box';schedule.innerHTML=`<label class="pp-push-schedule-switch"><input type="checkbox" data-pp-schedule-enabled> Agendar esta notificação</label><label class="pp-push-schedule-when" data-pp-schedule-when hidden><span>Data e hora do envio</span><input type="datetime-local" data-pp-schedule-at><small class="pp-push-schedule-note">O envio será processado pelo Provedor Plus no horário escolhido.</small></label>`;
  send?.insertAdjacentElement('beforebegin',schedule);
  const enabled=$('[data-pp-schedule-enabled]',schedule),when=$('[data-pp-schedule-when]',schedule),at=$('[data-pp-schedule-at]',schedule);at.min=localDateInput(new Date(Date.now()+60000));
  const sync=()=>{when.hidden=!enabled.checked;if(send)send.textContent=enabled.checked?'Agendar notificação':'Enviar notificação'};enabled.addEventListener('change',sync);sync();

  const scheduledSection=document.createElement('section');scheduledSection.className='pp-push-section';scheduledSection.innerHTML=`<div class="pp-push-section-head"><div><h3>Notificações agendadas</h3><p>Acompanhe os próximos envios e cancele um agendamento enquanto ele estiver pendente.</p></div></div><div class="pp-push-scheduled-list" data-pp-scheduled-list><div class="pp-push-scheduled-empty">Carregando...</div></div>`;
  history?history.insertAdjacentElement('beforebegin',scheduledSection):modal.querySelector('.pp-push-body')?.appendChild(scheduledSection);

  $$('[data-pp-variable]',variables).forEach(button=>button.addEventListener('click',()=>insertVariable(activeTextField||form.elements.body,button.dataset.ppVariable)));
  form.elements.title?.addEventListener('focus',()=>activeTextField=form.elements.title);form.elements.body?.addEventListener('focus',()=>activeTextField=form.elements.body);

  scheduledSection.addEventListener('click',async event=>{const button=event.target.closest('[data-pp-cancel-schedule]');if(!button)return;button.disabled=true;try{const data=await ops('cancel-schedule',{id:Number(button.dataset.ppCancelSchedule)});renderSchedules(modal,data.schedules||[])}catch(error){alert(error.message||String(error))}finally{button.disabled=false}});
  refreshSchedules(modal);
}

document.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.classList.contains('pp-push-form'))return;
  const modal=form.closest('.pp-push-modal'),enabled=$('[data-pp-schedule-enabled]',form);if(!enabled?.checked)return;
  event.preventDefault();event.stopImmediatePropagation();
  const result=$('[data-pp-push-result]',form),send=$('.pp-push-send',form),at=$('[data-pp-schedule-at]',form),when=new Date(at?.value||'');
  if(result){result.className='pp-push-result';result.textContent='Agendando...'}if(send)send.disabled=true;
  try{
    if(Number.isNaN(when.getTime()))throw new Error('Escolha a data e a hora do envio.');
    const data=await ops('schedule-notification',{mode:form.elements.mode.value,identifier:form.elements.identifier.value,title:form.elements.title.value,body:form.elements.body.value,url:form.elements.url.value,scheduledFor:when.toISOString()});
    if(result){result.className='pp-push-result ok';result.textContent=`Notificação agendada para ${fmt(when)}.`}
    renderSchedules(modal,data.schedules||[]);enabled.checked=false;enabled.dispatchEvent(new Event('change'));form.elements.body.value='';
  }catch(error){if(result){result.className='pp-push-result error';result.textContent=error.message||String(error)}}finally{if(send)send.disabled=false}
},true);

const observer=new MutationObserver(()=>{const modal=$('.pp-push-modal');if(modal)enhanceModal(modal)});
observer.observe(document.documentElement,{childList:true,subtree:true});
const existing=$('.pp-push-modal');if(existing)enhanceModal(existing);
})();
