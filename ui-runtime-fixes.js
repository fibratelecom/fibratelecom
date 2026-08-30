(()=>{
  if(window.__ProvedorPlusUiRuntimeStableInstalled)return;
  window.__ProvedorPlusUiRuntimeStableInstalled=true;

  const replacements=[
    ['Provedor Plus 1.0.17','Provedor Plus'],
    ['Visão geral','Dashboard'],
    ['IP privado ou VPN','Endereço MikroTik Cloud'],
    ['MikroTik Cloud / domínio público','Endereço MikroTik Cloud'],
    ['API nativa local','REST HTTPS'],
    ['REST HTTPS pela nuvem','REST HTTPS (MikroTik Cloud)'],
    ['Leitura pela API nativa','Consulta ao RouterOS'],
    ['Leitura pela REST HTTPS','Consulta ao RouterOS via REST HTTPS'],
    ['Integração permanente com o MikroTik','Gerenciamento MikroTik'],
    ['As credenciais ficam protegidas pelo Windows. Cada operação PPPoE se conecta automaticamente ao MikroTik vinculado ao cliente.','Gerencie clientes PPPoE, perfis, sessões e sincronização no MikroTik vinculado.'],
    ['Credenciais protegidas e permanentes','Acesso ao RouterOS'],
    ['O Windows protege a senha e o programa reconecta automaticamente.','Autenticação segura para sincronização com o RouterOS.'],
    ['Configuração da rede, roteadores MikroTik e conexão direta com o RouterOS 7.','Gerencie roteadores MikroTik, perfis PPPoE, bloqueios e sincronização de clientes.'],
    ['Configuração da rede e conexão direta com o RouterOS 7.','Gerencie roteadores MikroTik, sessões PPPoE e sincronização com o RouterOS 7.'],
    ['Configuração da rede e conexão HTTPS com o RouterOS 7, sem instalar programa no computador.','Gerencie roteadores MikroTik, sessões PPPoE e sincronização com o RouterOS 7.'],
    ['Configuração da rede e conexão HTTPS com o RouterOS 7 pela nuvem.','Gerencie roteadores MikroTik, sessões PPPoE e sincronização com o RouterOS 7.'],
    ['Conexão direta com o RouterOS 7.','Gerenciamento e sincronização com o RouterOS 7.'],
    ['Conexão HTTPS com o RouterOS 7 pela nuvem.','Gerenciamento e sincronização com o RouterOS 7.'],
    ['A senha fica criptografada neste navegador e só é enviada ao backend durante a conexão HTTPS com o MikroTik.','A credencial do MikroTik é protegida na nuvem e usada somente nas operações autenticadas com o RouterOS.'],
    ['A senha deste MikroTik não está salva neste navegador.','A credencial deste MikroTik não está disponível na nuvem.'],
    ['Credenciais protegidas no Windows','Credenciais protegidas com segurança'],
    ['Remover o certificado Efí deste computador?','Remover o certificado Efí configurado?'],
    ['Navegador / migração para PostgreSQL','Neon PostgreSQL (nuvem)'],
    ['Pendente no agente local','Pendente na sincronização'],
    ['Sincronização enviada ao agente local.','Sincronização enviada ao MikroTik.'],
    ['Alteração PPPoE enviada ao agente local.','Alteração PPPoE enviada ao MikroTik.'],
    ['Exclusão PPPoE enviada ao agente local.','Exclusão PPPoE enviada ao MikroTik.'],
    ['Acesso remoto disponível quando o agente local estiver conectado.','Acesso remoto pela integração REST HTTPS em nuvem.'],
    ['Na versão web, o acesso ao equipamento usa o agente local seguro.','O acesso ao equipamento usa a integração REST HTTPS em nuvem.'],
    ['Provedor Plus Conector não está ativo neste computador. Abra o Conector para usar o MikroTik e o WireGuard.','A integração MikroTik utiliza REST HTTPS pelo MikroTik Cloud.'],
    ['A configuração antiga do Conector local foi desativada nesta versão web. Salve o MikroTik novamente usando REST HTTPS.','A integração MikroTik utiliza REST HTTPS pelo MikroTik Cloud.'],
    ['Atendimento local','Atendimento'],
    ['Sistema local','Sistema online'],
    ['Não foi possível abrir o banco local.','Não foi possível abrir os dados na nuvem.'],
    ['Cliente salvo localmente.','Cliente salvo na nuvem.'],
    ['Liberada somente para local + VPN','Disponível via REST HTTPS'],
    ['No bloqueio por inadimplência o PPPoE permanece conectado, mas somente o portal de cobrança fica acessível.','No bloqueio por inadimplência, o acesso PPPoE é desativado no MikroTik até a liberação ou confirmação do pagamento.'],
    ['Perfil aplicado:','Situação:'],
    ['PP-BLOQ','Bloqueado no MikroTik'],
    ['O cliente continua conectado via PPPoE com acesso restrito à página de cobrança. Após a confirmação do pagamento, o perfil normal é restaurado automaticamente.','O acesso PPPoE fica bloqueado até a confirmação do pagamento ou liberação manual/em confiança. Após a confirmação, o acesso é reativado automaticamente.']
  ];

  const PLAN_STATE_KEY='provedor_plus_web_1_0_17';
  const planNorm=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  let planPatchBusy=false,planCleanupBusy=false;

  function replaceText(root){
    if(!root)return;
    if(root.nodeType===Node.TEXT_NODE){
      let value=root.nodeValue||'',next=value;
      for(const [from,to] of replacements)if(next.includes(from))next=next.replaceAll(from,to);
      if(next!==value)root.nodeValue=next;
      return;
    }
    if(!(root instanceof Element)&&root!==document.body)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){
      let value=n.nodeValue||'',next=value;
      for(const [from,to] of replacements)if(next.includes(from))next=next.replaceAll(from,to);
      if(next!==value)n.nodeValue=next;
    }
  }

  function installShellStyles(){
    if(document.getElementById('pp-shell-layout-fixes'))return;
    const style=document.createElement('style');
    style.id='pp-shell-layout-fixes';
    style.textContent=`
      .brand{height:82px!important;min-height:82px!important;padding:7px 10px 0!important;align-items:center!important;overflow:visible!important}
      .brand-mark{flex:0 0 31px!important;margin-top:2px!important}
      .workspace{min-height:52px!important;margin:12px 5px 12px!important;padding:8px 9px!important;gap:8px!important}
      .workspace-logo{width:30px!important;height:30px!important;flex:0 0 30px!important;border-radius:8px!important;font-size:11px!important}
      .workspace small{font-size:10px!important;line-height:1.2!important}
      .workspace strong{font-size:13px!important;line-height:1.25!important;white-space:normal!important}
      .user-card{min-height:52px!important;padding:8px 5px 6px!important;gap:7px!important;align-items:center!important}
      .user-card>span{width:30px!important;height:30px!important;flex:0 0 30px!important;font-size:11px!important}
      .user-card>div{min-width:0!important}
      .user-card strong{font-size:12px!important;line-height:1.2!important}
      .user-card small{font-size:10px!important;line-height:1.2!important;margin-top:2px!important}
      .user-card .pp-shell-logout{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-width:48px!important;height:30px!important;padding:0 9px!important;color:#5f706d!important;background:#f6f9f8!important;border:1px solid #dfe8e5!important;border-radius:7px!important;font-size:10px!important;font-weight:750!important;line-height:1!important}
      .user-card .pp-shell-logout:hover{color:#0a7566!important;background:#eaf6f2!important;border-color:#b8ddd4!important}
      .user-card .pp-shell-logout:disabled{opacity:.55!important;cursor:wait!important}
      .topbar .system-online{display:none!important}
      .pp-dashboard-title-row{display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:11px!important;min-width:0!important}
      .pp-dashboard-title-row h1{margin:0!important}
      .pp-dashboard-system-online{display:inline-flex!important;align-items:center!important;gap:7px!important;min-height:29px!important;padding:5px 10px!important;color:#55716b!important;background:#eef8f5!important;border:1px solid #d7ebe5!important;border-radius:20px!important;font-size:11px!important;font-weight:700!important;line-height:1.2!important;white-space:nowrap!important}
      .pp-dashboard-system-online i{display:block!important;width:7px!important;height:7px!important;background:#24b888!important;border-radius:50%!important;box-shadow:0 0 0 4px #dff5ed!important}
      .pp-dashboard-host{padding-top:20px!important}
      .pp-client-action-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;flex:0 0 36px!important;min-width:36px!important;width:36px!important;height:36px!important;padding:0!important;border-radius:8px!important;line-height:1!important}
      .pp-client-action-icon svg{display:block!important;width:18px!important;height:18px!important;pointer-events:none!important}
      .pp-client-action-icon[data-pp-client-action="view"]{color:#0b8f7c!important}
      .pp-client-action-icon[data-pp-client-action="boleto"]{color:#426477!important}
      .pp-client-action-icon[data-pp-client-action="edit"]{color:#5b6770!important}
      .pp-client-action-icon[data-pp-client-action="delete"]{color:#c54a46!important}
      .pp-plan-promo-toolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;margin:0 0 15px!important;padding:13px 15px!important;background:#fff!important;border:1px solid #dfe8e5!important;border-radius:11px!important;box-sizing:border-box!important}
      .pp-plan-promo-toolbar>div:first-child{min-width:0!important}.pp-plan-promo-toolbar strong{display:block!important;color:#26443d!important;font-size:12px!important}.pp-plan-promo-toolbar small{display:block!important;margin-top:3px!important;color:#778985!important;font-size:10px!important;line-height:1.35!important}
      .pp-plan-promo-actions{display:flex!important;gap:7px!important;flex-wrap:wrap!important;justify-content:flex-end!important}.pp-plan-promo-actions button{min-height:33px!important;padding:0 11px!important;border:1px solid #d5e2de!important;border-radius:8px!important;background:#fff!important;color:#526761!important;font-size:10px!important;font-weight:800!important;cursor:pointer!important}.pp-plan-promo-actions button.primary{background:#0d8b78!important;border-color:#0d8b78!important;color:#fff!important}.pp-plan-promo-actions button.danger{color:#b94b43!important;border-color:#efc9c5!important;background:#fff8f7!important}.pp-plan-promo-actions button:disabled{opacity:.55!important;cursor:wait!important}
      .pp-plan-managed-card{position:relative!important}.pp-plan-controls{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin:10px 0 0!important;padding:9px 10px!important;border:1px solid #e2ebe8!important;border-radius:8px!important;background:#f8fbfa!important}.pp-plan-controls label{display:inline-flex!important;align-items:center!important;gap:6px!important;color:#5c706a!important;font-size:9px!important;font-weight:750!important;cursor:pointer!important}.pp-plan-controls input{margin:0!important;accent-color:#0d8b78!important}.pp-plan-controls .pp-plan-portal-label{color:#0b806f!important}
      .pp-most-contracted-badge{position:absolute!important;top:-1px!important;right:18px!important;z-index:2!important;padding:6px 10px!important;border-radius:0 0 8px 8px!important;background:#008f79!important;color:#fff!important;font-size:9px!important;font-weight:900!important;letter-spacing:.3px!important;line-height:1!important}
      @media(max-width:760px){.pp-plan-promo-toolbar{align-items:stretch!important;flex-direction:column!important}.pp-plan-promo-actions{justify-content:stretch!important}.pp-plan-promo-actions button{flex:1!important}.pp-plan-controls{align-items:flex-start!important;flex-direction:column!important}}
      @media(min-width:901px){.topbar{display:none!important;height:0!important;min-height:0!important;border:0!important;padding:0!important;overflow:hidden!important}.content{padding-top:0!important}}
      @media(max-width:900px){.brand{height:76px!important;min-height:76px!important;padding-top:5px!important}.topbar{display:flex!important}.pp-dashboard-host{padding-top:16px!important}.pp-dashboard-title-row{gap:8px!important}}
    `;
    document.head.appendChild(style);
  }

  function patchDashboardStatus(){
    const heading=document.querySelector('.pp-dashboard-heading'),title=heading?.querySelector('h1');
    if(!heading||!title)return;
    let row=heading.querySelector('.pp-dashboard-title-row');
    if(!row){row=document.createElement('div');row.className='pp-dashboard-title-row';title.parentNode?.insertBefore(row,title);row.appendChild(title)}
    if(!row.querySelector('.pp-dashboard-system-online')){const status=document.createElement('span');status.className='pp-dashboard-system-online';status.innerHTML='<i></i><span>Sistema online</span>';row.appendChild(status)}
  }

  function clientContentRoot(){
    const heading=[...document.querySelectorAll('h1,h2')].find(el=>String(el.textContent||'').trim().toLowerCase()==='clientes'&&el.getClientRects().length>0);
    if(!heading)return null;
    return heading.closest('.content,[role="main"],main')||heading.parentElement?.parentElement||null;
  }

  const actionDefs={
    view:{texts:['status','visualizar'],title:'Visualizar cliente',icon:'<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.7"></circle>'},
    boleto:{texts:['boleto'],title:'Boleto do cliente',icon:'<path d="M6 3.5h9l3 3V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"></path><path d="M14.5 3.5V7H18"></path><path d="M8 11h7M8 14h7M8 17h5"></path>'},
    edit:{texts:['editar'],title:'Editar cliente',icon:'<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"></path><path d="m14 8 3 3"></path>'},
    delete:{texts:['excluir'],title:'Excluir cliente',icon:'<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m7 7 1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path>'}
  };
  const actionTexts=new Map(Object.entries(actionDefs).flatMap(([key,def])=>def.texts.map(text=>[text,key])));
  const actionMarkup=(key,def)=>`<svg data-pp-action-icon="${key}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${def.icon}</svg>`;

  function buttonActionKey(button){
    const saved=String(button?.dataset?.ppClientAction||'').trim();if(saved&&actionDefs[saved])return saved;
    if(button?.classList?.contains('pp-client-view-eye'))return 'view';
    return actionTexts.get(String(button?.textContent||'').trim().toLowerCase())||'';
  }

  function isClientActionGroup(button,area){
    let node=button?.parentElement,depth=0;
    while(node&&node!==area&&depth<5){
      const matched=[...node.querySelectorAll('button')].filter(candidate=>buttonActionKey(candidate));
      if(matched.length>=2)return true;
      node=node.parentElement;depth++;
    }
    return Boolean(button?.dataset?.ppClientAction||button?.classList?.contains('pp-client-view-eye'));
  }

  function patchClientActionButtons(){
    const area=clientContentRoot();if(!area)return;
    area.querySelectorAll('button').forEach(button=>{
      if(button.closest('.client-status-modal'))return;
      const key=buttonActionKey(button);if(!key||!isClientActionGroup(button,area))return;
      const def=actionDefs[key];
      button.dataset.ppClientAction=key;
      button.classList.remove('pp-client-view-eye');
      button.classList.add('pp-client-action-icon');
      button.title=def.title;
      button.setAttribute('aria-label',def.title);
      if(!button.querySelector(`svg[data-pp-action-icon="${key}"]`))button.innerHTML=actionMarkup(key,def);
    });
    ensureClientActionObserver(area);
  }

  let clientActionObserver=null,clientActionRoot=null;
  function ensureClientActionObserver(area=clientContentRoot()){
    if(!area)return;
    if(clientActionObserver&&clientActionRoot===area)return;
    if(clientActionObserver)clientActionObserver.disconnect();
    clientActionRoot=area;
    clientActionObserver=new MutationObserver(()=>patchClientActionButtons());
    clientActionObserver.observe(area,{childList:true,subtree:true,characterData:true});
  }

  window.ProvedorPlusPatchClientViewButtons=patchClientActionButtons;
  window.ProvedorPlusPatchClientActionButtons=patchClientActionButtons;

  function planState(){return window.ProvedorPlusCloudState?.getState?.()||{}}
  function planActive(plan){return plan?.active!==false&&plan?.enabled!==false}
  function planPriceCents(plan){const cents=Number(plan?.price_cents??plan?.value_cents);if(Number.isFinite(cents))return Math.round(cents);const value=Number(plan?.price??plan?.value??plan?.amount);return Number.isFinite(value)?Math.round(value*100):0}
  function planSpeed(plan){return String(plan?.speed??plan?.download_mbps??plan?.download??plan?.bandwidth??'').trim()}
  function planSignature(plan){return `${planNorm(plan?.name||plan?.title)}|${planNorm(planSpeed(plan))}|${planPriceCents(plan)}`}
  function planKey(plan,index=0){const id=Number(plan?.id);return Number.isFinite(id)&&id>0?`id:${id}`:`sig:${planSignature(plan)}:${index}`}
  function planUsage(plan,state=planState()){
    const clients=Array.isArray(state?.clients)?state.clients:[],id=Number(plan?.id)||0,name=planNorm(plan?.name||plan?.title);
    return clients.filter(client=>{
      const clientPlanId=Number(client?.plan_id)||0;
      if(id&&clientPlanId)return clientPlanId===id;
      return Boolean(name&&planNorm(client?.plan||client?.plan_name)===name);
    }).length;
  }
  function plansArea(){
    const heading=[...document.querySelectorAll('h1,h2')].find(el=>planNorm(el.textContent)==='planos'&&el.getClientRects().length>0);
    return heading?.closest('.content,[role="main"],main')||null;
  }
  function planCards(area){
    if(!area)return[];
    const buttons=[...area.querySelectorAll('button')].filter(button=>planNorm(button.textContent)==='editar plano');
    const cards=[];
    for(const button of buttons){
      let node=button.parentElement,chosen=null,depth=0;
      while(node&&node!==area&&depth<6){
        const editCount=[...node.querySelectorAll('button')].filter(item=>planNorm(item.textContent)==='editar plano').length;
        if(editCount===1)chosen=node;
        if(chosen&&node.parentElement&&[...node.parentElement.querySelectorAll('button')].filter(item=>planNorm(item.textContent)==='editar plano').length>1)break;
        node=node.parentElement;depth++;
      }
      if(chosen&&!cards.includes(chosen))cards.push(chosen);
    }
    return cards;
  }
  async function persistPlansState(nextState){
    localStorage.setItem(PLAN_STATE_KEY,JSON.stringify(nextState));
    if(window.ProvedorPlusCloudState?.forceSync)await window.ProvedorPlusCloudState.forceSync();
  }
  function refreshPlansView(area=plansArea()){
    const refresh=[...(area?.querySelectorAll('button')||[])].find(button=>planNorm(button.textContent).includes('atualizar'));
    if(refresh){setTimeout(()=>refresh.click(),40);return}
    const nav=[...document.querySelectorAll('.sidebar nav button,nav button')].find(button=>planNorm(button.textContent)==='planos');
    if(nav)setTimeout(()=>nav.click(),40);
  }
  async function cleanupDuplicateOuro(){
    if(planCleanupBusy)return false;planCleanupBusy=true;
    try{
      const state=planState(),plans=Array.isArray(state?.plans)?state.plans:[],active=plans.filter(planActive),groups=new Map();
      for(const plan of active){if(planNorm(plan?.name||plan?.title)!=='ouro')continue;const sig=planSignature(plan),group=groups.get(sig)||[];group.push(plan);groups.set(sig,group)}
      const remove=new Set();
      for(const group of groups.values()){
        if(group.length<2)continue;
        const ordered=[...group].sort((a,b)=>(Number(a?.id)||Number.MAX_SAFE_INTEGER)-(Number(b?.id)||Number.MAX_SAFE_INTEGER));
        const used=ordered.filter(plan=>planUsage(plan,state)>0),keeper=used[0]||ordered[0];
        for(const plan of ordered)if(plan!==keeper&&planUsage(plan,state)===0)remove.add(plan);
      }
      if(!remove.size)return false;
      const next={...state,plans:plans.filter(plan=>!remove.has(plan)),settings:{...(state.settings||{}),plan_duplicate_ouro_cleaned_at:new Date().toISOString()}};
      await persistPlansState(next);
      return true;
    }catch(error){console.error('Provedor Plus: não foi possível limpar o plano OURO duplicado.',error);return false}
    finally{planCleanupBusy=false}
  }
  function removeWrongMostContracted(area){
    for(const node of [...area.querySelectorAll('*')])if(!node.classList?.contains('pp-most-contracted-badge')&&node.children.length===0&&planNorm(node.textContent)==='mais contratado')node.remove();
  }
  function applyMostContracted(area,plans,cards,state){
    removeWrongMostContracted(area);
    let bestIndex=-1,bestCount=0;
    plans.forEach((plan,index)=>{const count=planUsage(plan,state);if(count>bestCount){bestCount=count;bestIndex=index}});
    const existing=area.querySelector('.pp-most-contracted-badge');
    if(bestIndex<0||bestCount<=0||!cards[bestIndex]){existing?.remove();return}
    const target=cards[bestIndex];target.classList.add('pp-plan-managed-card');
    if(existing){if(existing.parentElement!==target)target.prepend(existing);return}
    const badge=document.createElement('span');badge.className='pp-most-contracted-badge';badge.textContent='MAIS CONTRATADO';target.prepend(badge);
  }
  function updatePlanSelectionCount(toolbar){
    if(!toolbar)return;const selected=document.querySelectorAll('[data-pp-plan-select]:checked').length,label=toolbar.querySelector('[data-pp-plan-selected-count]');if(label)label.textContent=selected?`${selected} selecionado${selected===1?'':'s'}`:'Nenhum selecionado';
  }
  function ensurePlanToolbar(area,grid){
    let toolbar=area.querySelector('.pp-plan-promo-toolbar');
    if(toolbar)return toolbar;
    toolbar=document.createElement('section');toolbar.className='pp-plan-promo-toolbar';
    toolbar.innerHTML='<div><strong>Planos em promoção na Área do Cliente</strong><small>Marque “Área do Cliente” somente nos planos que devem aparecer como oferta. Use “Selecionar” para excluir planos em lote.</small></div><div class="pp-plan-promo-actions"><span data-pp-plan-selected-count style="align-self:center;font-size:9px;color:#7b8c88">Nenhum selecionado</span><button type="button" data-pp-plan-select-all>Selecionar todos</button><button class="danger" type="button" data-pp-plan-delete>Excluir selecionados</button><button class="primary" type="button" data-pp-plan-publish>Salvar divulgação</button></div>';
    grid.parentElement?.insertBefore(toolbar,grid);
    toolbar.addEventListener('click',async event=>{
      const selectAll=event.target.closest('[data-pp-plan-select-all]'),del=event.target.closest('[data-pp-plan-delete]'),publish=event.target.closest('[data-pp-plan-publish]');
      if(selectAll){const boxes=[...area.querySelectorAll('[data-pp-plan-select]')],all=boxes.length&&boxes.every(box=>box.checked);boxes.forEach(box=>box.checked=!all);selectAll.textContent=all?'Selecionar todos':'Desmarcar todos';updatePlanSelectionCount(toolbar);return}
      if(publish){
        const state=planState(),plans=Array.isArray(state?.plans)?state.plans:[],visible=new Map();
        area.querySelectorAll('.pp-plan-managed-card').forEach(card=>{const key=card.dataset.ppPlanKey,input=card.querySelector('[data-pp-plan-portal]');if(key&&input)visible.set(key,input.checked)});
        let activeIndex=0;
        const nextPlans=plans.map(plan=>{if(!planActive(plan))return plan;const key=planKey(plan,activeIndex++);return visible.has(key)?{...plan,portal_visible:visible.get(key)===true}:plan});
        publish.disabled=true;const old=publish.textContent;publish.textContent='Salvando...';
        try{await persistPlansState({...state,plans:nextPlans});window.alert('Seleção salva. Somente os planos marcados em “Área do Cliente” serão exibidos como oferta no portal.')}catch(error){window.alert(error?.message||'Não foi possível salvar a divulgação dos planos.')}finally{publish.disabled=false;publish.textContent=old}
        return;
      }
      if(del){
        const selected=new Set([...area.querySelectorAll('[data-pp-plan-select]:checked')].map(input=>input.closest('.pp-plan-managed-card')?.dataset.ppPlanKey).filter(Boolean));
        if(!selected.size){window.alert('Selecione pelo menos um plano para excluir.');return}
        const state=planState(),plans=Array.isArray(state?.plans)?state.plans:[];let activeIndex=0;
        const selectedPlans=[];
        for(const plan of plans){if(!planActive(plan))continue;const key=planKey(plan,activeIndex++);if(selected.has(key))selectedPlans.push({plan,key})}
        const blocked=selectedPlans.filter(item=>planUsage(item.plan,state)>0),allowed=selectedPlans.filter(item=>planUsage(item.plan,state)===0);
        if(!allowed.length){window.alert('Os planos selecionados estão vinculados a clientes e não podem ser excluídos.');return}
        const blockedText=blocked.length?`\n\n${blocked.length} plano(s) em uso serão preservados.`:'';
        if(!window.confirm(`Excluir ${allowed.length} plano(s) selecionado(s)?${blockedText}`))return;
        const removeKeys=new Set(allowed.map(item=>item.key));activeIndex=0;
        const nextPlans=plans.filter(plan=>{if(!planActive(plan))return true;const key=planKey(plan,activeIndex++);return !removeKeys.has(key)});
        del.disabled=true;const old=del.textContent;del.textContent='Excluindo...';
        try{await persistPlansState({...state,plans:nextPlans});window.alert(`${allowed.length} plano(s) excluído(s).${blocked.length?' Os planos vinculados a clientes foram mantidos.':''}`);refreshPlansView(area)}catch(error){window.alert(error?.message||'Não foi possível excluir os planos selecionados.')}finally{del.disabled=false;del.textContent=old}
      }
    });
    area.addEventListener('change',event=>{if(event.target.matches('[data-pp-plan-select]'))updatePlanSelectionCount(toolbar)});
    return toolbar;
  }
  async function patchPlansManagement(){
    if(planPatchBusy)return;const area=plansArea();if(!area)return;planPatchBusy=true;
    try{
      const cleaned=await cleanupDuplicateOuro();if(cleaned){refreshPlansView(area);return}
      const state=planState(),plans=(Array.isArray(state?.plans)?state.plans:[]).filter(planActive),cards=planCards(area);if(!plans.length||!cards.length)return;
      const grid=cards[0].parentElement;if(!grid)return;const toolbar=ensurePlanToolbar(area,grid);
      cards.forEach((card,index)=>{
        const plan=plans[index];if(!plan)return;const key=planKey(plan,index);card.classList.add('pp-plan-managed-card');card.dataset.ppPlanKey=key;
        let controls=card.querySelector('.pp-plan-controls');
        if(!controls){controls=document.createElement('div');controls.className='pp-plan-controls';const actions=[...card.querySelectorAll('button')].find(button=>planNorm(button.textContent)==='editar plano')?.parentElement;if(actions?.parentElement)actions.parentElement.insertBefore(controls,actions);else card.appendChild(controls)}
        if(!controls.dataset.ppReady){controls.dataset.ppReady='1';controls.innerHTML='<label class="pp-plan-portal-label"><input type="checkbox" data-pp-plan-portal> Área do Cliente</label><label><input type="checkbox" data-pp-plan-select> Selecionar</label>'}
        const portalInput=controls.querySelector('[data-pp-plan-portal]');if(portalInput&&!portalInput.matches(':focus'))portalInput.checked=plan.portal_visible!==false;
      });
      applyMostContracted(area,plans,cards,state);updatePlanSelectionCount(toolbar);
    }finally{planPatchBusy=false}
  }

  function patchLogout(){
    const card=document.querySelector('.user-card');if(!card||card.querySelector('.pp-shell-logout'))return;
    const button=document.createElement('button');button.type='button';button.className='pp-shell-logout';button.textContent='Sair';button.title='Sair do Provedor Plus';button.setAttribute('aria-label','Sair do Provedor Plus');
    button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;button.textContent='Saindo…';try{if(window.ProvedorPlusAuth?.logout)await window.ProvedorPlusAuth.logout();else location.reload()}catch(error){console.error('Provedor Plus: falha ao sair.',error);button.disabled=false;button.textContent='Sair'}});
    card.appendChild(button);
  }

  function patchMikrotikNote(){
    const config=document.querySelector('.router-config');if(!config)return;
    let note=config.querySelector('.cloud-mode-note');
    if(!note){note=document.createElement('div');note.className='cloud-mode-note';const picker=config.querySelector('.router-picker');(picker||config.querySelector('.panel-head'))?.insertAdjacentElement('afterend',note)}
    const html='<strong>Integração MikroTik</strong>Gerenciamento do RouterOS 7 via REST HTTPS usando o endereço MikroTik Cloud e a porta 443.';
    if(note.innerHTML!==html)note.innerHTML=html;
  }

  function patchRouterForm(){
    document.querySelectorAll('.router-form.multi select').forEach(select=>{const api=[...select.options].find(o=>o.value==='api'),rest=[...select.options].find(o=>o.value==='rest');if(api&&rest){if(!api.hidden)api.hidden=true;if(!api.disabled)api.disabled=true;if(rest.textContent!=='REST HTTPS')rest.textContent='REST HTTPS';if(select.value==='api'&&!select.dataset.cloudNormalized){select.dataset.cloudNormalized='1';select.value='rest';select.dispatchEvent(new Event('change',{bubbles:true}))}}});
    document.querySelectorAll('.router-form.multi input').forEach(input=>{const label=input.closest('label');if(label&&label.textContent.includes('Endereço MikroTik Cloud')&&input.placeholder!=='exemplo.sn.mynetname.net')input.placeholder='exemplo.sn.mynetname.net'});
  }

  function patchStatic(){
    if(document.title!=='Provedor Plus')document.title='Provedor Plus';
    installShellStyles();patchDashboardStatus();patchLogout();patchMikrotikNote();patchRouterForm();patchClientActionButtons();patchPlansManagement().catch(error=>console.error('Provedor Plus: falha ao preparar gestão de planos.',error));
  }

  function patchAddedNode(node){
    replaceText(node);
    patchClientActionButtons();
    patchPlansManagement().catch(error=>console.error('Provedor Plus: falha ao atualizar gestão de planos.',error));
    if(!(node instanceof Element))return;
    if(node.matches('.user-card,.router-config,.router-form,.pp-dashboard-heading')||node.querySelector('.user-card,.router-config,.router-form,.pp-dashboard-heading'))patchStatic();
  }

  function initial(){replaceText(document.body);patchStatic()}

  const observer=new MutationObserver(records=>{
    let structural=false;
    for(const record of records){
      for(const node of record.addedNodes){patchAddedNode(node);structural=true}
    }
    if(structural)patchStatic();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initial,{once:true});else initial();
})();