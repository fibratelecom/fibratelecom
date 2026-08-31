(()=>{
  if(window.__ProvedorPlusPlansCloudFileInstalled)return;
  window.__ProvedorPlusPlansCloudFileInstalled=true;
  window.__ProvedorPlusNewPlansInstalled=true;
  window.__ProvedorPlusPlanManagementInstalled=true;

  const KEY='provedor_plus_web_1_0_17';
  const norm=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const isPlansLabel=value=>norm(value).includes('planos');
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const money=cents=>(Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let navButton=null,layer=null,modal=null,opened=false,selected=new Set(),navObserver=null;

  const getState=()=>{
    const cloud=window.ProvedorPlusCloudState?.getState?.();
    if(cloud&&typeof cloud==='object')return cloud;
    try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return {}}
  };
  const saveState=async state=>{
    localStorage.setItem(KEY,JSON.stringify(state));
    if(window.ProvedorPlusCloudState?.forceSync)await window.ProvedorPlusCloudState.forceSync();
  };
  const active=plan=>plan?.active!==false&&plan?.enabled!==false;
  const planName=plan=>String(plan?.name||plan?.title||'Plano').trim();
  const planCents=plan=>{
    const cents=Number(plan?.price_cents??plan?.value_cents);
    if(Number.isFinite(cents))return Math.round(cents);
    const value=Number(plan?.price??plan?.amount);
    return Number.isFinite(value)?Math.round(value*100):0;
  };
  const speedMbps=plan=>{
    const direct=Number(plan?.download_mbps??plan?.download);
    if(Number.isFinite(direct)&&direct>0)return Math.round(direct);
    const raw=String(plan?.speed||plan?.bandwidth||'').toLowerCase().replace(',','.');
    const n=Number((raw.match(/[\d.]+/)||[])[0]);
    if(!Number.isFinite(n))return 0;
    return /giga|gb/.test(raw)?Math.round(n*1000):Math.round(n);
  };
  const uploadMbps=plan=>{
    const value=Number(plan?.upload_mbps??plan?.upload);
    if(Number.isFinite(value)&&value>=0)return Math.round(value);
    const match=String(plan?.description||'').match(/upload\s*[:\-]?\s*([\d.,]+)\s*(giga|gb|mega|mbps)?/i);
    if(!match)return 0;
    const parsed=Number(String(match[1]).replace(',','.'));
    if(!Number.isFinite(parsed))return 0;
    return /giga|gb/i.test(match[2]||'')?Math.round(parsed*1000):Math.round(parsed);
  };
  const decimalFromPt=value=>{
    const raw=String(value??'').replace(/R\$/gi,'').replace(/\s+/g,'').trim();
    if(!raw)return NaN;
    const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
    return Number(normalized);
  };
  const installationCents=plan=>{
    const cents=Number(plan?.installation_fee_cents??plan?.install_fee_cents??plan?.installationFeeCents);
    if(Number.isFinite(cents)&&cents>=0)return Math.round(cents);
    const value=Number(plan?.installation_fee??plan?.install_fee??plan?.installationFee);
    if(Number.isFinite(value)&&value>=0)return Math.round(value*100);
    const match=String(plan?.description||'').match(/instala(?:ção|cao)\s*(?:R\$\s*)?([\d.,]+)/i);
    const parsed=match?decimalFromPt(match[1]):NaN;
    return Number.isFinite(parsed)&&parsed>=0?Math.round(parsed*100):7990;
  };
  const speedLabel=mbps=>mbps>=1000&&mbps%1000===0?`${mbps/1000} GIGA`:`${mbps} MEGA`;
  const profileName=plan=>String(plan?.profile_name||plan?.profile||plan?.access_profile||plan?.mikrotik_profile||'').trim();
  const cleanPortalDescription=value=>String(value||'').split('·').map(part=>part.trim()).filter(part=>part&&!/^upload\s+[\d.,]+\s*(?:giga|gb|mega|mbps)?$/i.test(part)&&!/^instala(?:ção|cao)\s*(?:R\$\s*)?[\d.,]+$/i.test(part)).join(' · ');
  const portalDescription=plan=>[cleanPortalDescription(plan?.description),`Upload ${uploadMbps(plan)} Mbps`,`Instalação ${money(installationCents(plan))}`].filter(Boolean).join(' · ');
  const normalizePortalPlan=plan=>({
    ...plan,
    download_mbps:speedMbps(plan),
    download:speedMbps(plan),
    upload_mbps:uploadMbps(plan),
    upload:uploadMbps(plan),
    installation_fee_cents:installationCents(plan),
    installationFeeCents:installationCents(plan),
    installation_fee:installationCents(plan)/100,
    installationFee:installationCents(plan)/100,
    description:portalDescription(plan)
  });
  const clientPlanId=client=>Number(client?.plan_id??client?.planId??client?.plan?.id)||0;
  const clientPlanName=client=>norm(client?.plan_name??client?.planName??client?.plan?.name??client?.plan??'');
  const readClients=async()=>{
    try{const rows=await window.provedor?.clients?.list?.();if(Array.isArray(rows))return rows}catch(error){console.error('Provedor Plus: falha ao consultar clientes dos planos.',error)}
    const state=getState();return Array.isArray(state?.clients)?state.clients:[];
  };
  const usage=(plan,clients)=>{
    const id=Number(plan?.id)||0,name=norm(planName(plan));
    return (Array.isArray(clients)?clients:[]).filter(client=>{
      const cid=clientPlanId(client);
      if(id&&cid)return id===cid;
      return Boolean(name&&clientPlanName(client)===name);
    }).length;
  };
  const sidebarNav=()=>document.querySelector('.sidebar nav')||document.querySelector('aside nav')||null;
  const contentFor=button=>{
    const shell=button?.closest('.app-shell')||document.querySelector('.app-shell');
    return shell?.querySelector(':scope > .content')||shell?.querySelector('.content')||document.querySelector('.content')||null;
  };

  function ensureStyle(){
    if(document.getElementById('pp-plans-cloud-style'))return;
    const style=document.createElement('style');style.id='pp-plans-cloud-style';style.textContent=`
      .content.pp-plans-cloud-active{position:relative!important;overflow:auto!important;background:#f4f7f6!important}
      .content.pp-plans-cloud-active>:not(.pp-plans-cloud-layer){display:none!important}
      .pp-plans-cloud-layer{display:none;min-height:100%;padding:28px 28px 44px;background:linear-gradient(180deg,#f7faf9 0,#f2f6f5 100%);box-sizing:border-box;color:#173c35;font-family:Segoe UI,Arial,sans-serif}
      .content.pp-plans-cloud-active>.pp-plans-cloud-layer{display:block!important}
      .pppc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:20px}.pppc-head h1{margin:4px 0 5px;font-size:30px;line-height:1.05;color:#143c35}.pppc-head p{margin:0;color:#6d807b;font-size:12px}.pppc-eyebrow{font-size:10px;font-weight:850;letter-spacing:.14em;color:#0b8f7c;text-transform:uppercase}.pppc-primary{height:40px;padding:0 16px;border:0;border-radius:10px;background:#0b8f7c;color:white;font-weight:800;cursor:pointer}.pppc-primary:hover{background:#087766}
      .pppc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}.pppc-stat{padding:15px 16px;background:#fff;border:1px solid #dde8e5;border-radius:13px;box-shadow:0 3px 14px rgba(30,74,64,.04)}.pppc-stat small{display:block;color:#7b8c88;font-size:10px}.pppc-stat strong{display:block;margin-top:5px;font-size:23px;color:#173f37}
      .pppc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:11px 12px;background:#fff;border:1px solid #dde8e5;border-radius:12px}.pppc-toolbar-left,.pppc-toolbar-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pppc-toolbar button{height:34px;padding:0 11px;border:1px solid #d8e5e1;border-radius:8px;background:#fff;color:#536963;font-size:10px;font-weight:800;cursor:pointer}.pppc-toolbar button[data-save-portal]{background:#eaf7f3;border-color:#bce3d9;color:#087766}.pppc-toolbar button[data-delete-selected]{color:#b44b45;border-color:#edc8c4;background:#fff9f8}.pppc-toolbar span{font-size:10px;color:#758681}
      .pppc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:14px}.pppc-card{position:relative;display:flex;flex-direction:column;min-height:300px;padding:17px;background:#fff;border:1px solid #dbe7e4;border-radius:15px;box-shadow:0 4px 16px rgba(28,70,61,.045);box-sizing:border-box}.pppc-card.is-top{border-color:#57bca9;box-shadow:0 5px 20px rgba(11,143,124,.10)}.pppc-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.pppc-speed{display:inline-flex;padding:6px 9px;border-radius:8px;background:#e8f7f3;color:#087766;font-size:11px;font-weight:900}.pppc-status{font-size:9px;font-weight:850;padding:5px 7px;border-radius:20px;background:#eef3f2;color:#6b7e79}.pppc-status.on{background:#e6f7ef;color:#11845f}.pppc-card h2{margin:15px 0 5px;font-size:17px;color:#153d35}.pppc-price{font-size:25px;font-weight:900;color:#103830}.pppc-price small{font-size:10px;font-weight:600;color:#758680}.pppc-lines{display:grid;gap:8px;margin:15px 0;padding:13px 0;border-top:1px solid #edf2f1;border-bottom:1px solid #edf2f1}.pppc-lines div{font-size:11px;color:#526963}.pppc-lines b{color:#1b463e}.pppc-flags{display:grid;gap:8px;margin-bottom:13px}.pppc-check{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:750;color:#526963}.pppc-check.portal{color:#087766}.pppc-check input{accent-color:#0b8f7c}.pppc-actions{display:flex;gap:7px;margin-top:auto}.pppc-actions button{flex:1;height:36px;border:1px solid #d9e5e2;border-radius:8px;background:#fff;color:#4f655f;font-size:10px;font-weight:800;cursor:pointer}.pppc-actions button.danger{color:#b24e48;border-color:#ebc7c3;background:#fff9f8}.pppc-badge{position:absolute;top:-1px;right:17px;padding:6px 10px;border-radius:0 0 8px 8px;background:#0b8f7c;color:#fff;font-size:8px;font-weight:900;letter-spacing:.04em}.pppc-empty{grid-column:1/-1;padding:50px 20px;text-align:center;background:#fff;border:1px dashed #cadbd7;border-radius:14px;color:#788a85}
      .pppc-modal{position:fixed;inset:0;z-index:10030;display:grid;place-items:center;padding:20px;background:rgba(11,31,27,.54)}.pppc-modal-card{width:min(590px,96vw);max-height:90vh;overflow:auto;padding:22px;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.24)}.pppc-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.pppc-modal-head h3{margin:0;color:#173f37;font-size:20px}.pppc-x{border:0;background:#eef4f2;border-radius:8px;width:34px;height:34px;cursor:pointer}.pppc-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pppc-form label{display:grid;gap:5px;color:#60746e;font-size:10px;font-weight:750}.pppc-form label.full{grid-column:1/-1}.pppc-form input{height:39px;padding:0 10px;border:1px solid #d8e4e1;border-radius:8px;font:12px Segoe UI,Arial}.pppc-switches{grid-column:1/-1;display:flex;gap:18px;padding:10px 0}.pppc-switches label{display:flex;align-items:center;gap:7px}.pppc-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.pppc-modal-actions button{height:38px;padding:0 14px;border-radius:8px;border:1px solid #d7e3e0;background:#fff;font-weight:800;cursor:pointer}.pppc-modal-actions button.primary{border-color:#0b8f7c;background:#0b8f7c;color:#fff}
      @media(max-width:760px){.pp-plans-cloud-layer{padding:20px 14px 35px}.pppc-head{flex-direction:column}.pppc-stats{grid-template-columns:1fr}.pppc-toolbar{align-items:stretch;flex-direction:column}.pppc-form{grid-template-columns:1fr}.pppc-form label.full,.pppc-switches{grid-column:1}.pppc-switches{flex-direction:column;gap:8px}}
    `;document.head.appendChild(style);
  }

  function closeModal(){modal?.remove();modal=null}
  function closePlans(){opened=false;selected=new Set();closeModal();document.querySelectorAll('.content.pp-plans-cloud-active').forEach(node=>node.classList.remove('pp-plans-cloud-active'));navButton?.classList.remove('active')}

  function ensureLayer(button){
    ensureStyle();const content=contentFor(button);if(!content)return null;
    layer=content.querySelector(':scope > .pp-plans-cloud-layer')||layer;
    if(!layer||!layer.isConnected){layer=document.createElement('section');layer.className='pp-plans-cloud-layer';content.appendChild(layer)}
    return {content,layer};
  }

  async function render(){
    if(!opened||!navButton)return;
    const ready=ensureLayer(navButton);if(!ready)return;
    let state=getState(),plans=Array.isArray(state?.plans)?state.plans:[];
    const migrated=plans.map(plan=>plan?.portal_visible===true?normalizePortalPlan(plan):plan);
    const needsMigration=migrated.some((plan,index)=>JSON.stringify(plan)!==JSON.stringify(plans[index]));
    if(needsMigration){plans=migrated;state={...state,plans};await saveState(state)}
    const clients=await readClients(),counts=plans.map(plan=>usage(plan,clients)),maxUse=Math.max(0,...counts),activeCount=plans.filter(active).length,portalCount=plans.filter(plan=>active(plan)&&plan?.portal_visible===true).length;
    const cards=plans.map((plan,index)=>{
      const count=counts[index],top=maxUse>0&&count===maxUse&&active(plan),checked=selected.has(index),down=speedMbps(plan),up=uploadMbps(plan),installation=installationCents(plan);
      return `<article class="pppc-card ${top?'is-top':''}" data-index="${index}">${top?'<span class="pppc-badge">MAIS CONTRATADO</span>':''}<div class="pppc-top"><span class="pppc-speed">${esc(speedLabel(down||0))}</span><span class="pppc-status ${active(plan)?'on':''}">${active(plan)?'ATIVO':'INATIVO'}</span></div><h2>${esc(planName(plan))}</h2><div class="pppc-price">${money(planCents(plan))}<small>/mês</small></div><div class="pppc-lines"><div>↓ Download <b>${down||0} Mbps</b></div><div>↑ Upload <b>${up||0} Mbps</b></div><div>Taxa de instalação <b>${money(installation)}</b></div><div>Perfil <b>${esc(profileName(plan)||'Não configurado')}</b></div><div>Clientes vinculados <b>${count}</b></div></div><div class="pppc-flags"><label class="pppc-check portal"><input type="checkbox" data-portal ${plan?.portal_visible===true?'checked':''}> Área do Cliente</label><label class="pppc-check"><input type="checkbox" data-select ${checked?'checked':''}> Selecionar para excluir</label></div><div class="pppc-actions"><button type="button" data-edit>Editar</button><button type="button" class="${active(plan)?'danger':''}" data-toggle>${active(plan)?'Desativar':'Ativar'}</button></div></article>`;
    }).join('');
    ready.layer.innerHTML=`<div class="pppc-head"><div><div class="pppc-eyebrow">Gestão comercial</div><h1>Planos & Ofertas</h1><p>Cadastre os planos e escolha quais ofertas aparecem na Área do Cliente.</p></div><button type="button" class="pppc-primary" data-new>+ Novo plano</button></div><div class="pppc-stats"><div class="pppc-stat"><small>Planos cadastrados</small><strong>${plans.length}</strong></div><div class="pppc-stat"><small>Planos ativos</small><strong>${activeCount}</strong></div><div class="pppc-stat"><small>Na Área do Cliente</small><strong>${portalCount}</strong></div></div><div class="pppc-toolbar"><div class="pppc-toolbar-left"><button type="button" data-select-all>Selecionar todos</button><span>${selected.size?`${selected.size} selecionado${selected.size===1?'':'s'}`:'Nenhum selecionado'}</span></div><div class="pppc-toolbar-right"><button type="button" data-delete-selected>Excluir selecionados</button><button type="button" data-save-portal>Salvar Área do Cliente</button></div></div><div class="pppc-grid">${cards||'<div class="pppc-empty">Nenhum plano cadastrado. Clique em “Novo plano” para começar.</div>'}</div>`;
  }

  async function openEditor(index=null){
    closeModal();const state=getState(),plans=Array.isArray(state?.plans)?state.plans:[],plan=index===null?null:plans[index],down=plan?speedMbps(plan):0,up=plan?uploadMbps(plan):0,price=plan?planCents(plan)/100:0,installation=plan?installationCents(plan)/100:79.90;
    modal=document.createElement('div');modal.className='pppc-modal';modal.innerHTML=`<div class="pppc-modal-card"><div class="pppc-modal-head"><h3>${plan?'Editar plano':'Novo plano'}</h3><button type="button" class="pppc-x" data-close>×</button></div><form class="pppc-form"><label class="full">Nome do plano<input name="name" required value="${esc(planName(plan||{}))}"></label><label>Download (Mbps)<input name="download" type="number" min="1" required value="${down||''}"></label><label>Upload (Mbps)<input name="upload" type="number" min="0" value="${up||''}"></label><label>Mensalidade (R$)<input name="price" type="number" min="0.01" step="0.01" required value="${price||''}"></label><label>Taxa de instalação (R$)<input name="installation" type="number" min="0" step="0.01" value="${installation.toFixed(2)}"></label><label class="full">Perfil de acesso / MikroTik<input name="profile" value="${esc(profileName(plan||{}))}"></label><div class="pppc-switches"><label><input name="active" type="checkbox" ${!plan||active(plan)?'checked':''}> Plano ativo</label><label><input name="portal" type="checkbox" ${plan?.portal_visible===true?'checked':''}> Mostrar na Área do Cliente</label></div></form><div class="pppc-modal-actions"><button type="button" data-close>Cancelar</button><button type="button" class="primary" data-save>Salvar plano</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',async event=>{
      if(event.target===modal||event.target.closest('[data-close]')){closeModal();return}
      if(!event.target.closest('[data-save]'))return;
      const form=modal.querySelector('form'),data=new FormData(form),name=String(data.get('name')||'').trim(),download=Math.round(Number(data.get('download'))||0),upload=Math.round(Number(data.get('upload'))||0),priceValue=Number(data.get('price'))||0,installationValue=Number(data.get('installation')),profile=String(data.get('profile')||'').trim();
      if(!name||download<=0||priceValue<=0||!Number.isFinite(installationValue)||installationValue<0){window.alert('Informe nome, download, mensalidade e uma taxa de instalação válida.');return}
      const rows=[...plans],seq=Number(state?.seq?.plans)||0,numericIds=plans.map(item=>Number(item?.id)||0),id=plan?.id??Math.max(seq,...numericIds,0)+1;
      let nextPlan={...(plan||{}),id,name,title:name,download_mbps:download,download,upload_mbps:upload,upload,speed:speedLabel(download),bandwidth:speedLabel(download),price_cents:Math.round(priceValue*100),value_cents:Math.round(priceValue*100),price:priceValue,amount:priceValue,installation_fee_cents:Math.round(installationValue*100),installationFeeCents:Math.round(installationValue*100),installation_fee:installationValue,installationFee:installationValue,profile_name:profile,profile,active:Boolean(form.elements.active.checked),enabled:Boolean(form.elements.active.checked),portal_visible:Boolean(form.elements.portal.checked),updated_at:new Date().toISOString()};
      nextPlan=normalizePortalPlan(nextPlan);
      if(index===null)rows.push(nextPlan);else rows[index]=nextPlan;
      await saveState({...state,plans:rows,seq:{...(state.seq||{}),plans:Math.max(seq,Number(id)||0)}});closeModal();await render();
    });
  }

  async function handleLayerClick(event){
    const card=event.target.closest('.pppc-card'),index=Number(card?.dataset.index),state=getState(),plans=Array.isArray(state?.plans)?state.plans:[];
    if(event.target.closest('[data-new]')){openEditor(null);return}
    if(event.target.closest('[data-edit]')){openEditor(index);return}
    if(event.target.closest('[data-toggle]')){const rows=[...plans],plan=rows[index];if(!plan)return;const value=!active(plan);rows[index]={...plan,active:value,enabled:value,portal_visible:value?plan.portal_visible:false,updated_at:new Date().toISOString()};await saveState({...state,plans:rows});await render();return}
    if(event.target.matches('[data-select]')){event.target.checked?selected.add(index):selected.delete(index);await render();return}
    if(event.target.closest('[data-select-all]')){selected=selected.size===plans.length?new Set():new Set(plans.map((_,i)=>i));await render();return}
    if(event.target.closest('[data-save-portal]')){
      const ready=ensureLayer(navButton);if(!ready)return;
      const visible=new Set([...ready.layer.querySelectorAll('.pppc-card')].filter(node=>node.querySelector('[data-portal]')?.checked).map(node=>Number(node.dataset.index)));
      const clients=await readClients(),counts=plans.map(plan=>usage(plan,clients)),maxUse=Math.max(0,...counts);
      const next=plans.map((plan,i)=>normalizePortalPlan({
        ...plan,
        portal_visible:active(plan)&&visible.has(i),
        highlight:maxUse>0&&counts[i]===maxUse&&active(plan)
      }));
      await saveState({...state,plans:next});window.alert('Área do Cliente atualizada. Download, upload e taxa de instalação foram sincronizados com as ofertas.');await render();return;
    }
    if(event.target.closest('[data-delete-selected]')){if(!selected.size){window.alert('Selecione pelo menos um plano para excluir.');return}const clients=await readClients(),allowed=[],blocked=[];for(const i of selected){const plan=plans[i];if(!plan)continue;(usage(plan,clients)>0?blocked:allowed).push(i)}if(!allowed.length){window.alert('Os planos selecionados estão vinculados a clientes e não podem ser excluídos.');return}const note=blocked.length?`\n\n${blocked.length} plano(s) em uso serão preservados.`:'';if(!window.confirm(`Excluir ${allowed.length} plano(s)?${note}`))return;const remove=new Set(allowed);await saveState({...state,plans:plans.filter((_,i)=>!remove.has(i))});selected=new Set();await render();return}
  }

  function openPlans(button=navButton){
    if(!button)return;opened=true;navButton=button;const ready=ensureLayer(button);if(!ready)return;
    ready.content.classList.remove('pp-dashboard-root-active','pp-client-hub-active','pp-integration-hub-active','pp-new-plans-active','pp-route-overlay-active','pp-route-billing-active','pp-route-ticket-active','pp-route-staff-active','pp-nav-loading-active');
    ready.content.querySelector(':scope > .pp-nav-loading-layer')?.remove();
    button.closest('nav')?.querySelectorAll('button.active').forEach(item=>{if(item!==button)item.classList.remove('active')});button.classList.add('active');ready.content.classList.add('pp-plans-cloud-active');
    if(!ready.layer.dataset.bound){ready.layer.dataset.bound='1';ready.layer.addEventListener('click',event=>handleLayerClick(event).catch(error=>{console.error(error);window.alert(error?.message||'Não foi possível concluir a operação.') }))}
    render().catch(error=>{console.error(error);window.alert('Não foi possível carregar Planos & Ofertas.')});
  }

  function ensureNav(){
    const nav=sidebarNav();if(!nav)return;
    const buttons=[...nav.querySelectorAll('button')],old=buttons.filter(button=>!button.dataset.ppPlansCloud&&isPlansLabel(button.textContent)),existing=buttons.find(button=>button.dataset.ppPlansCloud==='1');
    let custom=existing;
    if(!custom){
      const source=old[0]||null;custom=document.createElement('button');custom.type='button';custom.dataset.ppPlansCloud='1';custom.className=String(source?.className||'');custom.innerHTML=source?.innerHTML||'<span>▤</span><span>Planos</span>';custom.title='Planos & Ofertas';
      if(source)source.replaceWith(custom);else{const estoque=buttons.find(button=>norm(button.textContent).includes('estoque'));if(estoque)nav.insertBefore(custom,estoque);else nav.appendChild(custom)}
    }
    old.filter(button=>button!==custom&&button.isConnected).forEach(button=>button.remove());
    navButton=custom;
    if(opened){custom.classList.add('active');const ready=ensureLayer(custom);ready?.content.classList.add('pp-plans-cloud-active')}
  }

  function installNavObserver(){
    const root=document.querySelector('.sidebar')||document.querySelector('aside');if(!root)return false;
    navObserver?.disconnect();navObserver=new MutationObserver(()=>ensureNav());navObserver.observe(root,{childList:true,subtree:true});ensureNav();return true;
  }

  ensureStyle();
  const bootObserver=new MutationObserver(()=>{if(installNavObserver()){bootObserver.disconnect()}});bootObserver.observe(document.documentElement,{childList:true,subtree:true});
  if(!installNavObserver())setTimeout(()=>installNavObserver(),100);

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('.sidebar nav button,aside nav button');if(!button)return;
    if(button.dataset.ppPlansCloud==='1'){event.preventDefault();event.stopImmediatePropagation();openPlans(button);return}
    if(isPlansLabel(button.textContent)){event.preventDefault();event.stopImmediatePropagation();ensureNav();openPlans(navButton);return}
    if(opened)closePlans();
  },true);
})();
