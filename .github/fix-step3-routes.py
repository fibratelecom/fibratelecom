from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrao nao encontrado em {path}: {old[:120]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')

# Cache da etapa.
replace_once('bootstrap.js', "const BUILD_TOKEN='20260831-step2-plans1';", "const BUILD_TOKEN='20260831-step3-routes1';")
replace_once('index.html', "/bootstrap.js?v=20260831-step2-plans1", "/bootstrap.js?v=20260831-step3-routes1")

# O controlador deixa de guardar apenas o botao DOM antigo; guarda tambem a intencao da rota.
replace_once(
    'bootstrap.js',
    "    let intentButton=null,intentAt=0,syncTimer=null,contentObserver=null,observedContent=null;",
    "    let intentButton=null,intentRoute=null,intentAt=0,syncTimer=null,contentObserver=null,observedContent=null,navObservers=new Map(),shellObserver=null,rootObserver=null,observedShell=null,navBindTimer=null;"
)

replace_once(
    'bootstrap.js',
    """    const activeButton=()=>{\n      const buttons=[...document.querySelectorAll('.sidebar nav button.active,aside nav button.active,nav button.active')];\n      return buttons.find(button=>button.offsetParent!==null)||buttons[0]||null;\n    };\n    const intendedButton=()=>{\n      const active=activeButton();\n      if(intentButton?.isConnected&&Date.now()-intentAt<6000){\n        if(active&&routeForButton(active)===routeForButton(intentButton))intentButton=null;\n        else return intentButton;\n      }\n      return active;\n    };""",
    """    const activeButton=()=>{\n      const shell=document.querySelector('.app-shell')||document;\n      const buttons=[...shell.querySelectorAll('.sidebar nav button.active,aside nav button.active')];\n      return buttons.find(button=>button.offsetParent!==null)||buttons[0]||null;\n    };\n    const intendedRoute=()=>{\n      const active=activeButton(),activeRoute=routeForButton(active);\n      if(intentRoute&&Date.now()-intentAt<2500){\n        if(active&&activeRoute===intentRoute){intentButton=null;intentRoute=null}\n        else return {button:intentButton?.isConnected?intentButton:active,route:intentRoute};\n      }\n      if(intentRoute&&Date.now()-intentAt>=2500){intentButton=null;intentRoute=null}\n      return {button:active,route:activeRoute};\n    };"""
)

replace_once(
    'bootstrap.js',
    "      const button=intendedButton(),route=routeForButton(button),content=resolveContent(button);",
    "      const intended=intendedRoute(),button=intended.button,route=intended.route,content=resolveContent(button);"
)

old_tail="""    function schedule(){clearTimeout(syncTimer);syncTimer=setTimeout(sync,20);setTimeout(sync,90);setTimeout(sync,220);setTimeout(sync,600)}\n    const navs=[...new Set(document.querySelectorAll('.sidebar nav,aside nav,nav'))];\n    for(const nav of navs){const observer=new MutationObserver(schedule);observer.observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}\n    document.addEventListener('click',event=>{const button=event.target.closest?.('.sidebar nav button,aside nav button,nav button');if(!button)return;intentButton=button;intentAt=Date.now();schedule()},true);\n    schedule();"""
new_tail="""    function schedule(){clearTimeout(syncTimer);syncTimer=setTimeout(sync,20);setTimeout(sync,90);setTimeout(sync,220);setTimeout(sync,600)}\n    const currentNavs=()=>{\n      const shell=document.querySelector('.app-shell');\n      const scope=shell||document;\n      return [...new Set(scope.querySelectorAll('.sidebar nav,aside nav'))];\n    };\n    const bindNavObservers=()=>{\n      const navs=currentNavs(),current=new Set(navs);\n      for(const [nav,observer] of [...navObservers.entries()]){\n        if(!nav.isConnected||!current.has(nav)){observer.disconnect();navObservers.delete(nav)}\n      }\n      for(const nav of navs){\n        if(navObservers.has(nav))continue;\n        const observer=new MutationObserver(()=>schedule());\n        observer.observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});\n        navObservers.set(nav,observer);\n      }\n      const shell=document.querySelector('.app-shell');\n      if(shell!==observedShell){\n        shellObserver?.disconnect();shellObserver=null;observedShell=shell||null;\n        if(shell){shellObserver=new MutationObserver(()=>scheduleRebind());shellObserver.observe(shell,{childList:true})}\n      }\n      const root=document.getElementById('root');\n      if(root&&!rootObserver){rootObserver=new MutationObserver(()=>scheduleRebind());rootObserver.observe(root,{childList:true})}\n    };\n    function scheduleRebind(){clearTimeout(navBindTimer);navBindTimer=setTimeout(()=>{bindNavObservers();schedule()},30)}\n    document.addEventListener('click',event=>{\n      const button=event.target.closest?.('.sidebar nav button,aside nav button');if(!button)return;\n      intentButton=button;intentRoute=routeForButton(button);intentAt=Date.now();schedule();\n    },true);\n    bindNavObservers();\n    schedule();"""
replace_once('bootstrap.js',old_tail,new_tail)

# Validacoes estruturais da etapa 3.
bootstrap=Path('bootstrap.js').read_text(encoding='utf-8')
required=['navObservers=new Map()','const currentNavs=()=>','const bindNavObservers=()=>','function scheduleRebind()','intentRoute=routeForButton(button)']
for marker in required:
    if marker not in bootstrap:
        raise SystemExit(f'Validacao falhou: {marker}')
if "const navs=[...new Set(document.querySelectorAll('.sidebar nav,aside nav,nav'))]" in bootstrap:
    raise SystemExit('Controlador antigo de nav ainda presente')
if "event.target.closest?.('.sidebar nav button,aside nav button,nav button')" in bootstrap:
    raise SystemExit('Clique global em qualquer nav ainda presente')

print('ETAPA 3 VALIDADA: rotas acompanham a navegacao atual')
