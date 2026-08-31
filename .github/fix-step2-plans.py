from pathlib import Path
import re


def patch_regex(path, pattern, replacement, label):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Nao foi possivel aplicar {label} em {path} (matches={count})')
    p.write_text(next_text, encoding='utf-8')


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrao ausente em {path} para {label}: {old!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Bootstrap: remover a implementacao duplicada inteira e a chamada dela.
patch_regex(
    'bootstrap.js',
    r"\n  const installNewPlansModule=\(\)=>\{.*?\n  const gunzipB64=async b64=>",
    "\n  const gunzipB64=async b64=>",
    'remocao do Planos duplicado do bootstrap'
)
patch_regex(
    'bootstrap.js',
    r"\n\s*try\{installNewPlansModule\(\)\}catch\(error\)\{console\.error\([^\n]*\}\n",
    "\n",
    'remocao da chamada duplicada de Planos'
)

# UI runtime: remover o terceiro gerenciador/fallback de Planos.
patch_regex(
    'ui-runtime-fixes.js',
    r"\n  function installPlanManagement\(\)\{.*?\n  function patchLogout\(\)\{",
    "\n  function patchLogout(){",
    'remocao do fallback duplicado de Planos'
)
replace_once(
    'ui-runtime-fixes.js',
    'function initial(){replaceText(document.body);patchStatic();installPlanManagement()}',
    'function initial(){replaceText(document.body);patchStatic()}',
    'remocao da inicializacao duplicada de Planos'
)

# Cache apenas dos arquivos alterados nesta etapa.
replace_once('bootstrap.js', "const BUILD_TOKEN='20260831-step1-menu1';", "const BUILD_TOKEN='20260831-step2-plans1';", 'token de build')
replace_once('bootstrap.js', '/ui-runtime-fixes.js?v=1017-fix18-plans-observer', '/ui-runtime-fixes.js?v=20260831-step2-plans1', 'cache do runtime')
replace_once('index.html', '/bootstrap.js?v=20260831-step1-menu1', '/bootstrap.js?v=20260831-step2-plans1', 'cache do bootstrap')

# Validacoes: plans.js deve ser a unica implementacao de Planos.
bootstrap = Path('bootstrap.js').read_text(encoding='utf-8')
runtime = Path('ui-runtime-fixes.js').read_text(encoding='utf-8')
plans = Path('plans.js').read_text(encoding='utf-8')

if 'installNewPlansModule' in bootstrap:
    raise SystemExit('Duplicidade de Planos ainda existe no bootstrap.js')
if 'installPlanManagement' in runtime:
    raise SystemExit('Duplicidade de Planos ainda existe no ui-runtime-fixes.js')
for required in ['__ProvedorPlusPlansCloudFileInstalled', '__ProvedorPlusNewPlansInstalled', '__ProvedorPlusPlanManagementInstalled', 'pp-plans-cloud-layer']:
    if required not in plans:
        raise SystemExit(f'plans.js perdeu marcador obrigatorio: {required}')

print('ETAPA 2 VALIDADA: plans.js e a unica implementacao de Planos')
