(()=>{
  if(window.__ProvedorPlusDashboardTransitionGuardInstalled)return;
  window.__ProvedorPlusDashboardTransitionGuardInstalled=true;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  let dashboardIntent=false,transitionObserver=null,stopTimer=null;

  function dashboardButton(target){
    const button=target?.closest?.('nav button,.sidebar nav button');
    if(!button)return null;
    const text=normalize(button.textContent);
    return {button,isDashboard:text.includes('dashboard')||text.includes('visao geral')};
  }

  function protectCurrentHost(){
    if(!dashboardIntent)return;
    const host=document.querySelector('.page-wrap');
    if(host&&!host.classList.contains('pp-dashboard-host'))host.classList.add('pp-dashboard-host');
  }

  function stopTransitionObserver(){
    if(transitionObserver){transitionObserver.disconnect();transitionObserver=null}
    clearTimeout(stopTimer);stopTimer=null;
  }

  function beginDashboardTransition(){
    dashboardIntent=true;
    protectCurrentHost();
    stopTransitionObserver();
    transitionObserver=new MutationObserver(()=>{
      if(!dashboardIntent){stopTransitionObserver();return}
      protectCurrentHost();
      if(document.querySelector('.page-wrap.pp-dashboard-host > .pp-dashboard-v2')){
        requestAnimationFrame(()=>{if(dashboardIntent)protectCurrentHost();stopTransitionObserver()});
      }
    });
    transitionObserver.observe(document.documentElement,{childList:true,subtree:true});
    queueMicrotask(protectCurrentHost);
    requestAnimationFrame(protectCurrentHost);
    stopTimer=setTimeout(stopTransitionObserver,1000);
  }

  function leaveDashboardTransition(){
    dashboardIntent=false;
    stopTransitionObserver();
    document.querySelector('.page-wrap')?.classList.remove('pp-dashboard-host');
  }

  function onNavigationIntent(event){
    const nav=dashboardButton(event.target);if(!nav)return;
    if(nav.isDashboard)beginDashboardTransition();
    else leaveDashboardTransition();
  }

  document.addEventListener('pointerdown',onNavigationIntent,true);
  document.addEventListener('click',onNavigationIntent,true);
})();
