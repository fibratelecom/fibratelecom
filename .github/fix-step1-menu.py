from pathlib import Path


def replace_exact(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrao nao encontrado em {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1) Cliente: acompanhar recriacao da sidebar sem observar o documento inteiro.
replace_exact(
    'dashboard-transition-guard.js',
    """  clientStyles();ensureClientButton();\n  const clientSidebar=document.querySelector('aside.sidebar')||document.querySelector('aside');\n  if(clientSidebar){\n    const clientObserver=new MutationObserver(()=>ensureClientButton());\n    clientObserver.observe(clientSidebar,{childList:true,subtree:true});\n  }\n})();""",
    """  let clientObservedSidebar=null,clientShellObserver=null,clientRootObserver=null,clientObservedShell=null,clientEnsureTimer=null;\n  function scheduleClientEnsure(){clearTimeout(clientEnsureTimer);clientEnsureTimer=setTimeout(()=>{ensureClientButton();bindClientObservers()},30)}\n  function bindClientObservers(){\n    const root=document.getElementById('root'),shell=document.querySelector('.app-shell'),sidebar=document.querySelector('aside.sidebar')||document.querySelector('aside');\n    if(sidebar!==clientObservedSidebar){clientObserver?.disconnect();clientObserver=null;clientObservedSidebar=sidebar||null;if(sidebar){clientObserver=new MutationObserver(()=>scheduleClientEnsure());clientObserver.observe(sidebar,{childList:true,subtree:true})}}\n    if(shell!==clientObservedShell){clientShellObserver?.disconnect();clientShellObserver=null;clientObservedShell=shell||null;if(shell){clientShellObserver=new MutationObserver(()=>scheduleClientEnsure());clientShellObserver.observe(shell,{childList:true})}}\n    if(root&&!clientRootObserver){clientRootObserver=new MutationObserver(()=>scheduleClientEnsure());clientRootObserver.observe(root,{childList:true})}\n  }\n  clientStyles();scheduleClientEnsure();\n})();"""
)

# 2) Planos: remover boot observer global e reapontar para a sidebar atual.
replace_exact(
    'plans.js',
    """  function installNavObserver(){\n    const root=document.querySelector('.sidebar')||document.querySelector('aside');if(!root)return false;\n    navObserver?.disconnect();navObserver=new MutationObserver(()=>ensureNav());navObserver.observe(root,{childList:true,subtree:true});ensureNav();return true;\n  }\n\n  ensureStyle();\n  const bootObserver=new MutationObserver(()=>{if(installNavObserver()){bootObserver.disconnect()}});bootObserver.observe(document.documentElement,{childList:true,subtree:true});\n  if(!installNavObserver())setTimeout(()=>installNavObserver(),100);""",
    """  let plansRootObserver=null,plansShellObserver=null,plansObservedSidebar=null,plansObservedShell=null,plansEnsureTimer=null;\n  function schedulePlansEnsure(){clearTimeout(plansEnsureTimer);plansEnsureTimer=setTimeout(()=>{ensureNav();bindPlansObservers()},30)}\n  function bindPlansObservers(){\n    const root=document.getElementById('root'),shell=document.querySelector('.app-shell'),sidebar=document.querySelector('.sidebar')||document.querySelector('aside');\n    if(sidebar!==plansObservedSidebar){navObserver?.disconnect();navObserver=null;plansObservedSidebar=sidebar||null;if(sidebar){navObserver=new MutationObserver(()=>schedulePlansEnsure());navObserver.observe(sidebar,{childList:true,subtree:true})}}\n    if(shell!==plansObservedShell){plansShellObserver?.disconnect();plansShellObserver=null;plansObservedShell=shell||null;if(shell){plansShellObserver=new MutationObserver(()=>schedulePlansEnsure());plansShellObserver.observe(shell,{childList:true})}}\n    if(root&&!plansRootObserver){plansRootObserver=new MutationObserver(()=>schedulePlansEnsure());plansRootObserver.observe(root,{childList:true})}\n  }\n\n  ensureStyle();\n  schedulePlansEnsure();"""
)

# 3) Dashboard: observer restrito e resiliente a troca da sidebar.
replace_exact(
    'dashboard-enhancements.js',
    """  observer=new MutationObserver(()=>{clearTimeout(ensureTimer);ensureTimer=setTimeout(ensureButton,20)});observer.observe(document.documentElement,{childList:true,subtree:true});ensureButton();\n})();""",
    """  let dashboardObservedSidebar=null,dashboardShellObserver=null,dashboardRootObserver=null,dashboardObservedShell=null;\n  function scheduleDashboardEnsure(){clearTimeout(ensureTimer);ensureTimer=setTimeout(()=>{ensureButton();bindDashboardObservers()},30)}\n  function bindDashboardObservers(){\n    const root=document.getElementById('root'),shell=document.querySelector('.app-shell'),sidebar=document.querySelector('aside.sidebar')||document.querySelector('aside');\n    if(sidebar!==dashboardObservedSidebar){observer?.disconnect();observer=null;dashboardObservedSidebar=sidebar||null;if(sidebar){observer=new MutationObserver(()=>scheduleDashboardEnsure());observer.observe(sidebar,{childList:true,subtree:true})}}\n    if(shell!==dashboardObservedShell){dashboardShellObserver?.disconnect();dashboardShellObserver=null;dashboardObservedShell=shell||null;if(shell){dashboardShellObserver=new MutationObserver(()=>scheduleDashboardEnsure());dashboardShellObserver.observe(shell,{childList:true})}}\n    if(root&&!dashboardRootObserver){dashboardRootObserver=new MutationObserver(()=>scheduleDashboardEnsure());dashboardRootObserver.observe(root,{childList:true})}\n  }\n  scheduleDashboardEnsure();\n})();"""
)

# 4) Funcionarios: parar de observar document.body inteiro e acompanhar sidebar atual.
staff_path = Path('staff-access.js')
staff = staff_path.read_text(encoding='utf-8')
start = staff.find('  async function start(){')
end = staff.find("\n  if(document.readyState==='loading')", start)
if start < 0 or end < 0:
    raise SystemExit('Bloco start de staff-access.js nao encontrado')
new_start = """  async function start(){\n    try{auth=await window.ProvedorPlusAuth?.status?.()}catch{return}\n    if(!auth?.authenticated||!auth.user)return;\n    let staffSidebarObserver=null,staffShellObserver=null,staffRootObserver=null,staffObservedSidebar=null,staffObservedShell=null,staffEnsureTimer=null;\n    const scheduleStaffEnsure=()=>{clearTimeout(staffEnsureTimer);staffEnsureTimer=setTimeout(()=>{installNav();applyPermissions();bindStaffObservers()},60)};\n    const bindStaffObservers=()=>{\n      const root=document.getElementById('root'),shell=document.querySelector('.app-shell'),sidebar=document.querySelector('.sidebar')||document.querySelector('aside');\n      if(sidebar!==staffObservedSidebar){staffSidebarObserver?.disconnect();staffSidebarObserver=null;staffObservedSidebar=sidebar||null;if(sidebar){staffSidebarObserver=new MutationObserver(()=>scheduleStaffEnsure());staffSidebarObserver.observe(sidebar,{childList:true,subtree:true})}}\n      if(shell!==staffObservedShell){staffShellObserver?.disconnect();staffShellObserver=null;staffObservedShell=shell||null;if(shell){staffShellObserver=new MutationObserver(()=>scheduleStaffEnsure());staffShellObserver.observe(shell,{childList:true})}}\n      if(root&&!staffRootObserver){staffRootObserver=new MutationObserver(()=>scheduleStaffEnsure());staffRootObserver.observe(root,{childList:true})}\n    };\n    installNav();applyPermissions();bindStaffObservers();\n    document.addEventListener('click',e=>{const b=e.target.closest('.sidebar nav button,nav button');if(b&&b!==navButton&&(layer||formLayer))closeLayer()},true);\n  }"""
staff = staff[:start] + new_start + staff[end:]
staff_path.write_text(staff, encoding='utf-8')

# 5) Cache/build: somente para garantir que o navegador receba esta etapa.
replace_exact('bootstrap.js', "const BUILD_TOKEN='20260831-integration-system2';", "const BUILD_TOKEN='20260831-step1-menu1';")
replace_exact('bootstrap.js', "/dashboard-transition-guard.js?v=20260831-integration-system2", "/dashboard-transition-guard.js?v=20260831-step1-menu1")
replace_exact('index.html', "/plans.js?v=20260831-planos-open1", "/plans.js?v=20260831-step1-menu1")
replace_exact('index.html', "/bootstrap.js?v=20260831-integration-system2", "/bootstrap.js?v=20260831-step1-menu1")

# Validacoes estruturais da etapa 1.
checks = {
    'dashboard-transition-guard.js': ['clientRootObserver', 'integrationRootObserver'],
    'plans.js': ['plansRootObserver'],
    'dashboard-enhancements.js': ['dashboardRootObserver'],
    'staff-access.js': ['staffRootObserver'],
}
for path, needles in checks.items():
    text = Path(path).read_text(encoding='utf-8')
    for needle in needles:
        if needle not in text:
            raise SystemExit(f'Validacao falhou: {needle} ausente em {path}')

if 'bootObserver.observe(document.documentElement' in Path('plans.js').read_text(encoding='utf-8'):
    raise SystemExit('Planos ainda observa document.documentElement')
if 'observer.observe(document.documentElement' in Path('dashboard-enhancements.js').read_text(encoding='utf-8'):
    raise SystemExit('Dashboard ainda observa document.documentElement')
if 'observer.observe(document.body' in Path('staff-access.js').read_text(encoding='utf-8'):
    raise SystemExit('Funcionarios ainda observa document.body')

print('ETAPA 1 VALIDADA')
