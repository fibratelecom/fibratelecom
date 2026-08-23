(async()=>{
  const read=async(paths)=>{
    const parts=await Promise.all(paths.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw new Error(`Falha ao carregar ${p}: ${r.status}`);return r.text()}));
    return parts.join('');
  };
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`Falha ao carregar ${src}`));document.head.appendChild(s)});
  const gunzipB64=async b64=>{
    const bin=atob(b64.replace(/\s+/g,''));
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    if(typeof DecompressionStream!=='function')throw new Error('Este navegador não suporta a descompressão necessária. Atualize o Chrome/Edge.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  };
  const css=await read(['/parts/basecss-01.txt','/parts/basecss-02.txt','/parts/basecss-03.txt','/parts/fincss-01.txt']);
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  try{
    const logo=await read(['/packed/logo-01.txt','/packed/logo-02.txt','/packed/logo-03.txt','/packed/logo-04.txt','/packed/logo-05.txt']);
    const brand=document.createElement('style');
    brand.textContent=`.workspace{min-height:72px!important;padding:8px 9px!important;gap:8px!important;overflow:hidden}.workspace-logo{font-size:0!important;color:transparent!important;background:transparent url("data:image/png;base64,${logo.replace(/\s+/g,'')}") center/contain no-repeat!important;width:84px!important;min-width:84px!important;max-width:84px!important;height:56px!important;flex:0 0 84px!important;border:0!important;border-radius:0!important;box-shadow:none!important}.workspace>div{min-width:0!important}.workspace strong{white-space:normal!important;overflow-wrap:anywhere!important}.workspace-brand{gap:8px!important}`;
    document.head.appendChild(brand);
  }catch(e){console.warn('Logo Fibra+ ainda não carregada',e)}
  const bridgeB64=await read(['/packed/bridgegz-01.txt','/packed/bridgegz-02.txt','/packed/bridgegz-03.txt','/packed/bridgegz-04.txt']);
  const bridge=await gunzipB64(bridgeB64);
  await new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([bridge],{type:'text/javascript'}));const s=document.createElement('script');s.src=url;s.onload=()=>{URL.revokeObjectURL(url);resolve()};s.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Falha ao iniciar a ponte web da 1.0.17'))};document.head.appendChild(s)});
  await loadScript('/agent-adapter.js?v=1017-mikrotik2');
  if(typeof window.ProvedorPlusInstallAgentAdapter!=='function')throw new Error('A ponte real do MikroTik não foi carregada.');
  await window.ProvedorPlusInstallAgentAdapter();
  const appB64=await read(Array.from({length:33},(_,i)=>`/packed/appgz-${String(i+1).padStart(2,'0')}.txt`));
  const app=await gunzipB64(appB64);
  const appUrl=URL.createObjectURL(new Blob([app],{type:'text/javascript'}));
  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1500)}
})().catch(err=>{
  console.error(err);
  const root=document.getElementById('root')||document.body;
  root.innerHTML=`<div style="font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:60px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px"><h2>Provedor Plus</h2><p>Não foi possível carregar o painel original.</p><pre style="white-space:pre-wrap;color:#b91c1c">${String(err&&err.message||err)}</pre><button onclick="location.reload()">Tentar novamente</button></div>`;
});
