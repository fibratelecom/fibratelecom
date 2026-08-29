(()=>{
  if(window.__ProvedorPlusBillingBankSelectorInstalled)return;
  window.__ProvedorPlusBillingBankSelectorInstalled=true;

  const api=window.provedor;
  if(!api?.invoices?.save)return;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const localState=()=>{try{return JSON.parse(localStorage.getItem('provedor_plus_web_1_0_17')||'{}')||{}}catch{return{}}};
  const localBanks=()=>localState()?.banks||{};

  const style=document.createElement('style');
  style.textContent=`
    .pp-bill-bank-field{display:grid;gap:5px;min-width:220px;max-width:360px;margin:0 0 12px;color:#405853}
    .pp-bill-bank-field>span,.pp-client-bank-field>span{font-size:11px;font-weight:750;line-height:1.25;color:#405853}
    .pp-bill-bank-field select,.pp-client-bank-field select{box-sizing:border-box;width:100%;height:38px;padding:0 10px;color:#2f4a44;background:#fff;border:1px solid #cfe0dc;border-radius:8px;font-size:12px;font-weight:650;outline:none}
    .pp-bill-bank-field select:focus,.pp-client-bank-field select:focus{border-color:#4fae9d;box-shadow:0 0 0 3px rgba(79,174,157,.12)}
    .pp-bill-bank-field select:disabled,.pp-client-bank-field select:disabled{color:#899793;background:#f5f8f7;cursor:not-allowed}
    .pp-bill-bank-field small,.pp-client-bank-field small{color:#71827e;font-size:10px;line-height:1.35;white-space:normal}
    .pp-bill-bank-modal-field{max-width:none;margin:10px 0 0;padding:10px 12px;background:#f8fbfa;border:1px solid #dfe9e6;border-radius:9px}
    .carnet-fields>.pp-bill-bank-field{margin:0;max-width:none}
    .pp-client-bank-field{display:grid;gap:5px;max-width:360px;margin:12px 0;padding:12px;border:1px solid #dfe9e6;border-radius:10px;background:#fbfdfc}
    .pp-bill-discount-field{display:grid;gap:8px;min-width:220px;max-width:360px;margin:0 0 12px;padding:11px 12px;border:1px solid #dfe9e6;border-radius:9px;background:#fbfdfc;color:#405853}
    .pp-bill-discount-field.is-unsupported{display:none}
    .pp-bill-discount-modal-field{max-width:none;margin:10px 0 0}
    .pp-bill-discount-toggle{display:flex;align-items:center;gap:8px;min-width:0;color:#405853;font-size:11px;font-weight:750;line-height:1.35;cursor:pointer}
    .pp-bill-discount-toggle input{width:16px;height:16px;margin:0;accent-color:#0d8b78}
    .pp-bill-discount-value{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px}
    .pp-bill-discount-value>span{color:#657773;font-size:11px;font-weight:750}
    .pp-bill-discount-value input{box-sizing:border-box;width:100%;height:38px;padding:0 10px;color:#2f4a44;background:#fff;border:1px solid #cfe0dc;border-radius:8px;font-size:12px;font-weight:700;outline:none}
    .pp-bill-discount-value input:focus{border-color:#4fae9d;box-shadow:0 0 0 3px rgba(79,174,157,.12)}
    .pp-bill-discount-value input:disabled{color:#9aa6a3;background:#f1f5f4}
    .pp-bill-discount-field small{color:#71827e;font-size:10px;line-height:1.35;white-space:normal}
    .pp-bill-discount-summary{display:none;color:#16785f!important;font-weight:700}
    .pp-bill-discount-field.is-enabled .pp-bill-discount-summary{display:block}
    @media(max-width:900px){.pp-bill-bank-field,.pp-client-bank-field,.pp-bill-discount-field{max-width:none;width:100%}}
  `;
  document.head.appendChild(style);

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
  function financeInvoiceModal(){
    return [...document.querySelectorAll('.modal,.dialog,[role="dialog"],.modal-card,.modal-content')].find(root=>{
      if(root.classList.contains('client-bills-modal')||root.closest('.client-bills-modal'))return false;
      return normalize(root.querySelector('h1,h2,h3')?.textContent||'')==='emitir cobranca';
    })||null;
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

  function ensureClientBankField(root){
    let field=root.querySelector('.pp-client-bank-field');if(field)return field;
    field=document.createElement('label');field.className='pp-client-bank-field';
    field.innerHTML='<span>Banco da cobrança</span><select class="pp-client-bank-select" aria-label="Banco da cobrança"></select><small>Banco preferencial deste cliente para boleto, carnê e PIX.</small>';
    const actions=root.querySelector('.modal-actions,.form-actions,.actions'),form=root.querySelector('form');
    if(actions&&actions.parentElement)actions.parentElement.insertBefore(field,actions);else if(form)form.appendChild(field);else root.appendChild(field);
    return field;
  }
  async function patchClientEditor(root,banks,active){
    if(!root)return;
    const field=ensureClientBankField(root),clients=await clientsList(),client=currentClientFromRoot(root,clients),preferred=preferredBank(banks,active),select=field.querySelector('select');
    fillBankSelect(select,active,select?.value||client?.billing_bank_provider||preferred);
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
    const discount=ensureDiscountField(field.parentElement||modal,true);syncDiscountAvailability(discount,visibleBillingKind());
  }

  function parseMoney(value){
    let raw=String(value??'').trim().replace(/[^0-9,.-]/g,'');
    if(!raw)return 0;
    if(raw.includes(','))raw=raw.replace(/\./g,'').replace(',','.');
    else if((raw.match(/\./g)||[]).length>1)raw=raw.replace(/\./g,'');
    const n=Number(raw);return Number.isFinite(n)&&n>0?Math.round(n*100):0;
  }
  function moneyFromCents(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Math.max(0,Number(cents)||0)/100)}
  function resetDiscountField(field){
    if(!field)return;
    const checkbox=field.querySelector('.pp-bill-discount-enabled'),input=field.querySelector('.pp-bill-discount-input'),summary=field.querySelector('.pp-bill-discount-summary');
    if(checkbox)checkbox.checked=false;if(input){input.value='';input.disabled=true}if(summary)summary.textContent='';field.classList.remove('is-enabled');
  }
  function ensureDiscountField(root,modal=false){
    if(!root)return null;
    let field=root.querySelector(':scope > .pp-bill-discount-field');
    if(field)return field;
    field=document.createElement('section');field.className=`pp-bill-discount-field${modal?' pp-bill-discount-modal-field':''}`;
    field.innerHTML='<label class="pp-bill-discount-toggle"><input type="checkbox" class="pp-bill-discount-enabled"><span>Desconto até a data do vencimento</span></label><div class="pp-bill-discount-value"><span>R$</span><input type="text" inputmode="decimal" class="pp-bill-discount-input" placeholder="0,00" disabled aria-label="Valor do desconto"></div><small>Opcional. Marque somente quando quiser conceder desconto se o pagamento ocorrer até o vencimento.</small><small class="pp-bill-discount-summary"></small>';
    const checkbox=field.querySelector('.pp-bill-discount-enabled'),input=field.querySelector('.pp-bill-discount-input'),summary=field.querySelector('.pp-bill-discount-summary');
    const sync=()=>{const enabled=Boolean(checkbox?.checked);field.classList.toggle('is-enabled',enabled);if(input)input.disabled=!enabled;const cents=parseMoney(input?.value);if(summary)summary.textContent=enabled&&cents?`${moneyFromCents(cents)} de desconto até o vencimento.`:''};
    checkbox?.addEventListener('change',()=>{if(!checkbox.checked&&input)input.value='';sync();if(checkbox.checked)setTimeout(()=>input?.focus(),0)});input?.addEventListener('input',sync);sync();
    root.appendChild(field);return field;
  }
  function visibleDiscountField(){return [...document.querySelectorAll('.pp-bill-discount-field')].find(field=>field.offsetParent!==null&&!field.classList.contains('is-unsupported'))||null}
  function findDueDate(data,field){
    for(const value of [data?.due_date,data?.dueDate,data?.expire_at,data?.expiration_date]){const v=String(value||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v}
    const root=field?.closest('.client-bills-modal,.modal,.dialog,[role="dialog"],.bill-generator,.carnet-fields,.pix-fields,.charge-generator,.invoice-generator')||document;
    const inputs=[...root.querySelectorAll('input[type="date"],input[name*="due" i],input[name*="venc" i],input[id*="due" i],input[id*="venc" i]')];
    for(const input of inputs){const v=String(input.value||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v}
    return '';
  }
  function visibleBillingKind(){
    const form=[...document.querySelectorAll('.bill-generator')].find(x=>x.offsetParent!==null);
    const title=normalize(form?.querySelector('.bill-generator-title strong')?.textContent||'');
    if(title.includes('carne'))return 'carne';
    if(title.includes('pix automatico'))return 'pix_auto';
    if(title.includes('pix com vencimento'))return 'pix_due';
    if(title.includes('avulso'))return 'avulso';
    return 'boleto';
  }
  function discountSupported(kind){return ['boleto','pix_due','avulso'].includes(String(kind||''))}
  function syncDiscountAvailability(field,kind){
    if(!field)return;
    const nextKind=String(kind||'boleto'),changed=Boolean(field.dataset.billingKind&&field.dataset.billingKind!==nextKind),supported=discountSupported(nextKind);
    if(changed||!supported)resetDiscountField(field);
    field.dataset.billingKind=nextKind;field.classList.toggle('is-unsupported',!supported);
    const checkbox=field.querySelector('.pp-bill-discount-enabled');if(checkbox)checkbox.disabled=!supported;
  }
  function clearDiscountData(data){
    const next={...(data||{})};
    for(const key of ['discount_until_due','discount_type','discount_cents','discount_value_cents','discount_amount','discount_until_date','discount_deadline','conditional_discount'])delete next[key];
    return next;
  }
  function applyDiscount(data){
    const field=visibleDiscountField();if(!field)return {...(data||{})};
    const kind=visibleBillingKind();syncDiscountAvailability(field,kind);
    let next=clearDiscountData(data),enabled=Boolean(field.querySelector('.pp-bill-discount-enabled')?.checked);
    if(!enabled)return next;
    if(!discountSupported(kind))return next;
    const bank=selectedBank();
    if(bank==='mercadoPago')throw new Error('Mercado Pago: a API de boleto usada pelo Provedor Plus não oferece desconto condicional até o vencimento. Selecione Efí Bank para usar este desconto.');
    const cents=parseMoney(field.querySelector('.pp-bill-discount-input')?.value);
    if(cents<=0)throw new Error('Informe o valor do desconto até o vencimento.');
    const dueDate=findDueDate(next,field);
    if(!dueDate)throw new Error('Informe a data de vencimento antes de gerar a cobrança com desconto.');
    next.discount_until_due=true;
    next.discount_type='currency';
    next.discount_cents=cents;
    next.discount_value_cents=cents;
    next.discount_amount=cents/100;
    next.discount_until_date=dueDate;
    next.discount_deadline=dueDate;
    next.conditional_discount={type:'currency',value:cents,until_date:dueDate};
    return next;
  }

  function selectedBank(){
    for(const selector of ['.pp-bill-bank-modal-field .pp-bill-bank-select','.bill-generator .pp-bill-bank-select','.carnet-fields .pp-bill-bank-select','.pix-fields .pp-bill-bank-select','.charge-generator .pp-bill-bank-select','.invoice-generator .pp-bill-bank-select','.pp-client-bank-select']){
      const el=[...document.querySelectorAll(selector)].find(x=>x.value&&!x.disabled&&x.offsetParent!==null);if(el)return String(el.value)
    }
    return '';
  }
  async function refreshBillingClient(clientId){
    const id=Number(clientId)||0;if(!id)return null;
    const clients=await api?.clients?.list?.();
    const fresh=(Array.isArray(clients)?clients:[]).find(c=>Number(c?.id)===id)||null;
    if(!fresh)throw new Error('Cliente não encontrado na nuvem antes de emitir a cobrança. Atualize o cadastro e tente novamente.');
    return fresh;
  }
  function explainBankError(error){
    const message=String(error?.message||error||'Falha na emissão bancária.');
    if(normalize(message).includes('recebedor e cliente nao podem ser a mesma pessoa')){
      return new Error('Efí: o CPF/CNPJ do cliente desta cobrança é o mesmo do titular da conta Efí. O Provedor Plus já atualizou o cadastro antes da emissão; use um cliente com CPF/CNPJ diferente do recebedor da conta Efí. Alterar apenas os dados da empresa, agência ou conta recebedora não muda o cliente enviado no carnê.');
    }
    return error instanceof Error?error:new Error(message);
  }

  if(typeof api?.banks?.createEfiPixAutomatic==='function'){
  const createEfiPixAutomatic=api.banks.createEfiPixAutomatic.bind(api.banks);
  api.banks.createEfiPixAutomatic=async values=>{
    await refreshBillingClient(values?.clientId);
    try{return await createEfiPixAutomatic(values)}catch(error){throw explainBankError(error)}
  };
}

  const invoiceSave=api.invoices.save.bind(api.invoices);
  api.invoices.save=async data=>{
    let next={...(data||{})};
    const freshClient=await refreshBillingClient(next.client_id??next.clientId);
    const bank=selectedBank()||String(freshClient?.billing_bank_provider||'');if(bank&&!next.id)next.bank_provider=bank;
    const discountField=visibleDiscountField();if(discountField)next=applyDiscount(next);
    try{const saved=await invoiceSave(next);resetDiscountField(discountField);return saved}catch(error){throw explainBankError(error)}
  };
  if(typeof api.invoices.generateInstallments==='function'){
    const generate=api.invoices.generateInstallments.bind(api.invoices);
    api.invoices.generateInstallments=async data=>{
      let next={...(data||{})};
      const freshClient=await refreshBillingClient(next.client_id??next.clientId),bank=selectedBank()||String(freshClient?.billing_bank_provider||'');if(bank)next.bank_provider=bank;
      const discountField=visibleDiscountField();if(discountField)next=applyDiscount(next);
      try{const saved=await generate(next);resetDiscountField(discountField);return saved}catch(error){throw explainBankError(error)}
    };
  }

  if(typeof api?.clients?.save==='function'){
    const clientSave=api.clients.save.bind(api.clients);
    api.clients.save=async data=>{
      const next={...(data||{})},root=clientEditor(),select=root?.querySelector('.pp-client-bank-select');
      if(select?.value)next.billing_bank_provider=String(select.value);
      return clientSave(next);
    };
  }

  let running=false,scheduled=false;
  async function patch(){
    if(running)return;running=true;
    try{
      const banks=await banksState(),active=readyBanks(banks),bills=clientBillsModal(),finance=financeInvoiceModal(),kind=visibleBillingKind();
      await patchClientEditor(clientEditor(),banks,active);
      await patchBillsModal(bills,banks,active);
      await patchBillsModal(finance,banks,active);
      for(const container of document.querySelectorAll('.bill-generator,.carnet-fields,.pix-fields,.charge-generator,.invoice-generator')){
        if(container.closest('.pp-client-bills-modal-ready'))continue;
        let field=container.querySelector(':scope > .pp-bill-bank-field');
        if(!field){field=document.createElement('label');field.className='pp-bill-bank-field';field.innerHTML='<span>Banco da cobrança</span><select class="pp-bill-bank-select" aria-label="Banco da cobrança"></select><small>Banco configurado para esta emissão.</small>';container.prepend(field)}
        const select=field.querySelector('select');fillBankSelect(select,active,select?.value||preferredBank(banks,active));
        const discount=ensureDiscountField(container,false);syncDiscountAvailability(discount,kind);
      }
    }finally{running=false}
  }
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch().catch(error=>console.error('Provedor Plus: falha ao preparar cobrança.',error))})});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  patch().catch(error=>console.error('Provedor Plus: falha ao preparar cobrança.',error));
})();