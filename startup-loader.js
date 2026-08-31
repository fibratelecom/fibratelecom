(()=>{
  if(window.__PPStartupLoaderInstalled)return;
  window.__PPStartupLoaderInstalled=true;

  const screen=document.getElementById('pp-startup-screen-new');
  const status=document.getElementById('pp-startup-status-new');
  const stage=document.getElementById('pp-startup-stage-new');
  const retry=document.getElementById('pp-startup-retry-new');
  if(!screen)return;

  let finished=false,stableCount=0,observer=null,poll=null,watchdog=null,hardRelease=null;

  if(retry)retry.addEventListener('click',()=>location.reload());

  function panelReady(){
    const shell=document.querySelector('.app-shell');
    const nav=document.querySelector('aside.sidebar nav,.sidebar nav,aside nav');
    const content=document.querySelector('.app-shell > .content,.app-shell .content,.content');
    const buttons=nav?.querySelectorAll('button')?.length||0;
    return Boolean(shell&&nav&&content&&buttons>0);
  }

  function finish(){
    if(finished)return;
    finished=true;
    clearInterval(poll);clearTimeout(watchdog);clearTimeout(hardRelease);observer?.disconnect();
    screen.classList.add('is-leaving');
    setTimeout(()=>screen.remove(),320);
  }

  function check(){
    if(panelReady())stableCount++;else stableCount=0;
    if(stableCount>=2)finish();
  }

  observer=new MutationObserver(check);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  poll=setInterval(check,150);

  watchdog=setTimeout(()=>{
    if(finished)return;
    screen.classList.add('is-error');
    if(status)status.textContent='O painel está demorando mais do que o esperado.';
    if(stage)stage.textContent='Liberando a interface...';
  },6000);

  hardRelease=setTimeout(()=>finish(),8000);

  check();
})();
