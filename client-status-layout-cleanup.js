(()=>{
  if(window.__ProvedorPlusClientStatusLayoutCleanupInstalled)return;
  window.__ProvedorPlusClientStatusLayoutCleanupInstalled=true;

  const api=window.provedor;
  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

  // Segurança: o modal original nunca pode ficar invisível esperando a telemetria.
  if(!document.getElementById('pp-client-status-visibility-safety')){
    const style=document.createElement('style');
    style.id='pp-client-status-visibility-safety';
    style.textContent='.client-status-modal{visibility:visible!important}.client-status-modal .client-access-facts{grid-template-columns:repeat(4,minmax(0,1fr))}.client-status-modal .client-remote-access{display:flex!important}@media(max-width:900px){.client-status-modal .client-access-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.client-status-modal .client-access-facts{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function contractBlock(modal){
    const heading=[...modal.querySelectorAll('h2,h3,h4')].find(el=>normalize(el.textContent)==='contrato e acesso');
    if(!heading)return null;
    let node=heading.parentElement,best=null,depth=0;
    while(node&&node!==modal&&depth<7){
      const text=normalize(node.textContent);
      const hits=['velocidade contratada','vencimento','status do cadastro','roteador/onu do cliente'].filter(label=>text.includes(label)).length;
      if(text.includes('contrato e acesso')&&hits>=2){best=node;break}
      node=node.parentElement;depth++;
    }
    return best||heading.parentElement;
  }

  function rowValue(section,label){
    if(!section)return '';
    const target=normalize(label);
    const labels=[...section.querySelectorAll('span,small,label,strong,b,div,p')].filter(el=>el.children.length===0&&normalize(el.textContent)===target);
    for(const labelEl of labels){
      let row=labelEl.parentElement,depth=0;
      while(row&&row!==section.parentElement&&depth<4){
        const values=[...row.querySelectorAll('strong,b,span,small,p')]
          .filter(el=>el!==labelEl&&el.children.length===0)
          .map(el=>String(el.textContent||'').trim())
          .filter(value=>value&&normalize(value)!==target);
        if(values.length)return values[values.length-1];
        row=row.parentElement;depth++;
      }
    }
    return '';
  }

  function ensureFact(facts,label,value){
    value=String(value||'').trim();
    if(!facts||!value||['—','nao identificado','não identificado','sem informacao','sem informação'].includes(normalize(value)))return;
    let article=[...facts.querySelectorAll(':scope > article')].find(el=>normalize(el.querySelector('span')?.textContent)===normalize(label));
    if(!article){
      article=document.createElement('article');
      article.dataset.ppIntegratedFact=normalize(label);
      article.innerHTML='<span></span><strong></strong>';
      facts.appendChild(article);
    }
    article.querySelector('span').textContent=label;
    article.querySelector('strong').textContent=value;
  }

  function currentState(){return window.ProvedorPlusCloudState?.getState?.()||{}}

  async function currentClient(modal){
    const title=normalize(modal.querySelector('.modal-head h2,h2')?.textContent||'');
    let clients=[];
    try{clients=typeof api?.clients?.list==='function'?await api.clients.list():[]}catch{}
    clients=Array.isArray(clients)?clients:[];
    let client=clients.find(row=>{
      const name=normalize(row?.name||'');
      return name&&title.includes(name);
    })||null;
    if(!client){
      const stateClients=currentState()?.clients;
      const list=Array.isArray(stateClients)?stateClients:[];
      client=list.find(row=>{const name=normalize(row?.name||'');return name&&title.includes(name)})||null;
    }
    return client;
  }

  function planName(client){
    if(!client)return '';
    const state=currentState(),plans=Array.isArray(state?.plans)?state.plans:[];
    const byId=client?.plan_id?plans.find(plan=>Number(plan?.id)===Number(client.plan_id)):null;
    return String(client?.plan_name||byId?.name||client?.plan||'').trim();
  }

  function routerName(client){
    if(!client)return '';
    if(String(client?.router_name||'').trim())return String(client.router_name).trim();
    const routers=Array.isArray(currentState()?.routers)?currentState().routers:[];
    const router=routers.find(item=>Number(item?.id)===Number(client?.router_id));
    return String(router?.name||'').trim();
  }

  function ensureRemoteAccess(panel,section,client){
    if(!panel||!section)return false;
    const originalButton=[...section.querySelectorAll('button')].find(button=>{
      const text=normalize(button.textContent);
      return text.includes('roteador')||text.includes('onu')||text.includes('acessar')||text.includes('abrir');
    })||null;
    const device=String(client?.device_ip||rowValue(section,'Roteador/ONU do cliente')||'').trim();
    let block=panel.querySelector('.client-remote-access');
    if(!block){block=document.createElement('div');block.className='client-remote-access';panel.appendChild(block)}
    block.innerHTML=`<div><strong>Acesso remoto ao equipamento</strong><small>${device?`Roteador / ONU: ${device}`:'Use o acesso original cadastrado para este cliente.'}</small></div>${originalButton?'<button type="button" data-pp-original-router>Acessar roteador / ONU</button>':''}`;
    const button=block.querySelector('[data-pp-original-router]');
    if(button&&originalButton)button.addEventListener('click',()=>originalButton.click());
    return Boolean(originalButton);
  }

  function hideOnlySafeLegacyConsumption(modal){
    const columns=modal.querySelector('.client-status-columns');
    if(!columns||!modal.querySelector('.client-live-consumption-panel'))return;
    for(const child of [...columns.children]){
      if(child.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))continue;
      const text=normalize(child.textContent);
      const hasOldTraffic=text.includes('download agora')&&text.includes('upload agora')&&(text.includes('consumo do mes')||text.includes('consumo do mês'));
      if(hasOldTraffic){child.style.display='none';child.dataset.ppLegacyConsumptionHidden='true'}
    }
  }

  let running=false;
  async function patch(){
    if(running)return;
    const modal=document.querySelector('.client-status-modal');if(!modal)return;
    modal.style.visibility='visible';
    const panel=modal.querySelector('.client-live-consumption-panel'),facts=panel?.querySelector('.client-access-facts');
    if(!panel||!facts)return;
    running=true;
    try{
      const section=contractBlock(modal),client=await currentClient(modal);
      ensureFact(facts,'Cliente',client?.name||'');
      ensureFact(facts,'Plano contratado',planName(client));
      ensureFact(facts,'MikroTik concentrador',routerName(client));
      if(section){
        ensureFact(facts,'Velocidade contratada',rowValue(section,'Velocidade contratada'));
        ensureFact(facts,'Vencimento',rowValue(section,'Vencimento'));
        ensureFact(facts,'Status do cadastro',rowValue(section,'Status do cadastro'));
        ensureFact(facts,'Roteador/ONU do cliente',client?.device_ip||rowValue(section,'Roteador/ONU do cliente'));
        const remotePreserved=ensureRemoteAccess(panel,section,client);
        // Só elimina a duplicidade depois que o conteúdo novo existe e o acesso original foi preservado.
        if(remotePreserved||!section.querySelector('button')){
          section.style.display='none';
          section.dataset.ppContractAccessHidden='true';
        }else{
          section.style.removeProperty('display');
        }
      }
      hideOnlySafeLegacyConsumption(modal);
    }finally{running=false}
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{
    const modal=document.querySelector('.client-status-modal');
    if(modal)modal.style.visibility='visible';
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;patch().catch(error=>console.error('Provedor Plus: falha ao organizar o status do cliente.',error))});
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  patch().catch(error=>console.error('Provedor Plus: falha ao organizar o status do cliente.',error));
})();
