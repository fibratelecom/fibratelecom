from pathlib import Path

def replace_exact(path, old, new, count=1):
    p=Path(path)
    s=p.read_text()
    actual=s.count(old)
    if actual != count:
        raise SystemExit(f'{path}: esperado {count} marcador(es), encontrado {actual}')
    p.write_text(s.replace(old,new,count))

replace_exact('dashboard-transition-guard.js',
    '  styles();scheduleIntegrationEnsure();',
    '  styles();ensureButton();bindIntegrationObservers();')
replace_exact('dashboard-transition-guard.js',
    '  clientStyles();scheduleClientEnsure();',
    '  clientStyles();ensureClientButton();bindClientObservers();')
replace_exact('dashboard-enhancements.js',
    '  scheduleDashboardEnsure();\n})();',
    '  ensureButton();bindDashboardObservers();\n})();')

p=Path('bootstrap.js')
s=p.read_text()
old_token="const BUILD_TOKEN='20260831-client-create1';"
if s.count(old_token)!=1:
    raise SystemExit('bootstrap: token antigo não encontrado exatamente uma vez')
s=s.replace(old_token,"const BUILD_TOKEN='20260831-uiatomic1';",1)

old="""  const root=document.getElementById('root');
  const appB64=await read(Array.from({length:33},(_,i)=>`/packed/appgz-${String(i+1).padStart(2,'0')}.txt`));"""
new="""  const root=document.getElementById('root');
  const uiGateStyle=document.createElement('style');
  uiGateStyle.id='pp-atomic-ui-gate';
  uiGateStyle.textContent='.pp-atomic-ui-mounting .app-shell{visibility:hidden!important;pointer-events:none!important}';
  document.head.appendChild(uiGateStyle);
  document.documentElement.classList.add('pp-atomic-ui-mounting');
  const appB64=await read(Array.from({length:33},(_,i)=>`/packed/appgz-${String(i+1).padStart(2,'0')}.txt`));"""
if s.count(old)!=1:
    raise SystemExit('bootstrap: marcador do gate não encontrado exatamente uma vez')
s=s.replace(old,new,1)

old="""  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await loadScript('/dashboard-transition-guard.js?v=20260831-client-create1').catch(error=>console.error('Provedor Plus: os hubs de navegação não foram carregados.',error));
  await loadScript('/ui-runtime-fixes.js?v=20260831-step6-observer1').catch(error=>console.error('Provedor Plus: correcoes de interface nao impediram os demais modulos de carregar.',error));
  await loadScriptStable('/dashboard-enhancements.js?v=20260831-step8-mikrotik1',{dropCharacterData:true,observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-root-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-new-plans-layer']}).catch(error=>console.error('Provedor Plus: o Dashboard gerencial não foi carregado.',error));"""
new="""  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await loadScript('/dashboard-transition-guard.js?v=20260831-uiatomic1');
  await loadScriptStable('/dashboard-enhancements.js?v=20260831-uiatomic1',{dropCharacterData:true,observerTargetSelector:'.app-shell',ignoreWithin:['.pp-dashboard-root-layer','.pp-pppoe-modal-layer','.pp-billing-auto-layer','.client-status-modal','.pp-ticket-layer','.pp-staff-layer','.pp-new-plans-layer']});
  const coreUiDeadline=Date.now()+3000;
  const adminNeedsIntegration=String(auth?.user?.role||'').toLowerCase()==='admin';
  let coreUiReady=false;
  while(Date.now()<coreUiDeadline){
    const shell=document.querySelector('.app-shell'),nav=shell?.querySelector('.sidebar nav,aside nav'),content=shell?.querySelector('.content');
    const dashboard=nav?.querySelector('[data-pp-dashboard-root="1"]'),client=nav?.querySelector('[data-pp-client-hub="1"]'),integration=nav?.querySelector('[data-pp-integration-hub="1"]');
    const dashboardLayer=content?.querySelector(':scope>.pp-dashboard-root-layer');
    if(shell&&nav&&content&&dashboard&&client&&(!adminNeedsIntegration||integration)&&dashboardLayer){coreUiReady=true;break}
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  if(!coreUiReady)throw new Error('A interface atual do Provedor Plus não concluiu a montagem de Dashboard, Cliente e Integração.');
  document.documentElement.classList.remove('pp-atomic-ui-mounting');
  uiGateStyle.remove();
  await loadScript('/ui-runtime-fixes.js?v=20260831-step6-observer1').catch(error=>console.error('Provedor Plus: correcoes de interface nao impediram os demais modulos de carregar.',error));"""
if s.count(old)!=1:
    raise SystemExit('bootstrap: bloco de módulos não encontrado exatamente uma vez')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('index.html')
s=p.read_text()
old='<script defer src="/bootstrap.js?v=20260831-client-create1"></script>'
new='<script defer src="/bootstrap.js?v=20260831-uiatomic1"></script>'
if s.count(old)!=1:
    raise SystemExit('index: token do bootstrap não encontrado exatamente uma vez')
p.write_text(s.replace(old,new,1))
