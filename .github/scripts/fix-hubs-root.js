const fs=require('fs');

function replace(path, oldText, newText){
  let s=fs.readFileSync(path,'utf8');
  if(!s.includes(oldText))throw new Error(`Padrão não encontrado em ${path}: ${oldText.slice(0,120)}`);
  s=s.replace(oldText,newText);
  fs.writeFileSync(path,s);
}

// 1) Os hubs não podem observar/manipular o menu enquanto o React ainda está montando.
replace('bootstrap.js',
"  await loadScript('/dashboard-transition-guard.js?v=20260831-dashboard-root1').catch(error=>console.error('Provedor Plus: a proteção de transição do Dashboard não foi carregada.',error));\n\n  const root=document.getElementById('root');",
"  const root=document.getElementById('root');");

replace('bootstrap.js',
"  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}\n\n  installNewPlansModule();",
"  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}\n  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));\n  await loadScript('/dashboard-transition-guard.js?v=20260831-hubs-rootfix1').catch(error=>console.error('Provedor Plus: os hubs de navegação não foram carregados.',error));\n\n  installNewPlansModule();");

replace('bootstrap.js',"const BUILD_TOKEN='20260831-boot-unblock2';","const BUILD_TOKEN='20260831-hubs-rootfix1';");
replace('index.html','/bootstrap.js?v=20260831-boot-unblock2','/bootstrap.js?v=20260831-hubs-rootfix1');

// 2) Integração: observar somente a sidebar já montada, nunca o documento inteiro.
replace('dashboard-transition-guard.js',
"  const rootObserver=new MutationObserver(()=>ensureButton());\n  rootObserver.observe(document.documentElement,{childList:true,subtree:true});\n  styles();ensureButton();",
"  styles();ensureButton();\n  const integrationSidebar=document.querySelector('aside.sidebar')||document.querySelector('aside');\n  if(integrationSidebar){\n    const integrationObserver=new MutationObserver(()=>ensureButton());\n    integrationObserver.observe(integrationSidebar,{childList:true,subtree:true});\n  }");

// 3) Cliente: o botão antigo já foi removido do bundle. Não remover nós gerenciados pelo React em runtime.
replace('dashboard-transition-guard.js',
"function ensureClientButton(){clientStyles();const nav=navRoot();if(!nav)return;[...nav.querySelectorAll('button')].forEach(b=>{if(b.dataset.ppClientHub==='1')return;if(norm(b.textContent)==='clientes')b.remove()});const buttons=[...nav.querySelectorAll('button')],dashboard=nav.querySelector('[data-pp-dashboard-root=\"1\"]'),finance=buttons.find(x=>norm(x.textContent).startsWith('financeiro')),systemLabel=[...nav.querySelectorAll('.nav-label,small')].find(x=>norm(x.textContent)==='sistema');",
"function ensureClientButton(){clientStyles();const nav=navRoot();if(!nav)return;const buttons=[...nav.querySelectorAll('button')],dashboard=nav.querySelector('[data-pp-dashboard-root=\"1\"]'),finance=buttons.find(x=>norm(x.textContent).startsWith('financeiro')),systemLabel=[...nav.querySelectorAll('.nav-label,small')].find(x=>norm(x.textContent)==='sistema');");

replace('dashboard-transition-guard.js',
"  const rootObserver=new MutationObserver(()=>ensureClientButton());rootObserver.observe(document.documentElement,{childList:true,subtree:true});clientStyles();ensureClientButton();",
"  clientStyles();ensureClientButton();\n  const clientSidebar=document.querySelector('aside.sidebar')||document.querySelector('aside');\n  if(clientSidebar){\n    const clientObserver=new MutationObserver(()=>ensureClientButton());\n    clientObserver.observe(clientSidebar,{childList:true,subtree:true});\n  }");
