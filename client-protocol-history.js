(()=>{
  if(window.__ProvedorPlusClientProtocolHistoryInstalled)return;
  window.__ProvedorPlusClientProtocolHistoryInstalled=true;

  let installed=false,lastClientId=0,renderToken=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const dateTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d)};

  function injectStyle(){
    if(document.getElementById('pp-client-protocol-history-style'))return;
    const style=document.createElement('style');style.id='pp-client-protocol-history-style';style.textContent=`
.client-protocol-history-panel{margin-top:14px;padding:16px;border:1px solid #e8e2ec;border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(54,36,70,.05)}
.client-protocol-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.client-protocol-history-head h3{margin:0;color:#33263e;font-size:14px}.client-protocol-history-head span{padding:5px 8px;border-radius:999px;background:#f2eafd;color:#6a20bd;font-size:8px;font-weight:900;text-transform:uppercase}
.client-protocol-history-list{display:grid;gap:7px}.client-protocol-item{display:grid;grid-template-columns:minmax(130px,.7fr) minmax(180px,1.5fr) auto;align-items:center;gap:10px;padding:10px 11px;border:1px solid #eee9f1;border-radius:11px;background:#fbfafc}.client-protocol-code{font-size:10px;font-weight:900;color:#6420b7}.client-protocol-code small,.client-protocol-main small{display:block;margin-top:2px;color:#94899b;font-size:8px;font-weight:600}.client-protocol-main b{display:block;color:#4a3c53;font-size:10px}.client-protocol-status{padding:5px 7px;border-radius:999px;background:#eaf7f1;color:#187259;font-size:8px;font-weight:900;white-space:nowrap}.client-protocol-status.negado,.client-protocol-status.falhou{background:#fff0ec;color:#a24d39}.client-protocol-empty{padding:14px;text-align:center;color:#94899b;font-size:10px}
@media(max-width:760px){.client-protocol-history-panel{padding:13px;border-radius:13px}.client-protocol-item{grid-template-columns:1fr auto}.client-protocol-main{grid-column:1/-1;grid-row:2}.client-protocol-code{grid-column:1}.client-protocol-status{grid-column:2;grid-row:1}}
`;
    document.head.appendChild(style);
  }
  async function listProtocols(clientId){
    const response=await fetch('/api/protocols',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',data:{clientId:Number(clientId),limit:40}})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha ao consultar protocolos (HTTP ${response.status}).`);
    return Array.isArray(body.data)?body.data:[];
  }
  function details(protocol){
    const d=protocol?.details||{};
    if(protocol?.category==='Vencimento'&&d.oldDay&&d.newDay){const extra=d.transitionAmountCents?` · ${money(d.transitionAmountCents)}`:'';return `Dia ${String(d.oldDay).padStart(2,'0')} → ${String(d.newDay).padStart(2,'0')}${extra}`}
    if(protocol?.subject==='Liberação em confiança')return 'Liberação temporária de 48 horas';
    if(d.amountCents)return `${money(d.amountCents)}${d.provider?` · ${String(d.provider)}`:''}`;
    if(d.latencyMs!==undefined||d.packetLoss!==undefined){const parts=[];if(d.latencyMs!==undefined)parts.push(`${d.latencyMs} ms`);if(d.packetLoss!==undefined)parts.push(`${d.packetLoss}% perda`);return parts.join(' · ')}
    return protocol?.category||'Área do Cliente';
  }
  function ensurePanel(){
    injectStyle();
    const modal=document.querySelector('.client-status-modal');if(!modal)return null;
    let panel=modal.querySelector('.client-protocol-history-panel');if(panel)return panel;
    panel=document.createElement('section');panel.className='client-protocol-history-panel';panel.innerHTML='<div class="client-protocol-history-head"><h3>Protocolos da Área do Cliente</h3><span>Auditoria</span></div><div class="client-protocol-history-list"><div class="client-protocol-empty">Carregando protocolos...</div></div>';
    const access=modal.querySelector('.client-access-history-panel');access?.insertAdjacentElement('afterend',panel)||modal.appendChild(panel);return panel;
  }
  async function render(clientId){
    const id=Number(clientId)||0;if(!id)return;lastClientId=id;const token=++renderToken,panel=ensurePanel();if(!panel)return;
    const list=panel.querySelector('.client-protocol-history-list');if(list)list.innerHTML='<div class="client-protocol-empty">Carregando protocolos...</div>';
    try{
      const rows=(await listProtocols(id)).filter(item=>String(item?.source||'')==='area-cliente').slice(0,12);if(token!==renderToken)return;const current=ensurePanel();if(!current)return;const target=current.querySelector('.client-protocol-history-list');if(!target)return;
      target.innerHTML=rows.length?rows.map(item=>{const status=String(item?.status||'').toLowerCase();return `<article class="client-protocol-item"><div class="client-protocol-code">${esc(item.protocol||'Sem protocolo')}<small>${esc(dateTime(item.createdAt))}</small></div><div class="client-protocol-main"><b>${esc(item.subject||item.category||'Ação do cliente')}</b><small>${esc(details(item))}</small></div><span class="client-protocol-status ${esc(status)}">${esc(item.status||'Concluído')}</span></article>`}).join(''):'<div class="client-protocol-empty">Nenhuma ação da Área do Cliente registrada ainda.</div>';
    }catch(error){const current=ensurePanel(),target=current?.querySelector('.client-protocol-history-list');if(target)target.innerHTML=`<div class="client-protocol-empty">${esc(error.message||String(error))}</div>`}
  }
  function install(){
    if(installed)return;const api=window.provedor;if(!api?.clients?.status)return;installed=true;
    const original=api.clients.status.bind(api.clients);api.clients.status=async id=>{const result=await original(id);window.setTimeout(()=>render(id),80);return result};
    const observer=new MutationObserver(()=>{if(lastClientId&&document.querySelector('.client-status-modal')&&!document.querySelector('.client-status-modal .client-protocol-history-panel'))render(lastClientId)});observer.observe(document.body,{childList:true,subtree:true});
  }
  const timer=setInterval(()=>{install();if(installed)clearInterval(timer)},250);window.setTimeout(()=>clearInterval(timer),30000);
})();
