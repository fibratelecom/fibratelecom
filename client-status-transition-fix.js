(()=>{
  if(window.__ProvedorPlusClientStatusTransitionFixInstalled)return;
  window.__ProvedorPlusClientStatusTransitionFixInstalled=true;

  const style=document.createElement('style');
  style.id='pp-client-status-transition-fix-style';
  style.textContent=`
    .client-status-modal.pp-client-status-preparing{position:relative!important;min-height:260px;visibility:visible!important}
    .client-status-modal.pp-client-status-preparing:not(.pp-client-status-ready)>*:not(.pp-client-status-loading){visibility:hidden!important;pointer-events:none!important}
    .client-status-modal .pp-client-status-loading{display:none}
    .client-status-modal.pp-client-status-preparing:not(.pp-client-status-ready)>.pp-client-status-loading{display:flex!important;visibility:visible!important;position:absolute;inset:0;z-index:20;align-items:center;justify-content:center;flex-direction:column;gap:10px;min-height:260px;padding:28px;background:#fff;color:#51645f;text-align:center}
    .client-status-modal.pp-client-status-preparing:not(.pp-client-status-ready)>.pp-client-status-loading::before{content:'';width:28px;height:28px;border:3px solid #dce9e6;border-top-color:#0d8b78;border-radius:50%;animation:pp-client-status-spin .8s linear infinite}
    .client-status-modal.pp-client-status-ready>.pp-client-status-loading{display:none!important}
    @keyframes pp-client-status-spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  function removeLoading(modal){
    modal.classList.remove('pp-client-status-preparing');
    const loading=modal.querySelector(':scope > .pp-client-status-loading');
    if(loading)loading.remove();
  }

  function prepare(modal){
    if(!(modal instanceof Element))return;
    if(modal.classList.contains('pp-client-status-ready')){removeLoading(modal);return}
    modal.classList.add('pp-client-status-preparing');
    if(!modal.querySelector(':scope > .pp-client-status-loading')){
      const loading=document.createElement('div');
      loading.className='pp-client-status-loading';
      loading.setAttribute('role','status');
      loading.setAttribute('aria-live','polite');
      loading.textContent='Carregando dados do cliente…';
      modal.appendChild(loading);
    }
  }

  function scan(){
    for(const modal of document.querySelectorAll('.client-status-modal'))prepare(modal);
  }

  const observer=new MutationObserver(()=>scan());
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  scan();
})();
