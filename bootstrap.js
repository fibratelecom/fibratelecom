(async()=>{
  window.__PROVEDOR_PLUS_CLOUD__=true;
  const read=async(paths)=>{const parts=await Promise.all(paths.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw new Error(`Falha ao carregar ${p}: ${r.status}`);return r.text()}));return parts.join('')};
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`Falha ao carregar ${src}`));document.head.appendChild(s)});
  const gunzipB64=async b64=>{const bin=atob(b64.replace(/\s+/g,'')),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);if(typeof DecompressionStream!=='function')throw new Error('Este navegador não suporta a descompressão necessária. Atualize o Chrome/Edge.');const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return new Response(stream).text()};
  const css=await read(['/parts/basecss-01.txt','/parts/basecss-02.txt','/parts/basecss-03.txt','/parts/fincss-01.txt','/ui-fixes.css?v=1017-fix8']);
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  await loadScript('/auth-gate.js?v=1017-cloud17');
  if(!window.ProvedorPlusAuth?.ensure)throw new Error('A autenticação do Provedor Plus não foi carregada.');
  const auth=await window.ProvedorPlusAuth.ensure();

  await loadScript('/cloud-state-store.js?v=1017-cloud17-audit1');
  if(!window.ProvedorPlusCloudState?.prepare)throw new Error('A sincronização com o banco da nuvem não foi carregada.');
  await window.ProvedorPlusCloudState.prepare();
  const currentState=window.ProvedorPlusCloudState.getState()||{};
  currentState.settings={...(currentState.settings||{}),current_user_name:auth?.user?.name||currentState.settings?.current_user_name||'Administrador'};
  localStorage.setItem('provedor_plus_web_1_0_17',JSON.stringify(currentState));
  await window.ProvedorPlusCloudState.forceSync();

  const bridgeB64=await read(['/packed/bridgegz-01.txt','/packed/bridgegz-02.txt','/packed/bridgegz-03.txt','/packed/bridgegz-04.txt']);
  const bridge=await gunzipB64(bridgeB64);
  await new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([bridge],{type:'text/javascript'})),s=document.createElement('script');s.src=url;s.onload=()=>{URL.revokeObjectURL(url);resolve()};s.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Falha ao iniciar a ponte web da 1.0.17'))};document.head.appendChild(s)});

  if(window.provedor?.app?.info){
    window.provedor.app.info=async()=>({version:'1.0.17',platform:'web-cloud',databasePath:'Neon PostgreSQL (nuvem)',currentUser:auth?.user?.name||'Administrador',connector:{connected:true,mode:'cloud-rest'},paymentPortal:null});
  }

  await loadScript('/cloud-router-store-v2.js?v=1017-cloud17');
  await loadScript('/cloud-client-store-v2.js?v=1017-cloud17-audit1');
  await loadScript('/cloud-adapter.js?v=1017-cloud17-audit1');
  if(typeof window.ProvedorPlusInstallCloudAdapter!=='function')throw new Error('A ponte HTTPS do MikroTik não foi carregada.');
  await window.ProvedorPlusInstallCloudAdapter();
  await loadScript('/cloud-client-status-fix.js?v=1017-cloud17-audit1');
  if(typeof window.provedor?.invoices?.sync==='function')await window.provedor.invoices.sync().catch(error=>console.error('Provedor Plus: falha na conciliação inicial de cobranças.',error));

  await loadScript('/cloud-backup-store.js?v=1017-cloud17');
  window.ProvedorPlusCloudState.wrapApi(window.provedor);
  await loadScript('/ui-runtime-fixes.js?v=1017-fix9');
  await loadScript('/client-status-enhancements.js?v=1017-status3').catch(error=>console.error('Provedor Plus: os indicadores avançados do cliente não foram carregados.',error));
  await loadScript('/dashboard-enhancements.js?v=1017-dashboard1').catch(error=>console.error('Provedor Plus: o Dashboard gerencial não foi carregado.',error));
  const appB64=await read(Array.from({length:33},(_,i)=>`/packed/appgz-${String(i+1).padStart(2,'0')}.txt`));
  const app=await gunzipB64(appB64),appUrl=URL.createObjectURL(new Blob([app],{type:'text/javascript'}));
  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}
  await loadScript('/staff-access.js?v=1017-staff1').catch(error=>console.error('Provedor Plus: a gestão de funcionários não foi carregada.',error));
  await loadScript('/ticket-enhancements.js?v=1017-ticket1').catch(error=>console.error('Provedor Plus: a gestão avançada de chamados não foi carregada.',error));
})().catch(err=>{console.error(err);const root=document.getElementById('root')||document.body,message=String(err&&err.message||err);root.innerHTML='<div style="font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:60px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px"><h2>Provedor Plus</h2><p>Não foi possível carregar o painel.</p><pre id="pp-startup-error" style="white-space:pre-wrap;color:#b91c1c"></pre><button id="pp-startup-retry">Tentar novamente</button></div>';const pre=root.querySelector('#pp-startup-error'),button=root.querySelector('#pp-startup-retry');if(pre)pre.textContent=message;if(button)button.addEventListener('click',()=>location.reload())});
