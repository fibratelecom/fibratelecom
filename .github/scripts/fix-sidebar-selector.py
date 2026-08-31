from pathlib import Path

files = [Path('dashboard-transition-guard.js'), Path('dashboard-enhancements.js')]
old_nav_expr = "document.querySelector('aside.sidebar nav[aria-label=\"Menu principal\"],aside.sidebar nav')"
new_nav_expr = "document.querySelector('.app-shell .sidebar nav[aria-label=\"Menu principal\"],.app-shell .sidebar nav,.app-shell aside nav[aria-label=\"Menu principal\"],.app-shell aside nav,.sidebar nav,aside nav')"
old_sidebar_expr = "document.querySelector('aside.sidebar')||document.querySelector('aside')"
new_sidebar_expr = "document.querySelector('.app-shell .sidebar,.app-shell aside,.sidebar,aside')"

changed = 0
for path in files:
    text = path.read_text(encoding='utf-8')
    nav_count = text.count(old_nav_expr)
    sidebar_count = text.count(old_sidebar_expr)
    text = text.replace(old_nav_expr, new_nav_expr)
    text = text.replace(old_sidebar_expr, new_sidebar_expr)
    changed += nav_count + sidebar_count
    path.write_text(text, encoding='utf-8')

bootstrap = Path('bootstrap.js')
text = bootstrap.read_text(encoding='utf-8')
for old in ["const BUILD_TOKEN='20260831-uiatomic2';", "const BUILD_TOKEN='20260831-uiatomic3';"]:
    text = text.replace(old, "const BUILD_TOKEN='20260831-uiatomic4';")
for old in ['/dashboard-transition-guard.js?v=20260831-uiatomic1','/dashboard-transition-guard.js?v=20260831-uiatomic3']:
    text = text.replace(old, '/dashboard-transition-guard.js?v=20260831-uiatomic4')
text = text.replace('/dashboard-enhancements.js?v=20260831-uiatomic1','/dashboard-enhancements.js?v=20260831-uiatomic4')
bootstrap.write_text(text, encoding='utf-8')

index = Path('index.html')
text = index.read_text(encoding='utf-8')
for old in ['/bootstrap.js?v=20260831-uiatomic2','/bootstrap.js?v=20260831-uiatomic3']:
    text = text.replace(old, '/bootstrap.js?v=20260831-uiatomic4')
index.write_text(text, encoding='utf-8')

if changed < 3:
    raise SystemExit(f'Correção incompleta: apenas {changed} ocorrências ajustadas.')
for path in files:
    text = path.read_text(encoding='utf-8')
    if old_nav_expr in text:
        raise SystemExit(f'Seletor antigo ainda presente em {path}')
    if old_sidebar_expr in text:
        raise SystemExit(f'Observador antigo ainda presente em {path}')

print(f'OK: {changed} seletores/observadores ajustados sem duplicar módulos.')
