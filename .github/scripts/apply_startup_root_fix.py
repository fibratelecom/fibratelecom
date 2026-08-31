from pathlib import Path
import base64,gzip,math

def replace_once(path,old,new):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit(f'Padrao nao encontrado em {path}: {old[:120]}')
    p.write_text(s.replace(old,new,1))

replace_once('bootstrap.js',
    "const screen=document.getElementById('pp-startup-screen'),status=document.getElementById('pp-startup-status'),stage=document.getElementById('pp-startup-stage'),retry=document.getElementById('pp-startup-retry');",
    "const screen=document.getElementById('pp-startup-screen-new'),status=document.getElementById('pp-startup-status-new'),stage=document.getElementById('pp-startup-stage-new'),retry=document.getElementById('pp-startup-retry-new');")

replace_once('bootstrap.js',
    "})();\n(async()=>{\n  window.__PROVEDOR_PLUS_CLOUD__=true;",
    "})();\nwindow.addEventListener('provedor-plus-react-error',event=>{const message=event?.detail?.message||'Falha ao montar o painel.';__ppStartup.fail(new Error(message))});\n(async()=>{\n  window.__PROVEDOR_PLUS_CLOUD__=true;")
replace_once('bootstrap.js',"const BUILD_TOKEN='20260831-startup-nolegacy1';","const BUILD_TOKEN='20260831-startup-rootfix1';")

old="""  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(typeof window.ProvedorPlusPatchClientViewButtons==='function')window.ProvedorPlusPatchClientViewButtons();
  __ppStartup.done();
})().catch(err=>{__ppStartup.fail(err)});"""
new="""  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(typeof window.ProvedorPlusPatchClientViewButtons==='function')window.ProvedorPlusPatchClientViewButtons();
  const shellDeadline=Date.now()+10000;
  while(!document.querySelector('.app-shell')){
    if(window.__PP_REACT_BOOT_ERROR__)throw window.__PP_REACT_BOOT_ERROR__;
    if(Date.now()>=shellDeadline)throw new Error('O painel não concluiu a primeira renderização.');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  __ppStartup.done();
})().catch(err=>{__ppStartup.fail(err)});"""
replace_once('bootstrap.js',old,new)

replace_once('index.html','<script defer src="/startup-loader.js?v=20260831-startup-unlock1"></script>\n','')
replace_once('index.html','/bootstrap.js?v=20260831-startup-nolegacy1','/bootstrap.js?v=20260831-startup-rootfix1')

files=[Path(f'packed/appgz-{i:02d}.txt') for i in range(1,34)]
encoded=''.join(p.read_text().strip() for p in files)
app=gzip.decompress(base64.b64decode(encoded)).decode()
old_prefix="async function Se(){let e=g(),q=async(e,t,n)=>"
if old_prefix not in app: raise SystemExit('Prefixo Se nao encontrado')
app=app.replace(old_prefix,"async function Se(){let q=async(e,t,n)=>",1)
start=app.find('async function Se(){')
target=';try{let[t,n,r,i,o,s,c,u,d]=await Promise.all(['
pos=app.find(target,start,start+5000)
if pos<0: raise SystemExit('Bloco try Se nao encontrado')
app=app[:pos]+app[pos:].replace(target,';try{let e=g(),[t,n,r,i,o,s,c,u,d]=await Promise.all([',1)
render_old=';return c?(0,p.jsxs)(`main`,{className:`boot-screen error-screen`'
render_new=';return i?null:c?(0,p.jsxs)(`main`,{className:`boot-screen error-screen`'
if render_old not in app: raise SystemExit('Render atual nao encontrado')
app=app.replace(render_old,render_new,1)
root_old='(0,d.createRoot)(document.getElementById(`root`)).render((0,p.jsx)(f.StrictMode,{children:(0,p.jsx)(A,{})}));'
root_new='(0,d.createRoot)(document.getElementById(`root`),{onUncaughtError:e=>{window.__PP_REACT_BOOT_ERROR__=e,console.error(`Provedor Plus: falha fatal de renderização.`,e),window.dispatchEvent(new CustomEvent(`provedor-plus-react-error`,{detail:{message:e instanceof Error?e.message:String(e)}}))}}).render((0,p.jsx)(f.StrictMode,{children:(0,p.jsx)(A,{})}));'
if root_old not in app: raise SystemExit('createRoot nao encontrado')
app=app.replace(root_old,root_new,1)
packed=base64.b64encode(gzip.compress(app.encode(),compresslevel=9)).decode()
chunk=math.ceil(len(packed)/len(files))
if chunk>3500: raise SystemExit(f'Chunk grande: {chunk}')
for idx,p in enumerate(files): p.write_text(packed[idx*chunk:(idx+1)*chunk]+'\n')
Path('startup-loader.js').unlink(missing_ok=True)
