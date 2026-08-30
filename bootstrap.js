(async()=>{
  window.__PROVEDOR_PLUS_CLOUD__=true;
  const BUILD_TOKEN='20260830-2025-chamados-rota1';
  window.__PROVEDOR_PLUS_BUILD__=BUILD_TOKEN;
  const assetUrl=value=>{
    const src=String(value||'');
    if(!src.startsWith('/'))return src;
    return `${src}${src.includes('?')?'&':'?'}ppbuild=${encodeURIComponent(BUILD_TOKEN)}`;
  };
  const read=async(paths)=>{const parts=await Promise.all(paths.map(async p=>{const url=assetUrl(p),r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`Falha ao carregar ${p}: ${r.status}`);return r.text()}));return parts.join('')};
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=assetUrl(src);s.onload=resolve;s.onerror=()=>reject(new Error(`Falha ao carregar ${src}`));document.head.appendChild(s)});
  const loadStyle=(href,id)=>new Promise((resolve,reject)=>{const existing=document.getElementById(id);if(existing){resolve();return}const link=document.createElement('link');link.rel='stylesheet';link.href=assetUrl(href);link.id=id;link.onload=resolve;link.onerror=()=>reject(new Error(`Falha ao carregar ${href}`));document.head.appendChild(link)});
  const loadScriptStable=async(src,{dropCharacterData=false,ignoreWithin=[],observerTargetSelector=null}={})=>{
    const Native=window.MutationObserver;
    if(typeof Native!=='function')return loadScript(src);
    function FilteredMutationObserver(callback){
      let observer;
      observer=new Native(records=>{
        const filtered=records.filter(record=>{
          const target=record.target instanceof Element?record.target:record.target?.parentElement;
          return !ignoreWithin.some(selector=>target?.closest?.(selector));
        });
        if(filtered.length)callback(filtered,observer);
      });
      const nativeObserve=observer.observe.bind(observer);
      observer.observe=(target,options={})=>{
        const safe={...options};
        if(dropCharacterData){safe.characterData=false;delete safe.characterDataOldValue}
        const scopedTarget=observerTargetSelector?document.querySelector(observerTargetSelector):null;
        nativeObserve(scopedTarget||target,safe);
      };
      return observer;
    }
    window.MutationObserver=FilteredMutationObserver;
    try{return await loadScript(src)}finally{window.MutationObserver=Native}
  };
  const installTicketRouteGuard=()=>{
    if(window.__ProvedorPlusTicketRouteGuardInstalled)return;
    window.__ProvedorPlusTicketRouteGuardInstalled=true;
    const style=document.createElement('style');
    style.id='pp-ticket-route-guard-style';
    style.textContent='.content.pp-ticket-route-active{position:relative!important;overflow:auto!important}.content.pp-ticket-route-active>:not(.pp-ticket-layer){display:none!important}.content.pp-ticket-route-active>.pp-ticket-layer{position:absolute!important;inset:0!important;z-index:17!important;display:block!important;visibility:visible!important;opacity:1!important;background:#f6f8f7!important;overflow:auto!important}';
    document.head.appendChild(style);
    const normalize=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    let activeContent=null,contentObserver=null,syncTimer=null;
    const activeTicketButton=()=>[...document.querySelectorAll('.sidebar nav button.active,nav button.active')].find(button=>normalize(button.textContent).includes('chamado'))||null;
    const release=()=>{
      contentObserver?.disconnect();contentObserver=null;
      activeContent?.classList.remove('pp-ticket-route-active');activeContent=null;
    };
    const resolveContent=button=>{
      const shell=button?.closest('.app-shell')||document.querySelector('.app-shell');
      if(!shell)return null;
      return [...shell.children].find(el=>el.classList?.contains('content'))||shell.querySelector('.content');
    };
    const sync=()=>{
      const button=activeTicketButton();
      if(!button){release();return}
      const content=resolveContent(button);
      if(!content){release();return}
      const layers=[...document.querySelectorAll('.pp-ticket-layer')].filter(node=>node.isConnected);
      if(!layers.length){
        if(activeContent!==content){release();activeContent=content;activeContent.classList.add('pp-ticket-route-active')}
        return;
      }
      const current=layers[layers.length-1];
      for(const duplicate of layers.slice(0,-1))duplicate.remove();
      if(current.parentElement!==content)content.appendChild(current);
      if(activeContent!==content){release();activeContent=content;activeContent.classList.add('pp-ticket-route-active')}
      if(!contentObserver){
        contentObserver=new MutationObserver(()=>{
          if(!activeTicketButton()){release();return}
          clearTimeout(syncTimer);syncTimer=setTimeout(sync,20);
        });
        contentObserver.observe(content,{childList:true});
      }
    };
    const schedule=()=>{
      clearTimeout(syncTimer);
      syncTimer=setTimeout(sync,20);
      setTimeout(sync,90);
      setTimeout(sync,220);
    };
    const navObserver=new MutationObserver(schedule);
    for(const nav of document.querySelectorAll('.sidebar nav,nav'))navObserver.observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('click',event=>{if(event.target.closest('.sidebar nav button,nav button'))setTimeout(schedule,30)},true);
    schedule();
  };
  const gunzipB64=async b64=>{const bin=atob(b64.replace(/\s+/g,'')),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);if(typeof DecompressionStream!=='function')throw new Error('Este navegador não suporta a descompressão necessária. Atualize o Chrome/Edge.');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return new Response(stream).text()};
  const css=await read(['/parts/basecss-01.txt','/parts/basecss-02.txt','/parts/basecss-03.txt','/parts/fincss-01.txt','/ui-fixes.css?v=1017-fix8']);
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  await loadScript('/auth-gate.js?v=1017-cloud17');
  if(!window.ProvedorPlusAuth?.ensure)throw new Error('A autenticação do Provedor Plus não foi carregada.');
  const auth=await window.ProvedorPlusAuth.ensure();

  await loadScript('/cloud-state-store.js?v=1017-cloud17-audit1');
  if(!window.ProvedorPlusCloudState?.prepare)throw new Error('A sincronização com o banco da nuvem não foi carregada.');
  await window.ProvedorPlusCloudState.prepare();
  const currentState=window.ProvedorPlusCloudState.getState()||{};
  currentState.settings={...(currentState.settings||{}),current_user_name:auth?.user?.name||currentState.settings?.current_user_name||'Administrador'};
  localStorage.setItem('provedor_plus_web_1_0_17',JSON.stringify(currentState));
  await window.ProvedorPlusCloudState.forceSync();

  const bridgeB64=await read(['/packed/bridgegz-01.txt','/packed/bridgegz-02.txt','/packed/bridgegz-03.txt','/packed/bridgegz-04.txt']);
  const bridge=await gunzipB64(bridgeB64);
  await new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([bridge],{type:'text/javascript'})),s=document.createElement('script');s.src=url;s.onload=()=>{URL.revokeObjectURL(url);resolve()};s.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Falha ao iniciar a ponte web da 1.0.17'))};document.head.appendChild(s)});

  if(window.provedor?.app?.info){
    window.provedor.app.info=async()=>({version:'1.0.17',platform:'web-cloud',databasePath:'Neon PostgreSQL (nuvem)',currentUser:auth?.user?.name||'Administrador',connector:{connected:true,mode:'cloud-rest'},paymentPortal:null});
  }

  await loadScript('/cloud-router-store-v2.js?v=1017-cloud17');
  await loadScript('/cloud-client-store-v2.js?v=1017-cloud17-audit1');
  await loadScript('/cloud-adapter.js?v=1017-cloud17-stable3');
  if(typeof window.ProvedorPlusInstallCloudAdapter!=='function')throw new Error('A ponte HTTPS do MikroTik não foi carregada.');
  await window.ProvedorPlusInstallCloudAdapter();
  await loadScript('/cloud-client-status-fix.js?v=1017-cloud17-audit2');
  if(typeof window.provedor?.invoices?.sync==='function')await window.provedor.invoices.sync().catch(error=>console.error('Provedor Plus: falha na conciliação inicial de cobranças.',error));

  await loadScript('/cloud-backup-store.js?v=1017-cloud17');
  window.ProvedorPlusCloudState.wrapApi(window.provedor);
  await loadScript('/mikrotik-read-stability.js?v=1017-mikrotikstable1').catch(error=>console.error('Provedor Plus: a estabilização das leituras MikroTik não foi carregada.',error));

  await Promise.all([
    loadStyle('/client-status-enhancements.css?v=1017-status6','pp-client-status-enhancements-css'),
    loadStyle('/dashboard-enhancements.css?v=1017-dashboard1','pp-dashboard-enhancements-css'),
    loadStyle('/staff-access.css?v=1017-staff1','pp-staff-access-css'),
    loadStyle('/ticket-enhancements.css?v=1017-ticket1','pp-ticket-enhancements-css'),
    loadStyle('/ui-readability-fixes.css?v=1017-readability1','pp-ui-readability-fixes-css')
  ]);

  await loadScript('/client-status-enhancements.js?v=1017-status7-stable').catch(error=>console.error('Provedor Plus: os indicadores avançados do cliente não foram carregados.',error));
  await loadScript('/client-status-layout-cleanup.js?v=1017-statuslayout6-freshdata').catch(error=>console.error('Provedor Plus: a organização visual do status do cliente não foi carregada.',error));
  await loadScript('/dashboard-transition-guard.js?v=1017-dashboard-guard2').catch(error=>console.error('Provedor Plus: a proteção de transição do Dashboard não foi carregada.',error));

  const root=document.getElementById('root');
  if(root)root.style.visibility='hidden';
  const appB64=await read(Array.from({length:33},(_,i)=>`/packed/appgz-${String(i+1).padStart(2,'0')}.txt`));
  const app=await gunzipB64(appB64),appUrl=URL.createObjectURL(new Blob([app],{type:'text/javascript'}));
  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}

  await loadScript('/ui-runtime-fixes.js?v=1017-fix13-client-actions');
  await loadScriptStable('/dashboard-enhancements.js?v=1017-dashboard1',{dropCharacterData:true,ignoreWithin:['.pp-dashboard-v2','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.client-status-modal','.pp-ticket-layer','.pp-staff-layer']}).catch(error=>console.error('Provedor Plus: o Dashboard gerencial não foi carregado.',error));
  await loadScriptStable('/billing-bank-selector.js?v=1017-billingbank3',{ignoreWithin:['.pp-dashboard-v2','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer']}).catch(error=>console.error('Provedor Plus: a seleção do banco emissor não foi carregada.',error));
  await loadScript('/billing-automation.js?v=1017-billingauto1').catch(error=>console.error('Provedor Plus: a automação de mensalidades não foi carregada.',error));
  await loadScriptStable('/staff-access.js?v=1017-staff1',{ignoreWithin:['.pp-dashboard-v2','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer']}).catch(error=>console.error('Provedor Plus: a gestão de funcionários não foi carregada.',error));
  await loadScriptStable('/ticket-enhancements.js?v=1017-ticket1',{observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-v2','.client-status-modal','.pp-staff-layer','.pp-ticket-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer']}).catch(error=>console.error('Provedor Plus: a gestão avançada de chamados não foi carregada.',error));
  installTicketRouteGuard();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(typeof window.ProvedorPlusPatchClientViewButtons==='function')window.ProvedorPlusPatchClientViewButtons();
  if(root)root.style.visibility='';
})().catch(err=>{console.error(err);const root=document.getElementById('root')||document.body;if(root)root.style.visibility='';const message=String(err&&err.message||err);root.innerHTML='<div style="font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:60px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px"><h2>Provedor Plus</h2><p>Não foi possível carregar o painel.</p><pre id="pp-startup-error" style="white-space:pre-wrap;color:#b91c1c"></pre><button id="pp-startup-retry">Tentar novamente</button></div>';const pre=root.querySelector('#pp-startup-error'),button=root.querySelector('#pp-startup-retry');if(pre)pre.textContent=message;if(button)button.addEventListener('click',()=>location.reload())});