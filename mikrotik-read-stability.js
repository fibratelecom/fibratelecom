(()=>{
  if(window.__ProvedorPlusMikrotikReadStabilityInstalled)return;
  window.__ProvedorPlusMikrotikReadStabilityInstalled=true;

  const api=window.provedor;
  if(!api)return;

  const routerGood=new Map(),routerFails=new Map(),clientGood=new Map(),clientFails=new Map();
  const MAX_TRANSIENT_FAILURES=2;

  function failCount(map,id){const next=(map.get(id)||0)+1;map.set(id,next);return next}
  function resetCount(map,id){map.set(id,0)}
  function message(error){return error instanceof Error?error.message:String(error||'Falha temporária de leitura.')}

  if(typeof api?.mikrotik?.sync==='function'){
    const originalSync=api.mikrotik.sync.bind(api.mikrotik);
    api.mikrotik.sync=async routerId=>{
      const id=Number(routerId)||0;
      try{
        const result=await originalSync(routerId);
        routerGood.set(id,result);resetCount(routerFails,id);
        return result;
      }catch(error){
        const failures=failCount(routerFails,id),last=routerGood.get(id);
        if(last&&failures<=MAX_TRANSIENT_FAILURES)return {...last,transientReadFailure:true,transientReadError:message(error)};
        throw error;
      }
    };
  }

  if(typeof api?.mikrotik?.metrics==='function'){
    const originalMetrics=api.mikrotik.metrics.bind(api.mikrotik);
    api.mikrotik.metrics=async routerId=>{
      const id=Number(routerId)||0;
      try{
        const result=await originalMetrics(routerId);
        routerGood.set(id,result);resetCount(routerFails,id);
        return result;
      }catch(error){
        const failures=failCount(routerFails,id),last=routerGood.get(id);
        if(last&&failures<=MAX_TRANSIENT_FAILURES)return {...last,transientReadFailure:true,transientReadError:message(error)};
        throw error;
      }
    };
  }

  if(typeof api?.clients?.status==='function'){
    const originalStatus=api.clients.status.bind(api.clients);
    api.clients.status=async clientId=>{
      const id=Number(clientId)||0;
      try{
        const result=await originalStatus(clientId),connection=String(result?.connectionState||'').toLowerCase();
        if(connection!=='unavailable'){
          clientGood.set(id,result);resetCount(clientFails,id);return result;
        }
        const failures=failCount(clientFails,id),last=clientGood.get(id);
        if(last&&failures<=MAX_TRANSIENT_FAILURES){
          return {...last,client:{...(last?.client||{}),...(result?.client||{})},traffic:result?.traffic||last?.traffic,transientReadFailure:true,transientReadError:String(result?.connectionError||'')};
        }
        return result;
      }catch(error){
        const failures=failCount(clientFails,id),last=clientGood.get(id);
        if(last&&failures<=MAX_TRANSIENT_FAILURES)return {...last,transientReadFailure:true,transientReadError:message(error)};
        throw error;
      }
    };
  }
})();
