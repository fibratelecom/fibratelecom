from pathlib import Path


def repl(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'pattern not found in {path}: {old[:80]}')
    p.write_text(s.replace(old, new, 1))

repl('cloud-state-store.js', """  async function cloud(action,data={}){
    const response=await fetch('/api/cloud-state',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})
    });
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
    return body.data;
  }""", """  async function cloud(action,data={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch('/api/cloud-state',{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal
      });
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw new Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
      return body.data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error(`Tempo limite ao consultar ${action}.`);
      throw error;
    }finally{clearTimeout(timer)}
  }""")

repl('cloud-adapter.js', '    await hydrateBankSettings();', "    hydrateBankSettings().catch(error=>console.warn('Provedor Plus: hidratacao bancaria em segundo plano falhou.',error));")

repl('bootstrap.js', """  await window.ProvedorPlusCloudState.prepare();
  const currentState=window.ProvedorPlusCloudState.getState()||{};
  currentState.settings={...(currentState.settings||{}),current_user_name:auth?.user?.name||currentState.settings?.current_user_name||'Administrador'};
  localStorage.setItem('provedor_plus_web_1_0_17',JSON.stringify(currentState));
  await window.ProvedorPlusCloudState.forceSync();""", """  await Promise.race([
    window.ProvedorPlusCloudState.prepare().catch(error=>{console.warn('Provedor Plus: estado remoto indisponivel na abertura; seguindo com o estado local.',error);return null}),
    new Promise(resolve=>setTimeout(()=>resolve(null),1200))
  ]);
  const currentState=window.ProvedorPlusCloudState.getState()||{};
  currentState.settings={...(currentState.settings||{}),current_user_name:auth?.user?.name||currentState.settings?.current_user_name||'Administrador'};
  localStorage.setItem('provedor_plus_web_1_0_17',JSON.stringify(currentState));
  window.ProvedorPlusCloudState.forceSync().catch(error=>console.warn('Provedor Plus: sincronizacao inicial continuara depois.',error));""")

repl('bootstrap.js', "  if(typeof window.provedor?.invoices?.sync==='function')await window.provedor.invoices.sync().catch(error=>console.error('Provedor Plus: falha na conciliação inicial de cobranças.',error));", "  if(typeof window.provedor?.invoices?.sync==='function')window.provedor.invoices.sync().catch(error=>console.error('Provedor Plus: falha na conciliação inicial de cobranças.',error));")

repl('bootstrap.js', "const BUILD_TOKEN='20260831-no-loading1';", "const BUILD_TOKEN='20260831-boot-unblock1';")
repl('index.html', '/bootstrap.js?v=20260831-no-loading1', '/bootstrap.js?v=20260831-boot-unblock1')
