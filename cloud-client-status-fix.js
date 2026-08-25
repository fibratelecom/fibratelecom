(()=>{
  const api=window.provedor;
  if(!api?.clients||api.clients.__cloudStatusFixInstalled||typeof api.clients.status!=='function')return;
  const originalStatus=api.clients.status.bind(api.clients);
  api.clients.status=async id=>{
    try{return await originalStatus(id)}catch(error){
      const message=String(error?.message||error||'');
      if(!/Cliente não encontrado/i.test(message))throw error;
      const rows=await api.clients.list();
      const client=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(id));
      if(!client)throw error;
      return {client,connectionState:'offline',connectionError:'',liveRatesAvailable:false,downloadBps:0,uploadBps:0};
    }
  };
  Object.defineProperty(api.clients,'__cloudStatusFixInstalled',{value:true,enumerable:false});
})();
