(()=>{
  if(window.__ProvedorPlusBillingBankSelectorInstalled)return;
  window.__ProvedorPlusBillingBankSelectorInstalled=true;

  const api=window.provedor;
  if(!api?.invoices?.save)return;

  const style=document.createElement('style');
  style.textContent=`
    .pp-bill-bank-field{display:grid;gap:5px;min-width:220px;max-width:340px;margin:0 0 12px;color:#405853}
    .pp-bill-bank-field>span{font-size:11px;font-weight:750;line-height:1.25}
    .pp-bill-bank-field select{box-sizing:border-box;width:100%;height:38px;padding:0 10px;color:#2f4a44;background:#fff;border:1px solid #cfe0dc;border-radius:8px;font-size:12px;font-weight:650;outline:none}
    .pp-bill-bank-field select:focus{border-color:#4fae9d;box-shadow:0 0 0 3px rgba(79,174,157,.12)}
    .pp-bill-bank-field select:disabled{color:#899793;background:#f5f8f7;cursor:not-allowed}
    .pp-bill-bank-field small{color:#71827e;font-size:10px;line-height:1.35;white-space:normal}
    .carnet-fields>.pp-bill-bank-field{margin:0;max-width:none}
    @media(max-width:900px){.pp-bill-bank-field{max-width:none;width:100%}}
  `;
  document.head.appendChild(style);

  const localBanks=()=>{try{return JSON.parse(localStorage.getItem('provedor_plus_web_1_0_17')||'{}')?.banks||{}}catch{return{}}};
  async function banksState(){
    try{const value=await api?.banks?.get?.();if(value&&typeof value==='object')return value.banks&&typeof value.banks==='object'?value.banks:value}catch(error){console.error('Provedor Plus: não foi possível ler os bancos configurados.',error)}
    return localBanks();
  }
  function selected(kind){
    const selectors=kind==='installments'?['.carnet-fields .pp-bill-bank-select','.carnet-wrapper .pp-bill-bank-select','.bill-generator .pp-bill-bank-select']:['.bill-generator .pp-bill-bank-select','.client-bills-modal .pp-bill-bank-select'];
    for(const selector of selectors){const el=[...document.querySelectorAll(selector)].find(x=>x.value&&!x.disabled);if(el)return String(el.value)}
    return '';
  }

  const save=api.invoices.save.bind(api.invoices);
  api.invoices.save=async data=>{
    const next={...(data||{})};
    if(!next.id&&!['Pix com vencimento','Pix Automático'].includes(String(next.billing_type||''))){const bank=selected('invoice');if(bank)next.bank_provider=bank}
    return save(next);
  };
  if(typeof api.invoices.generateInstallments==='function'){
    const generate=api.invoices.generateInstallments.bind(api.invoices);
    api.invoices.generateInstallments=async data=>{const next={...(data||{})},bank=selected('installments');if(bank)next.bank_provider=bank;return generate(next)};
  }

  function ensureField(container,kind){
    let field=container.querySelector(':scope > .pp-bill-bank-field');
    if(field)return field;
    field=document.createElement('label');
    field.className='pp-bill-bank-field';
    field.dataset.kind=kind;
    field.innerHTML='<span>Banco emissor do boleto</span><select class="pp-bill-bank-select" aria-label="Banco emissor do boleto"></select><small>Escolha qual banco configurado será usado para gerar esta cobrança pela API real.</small>';
    if(container.classList.contains('bill-generator')){
      const title=container.querySelector('.bill-generator-title');
      if(title)title.insertAdjacentElement('afterend',field);else container.prepend(field);
    }else container.prepend(field);
    return field;
  }

  function readyBanks(banks){
    const active=[];
    const efi=banks?.efi||{},mp=banks?.mercadoPago||{};
    if(efi.enabled&&efi.clientIdConfigured&&efi.clientSecretConfigured)active.push(['efi',`Efí Bank${efi.environment==='production'?' — Produção':' — Homologação'}`]);
    if(mp.enabled&&mp.accessTokenConfigured)active.push(['mercadoPago',`Mercado Pago${mp.environment==='production'?' — Produção':' — Teste'}`]);
    return active;
  }

  let running=false;
  async function patch(){
    if(running)return;
    const targets=[...[...document.querySelectorAll('.bill-generator')].map(container=>({container,kind:'invoice'})),...[...document.querySelectorAll('.carnet-fields')].map(container=>({container,kind:'installments'}))];
    if(!targets.length)return;
    running=true;
    try{
      const banks=await banksState(),active=readyBanks(banks),enabled=new Set(active.map(([value])=>value));
      const preferred=enabled.has(String(banks?.defaultProvider||''))?String(banks.defaultProvider):active[0]?.[0]||'';
      const hasEnabledButIncomplete=Boolean(banks?.efi?.enabled||banks?.mercadoPago?.enabled)&&!active.length;
      for(const {container,kind} of targets){
        const field=ensureField(container,kind),select=field.querySelector('select'),help=field.querySelector('small'),previous=enabled.has(select?.value)?select.value:'';
        if(!select)continue;
        select.innerHTML=active.length?active.map(([value,label])=>`<option value="${value}">${label}</option>`).join(''):'<option value="">Nenhum banco pronto para emissão</option>';
        select.disabled=!active.length;
        if(active.length)select.value=previous||preferred;
        if(help)help.textContent=active.length>1?'Escolha a API bancária que emitirá esta cobrança real.':active.length===1?'Esta cobrança será emitida pela API do banco configurado.':hasEnabledButIncomplete?'O banco está ativado, mas faltam credenciais obrigatórias em Integração.':'Ative e configure Efí Bank ou Mercado Pago em Integração antes de gerar boletos.';
      }
    }finally{running=false}
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch().catch(error=>console.error('Provedor Plus: falha ao preparar seleção do banco emissor.',error))})});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  patch().catch(error=>console.error('Provedor Plus: falha ao preparar seleção do banco emissor.',error));
})();
