(async()=>{
  window.__PROVEDOR_PLUS_CLOUD__=true;
  const BUILD_TOKEN='20260831-bankapi3';
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
  const installRouteIsolationGuard=()=>{
    if(window.__ProvedorPlusRouteIsolationGuardInstalled)return;
    window.__ProvedorPlusRouteIsolationGuardInstalled=true;
    const style=document.createElement('style');
    style.id='pp-route-isolation-style';
    style.textContent=`
      .content.pp-route-overlay-active{position:relative!important;overflow:auto!important;background:#f6f8f7!important}
      .content.pp-route-overlay-active::before{content:'Carregando...';position:absolute;inset:0;z-index:0;display:grid;place-items:center;color:#80908c;background:#f6f8f7;font:600 11px/1.4 Segoe UI,Arial,sans-serif}
      .content.pp-route-billing-active>:not(.pp-billing-auto-layer),
      .content.pp-route-ticket-active>:not(.pp-ticket-layer),
      .content.pp-route-staff-active>:not(.pp-staff-layer){display:none!important}
      .content.pp-route-billing-active>.pp-billing-auto-layer,
      .content.pp-route-ticket-active>.pp-ticket-layer,
      .content.pp-route-staff-active>.pp-staff-layer{display:block!important;visibility:visible!important;opacity:1!important;z-index:18!important}
    `;
    document.head.appendChild(style);

    const normalize=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    const routeClasses=['pp-route-overlay-active','pp-route-billing-active','pp-route-ticket-active','pp-route-staff-active'];
    const layerSelectors={billing:'.pp-billing-auto-layer',ticket:'.pp-ticket-layer',staff:'.pp-staff-layer'};
    let intentButton=null,intentAt=0,syncTimer=null,contentObserver=null,observedContent=null;

    const routeForButton=button=>{
      const label=normalize(button?.textContent);
      if(label.includes('mensalidade'))return'billing';
      if(label.includes('chamado'))return'ticket';
      if(label.includes('funcionario'))return'staff';
      if(label.includes('dashboard')||label.includes('visao geral'))return'dashboard';
      return'base';
    };
    const activeButton=()=>{
      const buttons=[...document.querySelectorAll('.sidebar nav button.active,aside nav button.active,nav button.active')];
      return buttons.find(button=>button.offsetParent!==null)||buttons[0]||null;
    };
    const intendedButton=()=>{
      const active=activeButton();
      if(intentButton?.isConnected&&Date.now()-intentAt<6000){
        if(active&&routeForButton(active)===routeForButton(intentButton))intentButton=null;
        else return intentButton;
      }
      return active;
    };
    const resolveContent=button=>{
      const shell=button?.closest('.app-shell')||document.querySelector('.app-shell');
      if(!shell)return document.querySelector('.content')||null;
      return [...shell.children].find(el=>el.classList?.contains('content'))||shell.querySelector('.content')||null;
    };
    const resetContents=()=>{for(const content of document.querySelectorAll('.content'))content.classList.remove(...routeClasses)};
    const resetDashboard=except=>{
      for(const host of document.querySelectorAll('.page-wrap.pp-dashboard-host'))if(host!==except)host.classList.remove('pp-dashboard-host');
      if(!except)document.querySelectorAll('.pp-pppoe-modal-layer').forEach(node=>node.remove());
    };
    const closeForeignEditors=route=>{
      if(route!=='ticket')document.querySelectorAll('.pp-ticket-modal-layer').forEach(node=>node.remove());
      if(route!=='staff')document.querySelectorAll('.pp-staff-modal-layer').forEach(node=>node.remove());
      if(route!=='dashboard')document.querySelectorAll('.pp-pppoe-modal-layer').forEach(node=>node.remove());
    };
    const setLayerState=(route,content)=>{
      for(const [key,selector] of Object.entries(layerSelectors)){
        const nodes=[...document.querySelectorAll(selector)].filter(node=>node.isConnected);
        if(key!==route){nodes.forEach(node=>node.style.setProperty('display','none','important'));continue}
        const current=nodes[nodes.length-1]||null;
        for(const duplicate of nodes.slice(0,-1))duplicate.remove();
        if(current){current.style.removeProperty('display');if(content&&current.parentElement!==content)content.appendChild(current)}
      }
    };
    const observeContent=content=>{
      if(observedContent===content)return;
      contentObserver?.disconnect();contentObserver=null;observedContent=content||null;
      if(!content)return;
      contentObserver=new MutationObserver(()=>schedule());
      contentObserver.observe(content,{childList:true});
    };
    const sync=()=>{
      const button=intendedButton(),route=routeForButton(button),content=resolveContent(button);
      resetContents();closeForeignEditors(route);observeContent(content);
      if(route==='dashboard'){
        setLayerState('dashboard',content);
        const pageWrap=content?.querySelector(':scope > .page-wrap')||content?.querySelector('.page-wrap')||null;
        resetDashboard(pageWrap);if(pageWrap)pageWrap.classList.add('pp-dashboard-host');return;
      }
      resetDashboard(null);
      if(route==='billing'||route==='ticket'||route==='staff'){
        setLayerState(route,content);
        if(content){content.classList.add('pp-route-overlay-active');content.classList.add(route==='billing'?'pp-route-billing-active':route==='ticket'?'pp-route-ticket-active':'pp-route-staff-active')}
        return;
      }
      setLayerState('base',content);
    };
    function schedule(){clearTimeout(syncTimer);syncTimer=setTimeout(sync,20);setTimeout(sync,90);setTimeout(sync,220);setTimeout(sync,600)}
    const navs=[...new Set(document.querySelectorAll('.sidebar nav,aside nav,nav'))];
    for(const nav of navs){const observer=new MutationObserver(schedule);observer.observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}
    document.addEventListener('click',event=>{const button=event.target.closest?.('.sidebar nav button,aside nav button,nav button');if(!button)return;intentButton=button;intentAt=Date.now();schedule()},true);
    schedule();
  };

  const installNewPlansModule=()=>{
    if(window.__ProvedorPlusNewPlansInstalled)return;
    window.__ProvedorPlusNewPlansInstalled=true;
    window.__ProvedorPlusPlanManagementInstalled=true;
    const KEY='provedor_plus_web_1_0_17';
    const norm=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    const money=cents=>Number(cents||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    let opened=false,navButton=null,layer=null,modal=null,selected=new Set();
    const getState=()=>window.ProvedorPlusCloudState?.getState?.()||{};
    const saveState=async state=>{localStorage.setItem(KEY,JSON.stringify(state));if(window.ProvedorPlusCloudState?.forceSync)await window.ProvedorPlusCloudState.forceSync()};
    const active=plan=>plan?.active!==false&&plan?.enabled!==false;
    const planName=plan=>String(plan?.name||plan?.title||'Plano').trim();
    const planCents=plan=>{const c=Number(plan?.price_cents??plan?.value_cents);if(Number.isFinite(c))return Math.round(c);const v=Number(plan?.price??plan?.amount);return Number.isFinite(v)?Math.round(v*100):0};
    const speedMbps=plan=>{const direct=Number(plan?.download_mbps??plan?.download);if(Number.isFinite(direct)&&direct>0)return Math.round(direct);const raw=String(plan?.speed||plan?.bandwidth||'').toLowerCase().replace(',','.');const n=Number((raw.match(/[\d.]+/)||[])[0]);if(!Number.isFinite(n))return 0;return /giga|gb/.test(raw)?Math.round(n*1000):Math.round(n)};
    const uploadMbps=plan=>{const n=Number(plan?.upload_mbps??plan?.upload);return Number.isFinite(n)?Math.round(n):0};
    const speedLabel=mbps=>mbps>=1000&&mbps%1000===0?`${mbps/1000} GIGA`:`${mbps} MEGA`;
    const profileName=plan=>String(plan?.profile_name||plan?.profile||plan?.access_profile||plan?.mikrotik_profile||'').trim();
    const readClients=async()=>{try{const rows=await window.provedor?.clients?.list?.();if(Array.isArray(rows))return rows}catch(error){console.error('Provedor Plus: falha ao consultar clientes para Planos.',error)}return Array.isArray(getState()?.clients)?getState().clients:[]};
    const clientPlanId=client=>Number(client?.plan_id??client?.planId??client?.plan?.id)||0;
    const clientPlanName=client=>norm(client?.plan_name??client?.planName??client?.plan?.name??client?.plan??'');
    const usage=(plan,clients)=>{const id=Number(plan?.id)||0,name=norm(planName(plan));return (clients||[]).filter(client=>{const cid=clientPlanId(client);if(id&&cid)return id===cid;return Boolean(name&&clientPlanName(client)===name)}).length};
    const contentFor=button=>{const shell=button?.closest('.app-shell')||document.querySelector('.app-shell');return shell?.querySelector(':scope > .content')||shell?.querySelector('.content')||document.querySelector('.content')};

    function ensureStyle(){
      if(document.getElementById('pp-new-plans-style'))return;
      const style=document.createElement('style');style.id='pp-new-plans-style';style.textContent=`
        .content.pp-new-plans-active{position:relative!important;overflow:auto!important;background:#f4f7f6!important}
        .content.pp-new-plans-active>:not(.pp-new-plans-layer){display:none!important}
        .pp-new-plans-layer{display:none;min-height:100%;padding:30px 28px 44px;background:linear-gradient(180deg,#f7faf9 0,#f2f6f5 100%);box-sizing:border-box;color:#173c35;font-family:Segoe UI,Arial,sans-serif}
        .content.pp-new-plans-active>.pp-new-plans-layer{display:block!important}
        .ppnp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.ppnp-eyebrow{font-size:10px;font-weight:850;letter-spacing:.14em;color:#0b8f7c;text-transform:uppercase}.ppnp-head h1{margin:6px 0 5px;font-size:30px;line-height:1.05;color:#143c35}.ppnp-head p{margin:0;color:#6d807b;font-size:12px}.ppnp-primary{height:40px;padding:0 16px;border:0;border-radius:10px;background:#0b8f7c;color:white;font-weight:800;cursor:pointer}.ppnp-primary:hover{background:#087766}
        .ppnp-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}.ppnp-stat{padding:15px 16px;background:#fff;border:1px solid #dde8e5;border-radius:13px;box-shadow:0 3px 14px rgba(30,74,64,.04)}.ppnp-stat small{display:block;color:#7b8c88;font-size:10px}.ppnp-stat strong{display:block;margin-top:5px;font-size:23px;color:#173f37}
        .ppnp-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:11px 12px;background:#fff;border:1px solid #dde8e5;border-radius:12px}.ppnp-toolbar-left,.ppnp-toolbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ppnp-toolbar button{height:34px;padding:0 11px;border:1px solid #d8e5e1;border-radius:8px;background:#fff;color:#536963;font-size:10px;font-weight:800;cursor:pointer}.ppnp-toolbar button[data-ppnp-save]{background:#eaf7f3;border-color:#bce3d9;color:#087766}.ppnp-toolbar button[data-ppnp-delete]{color:#b44b45;border-color:#edc8c4;background:#fff9f8}.ppnp-toolbar span{font-size:10px;color:#758681}
        .ppnp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:14px}.ppnp-card{position:relative;display:flex;flex-direction:column;min-height:300px;padding:17px;background:#fff;border:1px solid #dbe7e4;border-radius:15px;box-shadow:0 4px 16px rgba(28,70,61,.045);box-sizing:border-box}.ppnp-card.is-top{border-color:#57bca9;box-shadow:0 5px 20px rgba(11,143,124,.10)}.ppnp-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.ppnp-speed{display:inline-flex;padding:6px 9px;border-radius:8px;background:#e8f7f3;color:#087766;font-size:11px;font-weight:900}.ppnp-status{font-size:9px;font-weight:850;padding:5px 7px;border-radius:20px;background:#eef3f2;color:#6b7e79}.ppnp-status.on{background:#e6f7ef;color:#11845f}.ppnp-card h2{margin:15px 0 5px;font-size:17px;color:#153d35}.ppnp-price{font-size:25px;font-weight:900;color:#103830}.ppnp-price small{font-size:10px;font-weight:600;color:#758680}.ppnp-lines{display:grid;gap:8px;margin:15px 0;padding:13px 0;border-top:1px solid #edf2f1;border-bottom:1px solid #edf2f1}.ppnp-lines div{font-size:11px;color:#526963}.ppnp-lines b{color:#1b463e}.ppnp-flags{display:grid;gap:8px;margin-bottom:13px}.ppnp-check{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:750;color:#526963}.ppnp-check.portal{color:#087766}.ppnp-check input{accent-color:#0b8f7c}.ppnp-actions{display:flex;gap:7px;margin-top:auto}.ppnp-actions button{flex:1;height:36px;border:1px solid #d9e5e2;border-radius:8px;background:#fff;color:#4f655f;font-size:10px;font-weight:800;cursor:pointer}.ppnp-actions button.danger{color:#b24e48;border-color:#ebc7c3;background:#fff9f8}.ppnp-badge{position:absolute;top:-1px;right:17px;padding:6px 10px;border-radius:0 0 8px 8px;background:#0b8f7c;color:#fff;font-size:8px;font-weight:900;letter-spacing:.04em}.ppnp-empty{grid-column:1/-1;padding:50px 20px;text-align:center;background:#fff;border:1px dashed #cadbd7;border-radius:14px;color:#788a85}
        .ppnp-modal{position:fixed;inset:0;z-index:10030;display:grid;place-items:center;padding:20px;background:rgba(11,31,27,.54)}.ppnp-modal-card{width:min(590px,96vw);max-height:90vh;overflow:auto;padding:22px;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.24)}.ppnp-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.ppnp-modal-head h3{margin:0;color:#173f37;font-size:20px}.ppnp-x{border:0;background:#eef4f2;border-radius:8px;width:34px;height:34px;cursor:pointer}.ppnp-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ppnp-form label{display:grid;gap:5px;color:#60746e;font-size:10px;font-weight:750}.ppnp-form label.full{grid-column:1/-1}.ppnp-form input{height:39px;padding:0 10px;border:1px solid #d8e4e1;border-radius:8px;font:12px Segoe UI,Arial}.ppnp-switches{grid-column:1/-1;display:flex;gap:18px;padding:10px 0}.ppnp-switches label{display:flex;align-items:center;gap:7px}.ppnp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.ppnp-modal-actions button{height:38px;padding:0 14px;border-radius:8px;border:1px solid #d7e3e0;background:#fff;font-weight:800;cursor:pointer}.ppnp-modal-actions button.primary{border-color:#0b8f7c;background:#0b8f7c;color:#fff}
        @media(max-width:760px){.pp-new-plans-layer{padding:20px 14px 35px}.ppnp-head{flex-direction:column}.ppnp-stats{grid-template-columns:1fr}.ppnp-toolbar{align-items:stretch;flex-direction:column}.ppnp-form{grid-template-columns:1fr}.ppnp-form label.full,.ppnp-switches{grid-column:1}.ppnp-switches{flex-direction:column;gap:8px}}
      `;document.head.appendChild(style);
    }

    function closeModal(){modal?.remove();modal=null}
    async function openEditor(index=null){
      closeModal();const state=getState(),plans=Array.isArray(state.plans)?state.plans:[],plan=index===null?null:plans[index];
      const down=plan?speedMbps(plan):0,up=plan?uploadMbps(plan):0,price=plan?planCents(plan)/100:0,profile=plan?profileName(plan):'';
      modal=document.createElement('div');modal.className='ppnp-modal';modal.innerHTML=`<div class="ppnp-modal-card"><div class="ppnp-modal-head"><h3>${plan?'Editar plano':'Novo plano'}</h3><button class="ppnp-x" type="button" data-close>×</button></div><form class="ppnp-form"><label class="full">Nome do plano<input name="name" required value="${esc(planName(plan||{}))}"></label><label>Download (Mbps)<input name="download" type="number" min="1" required value="${down||''}"></label><label>Upload (Mbps)<input name="upload" type="number" min="0" value="${up||''}"></label><label>Mensalidade (R$)<input name="price" type="number" min="0.01" step="0.01" required value="${price||''}"></label><label>Perfil de acesso / MikroTik<input name="profile" value="${esc(profile)}"></label><div class="ppnp-switches"><label><input name="active" type="checkbox" ${!plan||active(plan)?'checked':''}> Plano ativo</label><label><input name="portal" type="checkbox" ${plan?.portal_visible===true?'checked':''}> Mostrar na Área do Cliente</label></div></form><div class="ppnp-modal-actions"><button type="button" data-close>Cancelar</button><button type="button" class="primary" data-save>Salvar plano</button></div></div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click',async event=>{
        if(event.target===modal||event.target.closest('[data-close]')){closeModal();return}
        if(!event.target.closest('[data-save]'))return;
        const form=modal.querySelector('form'),data=new FormData(form),name=String(data.get('name')||'').trim(),download=Math.round(Number(data.get('download'))||0),upload=Math.round(Number(data.get('upload'))||0),value=Number(data.get('price'))||0,profileValue=String(data.get('profile')||'').trim();
        if(!name||download<=0||value<=0){window.alert('Informe nome, download e mensalidade do plano.');return}
        const cents=Math.round(value*100),isActive=Boolean(form.elements.active.checked),portal=Boolean(form.elements.portal.checked),next=[...plans];
        let id=plan?.id;const numericIds=plans.map(item=>Number(item?.id)||0);let seq=Number(state?.seq?.plans)||0;
        if(index===null){id=Math.max(seq,...numericIds,0)+1;seq=Number(id)||seq+1}
        const base=plan||{};
        const nextPlan={...base,id,name,title:name,download_mbps:download,download,upload_mbps:upload,upload,speed:speedLabel(download),bandwidth:speedLabel(download),price_cents:cents,value_cents:cents,price:value,amount:value,profile:profileValue,profile_name:profileValue,active:isActive,enabled:isActive,portal_visible:portal,updated_at:new Date().toISOString()};
        if(index===null){nextPlan.created_at=new Date().toISOString();nextPlan.featured=false;next.push(nextPlan)}else next[index]=nextPlan;
        await saveState({...state,plans:next,seq:{...(state.seq||{}),plans:Math.max(seq,Number(id)||0)}});closeModal();await render();
      });
    }

    function ensureLayer(button){ensureStyle();const content=contentFor(button);if(!content)return null;layer=content.querySelector(':scope > .pp-new-plans-layer')||layer;if(!layer||!layer.isConnected){layer=document.createElement('section');layer.className='pp-new-plans-layer';content.appendChild(layer)}return {content,layer}}
    async function render(){
      if(!opened||!navButton)return;const ready=ensureLayer(navButton);if(!ready)return;
      const state=getState(),plans=Array.isArray(state.plans)?state.plans:[],clients=await readClients(),counts=plans.map(plan=>usage(plan,clients)),activeCount=plans.filter(active).length,portalCount=plans.filter(plan=>active(plan)&&plan?.portal_visible===true).length,maxUse=Math.max(0,...counts);
      const cards=plans.map((plan,index)=>{const down=speedMbps(plan),up=uploadMbps(plan),count=counts[index],isTop=maxUse>0&&count===maxUse&&active(plan),checked=selected.has(index);return `<article class="ppnp-card ${isTop?'is-top':''}" data-index="${index}">${isTop?'<span class="ppnp-badge">MAIS CONTRATADO</span>':''}<div class="ppnp-top"><span class="ppnp-speed">${esc(speedLabel(down||0))}</span><span class="ppnp-status ${active(plan)?'on':''}">${active(plan)?'ATIVO':'INATIVO'}</span></div><h2>${esc(planName(plan))}</h2><div class="ppnp-price">${money(planCents(plan))}<small>/mês</small></div><div class="ppnp-lines"><div>↓ Download <b>${down||0} Mbps</b></div><div>↑ Upload <b>${up||0} Mbps</b></div><div>Perfil <b>${esc(profileName(plan)||'Não configurado')}</b></div><div>Clientes vinculados <b>${count}</b></div></div><div class="ppnp-flags"><label class="ppnp-check portal"><input type="checkbox" data-portal ${plan?.portal_visible===true?'checked':''}> Área do Cliente</label><label class="ppnp-check"><input type="checkbox" data-select ${checked?'checked':''}> Selecionar para excluir</label></div><div class="ppnp-actions"><button type="button" data-edit>Editar</button><button type="button" class="${active(plan)?'danger':''}" data-toggle>${active(plan)?'Desativar':'Ativar'}</button></div></article>`}).join('');
      ready.layer.innerHTML=`<div class="ppnp-head"><div><div class="ppnp-eyebrow">Gestão comercial</div><h1>Planos & Ofertas</h1><p>Cadastre seus planos e escolha exatamente quais ofertas aparecem na Área do Cliente.</p></div><button type="button" class="ppnp-primary" data-new>+ Novo plano</button></div><div class="ppnp-stats"><div class="ppnp-stat"><small>Planos cadastrados</small><strong>${plans.length}</strong></div><div class="ppnp-stat"><small>Planos ativos</small><strong>${activeCount}</strong></div><div class="ppnp-stat"><small>Na Área do Cliente</small><strong>${portalCount}</strong></div></div><div class="ppnp-toolbar"><div class="ppnp-toolbar-left"><button type="button" data-select-all>Selecionar todos</button><span>${selected.size?`${selected.size} selecionado${selected.size===1?'':'s'}`:'Nenhum selecionado'}</span></div><div class="ppnp-toolbar-right"><button type="button" data-ppnp-delete>Excluir selecionados</button><button type="button" data-ppnp-save>Salvar Área do Cliente</button></div></div><div class="ppnp-grid">${cards||'<div class="ppnp-empty">Nenhum plano cadastrado. Clique em “Novo plano” para começar.</div>'}</div>`;
      ready.layer.onclick=async event=>{
        if(event.target.closest('[data-new]')){openEditor(null);return}
        const card=event.target.closest('.ppnp-card'),index=Number(card?.dataset.index);
        if(event.target.closest('[data-edit]')){openEditor(index);return}
        if(event.target.closest('[data-toggle]')){const latest=getState(),rows=Array.isArray(latest.plans)?[...latest.plans]:[],plan=rows[index];if(!plan)return;const value=!active(plan);rows[index]={...plan,active:value,enabled:value,portal_visible:value?plan.portal_visible:false,updated_at:new Date().toISOString()};await saveState({...latest,plans:rows});await render();return}
        if(event.target.matches('[data-select]')){event.target.checked?selected.add(index):selected.delete(index);await render();return}
        if(event.target.closest('[data-select-all]')){selected=selected.size===plans.length?new Set():new Set(plans.map((_,i)=>i));await render();return}
        if(event.target.closest('[data-ppnp-save]')){const latest=getState(),rows=Array.isArray(latest.plans)?latest.plans:[],visible=new Set([...ready.layer.querySelectorAll('.ppnp-card')].filter(card=>card.querySelector('[data-portal]')?.checked).map(card=>Number(card.dataset.index))),next=rows.map((plan,i)=>({...plan,portal_visible:active(plan)&&visible.has(i)}));await saveState({...latest,plans:next});window.alert('Área do Cliente atualizada. Somente os planos marcados serão exibidos como oferta.');await render();return}
        if(event.target.closest('[data-ppnp-delete]')){if(!selected.size){window.alert('Selecione pelo menos um plano para excluir.');return}const latest=getState(),rows=Array.isArray(latest.plans)?latest.plans:[],currentClients=await readClients(),allowed=[],blocked=[];for(const i of selected){const plan=rows[i];if(!plan)continue;(usage(plan,currentClients)>0?blocked:allowed).push(i)}if(!allowed.length){window.alert('Os planos selecionados estão vinculados a clientes e não podem ser excluídos.');return}const note=blocked.length?`\n\n${blocked.length} plano(s) em uso serão preservados.`:'';if(!window.confirm(`Excluir ${allowed.length} plano(s)?${note}`))return;const remove=new Set(allowed);await saveState({...latest,plans:rows.filter((_,i)=>!remove.has(i))});selected=new Set();await render();return}
      };
    }

    function closePlans(){opened=false;selected=new Set();closeModal();document.querySelectorAll('.content.pp-new-plans-active').forEach(content=>content.classList.remove('pp-new-plans-active'));if(navButton)navButton.classList.remove('active')}
    function openPlans(button=navButton){if(!button)return;opened=true;navButton=button;const ready=ensureLayer(button);if(!ready)return;button.closest('nav')?.querySelectorAll('button.active').forEach(item=>{if(item!==button)item.classList.remove('active')});button.classList.add('active');ready.content.classList.add('pp-new-plans-active');render().catch(error=>{console.error(error);window.alert('Não foi possível carregar os planos.')})}
    function ensureNav(){
      const nav=document.querySelector('.sidebar nav')||document.querySelector('aside nav');if(!nav)return;
      const originals=[...nav.querySelectorAll('button')].filter(button=>!button.dataset.ppNewPlansNav&&norm(button.textContent)==='planos');let custom=nav.querySelector('button[data-pp-new-plans-nav]');const wasActive=originals.some(button=>button.classList.contains('active'));
      if(!custom){custom=document.createElement('button');custom.type='button';custom.dataset.ppNewPlansNav='1';const original=originals[0];custom.className=String(original?.className||'');custom.innerHTML=original?.innerHTML||'<span>▤</span><span>Planos</span>';custom.title='Planos & Ofertas';const anchor=original||[...nav.querySelectorAll('button')].find(button=>norm(button.textContent)==='estoque');if(anchor)nav.insertBefore(custom,anchor);else nav.appendChild(custom)}
      originals.forEach(button=>button.remove());navButton=custom;if(opened){custom.classList.add('active');const ready=ensureLayer(custom);ready?.content.classList.add('pp-new-plans-active')}if(wasActive&&!opened)setTimeout(()=>openPlans(custom),0);
    }
    ensureStyle();ensureNav();const sidebar=document.querySelector('.sidebar')||document.querySelector('aside');if(sidebar){const observer=new MutationObserver(()=>ensureNav());observer.observe(sidebar,{childList:true,subtree:true})}
    document.addEventListener('click',event=>{const button=event.target.closest?.('.sidebar nav button,aside nav button');if(!button)return;if(button.dataset.ppNewPlansNav){event.preventDefault();event.stopImmediatePropagation();openPlans(button);return}if(norm(button.textContent)==='planos'){event.preventDefault();event.stopImmediatePropagation();ensureNav();openPlans(navButton);return}if(opened)closePlans()},true);
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

  if(window.provedor?.app?.info){window.provedor.app.info=async()=>({version:'1.0.17',platform:'web-cloud',databasePath:'Neon PostgreSQL (nuvem)',currentUser:auth?.user?.name||'Administrador',connector:{connected:true,mode:'cloud-rest'},paymentPortal:null})}

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
  await loadScript('/dashboard-transition-guard.js?v=20260831-bankapi3').catch(error=>console.error('Provedor Plus: a proteção de transição do Dashboard não foi carregada.',error));

  const root=document.getElementById('root');
  if(root)root.style.visibility='hidden';
  const appB64=await read(Array.from({length:33},(_,i)=>`/packed/appgz-${String(i+1).padStart(2,'0')}.txt`));
  const app=await gunzipB64(appB64),appUrl=URL.createObjectURL(new Blob([app],{type:'text/javascript'}));
  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}

  installNewPlansModule();
  await loadScript('/ui-runtime-fixes.js?v=1017-fix18-plans-observer');
  await loadScriptStable('/dashboard-enhancements.js?v=1017-dashboard1',{dropCharacterData:true,observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-v2','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-new-plans-layer']}).catch(error=>console.error('Provedor Plus: o Dashboard gerencial não foi carregado.',error));
  await loadScriptStable('/billing-bank-selector.js?v=1017-billingbank3',{ignoreWithin:['.pp-dashboard-v2','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.pp-new-plans-layer']}).catch(error=>console.error('Provedor Plus: a seleção do banco emissor não foi carregada.',error));
  await loadScript('/billing-automation.js?v=1017-billingauto1').catch(error=>console.error('Provedor Plus: a automação de mensalidades não foi carregada.',error));
  await loadScriptStable('/staff-access.js?v=1017-staff1',{observerTargetSelector:'.sidebar',ignoreWithin:['.pp-dashboard-v2','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.pp-new-plans-layer']}).catch(error=>console.error('Provedor Plus: a gestão de funcionários não foi carregada.',error));
  await loadScriptStable('/ticket-enhancements.js?v=1017-ticket1',{observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-v2','.client-status-modal','.pp-staff-layer','.pp-ticket-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.pp-new-plans-layer']}).catch(error=>console.error('Provedor Plus: a gestão avançada de chamados não foi carregada.',error));
  installRouteIsolationGuard();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(typeof window.ProvedorPlusPatchClientViewButtons==='function')window.ProvedorPlusPatchClientViewButtons();
  if(root)root.style.visibility='';
})().catch(err=>{console.error(err);const root=document.getElementById('root')||document.body;if(root)root.style.visibility='';const message=String(err&&err.message||err);root.innerHTML='<div style="font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:60px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px"><h2>Provedor Plus</h2><p>Não foi possível carregar o painel.</p><pre id="pp-startup-error" style="white-space:pre-wrap;color:#b91c1c"></pre><button id="pp-startup-retry">Tentar novamente</button></div>';const pre=root.querySelector('#pp-startup-error'),button=root.querySelector('#pp-startup-retry');if(pre)pre.textContent=message;if(button)button.addEventListener('click',()=>location.reload())});