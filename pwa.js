(()=>{
'use strict';

let deferredInstallPrompt=null;

const all=selector=>[...document.querySelectorAll(selector)];
const isIOS=()=>/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true;
const mobileLike=()=>isIOS()||/Android/i.test(navigator.userAgent)||window.matchMedia?.('(max-width: 820px)')?.matches===true;

function toast(message,kind='success'){
  const host=document.querySelector('#toast-root');
  if(host){
    const item=document.createElement('div');
    item.className=`toast ${kind}`;
    item.textContent=message;
    host.appendChild(item);
    window.setTimeout(()=>item.remove(),5000);
    return;
  }
  window.alert(message);
}

function loginInstallMarkup(){
  const platform=isIOS()?'iPhone / iPad':/Android/i.test(navigator.userAgent)?'Android':'este dispositivo';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="2.4"/><path d="M9 18.2h6M12 6v8M9.2 11.2 12 14l2.8-2.8"/></svg><span><strong>Instalar Provedor Plus</strong><small>Aplicativo para ${platform}</small></span>`;
}

function syncInstallButtons(){
  const visible=!isStandalone()&&(mobileLike()||Boolean(deferredInstallPrompt));
  all('[data-pwa-install]').forEach(button=>{
    button.hidden=!visible;
    if(button.classList.contains('pwa-login-install')){
      button.innerHTML=loginInstallMarkup();
      button.setAttribute('aria-label',isIOS()?'Instalar Provedor Plus no iPhone ou iPad':'Instalar Provedor Plus');
      return;
    }
    const compact=button.classList.contains('pwa-header-action');
    button.textContent=compact?(isIOS()?'Instalar':'Instalar app'):(isIOS()?'Instalar no iPhone':'Instalar aplicativo');
  });
}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return null;
  try{
    const registration=await navigator.serviceWorker.register('/sw.js?v=20261008-no-admin-notifications1',{scope:'/',updateViaCache:'none'});
    registration.waiting?.postMessage({type:'SKIP_WAITING'});
    try{await registration.update()}catch{}
    return registration;
  }catch(error){
    console.error('Provedor Plus: PWA não pôde registrar o service worker.',error);
    return null;
  }
}

function installInstructions(){
  if(isIOS())return 'No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.';
  return 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.';
}

async function installApp(){
  if(isStandalone()){toast('O Provedor Plus já está instalado neste aparelho.');return}
  if(deferredInstallPrompt){
    const prompt=deferredInstallPrompt;
    deferredInstallPrompt=null;
    await prompt.prompt();
    const choice=await prompt.userChoice;
    if(choice?.outcome==='accepted')toast('Instalação do Provedor Plus confirmada.');
    else toast('Instalação não confirmada. Você pode tentar novamente pelo menu do navegador.','error');
    syncInstallButtons();
    return;
  }
  toast(installInstructions());
}

document.addEventListener('click',event=>{
  const install=event.target.closest?.('[data-pwa-install]');
  if(install){event.preventDefault();void installApp().catch(error=>toast(error.message||String(error),'error'))}
});

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  syncInstallButtons();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  syncInstallButtons();
  toast('Provedor Plus instalado neste aparelho.');
});
window.addEventListener('provedorplus:login-ready',syncInstallButtons);
window.addEventListener('provedorplus:authenticated',syncInstallButtons);

async function boot(){
  await registerServiceWorker();
  syncInstallButtons();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();

window.ProvedorPlusPWA={install:installApp,isInstalled:isStandalone};
})();
