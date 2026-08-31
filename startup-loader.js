(()=>{
  if(window.__PPStartupLoaderInstalled)return;
  window.__PPStartupLoaderInstalled=true;

  const screen=document.getElementById('pp-startup-screen-new');
  const status=document.getElementById('pp-startup-status-new');
  const stage=document.getElementById('pp-startup-stage-new');
  const retry=document.getElementById('pp-startup-retry-new');
  if(!screen)return;

  const norm=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  let finished=false,stableCount=0,observer=null,poll=null,watchdog=null;

  if(retry)retry.addEventListener('click',()=>location.reload());

  function removeLegacyLoader(){
    const nodes=[...document.body.querySelectorAll('*')];
    for(const node of nodes){
      if(node===screen||screen.contains(node))continue;
      const text=norm(node.textContent);
      if(!text||text.length>180||!text.includes('abrindo banco de dados'))continue;
      const legacy=node.closest('[role="status"],[class*="loading"],[class*="loader"],[class*="splash"],[class*="startup"]')||node.parentElement||node;
      if(legacy&&legacy!==document.body&&legacy!==document.documentElement&&legacy.id!=='root')legacy.remove();
      else node.remove();
    }
  }

  function panelReady(){
    const shell=document.querySelector('.app-shell');
    const nav=document.querySelector('aside.sidebar nav,.sidebar nav,aside nav');
    const dashboardButton=document.querySelector('button[data-pp-dashboard-root="1"]');
    const dashboard=document.querySelector('.pp-dashboard-root-layer .ppd-head,.pp-dashboard-root-layer .ppd-error');
    return Boolean(shell&&nav&&dashboardButton&&dashboard);
  }

  function finish(){
    if(finished)return;
    finished=true;
    clearInterval(poll);clearTimeout(watchdog);observer?.disconnect();
    removeLegacyLoader();
    screen.classList.add('is-leaving');
    setTimeout(()=>screen.remove(),320);
  }

  function check(){
    removeLegacyLoader();
    if(panelReady())stableCount++;else stableCount=0;
    if(stableCount>=2)finish();
  }

  observer=new MutationObserver(check);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  poll=setInterval(check,120);
  watchdog=setTimeout(()=>{
    if(finished)return;
    screen.classList.add('is-error');
    if(status)status.textContent='O painel está demorando mais do que o esperado.';
    if(stage)stage.textContent='Tente recarregar a página';
  },15000);

  check();
})();
