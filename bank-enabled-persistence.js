(()=>{
  if(window.__ProvedorPlusBankEnabledPersistenceInstalled)return;
  window.__ProvedorPlusBankEnabledPersistenceInstalled=true;

  const normalize=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

  function bankForm(input){
    if(!(input instanceof HTMLInputElement)||input.type!=='checkbox'||input.name!=='enabled'||!input.closest('.bank-enable'))return null;
    const form=input.form||input.closest('form');
    if(!form)return null;
    const card=form.closest('.bank-card');
    const text=normalize(card?.textContent||'');
    if(text.includes('efi bank'))return {form,provider:'efi'};
    if(text.includes('mercado pago'))return {form,provider:'mercadoPago'};
    return null;
  }

  function submitSavedState(form){
    queueMicrotask(()=>{
      if(!form.isConnected)return;
      if(typeof form.requestSubmit==='function')form.requestSubmit();
      else form.querySelector('button[type="submit"]')?.click();
    });
  }

  document.addEventListener('change',event=>{
    const bank=bankForm(event.target);
    if(!bank)return;
    submitSavedState(bank.form);
  },true);
})();
