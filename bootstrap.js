(async()=>{
  const read=async(paths)=>{
    const parts=await Promise.all(paths.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw new Error(`Falha ao carregar ${p}: ${r.status}`);return r.text()}));
    return parts.join('');
  };
  const css=await read([
    '/parts/basecss-01.txt','/parts/basecss-02.txt','/parts/basecss-03.txt',
    '/parts/fincss-01.txt','/parts/override-01.txt'
  ]);
  const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);
  const bridge=await read(['/parts/bridge-01.txt','/parts/bridge-02.txt']);
  await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(new Blob([bridge],{type:'text/javascript'}));
    const s=document.createElement('script'); s.src=url;
    s.onload=()=>{URL.revokeObjectURL(url);resolve()}; s.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Falha ao iniciar a ponte web'))};
    document.head.appendChild(s);
  });
  const app=await read(Array.from({length:17},(_,i)=>`/parts/app-${String(i+1).padStart(2,'0')}.txt`));
  const appUrl=URL.createObjectURL(new Blob([app],{type:'text/javascript'}));
  try{await import(appUrl)}finally{setTimeout(()=>URL.revokeObjectURL(appUrl),1000)}
})().catch(err=>{
  console.error(err);
  const root=document.getElementById('root')||document.body;
  root.innerHTML=`<div style="font-family:Segoe UI,Arial,sans-serif;max-width:760px;margin:60px auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px"><h2>Provedor Plus</h2><p>Não foi possível carregar o painel.</p><pre style="white-space:pre-wrap;color:#b91c1c">${String(err&&err.message||err)}</pre><button onclick="location.reload()">Tentar novamente</button></div>`;
});
