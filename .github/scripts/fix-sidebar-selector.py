from pathlib import Path

files = [Path('dashboard-transition-guard.js'), Path('dashboard-enhancements.js')]
old_nav = "const navRoot=()=>document.querySelector('aside.sidebar nav[aria-label=\"Menu principal\"],aside.sidebar nav');"
new_nav = "const navRoot=()=>document.querySelector('.app-shell .sidebar nav[aria-label=\"Menu principal\"],.app-shell .sidebar nav,.app-shell aside nav[aria-label=\"Menu principal\"],.app-shell aside nav,.sidebar nav,aside nav');"
old_sidebar = "const root=document.getElementById('root'),shell=document.querySelector('.app-shell'),sidebar=document.querySelector('aside.sidebar')||document.querySelector('aside');"
new_sidebar = "const root=document.getElementById('root'),shell=document.querySelector('.app-shell'),sidebar=shell?.querySelector('.sidebar,aside')||document.querySelector('.sidebar,aside');"

changed = 0
for path in files:
    text = path.read_text(encoding='utf-8')
    nav_count = text.count(old_nav)
    sidebar_count = text.count(old_sidebar)
    if nav_count:
        text = text.replace(old_nav, new_nav)
        changed += nav_count
    if sidebar_count:
        text = text.replace(old_sidebar, new_sidebar)
        changed += sidebar_count
    path.write_text(text, encoding='utf-8')

# Cache-bust only the existing files whose selector changed.
bootstrap = Path('bootstrap.js')
text = bootstrap.read_text(encoding='utf-8')
text = text.replace("const BUILD_TOKEN='20260831-uiatomic2';", "const BUILD_TOKEN='20260831-uiatomic4';")
text = text.replace("const BUILD_TOKEN='20260831-uiatomic3';", "const BUILD_TOKEN='20260831-uiatomic4';")
text = text.replace("/dashboard-transition-guard.js?v=20260831-uiatomic3", "/dashboard-transition-guard.js?v=20260831-uiatomic4")
text = text.replace("/dashboard-transition-guard.js?v=20260831-uiatomic1", "/dashboard-transition-guard.js?v=20260831-uiatomic4")
text = text.replace("/dashboard-enhancements.js?v=20260831-uiatomic1", "/dashboard-enhancements.js?v=20260831-uiatomic4")
bootstrap.write_text(text, encoding='utf-8')

index = Path('index.html')
text = index.read_text(encoding='utf-8')
text = text.replace('/bootstrap.js?v=20260831-uiatomic3', '/bootstrap.js?v=20260831-uiatomic4')
text = text.replace('/bootstrap.js?v=20260831-uiatomic2', '/bootstrap.js?v=20260831-uiatomic4')
index.write_text(text, encoding='utf-8')

if changed < 3:
    raise SystemExit(f'Correção incompleta: apenas {changed} ocorrências ajustadas.')

for path in files:
    text = path.read_text(encoding='utf-8')
    if "aside.sidebar nav[aria-label=\"Menu principal\"],aside.sidebar nav" in text:
        raise SystemExit(f'Seletor antigo ainda presente em {path}')
    if "document.querySelector('aside.sidebar')||document.querySelector('aside')" in text:
        raise SystemExit(f'Observador antigo ainda presente em {path}')

print(f'OK: {changed} seletores/observadores ajustados sem duplicar módulos.')
