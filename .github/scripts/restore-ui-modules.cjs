const fs=require('fs');
const path='bootstrap.js';
let s=fs.readFileSync(path,'utf8');
function replaceOnce(oldText,newText,label){
  if(!s.includes(oldText)) throw new Error('Trecho nao encontrado: '+label);
  s=s.replace(oldText,newText);
}
replaceOnce("  installNewPlansModule();\n  await loadScript('/ui-runtime-fixes.js?v=1017-fix18-plans-observer');\n  await loadScriptStable('/dashboard-enhancements.js?v=20260831-dashboard-mikrotik2'", "  try{installNewPlansModule()}catch(error){console.error('Provedor Plus: Planos nao impediu os demais modulos de carregar.',error)}\n  await loadScript('/ui-runtime-fixes.js?v=1017-fix18-plans-observer').catch(error=>console.error('Provedor Plus: correcoes de interface nao impediram os demais modulos de carregar.',error));\n  await loadScriptStable('/dashboard-enhancements.js?v=20260831-dashboard-mikrotik2'", 'sequencia pos-react');
replaceOnce("  installRouteIsolationGuard();\n  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));\n  if(typeof window.ProvedorPlusPatchClientViewButtons==='function')window.ProvedorPlusPatchClientViewButtons();", "  try{installRouteIsolationGuard()}catch(error){console.error('Provedor Plus: isolamento de rotas falhou sem bloquear o painel.',error)}\n  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));\n  try{if(typeof window.ProvedorPlusPatchClientViewButtons==='function')window.ProvedorPlusPatchClientViewButtons()}catch(error){console.error('Provedor Plus: ajuste de botoes de cliente falhou sem bloquear o painel.',error)}", 'finalizacao visual');
s=s.replace(/const BUILD_TOKEN='[^']+';/,"const BUILD_TOKEN='20260831-ui-restore1';");
fs.writeFileSync(path,s);
let html=fs.readFileSync('index.html','utf8');
html=html.replace(/\/bootstrap\.js\?v=[^\"']+/,'/bootstrap.js?v=20260831-ui-restore1');
fs.writeFileSync('index.html',html);
