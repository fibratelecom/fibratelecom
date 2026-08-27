(()=>{
  if(window.__ProvedorPlusClientStatusLayoutCleanupInstalled)return;
  window.__ProvedorPlusClientStatusLayoutCleanupInstalled=true;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

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
    const target=normalize(label),leaves=[...section.querySelectorAll('span,small,label,strong,b,div,p')].filter(el=>el.children.length===0&&normalize(el.textContent)===target);
    for(const labelEl of leaves){
      let row=labelEl.parentElement,depth=0;
      while(row&&row!==section.parentElement&&depth<3){
        const values=[...row.querySelectorAll('strong,b,span,small,p')].filter(el=>el!==labelEl&&el.children.length===0).map(el=>String(el.textContent||'').trim()).filter(value=>value&&normalize(value)!==target);
        if(values.length)return values[values.length-1];
        row=row.parentElement;depth++;
      }
    }
    return '';
  }

  function ensureFact(facts,label,value){
    if(!value)return;
    let article=[...facts.querySelectorAll(':scope > article')].find(el=>normalize(el.querySelector('span')?.textContent)===normalize(label));
    if(!article){article=document.createElement('article');article.dataset.ppContractFact=normalize(label);article.innerHTML='<span></span><strong></strong>';facts.appendChild(article)}
    article.querySelector('span').textContent=label;
    article.querySelector('strong').textContent=value;
  }

  function patch(){
    const modal=document.querySelector('.client-status-modal');if(!modal)return;
    const section=contractBlock(modal);if(!section)return;
    const facts=modal.querySelector('.client-live-consumption-panel .client-access-facts');
    if(facts){
      ensureFact(facts,'Velocidade contratada',rowValue(section,'Velocidade contratada'));
      ensureFact(facts,'Vencimento',rowValue(section,'Vencimento'));
      ensureFact(facts,'Status do cadastro',rowValue(section,'Status do cadastro'));
      ensureFact(facts,'Roteador/ONU do cliente',rowValue(section,'Roteador/ONU do cliente'));
    }
    section.style.display='none';section.dataset.ppContractAccessHidden='true';
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch()})});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  patch();
})();
