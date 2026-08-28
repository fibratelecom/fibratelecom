(()=>{
  if(window.__ProvedorPlusNavigationTransitionGuardInstalled)return;
  window.__ProvedorPlusNavigationTransitionGuardInstalled=true;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const ROUTES={
    dashboard:['dashboard','visao geral'],
    clients:['clientes','cliente'],
    finance:['financeiro','finance'],
    integration:['integracao','integra'],
    tickets:['chamados','chamado'],
    plans:['planos','plano'],
    stock:['estoque'],
    reports:['relatorios','relatorio'],
    staff:['funcionarios','funcionario','usuarios','usuario']
  };
  let transition=null,transitionObserver=null,stopTimer=null,frameId=null,finishQueued=false,dashboardIntent=false;

  function routeKey(value){
    const text=normalize(value);
    for(const [key,terms] of Object.entries(ROUTES))if(terms.some(term=>text.includes(term)))return key;
    return text;
  }

  function navButton(target){
    const button=target?.closest?.('.sidebar nav button,nav button');
    if(!button||button.hidden||button.disabled)return null;
    return {button,key:routeKey(button.textContent)};
  }

  function contentRoot(){return document.querySelector('.content')}

  function contentFingerprint(){
    const content=contentRoot();
    if(!content)return'';
    const heading=[...content.querySelectorAll('h1,h2')].map(el=>normalize(el.textContent)).filter(Boolean).slice(0,4).join('|');
    const text=normalize(content.textContent).slice(0,700);
    return `${heading}::${text}`;
  }

  function installStyle(){
    if(document.getElementById('pp-navigation-transition-style'))return;
    const style=document.createElement('style');
    style.id='pp-navigation-transition-style';
    style.textContent=`
      .content{position:relative}
      #pp-navigation-transition-cover{position:absolute;inset:0;z-index:1090;background:#f6f8f7;pointer-events:auto}
      @media(max-width:900px){#pp-navigation-transition-cover{position:fixed;top:60px;left:0;right:0;bottom:0}}
    `;
    document.head.appendChild(style);
  }

  function ensureCover(){
    if(!transition)return;
    const content=contentRoot();if(!content)return;
    let cover=document.getElementById('pp-navigation-transition-cover');
    if(cover&&cover.parentElement===content)return;
    cover?.remove();
    cover=document.createElement('div');
    cover.id='pp-navigation-transition-cover';
    cover.setAttribute('aria-hidden','true');
    content.appendChild(cover);
  }

  function protectDashboardHost(){
    if(!dashboardIntent)return;
    const host=document.querySelector('.page-wrap');
    if(host&&!host.classList.contains('pp-dashboard-host'))host.classList.add('pp-dashboard-host');
  }

  function activeRouteKey(){
    const active=document.querySelector('.sidebar nav button.active,nav button.active');
    return active?routeKey(active.textContent):'';
  }

  function specialReady(key){
    if(key==='dashboard')return Boolean(document.querySelector('.page-wrap.pp-dashboard-host > .pp-dashboard-v2'));
    if(key==='tickets')return Boolean(document.querySelector('.pp-ticket-layer'));
    if(key==='staff')return Boolean(document.querySelector('.pp-staff-layer'));
    return false;
  }

  function routeReady(){
    if(!transition)return false;
    protectDashboardHost();
    const key=transition.key;
    if(['dashboard','tickets','staff'].includes(key))return specialReady(key);
    if(activeRouteKey()!==key)return false;
    const current=contentFingerprint();
    return Boolean(current&&current!==transition.beforeFingerprint);
  }

  function stopWatchers(){
    if(transitionObserver){transitionObserver.disconnect();transitionObserver=null}
    clearTimeout(stopTimer);stopTimer=null;
    if(frameId){cancelAnimationFrame(frameId);frameId=null}
    finishQueued=false;
  }

  function finishTransition(){
    if(!transition)return;
    stopWatchers();
    document.getElementById('pp-navigation-transition-cover')?.remove();
    if(dashboardIntent)protectDashboardHost();
    transition=null;
  }

  function queueFinish(){
    if(finishQueued||!transition)return;
    finishQueued=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      finishQueued=false;
      if(routeReady())finishTransition();
    }));
  }

  function checkTransition(){
    if(!transition)return;
    ensureCover();
    protectDashboardHost();
    if(routeReady()){queueFinish();return}
    frameId=requestAnimationFrame(checkTransition);
  }

  function beginTransition(button,key){
    if(!key||button.classList.contains('active'))return;
    installStyle();
    stopWatchers();
    document.getElementById('pp-navigation-transition-cover')?.remove();
    dashboardIntent=key==='dashboard';
    if(!dashboardIntent)document.querySelector('.page-wrap')?.classList.remove('pp-dashboard-host');
    transition={button,key,beforeFingerprint:contentFingerprint(),startedAt:Date.now()};
    ensureCover();
    protectDashboardHost();
    transitionObserver=new MutationObserver(()=>{
      if(!transition)return;
      ensureCover();
      protectDashboardHost();
      if(routeReady())queueFinish();
    });
    transitionObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    frameId=requestAnimationFrame(checkTransition);
    stopTimer=setTimeout(()=>finishTransition(),6000);
  }

  function onNavigationIntent(event){
    const nav=navButton(event.target);if(!nav)return;
    beginTransition(nav.button,nav.key);
  }

  document.addEventListener('click',onNavigationIntent,true);
})();
