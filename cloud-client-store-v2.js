(()=>{
  const api=window.provedor;
  if(!api?.clients||api.clients.__cloudClientStoreV2Installed)return;
  const original={...api.clients};

  async function cloud(action,data={}){
    const response=await fetch('/api/cloud-data',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})
    });
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha na sincronização com a nuvem (HTTP ${response.status}).`);
    return body.data;
  }

  const normalize=r=>{
    const out={...(r||{})};
    if(!out.pppoe_username&&out.pppoe_user)out.pppoe_username=out.pppoe_user;
    if(!out.pppoe_user&&out.pppoe_username)out.pppoe_user=out.pppoe_username;
    if(out.router_id!=null)out.router_id=Number(out.router_id)||null;
    return out;
  };

  const CLOUD_FIELDS=['router_id','connection_type','pppoe_username','mikrotik_profile','ip','mac_address','mikrotik_secret_id','mikrotik_status','mikrotik_last_sync'];

  function mergeRemoteLocal(remote,local){
    const r=normalize(remote),l=normalize(local),out={...r,...l};
    if(remote){
      for(const key of CLOUD_FIELDS){
        if(Object.prototype.hasOwnProperty.call(r,key))out[key]=r[key];
      }
    }
    return normalize(out);
  }

  const overlayCloudFields=(saved,data)=>{
    const out={...(saved||{})};
    for(const key of CLOUD_FIELDS){
      if(Object.prototype.hasOwnProperty.call(data||{},key))out[key]=data[key];
    }
    if(Object.prototype.hasOwnProperty.call(data||{},'pppoe_user'))out.pppoe_user=data.pppoe_user;
    return normalize(out);
  };

  const pickSaved=async(data,raw)=>{
    if(raw?.client?.id)return raw.client;
    if(raw?.id)return raw;
    try{
      const list=await original.list();
      const rows=Array.isArray(list)?list:[];
      if(data?.id){const byId=rows.find(x=>Number(x?.id)===Number(data.id));if(byId)return byId}
      const contract=String(data?.contract_number||'').trim();
      if(contract){const byContract=[...rows].reverse().find(x=>String(x?.contract_number||'').trim()===contract);if(byContract)return byContract}
      const name=String(data?.name||'').trim();
      if(name){const byName=[...rows].reverse().find(x=>String(x?.name||'').trim()===name);if(byName)return byName}
    }catch{}
    return data||null;
  };

  async function list(){
    let local=[];try{local=await original.list()}catch{}
    local=Array.isArray(local)?local:[];
    let remote=null;try{remote=await cloud('clients.list')}catch{}
    if(!Array.isArray(remote))return local;

    const remoteIds=new Set(remote.map(x=>Number(x?.id)).filter(Boolean));
    const missing=local.filter(x=>x?.id&&x?.name&&!remoteIds.has(Number(x.id)));
    if(missing.length){
      await Promise.allSettled(missing.map(x=>cloud('clients.save',x)));
      try{remote=await cloud('clients.list')}catch{}
    }

    const merged=new Map();
    for(const r of Array.isArray(remote)?remote:[]){const n=normalize(r),id=Number(n?.id);if(id)merged.set(id,n)}
    for(const l of local){const id=Number(l?.id);if(id)merged.set(id,mergeRemoteLocal(merged.get(id),l))}
    return [...merged.values()].sort((a,b)=>Number(a.id)-Number(b.id));
  }

  async function routerExistsInCloud(routerId){
    const id=Number(routerId)||0;if(!id)return false;
    const routers=await cloud('routers.list');
    return Array.isArray(routers)&&routers.some(r=>Number(r?.id)===id);
  }

  if(typeof original.list==='function')api.clients.list=list;

  if(typeof original.save==='function')api.clients.save=async data=>{
    let raw,saved;
    try{
      raw=await original.save(data);
      saved=await pickSaved(data,raw);
    }catch(error){
      const message=String(error?.message||error||'');
      const routerId=Number(data?.router_id)||0;
      const isLegacyRouterValidation=/MikroTik selecionado.*não foi encontrado/i.test(message);
      if(!routerId||!isLegacyRouterValidation||!(await routerExistsInCloud(routerId)))throw error;

      const localData={...(data||{}),router_id:null};
      raw=await original.save(localData);
      saved=await pickSaved(localData,raw);
    }

    const cloudRecord=overlayCloudFields(saved,data||{});
    if(cloudRecord?.id&&cloudRecord?.name)await cloud('clients.save',cloudRecord);
    return raw;
  };

  if(typeof original.delete==='function')api.clients.delete=async id=>{
    await cloud('clients.delete',{id});
    return original.delete(id);
  };

  if(typeof original.setMikrotikState==='function')api.clients.setMikrotikState=async(id,state)=>{
    const raw=await original.setMikrotikState(id,state);
    try{
      const rows=await original.list();
      const client=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(id));
      if(client?.id&&client?.name)await cloud('clients.save',client);
    }catch{}
    return raw;
  };

  Object.defineProperty(api.clients,'__cloudClientStoreV2Installed',{value:true,enumerable:false});
  list().catch(()=>{});
})();
