from pathlib import Path


def repl(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s:
        raise SystemExit('pattern not found: '+path)
    p.write_text(s.replace(old,new,1))

repl('auth-gate.js', """  async function api(action,data={}){
    const response=await fetch('/api/auth',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha de autenticação (HTTP ${response.status}).`);
    return body.data;
  }""", """  async function api(action,data={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch('/api/auth',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal});
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw new Error(body.error||`Falha de autenticação (HTTP ${response.status}).`);
      return body.data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('Tempo limite ao validar a sessão.');
      throw error;
    }finally{clearTimeout(timer)}
  }""")

repl('bootstrap.js', "const BUILD_TOKEN='20260831-boot-unblock1';", "const BUILD_TOKEN='20260831-boot-unblock2';")
repl('bootstrap.js', "})().catch(err=>{__ppStartup.fail(err)});", """})().catch(err=>{
  __ppStartup.fail(err);
  const root=document.getElementById('root');
  if(root&&!root.children.length){
    const box=document.createElement('div');
    box.style.cssText='min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f4f7f6;font-family:Segoe UI,Arial,sans-serif;color:#173c35';
    box.innerHTML='<div style="max-width:520px;text-align:center"><h2 style="margin:0 0 8px">Não foi possível abrir o painel</h2><p style="margin:0 0 16px;color:#6b7f79">A inicialização foi interrompida antes da tela principal.</p><button type="button" style="height:40px;padding:0 16px;border:0;border-radius:9px;background:#0b8f7c;color:#fff;font-weight:800;cursor:pointer">Tentar novamente</button></div>';
    box.querySelector('button').onclick=()=>location.reload();root.appendChild(box);
  }
});""")
repl('index.html','/bootstrap.js?v=20260831-boot-unblock1','/bootstrap.js?v=20260831-boot-unblock2')
