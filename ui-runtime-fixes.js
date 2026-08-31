(()=>{
  if(window.__ProvedorPlusUiRuntimeStableInstalled)return;
  window.__ProvedorPlusUiRuntimeStableInstalled=true;

  const replacements=[
    ['Provedor Plus 1.0.17','Provedor Plus'],
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

  function installPlanManagement(){
    if(window.__ProvedorPlusPlanManagementInstalled)return;
    window.__ProvedorPlusPlanManagementInstalled=true;
    const STATE_KEY='provedor_plus_web_1_0_17';
    const norm=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    let routeObserver=null,routeRoot=null,routeTimer=null,actionBusy=false,normalizing=false;

    const getState=()=>window.ProvedorPlusCloudState?.getState?.()||{};
    const active=plan=>plan?.active!==false&&plan?.enabled!==false;
    const activePlans=state=>(Array.isArray(state?.plans)?state.plans:[]).map((plan,index)=>({plan,index})).filter(item=>active(item.plan));
    const activePlansNav=()=>[...document.querySelectorAll('.sidebar nav button.active,aside nav button.active,nav button.active')].find(button=>button.getClientRects().length>0&&norm(button.textContent)==='planos')||null;
    const page=()=>{
      const grid=[...document.querySelectorAll('.plans-grid')].find(node=>node.getClientRects().length>0);
      if(!grid)return null;
      return {grid,area:grid.closest('.page-wrap')||grid.closest('.content')||grid.parentElement};
    };
    const priceCents=plan=>{
      const cents=Number(plan?.price_cents??plan?.value_cents);
      if(Number.isFinite(cents))return Math.round(cents);
      const value=Number(plan?.price??plan?.value??plan?.amount);
      return Number.isFinite(value)?Math.round(value*100):0;
    };
    const cardPrice=card=>{
      const node=[...card.querySelectorAll('strong')].find(el=>/R\$/i.test(String(el.textContent||'')));
      const match=String(node?.textContent||'').match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
      if(!match)return 0;
      const value=Number(match[1].replace(/\./g,'').replace(',','.'));
      return Number.isFinite(value)?Math.round(value*100):0;
    };
    const speed=plan=>norm(plan?.speed??plan?.download_mbps??plan?.download??plan?.bandwidth??'');
    const cardSpeed=card=>norm(card.querySelector('.plan-head span')?.textContent||'');
    const clientPlanId=client=>Number(client?.plan_id??client?.planId??client?.plan?.id)||0;
    const clientPlanName=client=>norm(client?.plan_name??client?.planName??client?.plan?.name??client?.plan??'');
    const planUse=(plan,clients)=>{
      const id=Number(plan?.id)||0,name=norm(plan?.name||plan?.title);
      return (Array.isArray(clients)?clients:[]).filter(client=>{
        const cid=clientPlanId(client);
        if(id&&cid)return id===cid;
        const cname=clientPlanName(client);
        return Boolean(name&&cname&&name===cname);
      }).length;
    };
    const readClients=async()=>{
      try{const rows=await window.provedor?.clients?.list?.();if(Array.isArray(rows))return rows}
      catch(error){console.error('Provedor Plus: não foi possível consultar clientes para validar Planos.',error)}
      return Array.isArray(getState()?.clients)?getState().clients:[];
    };
    const persist=async state=>{
      localStorage.setItem(STATE_KEY,JSON.stringify(state));
      if(window.ProvedorPlusCloudState?.forceSync)await window.ProvedorPlusCloudState.forceSync();
    };
    function mapCards(state,grid){
      const entries=activePlans(state),used=new Set(),mapped=[];
      for(const card of [...grid.querySelectorAll('.plan-card')]){
        const name=norm(card.querySelector('h2')?.textContent),cents=cardPrice(card),spd=cardSpeed(card),candidates=entries.filter(item=>!used.has(item.index));
        let item=candidates.find(x=>norm(x.plan?.name||x.plan?.title)===name&&priceCents(x.plan)===cents&&(!spd||!speed(x.plan)||spd.includes(speed(x.plan))||speed(x.plan).includes(spd)));
        item=item||candidates.find(x=>norm(x.plan?.name||x.plan?.title)===name&&priceCents(x.plan)===cents);
        item=item||candidates.find(x=>norm(x.plan?.name||x.plan?.title)===name);
        item=item||candidates[0]||null;
        if(item){used.add(item.index);mapped.push({card,...item})}
      }
      return mapped;
    }
    const cardClientCount=card=>{
      const text=String(card.querySelector('.plan-head small')?.textContent||card.textContent||''),match=text.match(/(\d+)\s+clientes?/i);
      return match?Number(match[1])||0:0;
    };
    function ensureStyle(){
      if(document.getElementById('pp-plan-management-style'))return;
      const style=document.createElement('style');style.id='pp-plan-management-style';style.textContent=`
        .pp-plan-management-toolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;margin:0 0 14px!important;padding:12px 14px!important;background:#fff!important;border:1px solid #dfe8e5!important;border-radius:10px!important;box-sizing:border-box!important}
        .pp-plan-management-toolbar strong{display:block!important;color:#27453f!important;font-size:12px!important}.pp-plan-management-toolbar small{display:block!important;margin-top:3px!important;color:#778984!important;font-size:10px!important;line-height:1.35!important}.pp-plan-management-actions{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important;justify-content:flex-end!important}
        .pp-plan-management-actions button{min-height:33px!important;padding:0 11px!important;border:1px solid #d7e3e0!important;border-radius:8px!important;background:#fff!important;color:#536a64!important;font-size:10px!important;font-weight:800!important;cursor:pointer!important}.pp-plan-management-actions button[data-pp-plan-save-promo]{background:#0d8b78!important;border-color:#0d8b78!important;color:#fff!important}.pp-plan-management-actions button[data-pp-plan-delete-selected]{color:#b54b44!important;border-color:#efc9c5!important;background:#fff8f7!important}.pp-plan-management-actions button:disabled{opacity:.55!important;cursor:wait!important}
        .plan-card .pp-plan-management-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;flex:0 0 auto!important;margin:0 0 9px!important;padding:8px 9px!important;border:1px solid #e1ebe8!important;border-radius:8px!important;background:#f8fbfa!important}.pp-plan-management-row label{display:inline-flex!important;align-items:center!important;gap:6px!important;margin:0!important;color:#596d68!important;font-size:9px!important;font-weight:750!important;cursor:pointer!important}.pp-plan-management-row label:first-child{color:#0a7f6e!important}.pp-plan-management-row input{margin:0!important;accent-color:#0d8b78!important}
        @media(max-width:760px){.pp-plan-management-toolbar{align-items:stretch!important;flex-direction:column!important}.pp-plan-management-actions{justify-content:stretch!important}.pp-plan-management-actions button{flex:1!important}.plan-card .pp-plan-management-row{align-items:flex-start!important;flex-direction:column!important}}
      `;document.head.appendChild(style);
    }
    async function normalizeDuplicateOuro(){
      if(normalizing)return;normalizing=true;
      try{
        const state=getState(),plans=Array.isArray(state?.plans)?state.plans:[],clients=await readClients(),entries=plans.map((plan,index)=>({plan,index})).filter(item=>active(item.plan)&&norm(item.plan?.name||item.plan?.title)==='ouro');
        if(entries.length<2)return;
        const groups=new Map();
        for(const item of entries){const key=`${norm(item.plan?.name||item.plan?.title)}|${speed(item.plan)}|${priceCents(item.plan)}`,list=groups.get(key)||[];list.push(item);groups.set(key,list)}
        const remove=new Set();
        for(const group of groups.values()){
          if(group.length<2)continue;
          const ordered=[...group].sort((a,b)=>(Number(a.plan?.id)||a.index)-(Number(b.plan?.id)||b.index)),used=ordered.find(item=>planUse(item.plan,clients)>0),keeper=used||ordered[0];
          for(const item of ordered)if(item.index!==keeper.index&&planUse(item.plan,clients)===0)remove.add(item.index);
        }
        if(remove.size)await persist({...state,plans:plans.filter((_,index)=>!remove.has(index))});
      }finally{normalizing=false}
    }
    function createToolbar(area,grid){
      let toolbar=area.querySelector('.pp-plan-management-toolbar');if(toolbar)return toolbar;
      toolbar=document.createElement('section');toolbar.className='pp-plan-management-toolbar';toolbar.innerHTML='<div><strong>Divulgação na Área do Cliente</strong><small>Marque os planos que devem aparecer nas promoções da Área do Cliente. “Selecionar” é usado somente para exclusão.</small></div><div class="pp-plan-management-actions"><span data-pp-plan-selected-label style="font-size:9px;color:#7b8c88">Nenhum selecionado</span><button type="button" data-pp-plan-select-all>Selecionar todos</button><button type="button" data-pp-plan-delete-selected>Excluir selecionados</button><button type="button" data-pp-plan-save-promo>Salvar promoção</button></div>';
      grid.insertAdjacentElement('beforebegin',toolbar);return toolbar;
    }
    function applyFeatured(mapped){
      let best=null,bestCount=0;
      for(const item of mapped){const count=cardClientCount(item.card);if(count>bestCount){best=item;bestCount=count}}
      for(const {card} of mapped){
        const should=bestCount>0&&best?.card===card;if(card.classList.contains('featured')!==should)card.classList.toggle('featured',should);
        const badges=[...card.querySelectorAll('em')].filter(node=>norm(node.textContent)==='mais contratado');
        if(!should)badges.forEach(node=>node.remove());else if(!badges.length){const badge=document.createElement('em');badge.textContent='MAIS CONTRATADO';card.prepend(badge)}
      }
    }
    function enhanceCurrent(){
      if(!activePlansNav())return false;
      const current=page();if(!current)return false;
      ensureStyle();const state=getState(),mapped=mapCards(state,current.grid);if(!mapped.length)return false;createToolbar(current.area,current.grid);
      for(const {card,plan,index} of mapped){
        card.dataset.ppPlanIndex=String(index);let row=card.querySelector('.pp-plan-management-row');
        if(!row){row=document.createElement('div');row.className='pp-plan-management-row';row.innerHTML='<label><input type="checkbox" data-pp-plan-portal> Área do Cliente</label><label><input type="checkbox" data-pp-plan-select> Selecionar</label>';const actions=card.querySelector('.plan-actions');if(actions)actions.insertAdjacentElement('beforebegin',row);else card.appendChild(row)}
        const portal=row.querySelector('[data-pp-plan-portal]');if(portal)portal.checked=plan?.portal_visible===true;
      }
      applyFeatured(mapped);
      const selected=current.area.querySelectorAll('[data-pp-plan-select]:checked').length,label=current.area.querySelector('[data-pp-plan-selected-label]');if(label)label.textContent=selected?`${selected} selecionado${selected===1?'':'s'}`:'Nenhum selecionado';
      return true;
    }
    function stopObserver(){routeObserver?.disconnect();routeObserver=null;routeRoot=null;clearTimeout(routeTimer);routeTimer=null}
    function scheduleEnhance(delay=30){clearTimeout(routeTimer);routeTimer=setTimeout(()=>{if(!activePlansNav()){stopObserver();return}enhanceCurrent();ensureObserver()},delay)}
    function ensureObserver(){
      if(!activePlansNav())return stopObserver();const current=page();if(!current)return;const root=current.area;if(routeObserver&&routeRoot===root)return;stopObserver();routeRoot=root;
      routeObserver=new MutationObserver(records=>{
        if(!activePlansNav())return stopObserver();
        const relevant=records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&(node.matches?.('.plans-grid,.plan-card,.plan-actions,.pp-plan-management-toolbar,.pp-plan-management-row')||node.querySelector?.('.plans-grid,.plan-card,.plan-actions'))));
        if(relevant)scheduleEnhance(20);
      });
      routeObserver.observe(root,{childList:true,subtree:true});
    }
    async function enterPlans(){
      await normalizeDuplicateOuro();const deadline=Date.now()+5000;
      while(activePlansNav()&&Date.now()<deadline){if(enhanceCurrent()){ensureObserver();return}await new Promise(resolve=>setTimeout(resolve,40))}
    }
    async function savePromotion(area){
      if(actionBusy)return;actionBusy=true;const button=area.querySelector('[data-pp-plan-save-promo]');if(button)button.disabled=true;
      try{const state=getState(),plans=Array.isArray(state?.plans)?state.plans:[],selected=new Set([...area.querySelectorAll('.plan-card[data-pp-plan-index]')].filter(card=>card.querySelector('[data-pp-plan-portal]')?.checked).map(card=>Number(card.dataset.ppPlanIndex)));await persist({...state,plans:plans.map((plan,index)=>active(plan)?{...plan,portal_visible:selected.has(index)}:plan)});window.alert('Promoção salva. Somente os planos marcados serão exibidos na Área do Cliente.')}
      catch(error){window.alert(error?.message||'Não foi possível salvar a promoção.')}
      finally{actionBusy=false;if(button)button.disabled=false}
    }
    async function deleteSelected(area){
      if(actionBusy)return;const cards=[...area.querySelectorAll('.plan-card[data-pp-plan-index]')].filter(card=>card.querySelector('[data-pp-plan-select]')?.checked);if(!cards.length){window.alert('Selecione pelo menos um plano para excluir.');return}
      const state=getState(),plans=Array.isArray(state?.plans)?state.plans:[],clients=await readClients(),allowed=[],blocked=[];
      for(const card of cards){const index=Number(card.dataset.ppPlanIndex),plan=plans[index];if(!plan)continue;const inUse=cardClientCount(card)>0||planUse(plan,clients)>0;(inUse?blocked:allowed).push(index)}
      if(!allowed.length){window.alert('Os planos selecionados estão vinculados a clientes e não podem ser excluídos.');return}
      const extra=blocked.length?`\n\n${blocked.length} plano(s) em uso serão preservados.`:'';if(!window.confirm(`Excluir ${allowed.length} plano(s) selecionado(s)?${extra}`))return;actionBusy=true;
      try{const remove=new Set(allowed);await persist({...state,plans:plans.filter((_,index)=>!remove.has(index))});window.alert(`${allowed.length} plano(s) excluído(s).${blocked.length?' Os planos vinculados a clientes foram mantidos.':''}`);const refresh=[...(area.querySelectorAll('button')||[])].find(button=>norm(button.textContent)==='atualizar');refresh?.click();setTimeout(()=>enterPlans().catch(console.error),80)}
      catch(error){window.alert(error?.message||'Não foi possível excluir os planos selecionados.')}
      finally{actionBusy=false}
    }

    document.addEventListener('click',event=>{
      const nav=event.target.closest?.('.sidebar nav button,aside nav button,nav button');
      if(nav){if(norm(nav.textContent)==='planos')setTimeout(()=>enterPlans().catch(error=>console.error('Provedor Plus: falha ao abrir Planos.',error)),0);else stopObserver();return}
      const current=page();if(!current||!activePlansNav())return;const target=event.target,all=target.closest?.('[data-pp-plan-select-all]');
      if(all){event.preventDefault();const boxes=[...current.area.querySelectorAll('[data-pp-plan-select]')],mark=!boxes.every(box=>box.checked);boxes.forEach(box=>box.checked=mark);all.textContent=mark?'Desmarcar todos':'Selecionar todos';scheduleEnhance(0);return}
      if(target.closest?.('[data-pp-plan-save-promo]')){event.preventDefault();savePromotion(current.area);return}
      if(target.closest?.('[data-pp-plan-delete-selected]')){event.preventDefault();deleteSelected(current.area);return}
      const button=target.closest?.('button');if(button&&['atualizar','criar plano','editar plano','desativar','ativar','salvar'].some(text=>norm(button.textContent).includes(text)))setTimeout(()=>scheduleEnhance(20),60);
    },true);
    document.addEventListener('change',event=>{if(event.target.matches?.('[data-pp-plan-select]'))scheduleEnhance(0)});
    setTimeout(()=>{if(activePlansNav())enterPlans().catch(error=>console.error('Provedor Plus: falha na primeira montagem de Planos.',error))},120);
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
    installShellStyles();patchDashboardStatus();patchLogout();patchMikrotikNote();patchRouterForm();patchClientActionButtons();
  }

  function patchAddedNode(node){
    replaceText(node);
    patchClientActionButtons();
    if(!(node instanceof Element))return;
    if(node.matches('.user-card,.router-config,.router-form,.pp-dashboard-heading')||node.querySelector('.user-card,.router-config,.router-form,.pp-dashboard-heading'))patchStatic();
  }

  function initial(){replaceText(document.body);patchStatic();installPlanManagement()}

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