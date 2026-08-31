from pathlib import Path
import re

bootstrap = Path('bootstrap.js')
text = bootstrap.read_text(encoding='utf-8')

old_top = "const __ppStartup={done(){},fail(error){console.error(error)}};\nwindow.addEventListener('provedor-plus-react-error',event=>{const message=event?.detail?.message||'Falha ao montar o painel.';console.error(new Error(message))});"
new_top = r'''let __ppReactBootError=null;
function __ppRenderStartupFailure(error){
  const root=document.getElementById('root');
  if(!root)return;
  root.replaceChildren();
  const outer=document.createElement('div');
  outer.style.cssText='min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f4f7f6;font-family:Segoe UI,Arial,sans-serif;color:#173c35';
  const card=document.createElement('div');
  card.style.cssText='width:min(100%,560px);text-align:center;background:#fff;border:1px solid #dfe8e5;border-radius:16px;padding:28px;box-sizing:border-box;box-shadow:0 16px 42px rgba(22,60,53,.08)';
  const title=document.createElement('h2');title.textContent='Não foi possível abrir o painel';title.style.cssText='margin:0 0 8px';
  const message=document.createElement('p');message.textContent='A inicialização não foi concluída. Nenhuma tela parcial será mantida.';message.style.cssText='margin:0 0 10px;color:#6b7f79';
  const detail=document.createElement('small');detail.textContent=String(error?.message||error||'Falha inesperada na inicialização.');detail.style.cssText='display:block;margin:0 0 18px;color:#83938f;word-break:break-word';
  const button=document.createElement('button');button.type='button';button.textContent='Tentar novamente';button.style.cssText='height:40px;padding:0 18px;border:0;border-radius:9px;background:#0b8f7c;color:#fff;font-weight:800;cursor:pointer';
  button.onclick=()=>{const url=new URL(location.href);url.searchParams.set('ppretry',String(Date.now()));location.replace(url.toString())};
  card.append(title,message,detail,button);outer.appendChild(card);root.appendChild(outer);
}
const __ppReactErrorListener=event=>{
  const error=new Error(event?.detail?.message||'Falha ao montar o painel.');
  __ppReactBootError=error;window.__PP_REACT_BOOT_ERROR__=error;console.error(error);
};
const __ppStartup={
  settled:false,failed:false,
  done(){if(this.settled)return;this.settled=true;window.__PROVEDOR_PLUS_STARTUP_READY__=true;window.removeEventListener('provedor-plus-react-error',__ppReactErrorListener)},
  fail(error){if(this.failed)return;if(this.settled){console.error(error);return}this.failed=true;this.settled=true;window.__PROVEDOR_PLUS_STARTUP_READY__=false;window.removeEventListener('provedor-plus-react-error',__ppReactErrorListener);console.error(error);__ppRenderStartupFailure(error)}
};
window.addEventListener('provedor-plus-react-error',__ppReactErrorListener);'''
if old_top not in text:
    raise SystemExit('startup top marker not found')
text = text.replace(old_top, new_top, 1)

text = text.replace("const BUILD_TOKEN='20260831-step8-mikrotik1';", "const BUILD_TOKEN='20260831-step10-startup1';", 1)

import_marker = "try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}"
if import_marker not in text:
    raise SystemExit('app import marker not found')
text = text.replace(import_marker, import_marker + "\n  if(__ppReactBootError||window.__PP_REACT_BOOT_ERROR__)throw (__ppReactBootError||window.__PP_REACT_BOOT_ERROR__);", 1)

old_ready = '''  const shellDeadline=Date.now()+10000;
  while(!document.querySelector('.app-shell')){
    if(window.__PP_REACT_BOOT_ERROR__)throw window.__PP_REACT_BOOT_ERROR__;
    if(Date.now()>=shellDeadline)throw new Error('O painel não concluiu a primeira renderização.');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  __ppStartup.done();'''
new_ready = '''  const shellDeadline=Date.now()+10000;
  let readyShell=null;
  while(Date.now()<shellDeadline){
    if(__ppReactBootError||window.__PP_REACT_BOOT_ERROR__)throw (__ppReactBootError||window.__PP_REACT_BOOT_ERROR__);
    const shell=document.querySelector('.app-shell'),sidebar=shell?.querySelector('.sidebar,aside'),content=shell?.querySelector('.content');
    if(shell&&sidebar&&content){readyShell=shell;break}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!readyShell)throw new Error('O painel não concluiu a montagem da navegação e do conteúdo principal.');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(!readyShell.isConnected||!readyShell.querySelector('.sidebar,aside')||!readyShell.querySelector('.content'))throw new Error('A estrutura principal do painel foi interrompida durante a montagem.');
  if(__ppReactBootError||window.__PP_REACT_BOOT_ERROR__)throw (__ppReactBootError||window.__PP_REACT_BOOT_ERROR__);
  __ppStartup.done();'''
if old_ready not in text:
    raise SystemExit('shell readiness marker not found')
text = text.replace(old_ready, new_ready, 1)

catch_pattern = re.compile(r"\}\)\(\)\.catch\(err=>\{\n\s*__ppStartup\.fail\(err\);.*?\n\}\);\s*$", re.S)
text, count = catch_pattern.subn("})().catch(err=>{\n  __ppStartup.fail(err);\n});\n", text, count=1)
if count != 1:
    raise SystemExit(f'final catch patch count={count}')

bootstrap.write_text(text, encoding='utf-8')

index = Path('index.html')
html = index.read_text(encoding='utf-8')
old = '/bootstrap.js?v=20260831-step8-mikrotik1'
new = '/bootstrap.js?v=20260831-step10-startup1'
if old not in html:
    raise SystemExit('index bootstrap token not found')
index.write_text(html.replace(old, new, 1), encoding='utf-8')
