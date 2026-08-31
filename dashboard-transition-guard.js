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

  function activeDashboard(){
    const active=document.querySelector('nav button.active,.sidebar nav button.active');
    if(!active)return false;
    const text=normalize(active.textContent);
    return text.includes('dashboard')||text.includes('visao geral');
  }

  function protectedHosts(){return [...document.querySelectorAll('.page-wrap.pp-dashboard-host')]}

  function protectCurrentHost(){
    if(!dashboardIntent)return;
    const host=document.querySelector('.page-wrap');
    if(host&&!host.classList.contains('pp-dashboard-host'))host.classList.add('pp-dashboard-host');
  }

  function releaseDashboardHosts(){for(const host of protectedHosts())host.classList.remove('pp-dashboard-host')}

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
    const settle=()=>{
      if(activeDashboard())return;
      releaseDashboardHosts();
      stopTransitionObserver();
    };
    const nav=document.querySelector('nav,.sidebar nav');
    if(nav){
      transitionObserver=new MutationObserver(settle);
      transitionObserver.observe(nav,{attributes:true,subtree:true,attributeFilter:['class'],childList:true});
    }
    requestAnimationFrame(()=>requestAnimationFrame(settle));
    stopTimer=setTimeout(settle,700);
  }

  function onNavigationIntent(event){
    const nav=dashboardButton(event.target);if(!nav)return;
    if(nav.isDashboard)beginDashboardTransition();
    else leaveDashboardTransition();
  }

  document.addEventListener('click',onNavigationIntent,true);
})();

