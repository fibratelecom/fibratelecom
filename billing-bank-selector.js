(()=>{
  if(window.__ProvedorPlusBillingBankSelectorInstalled)return;
  window.__ProvedorPlusBillingBankSelectorInstalled=true;

  const api=window.provedor;
  if(!api?.invoices?.save)return;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const style=document.createElement('style');
  style.textContent=`
    .pp-bill-bank-field{display:grid;gap:5px;min-width:220px;max-width:360px;margin:0 0 12px;color:#405853}
    .pp-bill-bank-field>span,.pp-client-extra-field>span{font-size:11px;font-weight:750;line-height:1.25;color:#405853}
    .pp-bill-bank-field select,.pp-client-extra-field select,.pp-client-extra-field input{box-sizing:border-box;width:100%;height:38px;padding:0 10px;color:#2f4a44;background:#fff;border:1px solid #cfe0dc;border-radius:8px;font-size:12px;font-weight:650;outline:none}
    .pp-bill-bank-field select:focus,.pp-client-extra-field select:focus,.pp-client-extra-field input:focus{border-color:#4fae9d;box-shadow:0 0 0 3px rgba(79,174,157,.12)}
    .pp-bill-bank-field select:disabled,.pp-client-extra-field select:disabled{color:#899793;background:#f5f8f7;cursor:not-allowed}
    .pp-bill-bank-field small,.pp-client-extra-field small{color:#71827e;font-size:10px;line-height:1.35;white-space:normal}
    .pp-bill-bank-modal-field{max-width:none;margin:10px 0 0;padding:10px 12px;background:#f8fbfa;border:1px solid #dfe9e6;border-radius:9px}
    .carnet-fields>.pp-bill-bank-field{margin:0;max-width:none}
    .pp-client-extra-config{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:14px 0;padding:14px;border:1px solid #dfe9e6;border-radius:10px;background:#fbfdfc}
    .pp-client-extra-config-title{grid-column:1/-1;margin:0;color:#304843;font-size:12px;font-weight:800}
    .pp-client-extra-field{display:grid;gap:5px;min-width:0}
    @media(max-width:900px){.pp-bill-bank-field{max-width:none;width:100%}.pp-client-extra-config{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const localState=()=>{try{return JSON.parse(localStorage.getItem('provedor_plus_web_1_0_17')||'{}')||{}}catch{return{}}};
  const localBanks=()=>localState()?.banks||{};
  async function banksState(){
    try{const value=await api?.banks?.get?.();if(value&&typeof value==='object')return value.banks&&typeof value.banks==='object'?value.banks:value}catch(error){console.error('Provedor Plus: não foi possível ler os bancos configurados.',error)}
    return localBanks();
  }
  function readyBanks(banks){
    const active=[],efi=banks?.efi||{},mp=banks?.mercadoPago||{};
    if(efi.enabled&&efi.clientIdConfigured&&efi.clientSecretConfigured)active.push(['efi',`Efí Bank${efi.environment==='production'?' — Produção':' — Homologação'}`]);
    if(mp.enabled&&mp.accessTokenConfigured)active.push(['mercadoPago',`Mercado Pago${mp.environment==='production'?' — Produção':' — Teste'}`]);
    return active;
  }
  function preferredBank(banks,active){
    const enabled=new Set(active.map(([value])=>value)),configured=String(banks?.defaultProvider||'');
    return enabled.has(configured)?configured:active[0]?.[0]||'';
  }
  function fillBankSelect(select,active,value=''){
    if(!select)return;
    const enabled=new Set(active.map(([v])=>v));
    select.innerHTML=active.length?active.map(([v,label])=>`<option value="${esc(v)}">${esc(label)}</option>`).join(''):'<option value="">Nenhum banco pronto para cobrança</option>';
    select.disabled=!active.length;
    if(active.length)select.value=enabled.has(String(value||''))?String(value):active[0][0];
  }

  function clientEditor(){
    const roots=[...document.querySelectorAll('.modal,.dialog,[role="dialog"],.modal-card,.modal-content')];
    return roots.find(root=>{
      if(root.closest('.client-status-modal,.client-bills-modal'))return false;
      const title=normalize(root.querySelector('h1,h2,h3')?.textContent||'');
      return /(^| )(novo|nova|editar|edicao|cadastro|cadastrar) cliente( |$)/.test(title)||title.includes('cliente - editar');
    })||null;
  }
  function clientBillsModal(){
    const explicit=document.querySelector('.client-bills-modal');if(explicit)return explicit;
    return [...document.querySelectorAll('.modal,.dialog,[role="dialog"],.modal-card,.modal-content')].find(root=>normalize(root.querySelector('h1,h2,h3')?.textContent||'').startsWith('boletos de '))||null;
  }
  function currentClientFromRoot(root,clients){
    if(!root||!Array.isArray(clients))return null;
    const title=normalize(root.querySelector('h1,h2,h3')?.textContent||'');
    let client=clients.find(c=>{const name=normalize(c?.name);return name.length>2&&title.includes(name)});
    if(client)return client;
    const values=new Set([...root.querySelectorAll('input')].map(input=>normalize(input.value)).filter(value=>value.length>2));
    return clients.find(c=>[c?.name,c?.document,c?.contract_number].some(value=>{const v=normalize(value);return v&&values.has(v)}))||null;
  }
  async function clientsList(){
    try{const clients=await api?.clients?.list?.();return Array.isArray(clients)?clients:[]}
    catch{const clients=localState()?.clients;return Array.isArray(clients)?clients:[]}
  }

  function ensureClientConfig(root){
    let block=root.querySelector('.pp-client-extra-config');if(block)return block;
    block=document.createElement('section');block.className='pp-client-extra-config';
    block.innerHTML=`<h4 class="pp-client-extra-config-title">Cobrança e acesso remoto</h4>
      <label class="pp-client-extra-field"><span>Banco da cobrança</span><select class="pp-client-bank-select" aria-label="Banco da cobrança"></select><small>Banco preferencial deste cliente para boleto, carnê e PIX.</small></label>
      <label class="pp-client-extra-field"><span>IP do roteador/ONU</span><input class="pp-client-device-ip" type="text" autocomplete="off" placeholder="Ex.: 192.168.1.1 ou https://endereco"/><small>Endereço do equipamento do cliente, não do MikroTik concentrador.</small></label>
      <label class="pp-client-extra-field"><span>Porta do roteador/ONU</span><input class="pp-client-device-port" type="number" min="1" max="65535" inputmode="numeric" placeholder="Vazio = padrão"/><small>Informe somente quando o acesso usar uma porta específica.</small></label>`;
    const form=root.querySelector('form'),actions=root.querySelector('.modal-actions,.form-actions,.actions');
    if(actions&&actions.parentElement)actions.parentElement.insertBefore(block,actions);else if(form)form.appendChild(block);else root.appendChild(block);
    return block;
  }

  async function patchClientEditor(root,banks,active){
    if(!root)return;
    const block=ensureClientConfig(root),clients=await clientsList(),client=currentClientFromRoot(root,clients),preferred=preferredBank(banks,active);
    const bank=block.querySelector('.pp-client-bank-select'),ip=block.querySelector('.pp-client-device-ip'),port=block.querySelector('.pp-client-device-port'),untouched=block.dataset.initialized!=='true';
    fillBankSelect(bank,active,bank?.value||client?.billing_bank_provider||preferred);
    if(untouched){if(ip)ip.value=String(client?.device_ip||'');if(port)port.value=String(client?.device_port||'');block.dataset.initialized='true'}
  }

  function ensureBillField(modal){
    modal.classList.add('pp-client-bills-modal-ready');
    let field=modal.querySelector('.pp-bill-bank-modal-field');if(field)return field;
    field=document.createElement('label');field.className='pp-bill-bank-field pp-bill-bank-modal-field';
    field.innerHTML='<span>Banco da cobrança</span><select class="pp-bill-bank-select" aria-label="Banco da cobrança"></select><small>Escolha o banco que será usado para esta cobrança.</small>';
    const heading=[...modal.querySelectorAll('h2,h3,h4')].find(el=>normalize(el.textContent)==='gerar cobranca para este cliente');
    const area=heading?.parentElement||modal.querySelector('.modal-body')||modal;
    area.appendChild(field);
    return field;
  }
  async function patchBillsModal(modal,banks,active){
    if(!modal)return;
    const field=ensureBillField(modal),clients=await clientsList(),client=currentClientFromRoot(modal,clients),preferred=preferredBank(banks,active),select=field.querySelector('select');
    fillBankSelect(select,active,select?.value||client?.billing_bank_provider||preferred);
    const help=field.querySelector('small');
    if(help)help.textContent=active.length>1?'Selecione qual banco configurado emitirá a cobrança deste cliente.':active.length===1?'O banco configurado será usado para esta cobrança.':'Configure Efí Bank ou Mercado Pago em Integração antes de emitir cobrança real.';
  }

  function selectedBank(){
    for(const selector of ['.pp-bill-bank-modal-field .pp-bill-bank-select','.bill-generator .pp-bill-bank-select','.carnet-fields .pp-bill-bank-select','.pp-client-bank-select']){
      const el=[...document.querySelectorAll(selector)].find(x=>x.value&&!x.disabled&&x.offsetParent!==null);if(el)return String(el.value)
    }
    return '';
  }
  async function clientPreferredBank(clientId){
    if(!Number(clientId))return '';
    try{const clients=await api?.clients?.list?.();return String((clients||[]).find(c=>Number(c?.id)===Number(clientId))?.billing_bank_provider||'')}catch{return ''}
  }

  const invoiceSave=api.invoices.save.bind(api.invoices);
  api.invoices.save=async data=>{
    const next={...(data||{})};
    if(!next.id){const bank=selectedBank()||await clientPreferredBank(next.client_id??next.clientId);if(bank)next.bank_provider=bank}
    return invoiceSave(next);
  };
  if(typeof api.invoices.generateInstallments==='function'){
    const generate=api.invoices.generateInstallments.bind(api.invoices);
    api.invoices.generateInstallments=async data=>{const next={...(data||{})},bank=selectedBank()||await clientPreferredBank(next.client_id??next.clientId);if(bank)next.bank_provider=bank;return generate(next)};
  }

  if(typeof api?.clients?.save==='function'){
    const clientSave=api.clients.save.bind(api.clients);
    api.clients.save=async data=>{
      const next={...(data||{})},root=clientEditor(),block=root?.querySelector('.pp-client-extra-config');
      if(block){
        const bank=String(block.querySelector('.pp-client-bank-select')?.value||'').trim(),ip=String(block.querySelector('.pp-client-device-ip')?.value||'').trim(),portRaw=String(block.querySelector('.pp-client-device-port')?.value||'').trim(),port=Number(portRaw);
        if(bank)next.billing_bank_provider=bank;
        next.device_ip=ip;
        next.device_port=portRaw&&Number.isInteger(port)&&port>=1&&port<=65535?port:'';
      }
      return clientSave(next);
    };
  }

  let running=false,scheduled=false;
  async function patch(){
    if(running)return;running=true;
    try{
      const banks=await banksState(),active=readyBanks(banks),bills=clientBillsModal();
      await patchClientEditor(clientEditor(),banks,active);
      await patchBillsModal(bills,banks,active);
      for(const container of document.querySelectorAll('.bill-generator,.carnet-fields')){
        if(container.closest('.pp-client-bills-modal-ready'))continue;
        let field=container.querySelector(':scope > .pp-bill-bank-field');
        if(!field){field=document.createElement('label');field.className='pp-bill-bank-field';field.innerHTML='<span>Banco da cobrança</span><select class="pp-bill-bank-select" aria-label="Banco da cobrança"></select><small>Banco configurado para esta emissão.</small>';container.prepend(field)}
        const select=field.querySelector('select');fillBankSelect(select,active,select?.value||preferredBank(banks,active));
      }
    }finally{running=false}
  }
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch().catch(error=>console.error('Provedor Plus: falha ao preparar cobrança e acesso do cliente.',error))})});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  patch().catch(error=>console.error('Provedor Plus: falha ao preparar cobrança e acesso do cliente.',error));
})();
