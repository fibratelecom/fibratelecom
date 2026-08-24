(()=>{
  const replaceText=(root,from,to)=>{
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode()))if(n.nodeValue&&n.nodeValue.includes(from))n.nodeValue=n.nodeValue.replaceAll(from,to);
  };
  let scheduled=false;
  function patch(){
    scheduled=false;
    const root=document.body;
    if(!root)return;
    replaceText(root,'Sistema local','Sistema online');
    replaceText(root,'IP privado ou VPN','MikroTik Cloud / domínio público');
    replaceText(root,'API nativa local','REST HTTPS pela nuvem');
    replaceText(root,'O Windows protege a senha e o programa reconecta automaticamente.','A senha fica criptografada neste navegador e só é enviada ao backend durante a conexão HTTPS com o MikroTik.');
    replaceText(root,'Configuração da rede e conexão direta com o RouterOS 7.','Configuração da rede e conexão HTTPS com o RouterOS 7, sem instalar programa no computador.');
    replaceText(root,'Conexão direta com o RouterOS 7.','Conexão HTTPS com o RouterOS 7 pela nuvem.');
    const config=document.querySelector('.router-config');
    if(config&&!config.querySelector('.cloud-mode-note')){
      const note=document.createElement('div');note.className='cloud-mode-note';
      note.innerHTML='<strong>Conexão MikroTik sem programa no computador</strong>Use REST HTTPS com o DNS do MikroTik Cloud (ex.: xxxxx.sn.mynetname.net) ou outro domínio público. O RouterOS precisa estar com www-ssl/REST habilitado.';
      const picker=config.querySelector('.router-picker');(picker||config.querySelector('.panel-head'))?.insertAdjacentElement('afterend',note);
    }
    document.querySelectorAll('.router-form.multi select').forEach(select=>{
      const api=[...select.options].find(o=>o.value==='api'),rest=[...select.options].find(o=>o.value==='rest');
      if(api&&rest){api.hidden=true;api.disabled=true;if(select.value==='api'&&!select.dataset.cloudNormalized){select.dataset.cloudNormalized='1';select.value='rest';select.dispatchEvent(new Event('change',{bubbles:true}))}}
    });
    document.querySelectorAll('.router-form.multi input').forEach(input=>{
      const label=input.closest('label');if(label&&label.textContent.includes('MikroTik Cloud / domínio público'))input.placeholder='exemplo.sn.mynetname.net';
    });
  }
  const requestPatch=()=>{if(!scheduled){scheduled=true;queueMicrotask(patch)}};
  new MutationObserver(requestPatch).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch,{once:true});else patch();
})();
