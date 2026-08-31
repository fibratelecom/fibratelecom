from pathlib import Path

bootstrap = Path('bootstrap.js')
text = bootstrap.read_text(encoding='utf-8')
old = """  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));\n  await loadScript('/dashboard-transition-guard.js?v=20260831-uiatomic4');\n  await loadScriptStable('/dashboard-enhancements.js?v=20260831-uiatomic4',{dropCharacterData:true,observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-root-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-new-plans-layer']});\n"""
new = """  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));\n  const baseUiDeadline=Date.now()+8000;\n  let baseUiNav=null,baseUiContent=null,baseUiSignature='',baseUiStableSince=0;\n  while(Date.now()<baseUiDeadline){\n    const shell=document.querySelector('.app-shell'),nav=shell?.querySelector('.sidebar nav,aside nav'),content=shell?.querySelector('.content');\n    if(shell&&nav&&content){\n      const signature=`${nav.children.length}|${String(nav.textContent||'').replace(/\\s+/g,' ').trim()}`;\n      if(nav===baseUiNav&&content===baseUiContent&&signature===baseUiSignature){\n        if(Date.now()-baseUiStableSince>=700)break;\n      }else{\n        baseUiNav=nav;baseUiContent=content;baseUiSignature=signature;baseUiStableSince=Date.now();\n      }\n    }else{\n      baseUiNav=null;baseUiContent=null;baseUiSignature='';baseUiStableSince=0;\n    }\n    await new Promise(resolve=>setTimeout(resolve,50));\n  }\n  const stableShell=document.querySelector('.app-shell'),stableNav=stableShell?.querySelector('.sidebar nav,aside nav'),stableContent=stableShell?.querySelector('.content');\n  if(!stableShell||!stableNav||!stableContent||!baseUiStableSince||Date.now()-baseUiStableSince<700)throw new Error('A estrutura base do painel não estabilizou antes da montagem da interface atual.');\n  await loadScript('/dashboard-transition-guard.js?v=20260831-uiatomic5');\n  await loadScriptStable('/dashboard-enhancements.js?v=20260831-uiatomic5',{dropCharacterData:true,observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-root-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-new-plans-layer']});\n"""
if old not in text:
    raise SystemExit('Trecho de montagem uiatomic4 não encontrado; nenhuma alteração aplicada.')
text = text.replace(old, new, 1)
text = text.replace("const BUILD_TOKEN='20260831-uiatomic4';", "const BUILD_TOKEN='20260831-uiatomic5';", 1)
bootstrap.write_text(text, encoding='utf-8')

index = Path('index.html')
html = index.read_text(encoding='utf-8')
if '/bootstrap.js?v=20260831-uiatomic4' not in html:
    raise SystemExit('Referência uiatomic4 do bootstrap não encontrada no index.')
html = html.replace('/bootstrap.js?v=20260831-uiatomic4', '/bootstrap.js?v=20260831-uiatomic5', 1)
index.write_text(html, encoding='utf-8')

print('OK: bootstrap agora aguarda a navegação base estabilizar antes de montar Dashboard, Cliente e Integração.')
