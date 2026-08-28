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
      .pp-client-view-eye{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:36px!important;width:36px!important;height:36px!important;padding:0!important;color:#0b8f7c!important}
      .pp-client-view-eye svg{width:21px!important;height:21px!important;pointer-events:none!important}
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

  const eyeMarkup=()=>'<svg data-pp-eye-icon="true" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.7"></circle></svg>';

  function patchClientViewButtons(){
    const area=clientContentRoot();if(!area)return;
    area.querySelectorAll('button').forEach(button=>{
      if(button.closest('.client-status-modal'))return;
      const isEye=button.classList.contains('pp-client-view-eye'),text=String(button.textContent||'').trim().toLowerCase();
      if(!isEye&&text!=='status')return;
      if(!isEye)button.classList.add('pp-client-view-eye');
      button.title='Visualizar cliente';
      button.setAttribute('aria-label','Visualizar cliente');
      if(!button.querySelector('svg[data-pp-eye-icon]'))button.innerHTML=eyeMarkup();
    });
  }
  window.ProvedorPlusPatchClientViewButtons=patchClientViewButtons;

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
    installShellStyles();patchDashboardStatus();patchLogout();patchMikrotikNote();patchRouterForm();patchClientViewButtons();
  }

  function patchAddedNode(node){
    replaceText(node);
    patchClientViewButtons();
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