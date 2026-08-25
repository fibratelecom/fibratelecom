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
    if(out.id!=null)out.id=Number(out.id)||out.id;
    return out;
  };

  async function list(){
    const remote=await cloud('clients.list');
    return (Array.isArray(remote)?remote:[]).map(normalize).sort((a,b)=>Number(a.id)-Number(b.id));
  }

  async function save(data={}){
    const payload=normalize(data);
    const remote=normalize(await cloud('clients.save',payload));
    if(!remote?.id)throw new Error('A nuvem não retornou o identificador do cliente salvo.');
    return remote;
  }

  async function remove(id){
    id=Number(id);if(!id)throw new Error('Cliente inválido.');
    await cloud('clients.delete',{id});
    return {deleted:true,id};
  }

  async function setMikrotikState(id,state={}){
    id=Number(id);if(!id)throw new Error('Cliente inválido.');
    const rows=await list();
    const client=rows.find(x=>Number(x?.id)===id);
    if(!client)throw new Error('Cliente não encontrado na nuvem.');
    return save({
      ...client,
      mikrotik_secret_id:state.secretId??client.mikrotik_secret_id,
      mikrotik_status:state.status??client.mikrotik_status,
      mikrotik_last_sync:state.lastSync??client.mikrotik_last_sync
    });
  }

  api.clients.list=list;
  api.clients.save=save;
  api.clients.delete=remove;
  api.clients.setMikrotikState=setMikrotikState;
  api.clients.__legacyLocal=original;
  Object.defineProperty(api.clients,'__cloudClientStoreV2Installed',{value:true,enumerable:false});
})();
