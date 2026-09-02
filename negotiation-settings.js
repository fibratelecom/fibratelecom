(()=>{
'use strict';
if(window.__PP_NEGOTIATION_SETTINGS_INSTALLED__)return;
window.__PP_NEGOTIATION_SETTINGS_INSTALLED__=true;

const $=(selector,root=document)=>root.querySelector(selector);
const number=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function toast(message,error=false){
  document.querySelector('.pp-negotiation-v2-toast')?.remove();
  const node=document.createElement('div');node.className='pp-negotiation-v2-toast';node.textContent=message;
  Object.assign(node.style,{position:'fixed',left:'50%',bottom:'18px',zIndex:'13000',transform:'translateX(-50%)',maxWidth:'90vw',padding:'11px 15px',borderRadius:'10px',background:error?'#9b2c2c':'#174f44',color:'#fff',font:'700 11px/1.4 Segoe UI,Arial',boxShadow:'0 12px 35px rgba(0,0,0,.2)'});
  document.body.appendChild(node);setTimeout(()=>node.remove(),4800);
}
function api(){return window.provedor?.settings}
async function settings(){try{return await api()?.get?.()||{}}catch{return{}}}
function field(card,selector){return $(selector,card)}
function setValue(card,selector,value){const input=field(card,selector);if(input)input.value=String(value)}

async function enhance(card){
  if(!card||card.dataset.ppNegotiationV2==='1')return;
  card.dataset.ppNegotiationV2='1';
  const grid=$('.pp-negotiation-grid',card);if(!grid)return;
  const oldDiscount=field(card,'.pp-neg-installment-discount');
  const oldLabel=oldDiscount?.closest('label');if(oldLabel)oldLabel.style.display='none';if(oldDiscount)oldDiscount.value='0';
  if(!field(card,'.pp-neg-interest')){
    const label=document.createElement('label');label.className='pp-neg-interest-wrap';label.innerHTML='<span>Juros parcelado (% ao mês)</span><input class="pp-neg-interest" type="number" min="0" max="20" step="0.1" value="1.5">';
    const cashLabel=field(card,'.pp-neg-cash')?.closest('label');cashLabel?.insertAdjacentElement('afterend',label)||grid.appendChild(label);
  }
  const note=$('.pp-billing-auto-note',card);if(note)note.textContent='O cliente recebe duas propostas: à vista com desconto ou parcelada com entrada e juros. Parcelas do acordo não geram cashback e faturas já renegociadas não entram em outro acordo automático.';
  const current=await settings();if(!card.isConnected)return;
  const version=Number(current.negotiation_policy_version)||0;
  const values=version>=2?{
    minDays:clamp(Math.floor(number(current.negotiation_min_overdue_days,5)),0,365),
    cash:clamp(number(current.negotiation_cash_discount_percent,5),0,100),
    interest:clamp(number(current.negotiation_installment_interest_percent,1.5),0,20),
    max:clamp(Math.floor(number(current.negotiation_max_installments,3)),2,3),
    entry:clamp(number(current.negotiation_entry_percent,30),0,90),
    first:clamp(Math.floor(number(current.negotiation_first_due_days,0)),0,30)
  }:{minDays:5,cash:5,interest:1.5,max:3,entry:30,first:0};
  setValue(card,'.pp-neg-min-days',values.minDays);setValue(card,'.pp-neg-cash',values.cash);setValue(card,'.pp-neg-interest',values.interest);setValue(card,'.pp-neg-max',values.max);setValue(card,'.pp-neg-entry',values.entry);setValue(card,'.pp-neg-first-due',values.first);if(oldDiscount)oldDiscount.value='0';
  const max=field(card,'.pp-neg-max');if(max){max.min='2';max.max='3'}
  const entry=field(card,'.pp-neg-entry');if(entry)entry.max='90';
}

async function save(card){
  const service=api();if(!service?.save)throw new Error('Não foi possível acessar as configurações de negociação.');
  const values={
    negotiation_policy_version:2,
    negotiation_auto_enabled:field(card,'.pp-neg-enabled')?.value==='true',
    negotiation_min_overdue_days:clamp(Math.floor(number(field(card,'.pp-neg-min-days')?.value,5)),0,365),
    negotiation_cash_discount_percent:clamp(number(field(card,'.pp-neg-cash')?.value,5),0,100),
    negotiation_installment_discount_percent:0,
    negotiation_installment_interest_percent:clamp(number(field(card,'.pp-neg-interest')?.value,1.5),0,20),
    negotiation_max_installments:clamp(Math.floor(number(field(card,'.pp-neg-max')?.value,3)),2,3),
    negotiation_entry_percent:clamp(number(field(card,'.pp-neg-entry')?.value,30),0,90),
    negotiation_first_due_days:clamp(Math.floor(number(field(card,'.pp-neg-first-due')?.value,0)),0,30)
  };
  await service.save(values);toast('Regras da negociação automática salvas.');
}

function scan(){document.querySelectorAll('.pp-billing-negotiation-card').forEach(card=>enhance(card).catch(()=>{}))}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('.pp-negotiation-save');if(!button)return;
  const card=button.closest('.pp-billing-negotiation-card');if(!card)return;
  event.preventDefault();event.stopImmediatePropagation();button.disabled=true;const original=button.textContent;button.textContent='Salvando...';
  save(card).catch(error=>toast(error.message||String(error),true)).finally(()=>{if(button.isConnected){button.disabled=false;button.textContent=original||'Salvar regras'}});
},true);

const observer=new MutationObserver(scan);observer.observe(document.documentElement,{childList:true,subtree:true});scan();
})();
