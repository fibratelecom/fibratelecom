(()=>{
'use strict';

const API='/api/push-admin';
let deferredInstallPrompt=null;
let registration=null;
let pushActive=false;
let pushBusy=false;
let adminSession=false;

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

function ensureNotificationGate(){
  let gate=document.querySelector('[data-admin-notification-gate]');
  if(gate)return gate;
  gate=document.createElement('section');
  gate.className='admin-notification-gate';
  gate.setAttribute('data-admin-notification-gate','');
  gate.hidden=true;
  gate.innerHTML=`<div class="admin-notification-gate-card"><img src="/app-icon-192.png?v=20261006-payments1" alt="" aria-hidden="true"><span class="section-label light">PROVEDOR PLUS</span><h2>Ative as notificações de pagamentos</h2><p data-admin-notification-message>Para usar o painel administrativo neste aparelho, autorize as notificações de pagamentos.</p><div class="admin-notification-gate-actions"><button class="btn primary payment-notification-gate-action" data-admin-push type="button">Ativar notificações</button><button class="notification-gate-install" data-pwa-install type="button" hidden>Instalar Provedor Plus</button></div><small>Você receberá valor, cliente, contrato, vencimento e forma de pagamento quando uma mensalidade for confirmada como paga.</small></div>`;
  document.body.appendChild(gate);
  return gate;
}

function syncNotificationGate(message=''){
  const gate=ensureNotificationGate(),required=adminSession&&!pushActive;
  gate.hidden=!required;
  document.documentElement.classList.toggle('admin-notification-required',required);
  if(!required)return;
  const node=gate.querySelector('[data-admin-notification-message]');
  let detail=message;
  if(!detail&&!pushSupported())detail='Este navegador não oferece notificações push. Use um navegador compatível para acessar o painel administrativo.';
  else if(!detail&&isIOS()&&!isStandalone())detail='No iPhone ou iPad, instale o Provedor Plus na Tela de Início e abra pelo ícone para ativar as notificações.';
  else if(!detail&&Notification.permission==='denied')detail='As notificações estão bloqueadas neste aparelho. Ative-as nas configurações do sistema e volte ao Provedor Plus.';
  else if(!detail)detail='As notificações de pagamentos são obrigatórias para o administrador neste aparelho. Toque abaixo para autorizar.';
  if(node)node.textContent=detail;
  syncInstallButtons();
}

function syncPushButtons(message=''){
  all('[data-admin-push]').forEach(button=>{
    button.hidden=false;
    button.disabled=pushBusy;
    button.classList.toggle('active',pushActive);
    const gateAction=button.classList.contains('payment-notification-gate-action');
    button.textContent=pushBusy?'Aguarde…':gateAction?'Ativar notificações':'Notificações';
    if(message)button.title=message;
  });
  syncNotificationGate(message);
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
    registration=await navigator.serviceWorker.register('/sw.js?v=20261006-payments1',{scope:'/',updateViaCache:'none'});
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
  if(!adminSession){pushActive=false;syncNotificationGate();return}
  ensureNotificationGate();
  if(!pushSupported()){pushActive=false;syncPushButtons('Este navegador não oferece notificações push.');return}
  if(isIOS()&&!isStandalone()){pushActive=false;syncPushButtons('No iPhone, instale o Provedor Plus na Tela de Início antes de ativar as notificações.');return}
  if(Notification.permission!=='granted'){pushActive=false;syncPushButtons(Notification.permission==='denied'?'As notificações estão bloqueadas. Ative-as nas configurações do aparelho.':'Autorize as notificações para continuar usando o painel administrativo.');return}
  try{
    const sub=await currentSubscription();
    if(!sub){pushActive=false;syncPushButtons('Autorize as notificações para continuar usando o painel administrativo.');return}
    const state=await api('status',{endpoint:sub.endpoint});
    pushActive=state.active===true;
    syncPushButtons(pushActive?'Notificações de pagamentos ativas neste aparelho.':'Autorize as notificações para continuar usando o painel administrativo.');
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
        pushActive=true;
        toast('As notificações de pagamentos são obrigatórias e já estão ativas neste aparelho.');
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
    toast('Notificações de pagamentos ativadas. O Provedor Plus avisará quando uma mensalidade for confirmada como paga.');
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
window.addEventListener('provedorplus:login-ready',()=>{adminSession=false;pushActive=false;syncInstallButtons();syncNotificationGate()});
window.addEventListener('provedorplus:authenticated',event=>{
  adminSession=String(event?.detail?.role||'').toLowerCase()==='admin';
  if(adminSession)ensureNotificationGate();
  syncInstallButtons();
  if(adminSession)void syncPushState();
});
window.addEventListener('focus',()=>{if(adminSession)void syncPushState()});

async function boot(){
  registration=await registerServiceWorker();
  syncInstallButtons();
  void syncPushState();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();

window.ProvedorPlusPWA={install:installApp,syncPush:syncPushState,isInstalled:isStandalone};
})();
