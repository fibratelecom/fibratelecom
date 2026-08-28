(()=>{
  if(window.__ProvedorPlusBillingActionUiInstalled)return;
  window.__ProvedorPlusBillingActionUiInstalled=true;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

  const style=document.createElement('style');
  style.textContent=`
    .client-bills-modal .bill-create-actions{
      display:grid!important;
      grid-template-columns:repeat(4,minmax(118px,1fr))!important;
      gap:8px!important;
      align-items:stretch!important;
      width:min(100%,590px)!important;
      margin:0!important;
    }
    .client-bills-modal .bill-create-actions>button.pp-bill-action-button{
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      box-sizing:border-box!important;
      min-width:0!important;
      width:100%!important;
      height:40px!important;
      padding:0 11px!important;
      border-radius:9px!important;
      font-size:12px!important;
      font-weight:700!important;
      line-height:1.1!important;
      white-space:nowrap!important;
      text-align:center!important;
    }
    .client-bills-modal .bill-create-actions>button.pp-bank-provider-disabled{
      opacity:.48!important;
      cursor:not-allowed!important;
    }
    @media(max-width:920px){
      .client-bills-modal .bill-create-actions{grid-template-columns:repeat(2,minmax(132px,1fr))!important;width:100%!important}
    }
    @media(max-width:560px){
      .client-bills-modal .bill-create-actions{grid-template-columns:1fr!important}
    }
  `;
  document.head.appendChild(style);

  function billsModal(){
    const explicit=document.querySelector('.client-bills-modal');
    if(explicit)return explicit;
    return [...document.querySelectorAll('.modal,.dialog,[role="dialog"],.modal-card,.modal-content')].find(root=>normalize(root.querySelector('h1,h2,h3')?.textContent||'').startsWith('boletos de '))||null;
  }

  function bankSelect(modal){
    if(!modal)return null;
    return modal.querySelector('.pp-bill-bank-modal-field .pp-bill-bank-select,.pp-bill-bank-select');
  }

  function actionKind(button){
    const text=normalize(button?.textContent||'');
    if(text.includes('pix automatico'))return 'pix_auto';
    if(text.includes('pix com vencimento'))return 'pix_due';
    if(text.includes('carne'))return 'carne';
    if(text.includes('boleto avulso'))return 'boleto';
    return '';
  }

  function hasProvider(select,value){
    return Boolean(select&&[...select.options].some(option=>String(option.value)===String(value)&&!option.disabled));
  }

  function setProvider(select,value){
    if(!select||select.disabled||!hasProvider(select,value)||select.value===value)return false;
    select.value=value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }

  function patch(){
    const modal=billsModal();if(!modal)return;
    const actions=modal.querySelector('.bill-create-actions');if(!actions)return;
    const select=bankSelect(modal),efiReady=hasProvider(select,'efi');

    actions.querySelectorAll('button').forEach(button=>{
      const kind=actionKind(button);if(!kind)return;
      button.classList.add('pp-bill-action-button');
      button.dataset.ppBillingKind=kind;

      const efiOnly=kind==='pix_due'||kind==='pix_auto'||kind==='carne';
      if(kind==='boleto')button.title='Emite pelo banco selecionado em Banco da cobrança.';
      else if(kind==='carne')button.title='Carnê com várias parcelas é emitido pela Efí Bank.';
      else if(kind==='pix_due')button.title='Pix com vencimento é emitido pela Efí Bank.';
      else if(kind==='pix_auto')button.title='Pix Automático é emitido pela Efí Bank.';

      if(efiOnly&&!efiReady){
        if(!button.disabled){button.disabled=true;button.dataset.ppProviderDisabled='1'}
        button.classList.add('pp-bank-provider-disabled');
      }else{
        if(button.dataset.ppProviderDisabled==='1'){button.disabled=false;delete button.dataset.ppProviderDisabled}
        button.classList.remove('pp-bank-provider-disabled');
      }
    });
  }

  function schedule(){
    requestAnimationFrame(()=>{patch();setTimeout(patch,40);setTimeout(patch,140)});
  }

  document.addEventListener('pointerdown',event=>{
    const button=event.target?.closest?.('.client-bills-modal .bill-create-actions button');
    if(!button||button.disabled)return;
    const kind=actionKind(button);if(!['carne','pix_due','pix_auto'].includes(kind))return;
    const modal=billsModal(),select=bankSelect(modal);
    if(hasProvider(select,'efi'))setProvider(select,'efi');
  },true);

  document.addEventListener('click',schedule,true);
  document.addEventListener('change',schedule,true);
  window.addEventListener('provedor-plus-cloud-error',schedule);
  window.ProvedorPlusPatchBillingActions=patch;
  schedule();
})();
