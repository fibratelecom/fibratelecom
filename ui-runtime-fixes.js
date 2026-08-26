(()=>{
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
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){
      let value=n.nodeValue||'',next=value;
      for(const [from,to] of replacements)if(next.includes(from))next=next.replaceAll(from,to);
      if(next!==value)n.nodeValue=next;
    }
  }

  function patchMikrotikNote(){
    const config=document.querySelector('.router-config');
    if(!config)return;
    let note=config.querySelector('.cloud-mode-note');
    if(!note){
      note=document.createElement('div');
      note.className='cloud-mode-note';
      const picker=config.querySelector('.router-picker');
      (picker||config.querySelector('.panel-head'))?.insertAdjacentElement('afterend',note);
    }
    const html='<strong>Integração MikroTik</strong>Gerenciamento do RouterOS 7 via REST HTTPS usando o endereço MikroTik Cloud e a porta 443.';
    if(note.innerHTML!==html)note.innerHTML=html;
  }

  function patchRouterForm(){
    document.querySelectorAll('.router-form.multi select').forEach(select=>{
      const api=[...select.options].find(o=>o.value==='api');
      const rest=[...select.options].find(o=>o.value==='rest');
      if(api&&rest){
        if(!api.hidden)api.hidden=true;
        if(!api.disabled)api.disabled=true;
        if(rest.textContent!=='REST HTTPS')rest.textContent='REST HTTPS';
        if(select.value==='api'&&!select.dataset.cloudNormalized){
          select.dataset.cloudNormalized='1';
          select.value='rest';
          select.dispatchEvent(new Event('change',{bubbles:true}));
        }
      }
    });
    document.querySelectorAll('.router-form.multi input').forEach(input=>{
      const label=input.closest('label');
      if(label&&label.textContent.includes('Endereço MikroTik Cloud')&&input.placeholder!=='exemplo.sn.mynetname.net')input.placeholder='exemplo.sn.mynetname.net';
    });
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(patch)}});
  function patch(){
    scheduled=false;observer.disconnect();
    try{
      if(document.title!=='Provedor Plus')document.title='Provedor Plus';
      const root=document.body;if(!root)return;
      replaceText(root);patchMikrotikNote();patchRouterForm();
    }finally{observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true})}
  }
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch,{once:true});else patch();
})();
