(()=>{
'use strict';

const API='/api/push-admin';
let deferredInstallPrompt=null;
let registration=null;
let pushActive=false;
let pushBusy=false;

const text=value=>String(value??'').trim();
const all=selector=>[...document.querySelectorAll(selector)];
const isIOS=()=>/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||navigator.standalone===true;
const pushSupported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
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

function syncInstallButtons(){
  const visible=!isStandalone()&&(mobileLike()||Boolean(deferredInstallPrompt));
  all('[data-pwa-install]').forEach(button=>{
    button.hidden=!visible;
    button.textContent=isIOS()?'Instalar no iPhone':'Instalar aplicativo';
  });
}

function syncPushButtons(message=''){
  all('[data-admin-push]').forEach(button=>{
    button.hidden=false;
    button.disabled=pushBusy;
    button.classList.toggle('active',pushActive);
    button.textContent=pushBusy?'Aguarde…':pushActive?'Avisos Pix ativos':'Ativar avisos Pix';
    if(message)button.title=message;
  });
}

async function api(action,data={}){
  const response=await fetch(API,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
  let body={};try{body=await response.json()}catch{}
  if(!response.ok||body?.ok!==true)throw new Error(body?.error||`Falha nas notificações (HTTP ${response.status}).`);
  return body.data||{};
}

function toKey(value){
  const raw=text(value).replace(/-/g,'+').replace(/_/g,'/'),padded=raw+'='.repeat((4-raw.length%4)%4),binary=atob(padded),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return null;
  try{
    registration=await navigator.serviceWorker.register('/sw.js?v=20261005',{scope:'/',updateViaCache:'none'});
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

async function currentSubscription(){
  const reg=registration||await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function syncPushState(){
  if(!document.querySelector('[data-admin-push]'))return;
  if(!pushSupported()){pushActive=false;syncPushButtons('Este navegador não oferece notificações push.');return}
  if(isIOS()&&!isStandalone()){pushActive=false;syncPushButtons('No iPhone, instale o Provedor Plus antes de ativar os avisos.');return}
  if(Notification.permission!=='granted'){pushActive=false;syncPushButtons('Ative para receber o nome do cliente quando o Pix for confirmado.');return}
  try{
    const sub=await currentSubscription();
    if(!sub){pushActive=false;syncPushButtons();return}
    const state=await api('status',{endpoint:sub.endpoint});
    pushActive=state.active===true;
    syncPushButtons();
  }catch(error){
    pushActive=false;
    syncPushButtons(error.message||String(error));
  }
}

async function togglePush(){
  if(pushBusy)return;
  pushBusy=true;syncPushButtons();
  try{
    if(!pushSupported())throw new Error('Este navegador não oferece notificações push.');
    if(isIOS()&&!isStandalone())throw new Error('No iPhone, instale o Provedor Plus na Tela de Início antes de ativar os avisos.');
    let sub=await currentSubscription();
    if(sub&&Notification.permission==='granted'){
      const state=await api('status',{endpoint:sub.endpoint});
      if(state.active===true){
        await api('unsubscribe',{endpoint:sub.endpoint});
        await sub.unsubscribe();
        pushActive=false;
        toast('Avisos de Pix desativados neste dispositivo.');
        return;
      }
    }
    let permission=Notification.permission;
    if(permission!=='granted')permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('A permissão de notificações não foi concedida.');
    const config=await api('config'),reg=registration||await navigator.serviceWorker.ready;
    sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toKey(config.publicKey)});
    await api('subscribe',{subscription:sub.toJSON(),userAgent:navigator.userAgent,platform:navigator.platform||''});
    pushActive=true;
    toast('Avisos Pix ativados. O Provedor Plus mostrará o nome do cliente quando o Mercado Pago confirmar o pagamento.');
  }finally{
    pushBusy=false;
    syncPushButtons();
  }
}

document.addEventListener('click',event=>{
  const install=event.target.closest?.('[data-pwa-install]');
  if(install){event.preventDefault();void installApp().catch(error=>toast(error.message||String(error),'error'));return}
  const push=event.target.closest?.('[data-admin-push]');
  if(push){event.preventDefault();void togglePush().catch(error=>toast(error.message||String(error),'error'))}
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
window.addEventListener('provedorplus:authenticated',()=>{
  syncInstallButtons();
  void syncPushState();
});
window.addEventListener('focus',()=>void syncPushState());

async function boot(){
  registration=await registerServiceWorker();
  syncInstallButtons();
  void syncPushState();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();

window.ProvedorPlusPWA={install:installApp,syncPush:syncPushState,isInstalled:isStandalone};
})();
