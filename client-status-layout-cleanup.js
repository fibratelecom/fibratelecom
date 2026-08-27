(()=>{
  if(window.__ProvedorPlusClientStatusLayoutCleanupInstalled)return;
  window.__ProvedorPlusClientStatusLayoutCleanupInstalled=true;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

  function smallestGroup(modal,marker,terms){
    let node=marker?.parentElement,best=null,depth=0;
    while(node&&node!==modal&&depth<8){
      if(node.closest('.client-live-consumption-panel'))return null;
      const text=normalize(node.textContent);
      if(terms.every(term=>text.includes(term))){best=node;break}
      node=node.parentElement;depth++;
    }
    return best;
  }

  function hideLegacyConsumption(modal){
    if(!modal.querySelector('.client-live-consumption-panel'))return;
    const leaves=[...modal.querySelectorAll('span,small,strong,b,label,div,p')].filter(el=>el.children.length===0);
    const downloadNow=leaves.find(el=>normalize(el.textContent)==='download agora'&&!el.closest('.client-live-consumption-panel'));
    if(downloadNow){
      const group=smallestGroup(modal,downloadNow,['download agora','upload agora','consumo do mes']);
      if(group){group.style.display='none';group.dataset.ppLegacyConsumptionHidden='true'}
    }

    const legacyLabels=new Set(['download agora','upload agora','consumo do mes']);
    for(const label of leaves){
      if(!legacyLabels.has(normalize(label.textContent))||label.closest('.client-live-consumption-panel'))continue;
      const card=label.closest('article,.client-stat,.stat-card,.metric-card,.status-card,.card');
      if(card&&card!==modal){card.style.display='none';card.dataset.ppLegacyConsumptionHidden='true'}
    }

    const progressLabels=leaves.filter(el=>!el.closest('.client-live-consumption-panel')&&['download','upload'].includes(normalize(el.textContent)));
    for(const label of progressLabels){
      let node=label.parentElement,depth=0;
      while(node&&node!==modal&&depth<5){
        const text=normalize(node.textContent);
        if(text.includes('download')&&text.includes('upload')&&(text.includes('mbps')||node.querySelector('[class*="progress"],progress'))){
          node.style.display='none';node.dataset.ppLegacyConsumptionHidden='true';break;
        }
        node=node.parentElement;depth++;
      }
    }
  }

  function restoreOriginalContractAccess(modal){
    const heading=[...modal.querySelectorAll('h2,h3,h4')].find(el=>normalize(el.textContent)==='contrato e acesso');
    if(!heading)return;
    let node=heading.parentElement,section=null,depth=0;
    while(node&&node!==modal&&depth<7){
      const text=normalize(node.textContent);
      if(text.includes('contrato e acesso')&&text.includes('roteador/onu do cliente')){section=node;break}
      node=node.parentElement;depth++;
    }
    if(!section)section=heading.parentElement;
    section.style.removeProperty('display');
    delete section.dataset.ppContractAccessHidden;
  }

  function patch(){
    const modal=document.querySelector('.client-status-modal');if(!modal)return;
    hideLegacyConsumption(modal);
    restoreOriginalContractAccess(modal);
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch()})});
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  patch();
})();
