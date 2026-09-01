(()=>{
  if(!window.__ProvedorPlusLegacyClientMarkerInstalled){
    window.__ProvedorPlusLegacyClientMarkerInstalled=true;
    window.__ProvedorPlusClientHubInstalled=true;
    const normalizeLabel=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    const removeClientPdfButton=()=>{
      document.querySelectorAll('button,a,[role="button"]').forEach(node=>{
        if(normalizeLabel(node.textContent)==='baixar pdf')node.remove();
      });
    };
    const markLegacyClient=()=>{
      removeClientPdfButton();
      const nav=document.querySelector('.app-shell .sidebar nav[aria-label="Menu principal"],.app-shell .sidebar nav,.app-shell aside nav[aria-label="Menu principal"],.app-shell aside nav,.sidebar nav,aside nav');
      if(!nav)return;
      const item=[...nav.querySelectorAll('button,a,[role="button"]')].find(node=>{
        const label=normalizeLabel(node.textContent);
        return label.includes('clientes')||label==='cliente';
      });
      if(item){
        item.dataset.ppClientHub='1';
        return;
      }
      let marker=nav.querySelector('[data-pp-client-hub="1"][data-pp-legacy-client-marker="1"]');
      if(!marker){
        marker=document.createElement('span');
        marker.hidden=true;
        marker.setAttribute('aria-hidden','true');
        marker.dataset.ppClientHub='1';
        marker.dataset.ppLegacyClientMarker='1';
        nav.appendChild(marker);
      }
    };
    const observer=new MutationObserver(markLegacyClient);
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
    window.addEventListener('DOMContentLoaded',markLegacyClient,{once:true});
    markLegacyClient();
  }

  const api=window.provedor;
  if(!api?.clients||api.clients.__cloudStatusFixInstalled||typeof api.clients.status!=='function')return;
  const originalStatus=api.clients.status.bind(api.clients);

  const number=v=>Number.isFinite(Number(v))?Number(v):0;
  const localMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const emptyCurrent=()=>({month:localMonthKey(),download_bytes:0,upload_bytes:0});

  function normalizeStatus(value,client){
    const out=value&&typeof value==='object'?{...value}:{};
    const resolvedClient=out.client||client||null;
    const traffic=out.traffic&&typeof out.traffic==='object'?out.traffic:{};
    const current=traffic.current&&typeof traffic.current==='object'?traffic.current:emptyCurrent();
    out.client=resolvedClient;
    out.connectionState=out.connectionState||(
      resolvedClient?.connection_type==='PPPoE'?'unavailable':'not_applicable'
    );
    out.connectionError=String(out.connectionError||'');
    out.liveRatesAvailable=Boolean(out.liveRatesAvailable||traffic.liveRatesAvailable);
    out.downloadBps=number(out.downloadBps||traffic.downloadBps);
    out.uploadBps=number(out.uploadBps||traffic.uploadBps);
    out.traffic={
      ...traffic,
      downloadBps:number(traffic.downloadBps||out.downloadBps),
      uploadBps:number(traffic.uploadBps||out.uploadBps),
      current:{
        ...emptyCurrent(),
        ...current,
        download_bytes:number(current.download_bytes),
        upload_bytes:number(current.upload_bytes)
      },
      history:Array.isArray(traffic.history)?traffic.history:[]
    };
    if(!out.trust||typeof out.trust!=='object')out.trust={active:false,usedThisMonth:false};
    return out;
  }

  api.clients.status=async id=>{
    try{
      const result=await originalStatus(id);
      return normalizeStatus(result,result?.client||null);
    }catch(error){
      const message=String(error?.message||error||'');
      if(!/Cliente não encontrado/i.test(message))throw error;

      let listedClient=null;
      try{
        const rows=await api.clients.list();
        listedClient=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(id))||null;
      }catch{}
      if(!listedClient)throw error;

      return normalizeStatus({
        client:listedClient,
        connectionState:listedClient.connection_type==='PPPoE'?'unavailable':'not_applicable',
        connectionError:'',
        liveRatesAvailable:false
      },listedClient);
    }
  };

  Object.defineProperty(api.clients,'__cloudStatusFixInstalled',{value:true,enumerable:false});
})();
