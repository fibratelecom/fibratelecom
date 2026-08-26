(()=>{
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
    let listedClient=null;
    try{
      const rows=await api.clients.list();
      listedClient=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(id))||null;
    }catch{}

    try{
      const result=await originalStatus(id);
      return normalizeStatus(result,result?.client||listedClient);
    }catch(error){
      const message=String(error?.message||error||'');
      if(!/Cliente não encontrado/i.test(message)||!listedClient)throw error;
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
