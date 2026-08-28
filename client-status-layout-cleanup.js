(()=>{
  if(window.__ProvedorPlusClientStatusLayoutCleanupInstalled)return;
  window.__ProvedorPlusClientStatusLayoutCleanupInstalled=true;

  const api=window.provedor;
  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const formatCpf=value=>{const raw=String(value||'').trim(),digits=raw.replace(/\D/g,'');return digits.length===11?digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):raw};
  const firstValue=(...values)=>{for(const value of values){if(value===0)return '0';if(typeof value==='string'&&value.trim())return value.trim();if(typeof value==='number'&&Number.isFinite(value))return String(value)}return ''};
  const formatDueDay=value=>{const raw=String(value||'').trim();if(!raw)return '';if(/^\d{1,2}$/.test(raw))return `Dia ${Number(raw)}`;const iso=raw.match(/^\d{4}-\d{2}-(\d{2})/);if(iso)return `Dia ${Number(iso[1])}`;return raw};
  const whatsappDigits=value=>{let digits=String(value||'').replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if((digits.length===10||digits.length===11)&&!digits.startsWith('55'))digits=`55${digits}`;return digits};
  const formatPhone=value=>{const raw=String(value||'').trim(),digits=raw.replace(/\D/g,'');const local=digits.startsWith('55')&&digits.length>=12?digits.slice(2):digits;if(local.length===11)return local.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');if(local.length===10)return local.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3');return raw};

  if(!document.getElementById('pp-client-status-visibility-safety')){
    const style=document.createElement('style');
    style.id='pp-client-status-visibility-safety';
    style.textContent='.client-status-modal{visibility:visible!important}.client-status-modal .client-access-facts{grid-template-columns:repeat(4,minmax(0,1fr))}.client-status-modal .client-remote-access{display:flex!important}.client-status-modal .client-access-facts a[data-pp-whatsapp]{display:inline-flex;align-items:center;gap:6px;color:#087f69;text-decoration:none;font-weight:750}.client-status-modal .client-access-facts a[data-pp-whatsapp]:hover{text-decoration:underline}@media(max-width:900px){.client-status-modal .client-access-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.client-status-modal .client-access-facts{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function contractBlock(modal){
    const heading=[...modal.querySelectorAll('h2,h3,h4')].find(el=>normalize(el.textContent)==='contrato e acesso');
    if(!heading)return null;
    let node=heading.parentElement,best=null,depth=0;
    while(node&&node!==modal&&depth<7){const text=normalize(node.textContent),hits=['velocidade contratada','vencimento','status do cadastro','roteador/onu do cliente'].filter(label=>text.includes(label)).length;if(text.includes('contrato e acesso')&&hits>=2){best=node;break}node=node.parentElement;depth++}
    return best||heading.parentElement;
  }

  function rowValue(section,label){
    if(!section)return '';
    const target=normalize(label),labels=[...section.querySelectorAll('span,small,label,strong,b,div,p')].filter(el=>el.children.length===0&&normalize(el.textContent)===target);
    for(const labelEl of labels){let row=labelEl.parentElement,depth=0;while(row&&row!==section.parentElement&&depth<4){const values=[...row.querySelectorAll('strong,b,span,small,p')].filter(el=>el!==labelEl&&el.children.length===0).map(el=>String(el.textContent||'').trim()).filter(value=>value&&normalize(value)!==target);if(values.length)return values[values.length-1];row=row.parentElement;depth++}}
    return '';
  }

  function findFact(facts,label){return [...facts.querySelectorAll(':scope > article')].find(el=>normalize(el.querySelector('span')?.textContent)===normalize(label))||null}

  function ensureFact(facts,label,value){
    value=String(value||'').trim();if(!facts||!value||['—','nao identificado','não identificado','sem informacao','sem informação'].includes(normalize(value)))return;
    let article=findFact(facts,label);
    if(!article){article=document.createElement('article');article.dataset.ppIntegratedFact=normalize(label);article.innerHTML='<span></span><strong></strong>';facts.appendChild(article)}
    const labelEl=article.querySelector('span'),valueEl=article.querySelector('strong');if(labelEl&&labelEl.textContent!==label)labelEl.textContent=label;if(valueEl&&valueEl.textContent!==value)valueEl.textContent=value;
  }

  function ensureWhatsappFact(facts,value){
    const digits=whatsappDigits(value);if(!facts||digits.length<12)return;
    let article=findFact(facts,'WhatsApp');
    if(!article){article=document.createElement('article');article.dataset.ppIntegratedFact='whatsapp';article.innerHTML='<span>WhatsApp</span><strong></strong>';facts.appendChild(article)}
    const strong=article.querySelector('strong');if(!strong)return;
    let link=strong.querySelector('a[data-pp-whatsapp]');if(!link){strong.textContent='';link=document.createElement('a');link.dataset.ppWhatsapp='true';link.target='_blank';link.rel='noopener noreferrer';link.title='Abrir conversa no WhatsApp';strong.appendChild(link)}
    const display=formatPhone(value)||digits;link.href=`https://wa.me/${digits}`;link.textContent=`${display} ↗`;
  }

  function currentState(){return window.ProvedorPlusCloudState?.getState?.()||{}}
  async function currentClient(modal,result){
    if(result?.client)return result.client;
    const title=normalize(modal.querySelector('.modal-head h2,h2')?.textContent||'');
    const stateClients=Array.isArray(currentState()?.clients)?currentState().clients:[];
    let client=stateClients.find(row=>{const name=normalize(row?.name||'');return name&&title.includes(name)})||null;
    if(client)return client;
    try{const rows=typeof api?.clients?.list==='function'?await api.clients.list():[];client=(Array.isArray(rows)?rows:[]).find(row=>{const name=normalize(row?.name||'');return name&&title.includes(name)})||null}catch{}
    return client;
  }

  function planName(client){if(!client)return '';const state=currentState(),plans=Array.isArray(state?.plans)?state.plans:[],byId=client?.plan_id?plans.find(plan=>Number(plan?.id)===Number(client.plan_id)):null;return String(client?.plan_name||byId?.name||client?.plan||'').trim()}
  function routerName(client){if(!client)return '';if(String(client?.router_name||'').trim())return String(client.router_name).trim();const routers=Array.isArray(currentState()?.routers)?currentState().routers:[],router=routers.find(item=>Number(item?.id)===Number(client?.router_id));return String(router?.name||'').trim()}

  function clientContact(client){
    const addressObject=client?.address&&typeof client.address==='object'?client.address:(client?.address_data&&typeof client.address_data==='object'?client.address_data:{});
    const dueDay=formatDueDay(firstValue(client?.due_day,client?.billing_day,client?.day_due,client?.vencimento_dia,client?.dueDateDay,client?.due_date));
    const address=firstValue(typeof client?.address==='string'?client.address:'',client?.street,client?.logradouro,client?.address_line,client?.endereco,addressObject?.street,addressObject?.logradouro,addressObject?.address,addressObject?.endereco);
    const neighborhood=firstValue(client?.neighborhood,client?.bairro,client?.district,addressObject?.neighborhood,addressObject?.bairro,addressObject?.district);
    const city=firstValue(client?.city,client?.cidade,client?.municipality,client?.municipio,addressObject?.city,addressObject?.cidade,addressObject?.municipality);
    const state=firstValue(client?.state,client?.estado,client?.uf,addressObject?.state,addressObject?.estado,addressObject?.uf);
    const complement=firstValue(client?.complement,client?.complemento,client?.address_complement,addressObject?.complement,addressObject?.complemento);
    const whatsapp=firstValue(client?.whatsapp,client?.whatsapp_number,client?.whatsapp_phone,client?.mobile,client?.celular,client?.cellphone,client?.phone,client?.telefone);
    return {dueDay,address,neighborhood,city,state,complement,whatsapp};
  }

  function ensureRemoteAccess(panel,section,client){
    if(!panel||!section)return false;
    const device=String(client?.device_ip||rowValue(section,'Roteador/ONU do cliente')||'').trim();
    let block=panel.querySelector('.client-remote-access');
    if(!block){block=document.createElement('div');block.className='client-remote-access';block.innerHTML='<div><strong>Acesso remoto ao equipamento</strong><small data-pp-remote-detail></small></div>';panel.appendChild(block)}
    const detail=block.querySelector('[data-pp-remote-detail]');
    const detailText=device?`Roteador / ONU: ${device}`:'Use o acesso original cadastrado para este cliente.';if(detail&&detail.textContent!==detailText)detail.textContent=detailText;

    let originalButton=block.querySelector('button[data-pp-original-router="true"]');
    if(!originalButton){
      originalButton=[...section.querySelectorAll('button')].find(button=>{const text=normalize(button.textContent);return text.includes('roteador')||text.includes('onu')||text.includes('acessar')||text.includes('abrir')})||null;
      if(originalButton){
        originalButton.dataset.ppOriginalRouter='true';
        originalButton.hidden=false;
        originalButton.style.removeProperty('display');
        originalButton.textContent='Acessar roteador / ONU';
        block.appendChild(originalButton);
      }
    }
    return Boolean(originalButton);
  }

  function hideOnlySafeLegacyConsumption(modal){
    const columns=modal.querySelector('.client-status-columns');if(!columns||!modal.querySelector('.client-live-consumption-panel'))return;
    for(const child of [...columns.children]){if(child.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))continue;const text=normalize(child.textContent),hasOldTraffic=text.includes('download agora')&&text.includes('upload agora')&&(text.includes('consumo do mes')||text.includes('consumo do mês'));if(hasOldTraffic&&child.style.display!=='none'){child.style.display='none';child.dataset.ppLegacyConsumptionHidden='true'}}
  }

  let running=false;
  async function patch(modal,result){
    if(running||!modal?.isConnected)return;
    const panel=modal.querySelector('.client-live-consumption-panel'),facts=panel?.querySelector('.client-access-facts');if(!panel||!facts)return;
    running=true;
    try{
      const section=contractBlock(modal),client=await currentClient(modal,result);
      const cpf=formatCpf(client?.cpf||client?.document||client?.document_number||client?.cpf_cnpj||client?.tax_id||'');
      const contact=clientContact(client||{});
      ensureFact(facts,'Cliente',client?.name||'');
      ensureFact(facts,'CPF',cpf);
      ensureFact(facts,'Dia do Vencimento',contact.dueDay);
      ensureFact(facts,'Endereço',contact.address);
      ensureFact(facts,'Bairro',contact.neighborhood);
      ensureFact(facts,'Cidade',contact.city);
      ensureFact(facts,'Estado',contact.state);
      ensureFact(facts,'Complemento',contact.complement);
      ensureWhatsappFact(facts,contact.whatsapp);
      ensureFact(facts,'Plano contratado',planName(client));
      ensureFact(facts,'MikroTik concentrador',routerName(client));
      if(section){
        ensureFact(facts,'Velocidade contratada',rowValue(section,'Velocidade contratada'));ensureFact(facts,'Vencimento',rowValue(section,'Vencimento'));ensureFact(facts,'Status do cadastro',rowValue(section,'Status do cadastro'));ensureFact(facts,'Roteador/ONU do cliente',client?.device_ip||rowValue(section,'Roteador/ONU do cliente'));
        const remotePreserved=ensureRemoteAccess(panel,section,client);
        if(remotePreserved){if(section.style.display!=='none')section.style.display='none';section.dataset.ppContractAccessHidden='true'}
        else{section.style.removeProperty('display');delete section.dataset.ppContractAccessHidden}
      }
      hideOnlySafeLegacyConsumption(modal);
    }finally{running=false}
  }

  if(typeof api?.clients?.status==='function'&&!api.clients.__ppStatusEntryGuardInstalled){
    const currentStatus=api.clients.status.bind(api.clients);
    api.clients.status=async id=>{
      const numericId=Number(id)||0,modal=document.querySelector('.client-status-modal');
      if(modal){
        const renderedId=Number(modal.dataset.ppClientStatusId)||0;
        const hasNewView=Boolean(modal.querySelector('.client-extra-summary')&&modal.querySelector('.client-live-consumption-panel'));
        if(!hasNewView||!renderedId||renderedId!==numericId)modal.classList.remove('pp-client-status-ready');
      }
      return currentStatus(id);
    };
    Object.defineProperty(api.clients,'__ppStatusEntryGuardInstalled',{value:true,enumerable:false});
  }

  document.addEventListener('pp:client-status-rendered',event=>{
    const modal=event.detail?.modal||document.querySelector('.client-status-modal');
    if(modal)modal.dataset.ppClientStatusId=String(Number(event.detail?.id)||0);
    patch(modal,event.detail?.result).catch(error=>console.error('Provedor Plus: falha ao organizar o status do cliente.',error));
  });
  setTimeout(()=>{const modal=document.querySelector('.client-status-modal');if(modal)patch(modal,null).catch(()=>{})},120);
})();
