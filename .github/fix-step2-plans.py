from pathlib import Path


def remove_between(path, start_marker, end_marker):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    start = text.find(start_marker)
    end = text.find(end_marker, start)
    if start < 0 or end < 0:
        raise SystemExit(f'Bloco nao encontrado em {path}: {start_marker!r} -> {end_marker!r}')
    text = text[:start] + text[end:]
    p.write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrao nao encontrado em {path}: {old!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Bootstrap: remover a segunda implementacao completa de Planos.
remove_between(
    'bootstrap.js',
    '  const installNewPlansModule=()=>{',
    '  const gunzipB64=async b64=>'
)
replace_once(
    'bootstrap.js',
    "  try{installNewPlansModule()}catch(error){console.error('Provedor Plus: Planos nao impediu os demais modulos de carregar.',error)}\n",
    ''
)

# UI runtime: remover o terceiro gerenciador/fallback de Planos.
remove_between(
    'ui-runtime-fixes.js',
    '  function installPlanManagement(){',
    '  function patchLogout(){'
)
replace_once(
    'ui-runtime-fixes.js',
    '  function initial(){replaceText(document.body);patchStatic();installPlanManagement()}',
    '  function initial(){replaceText(document.body);patchStatic()}'
)

# Cache apenas dos arquivos alterados nesta etapa.
replace_once('bootstrap.js', "const BUILD_TOKEN='20260831-step1-menu1';", "const BUILD_TOKEN='20260831-step2-plans1';")
replace_once('bootstrap.js', "/ui-runtime-fixes.js?v=1017-fix18-plans-observer", "/ui-runtime-fixes.js?v=20260831-step2-plans1")
replace_once('index.html', "/bootstrap.js?v=20260831-step1-menu1", "/bootstrap.js?v=20260831-step2-plans1")

# Validacoes: plans.js deve ser a unica implementacao de Planos.
bootstrap = Path('bootstrap.js').read_text(encoding='utf-8')
runtime = Path('ui-runtime-fixes.js').read_text(encoding='utf-8')
plans = Path('plans.js').read_text(encoding='utf-8')

for forbidden in ['installNewPlansModule', 'pp-new-plans-layer', 'ppNewPlansNav']:
    if forbidden in bootstrap:
        raise SystemExit(f'Duplicidade ainda existe no bootstrap: {forbidden}')
for forbidden in ['installPlanManagement', 'pp-plan-management-toolbar', 'pp-plan-management-row']:
    if forbidden in runtime:
        raise SystemExit(f'Duplicidade ainda existe no ui-runtime-fixes: {forbidden}')
for required in ['__ProvedorPlusPlansCloudFileInstalled', '__ProvedorPlusNewPlansInstalled', '__ProvedorPlusPlanManagementInstalled', 'pp-plans-cloud-layer']:
    if required not in plans:
        raise SystemExit(f'plans.js perdeu marcador obrigatorio: {required}')

print('ETAPA 2 VALIDADA: plans.js e a unica implementacao de Planos')