(()=>{
  if(window.__ProvedorPlusIntegrationHubInstalled)return;
  window.__ProvedorPlusIntegrationHubInstalled=true;

  const norm=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  let hubButton=null,popup=null,layer=null,hideTimer=null,navObserver=null,observedNav=null;

  function ensureStyles(){
    if(document.getElementById('pp-integration-hub-style'))return;
    const style=document.createElement('style');
    style.id='pp-integration-hub-style';
    style.textContent=`
      .pp-integration-hub-button{position:relative!important}
      .pp-integration-hub-button .pp-integration-chevron{margin-left:auto!important;font-size:16px!important;line-height:1!important;opacity:.62!important}
      .pp-integration-menu{position:fixed;z-index:11050;width:230px;padding:7px;background:#fff;border:1px solid #dce7e4;border-radius:11px;box-shadow:0 14px 38px rgba(18,52,45,.18);box-sizing:border-box}
      .pp-integration-menu[hidden]{display:none!important}
      .pp-integration-menu button{display:flex;width:100%;align-items:center;gap:10px;padding:10px 11px;border:0;border-radius:8px;background:transparent;color:#294b44;text-align:left;font:700 11px/1.3 Segoe UI,Arial,sans-serif;cursor:pointer}
      .pp-integration-menu button:hover{background:#edf8f5;color:#087866}
      .pp-integration-menu svg{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .content.pp-integration-hub-active{position:relative!important;overflow:auto!important;background:#f4f7f6!important}
      .content.pp-integration-hub-active>:not(.pp-integration-hub-layer){display:none!important}
      .content.pp-integration-hub-active>.pp-integration-hub-layer{display:block!important}
      .pp-integration-hub-layer{display:none;min-height:100%;padding:30px 28px 44px;box-sizing:border-box;background:linear-gradient(180deg,#f7faf9 0,#f2f6f5 100%);font-family:Segoe UI,Arial,sans-serif;color:#173d36}
      .pp-integration-hub-head{max-width:820px;padding:24px;background:#fff;border:1px solid #dce7e4;border-radius:14px;box-shadow:0 4px 16px rgba(30,72,63,.05)}
      .pp-integration-hub-eyebrow{margin-bottom:7px;color:#0b8f7c;font-size:10px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}
      .pp-integration-hub-head h1{margin:0 0 7px;font-size:28px;line-height:1.12;color:#173d36}
      .pp-integration-hub-head p{margin:0;color:#71827e;font-size:12px;line-height:1.5}
      @media(max-width:900px){.pp-integration-menu{width:210px}.pp-integration-hub-layer{padding:20px 14px 35px}}
    `;
    document.head.appendChild(style);
  }

  const navRoot=()=>document.querySelector('.sidebar nav')||document.querySelector('aside nav')||document.querySelector('nav');
  const isOldIntegration=button=>{
    if(!button||button.dataset.ppIntegrationHub==='1')return false;
    const text=norm(button.textContent);
    return text==='integracao'||text==='integracoes';
  };
  const contentRoot=()=>{
    const shell=document.querySelector('.app-shell');
    return shell?.querySelector(':scope > .content')||shell?.querySelector('.content')||document.querySelector('.content');
  };

  function removeOldIntegration(nav=navRoot()){
    if(!nav)return [];
    const old=[...nav.querySelectorAll('button')].filter(isOldIntegration);
    old.forEach(button=>button.remove());
    return old;
  }

  function closePopup(){
    clearTimeout(hideTimer);hideTimer=null;
    if(popup)popup.hidden=true;
    hubButton?.setAttribute('aria-expanded','false');
  }

  function scheduleClose(){
    clearTimeout(hideTimer);
    hideTimer=setTimeout(closePopup,150);
  }

  function positionPopup(){
    if(!hubButton||!popup||popup.hidden)return;
    const rect=hubButton.getBoundingClientRect(),gap=8,width=popup.offsetWidth||230;
    let left=rect.right+gap,top=rect.top;
    if(left+width>innerWidth-10)left=Math.max(10,rect.left-width-gap);
    top=Math.min(Math.max(10,top),Math.max(10,innerHeight-(popup.offsetHeight||110)-10));
    popup.style.left=`${Math.round(left)}px`;
    popup.style.top=`${Math.round(top)}px`;
  }

  function showPopup(){
    ensureButton();
    if(!hubButton||!popup)return;
    clearTimeout(hideTimer);hideTimer=null;
    popup.hidden=false;
    hubButton.setAttribute('aria-expanded','true');
    requestAnimationFrame(positionPopup);
  }

  function closeLayer(){
    document.querySelectorAll('.content.pp-integration-hub-active').forEach(content=>content.classList.remove('pp-integration-hub-active'));
    document.querySelectorAll('.pp-integration-hub-layer').forEach(node=>node.remove());
    layer=null;
    hubButton?.classList.remove('active');
  }

  function openSection(kind){
    closePopup();
    const content=contentRoot();if(!content)return;
    content.classList.add('pp-integration-hub-active');
    layer=content.querySelector(':scope > .pp-integration-hub-layer');
    if(!layer){layer=document.createElement('section');layer.className='pp-integration-hub-layer';content.appendChild(layer)}
    const bank=kind==='banks',title=bank?'API Bancos':'Servidor MikroTik',description=bank?'Área exclusiva para configurar as APIs bancárias.':'Área exclusiva para configurar a integração com o servidor MikroTik.';
    layer.innerHTML=`<div class="pp-integration-hub-head"><div class="pp-integration-hub-eyebrow">Integração</div><h1>${title}</h1><p>${description}</p></div>`;
    const nav=navRoot();nav?.querySelectorAll('button.active').forEach(button=>{if(button!==hubButton)button.classList.remove('active')});
    hubButton?.classList.add('active');
  }

  function buildPopup(){
    if(popup?.isConnected)return popup;
    popup=document.createElement('div');
    popup.className='pp-integration-menu';
    popup.hidden=true;
    popup.setAttribute('role','menu');
    popup.innerHTML=`
      <button type="button" role="menuitem" data-pp-integration-option="banks"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M3 10h18M7 15h3"></path></svg><span>API Bancos</span></button>
      <button type="button" role="menuitem" data-pp-integration-option="mikrotik"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="6" rx="2"></rect><rect x="4" y="14" width="16" height="6" rx="2"></rect><path d="M8 7h.01M8 17h.01M12 7h4M12 17h4"></path></svg><span>Servidor MikroTik</span></button>`;
    popup.addEventListener('mouseenter',()=>{clearTimeout(hideTimer);hideTimer=null});
    popup.addEventListener('mouseleave',scheduleClose);
    popup.addEventListener('click',event=>{
      const option=event.target.closest?.('[data-pp-integration-option]');if(!option)return;
      event.preventDefault();event.stopPropagation();
      openSection(option.dataset.ppIntegrationOption);
    });
    document.body.appendChild(popup);
    return popup;
  }

  function ensureNavObserver(nav){
    if(!nav||observedNav===nav)return;
    navObserver?.disconnect();observedNav=nav;
    navObserver=new MutationObserver(()=>ensureButton());
    navObserver.observe(nav,{childList:true,subtree:true});
  }

  function ensureButton(){
    ensureStyles();
    const nav=navRoot();if(!nav)return;
    ensureNavObserver(nav);
    const old=[...nav.querySelectorAll('button')].filter(isOldIntegration),anchor=old[0]||null;
    let current=nav.querySelector('button[data-pp-integration-hub="1"]');
    if(!current&&anchor){
      current=document.createElement('button');
      current.type='button';
      current.dataset.ppIntegrationHub='1';
      current.className=String(anchor.className||'');
      current.classList.add('pp-integration-hub-button');
      current.setAttribute('aria-haspopup','menu');current.setAttribute('aria-expanded','false');
      current.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12h8M12 8v8"></path><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path></svg><span>Integração</span><span class="pp-integration-chevron">›</span>';
      nav.insertBefore(current,anchor);
      current.addEventListener('mouseenter',showPopup);
      current.addEventListener('mouseleave',scheduleClose);
      current.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(popup&&!popup.hidden)closePopup();else showPopup()});
    }
    hubButton=current||hubButton;
    removeOldIntegration(nav);
    buildPopup();
  }

  document.addEventListener('click',event=>{
    const navButton=event.target.closest?.('.sidebar nav button,aside nav button,nav button');
    if(navButton&&navButton!==hubButton){closePopup();closeLayer();return}
    if(popup&&!popup.hidden&&!event.target.closest('.pp-integration-menu')&&event.target!==hubButton&&!hubButton?.contains(event.target))closePopup();
  },true);
  addEventListener('resize',positionPopup);
  addEventListener('scroll',positionPopup,true);

  const rootObserver=new MutationObserver(()=>ensureButton());
  rootObserver.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureButton,{once:true});else ensureButton();
})();
