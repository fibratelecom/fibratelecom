from pathlib import Path


def replace_exact(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: esperado {count} marcador(es), encontrado {actual}")
    p.write_text(text.replace(old, new, count))

# Integração: não depender exclusivamente do bloco visual "Sistema" existir naquele instante.
replace_exact(
    'dashboard-transition-guard.js',
    "const systemLabel=[...nav.querySelectorAll('.nav-label,small')].find(x=>norm(x.textContent)==='sistema'),systemRow=systemLabel?[...nav.children].find(x=>x===systemLabel||x.contains(systemLabel)):null;if(!systemRow)return;let b=",
    "const systemLabel=[...nav.querySelectorAll('.nav-label,small')].find(x=>norm(x.textContent)==='sistema'),systemRow=systemLabel?[...nav.children].find(x=>x===systemLabel||x.contains(systemLabel)):null;let b="
)
replace_exact(
    'dashboard-transition-guard.js',
    "const target=systemRow.nextSibling;if(target!==b)nav.insertBefore(b,target);hubButton=b;buildPopup()",
    "const target=systemRow?.nextSibling||null;if(target&&target!==b)nav.insertBefore(b,target);else if(!b.isConnected)nav.appendChild(b);hubButton=b;buildPopup()"
)

# Cliente: se Financeiro/Sistema ainda não existirem, usar o Dashboard como referência e, em último caso, anexar ao nav.
replace_exact(
    'dashboard-transition-guard.js',
    "let anchor=dashboard?.nextSibling||finance||systemLabel;if(!anchor&&dashboard)anchor=systemLabel;if(!anchor)return;let b=",
    "let anchor=dashboard?.nextSibling||finance||systemLabel||null;let b="
)
replace_exact(
    'dashboard-transition-guard.js',
    "anchor=dashboard?.nextSibling||finance||systemLabel;if(anchor!==b&&b.nextSibling!==anchor)nav.insertBefore(b,anchor);clientButton=b;buildClientPopup()",
    "anchor=dashboard?.nextSibling||finance||systemLabel||null;if(anchor&&anchor!==b&&b.nextSibling!==anchor)nav.insertBefore(b,anchor);else if(!anchor&&!b.isConnected)nav.appendChild(b);clientButton=b;buildClientPopup()"
)

# Atualiza cache e melhora o diagnóstico caso ainda exista alguma pendência real de montagem.
p = Path('bootstrap.js')
text = p.read_text()
text = text.replace("const BUILD_TOKEN='20260831-uiatomic2';", "const BUILD_TOKEN='20260831-uiatomic3';", 1)
text = text.replace("/dashboard-transition-guard.js?v=20260831-uiatomic1", "/dashboard-transition-guard.js?v=20260831-uiatomic3", 1)
old = "if(!coreUiReady)throw new Error('A interface atual do Provedor Plus não concluiu a montagem de Dashboard, Cliente e Integração.');"
new = "if(!coreUiReady){const shell=document.querySelector('.app-shell'),nav=shell?.querySelector('.sidebar nav,aside nav'),content=shell?.querySelector('.content');const missing=[];if(!shell)missing.push('estrutura principal');if(!nav)missing.push('navegação');if(!content)missing.push('conteúdo');if(nav&&!nav.querySelector('[data-pp-dashboard-root=\\\"1\\\"]'))missing.push('Dashboard');if(nav&&!nav.querySelector('[data-pp-client-hub=\\\"1\\\"]'))missing.push('Cliente');if(adminNeedsIntegration&&nav&&!nav.querySelector('[data-pp-integration-hub=\\\"1\\\"]'))missing.push('Integração');if(content&&!content.querySelector(':scope>.pp-dashboard-root-layer'))missing.push('camada do Dashboard');throw new Error(`A interface atual do Provedor Plus não concluiu a montagem. Pendência: ${missing.join(', ')||'estado desconhecido'}.`)}"
if text.count(old) != 1:
    raise SystemExit('bootstrap.js: marcador de erro da montagem não encontrado exatamente uma vez')
text = text.replace(old, new, 1)
p.write_text(text)

replace_exact(
    'index.html',
    '<script defer src="/bootstrap.js?v=20260831-uiatomic2"></script>',
    '<script defer src="/bootstrap.js?v=20260831-uiatomic3"></script>'
)
