(()=>{
  const api=window.provedor;
  if(!api?.clients||api.clients.__cloudClientStoreV2Installed)return;
  const STATE_KEY='provedor_plus_web_1_0_17';
  const original={...api.clients};
  const CLOUD_FIELDS=['router_id','connection_type','pppoe_username','pppoe_user','mikrotik_profile','ip','mac_address','mikrotik_secret_id','mikrotik_status','mikrotik_last_sync','last_mikrotik_sync'];

  async function request(url,action,data={}){
    const response=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha na sincronização com a nuvem (HTTP ${response.status}).`);
    return body.data;
  }
  const cloudData=(action,data={})=>request('/api/cloud-data',action,data);
  const cloudState=(action,data={})=>request('/api/cloud-state',action,data);

  const normalize=r=>{
    const out={...(r||{})};
    if(!out.pppoe_username&&out.pppoe_user)out.pppoe_username=out.pppoe_user;
    if(!out.pppoe_user&&out.pppoe_username)out.pppoe_user=out.pppoe_username;
    if(out.router_id!=null)out.router_id=Number(out.router_id)||null;
    if(out.plan_id!=null)out.plan_id=Number(out.plan_id)||null;
    if(out.id!=null)out.id=Number(out.id)||out.id;
    if(!out.cep&&out.zip_code)out.cep=out.zip_code;
    if(!out.zip_code&&out.cep)out.zip_code=out.cep;
    if(!out.street&&out.address)out.street=out.address;
    if(!out.address&&out.street)out.address=out.street;
    if(!out.last_mikrotik_sync&&out.mikrotik_last_sync)out.last_mikrotik_sync=out.mikrotik_last_sync;
    if(!out.mikrotik_last_sync&&out.last_mikrotik_sync)out.mikrotik_last_sync=out.last_mikrotik_sync;
    return out;
  };

  function sameIdentity(a,b){
    if(!a||!b)return false;
    if(Number(a.id)&&Number(b.id)&&Number(a.id)===Number(b.id))return true;
    const contract=String(a.contract_number||'').trim();
    if(contract&&contract===String(b.contract_number||'').trim())return true;
    const document=String(a.document||'').replace(/\D/g,'');
    if(document&&document===String(b.document||'').replace(/\D/g,''))return true;
    return false;
  }

  function overlayCloudFields(base,remote){
    const out={...normalize(base),...normalize(remote)};
    for(const key of CLOUD_FIELDS){if(Object.prototype.hasOwnProperty.call(remote||{},key))out[key]=remote[key]}
    return normalize(out);
  }

  async function readState(){
    const remote=await cloudState('state.get');
    return remote?.state&&typeof remote.state==='object'?remote.state:{};
  }

  function mirrorState(state){
    try{const raw=JSON.stringify(state||{});if(localStorage.getItem(STATE_KEY)!==raw)localStorage.setItem(STATE_KEY,raw)}catch{}
  }

  async function writeState(state){
    const saved=await cloudState('state.save',{state});
    const next=saved?.state&&typeof saved.state==='object'?saved.state:state;
    mirrorState(next);
    return next;
  }

  function remapClientReferences(state,oldId,newId){
    oldId=Number(oldId)||0;newId=Number(newId)||0;if(!oldId||!newId||oldId===newId)return;
    for(const key of ['invoices','tickets'])if(Array.isArray(state[key]))state[key]=state[key].map(row=>Number(row?.client_id)===oldId?{...row,client_id:newId}:row);
    const records=state?.banks?.efi?.pixAutomaticRecords;
    if(Array.isArray(records))state.banks.efi.pixAutomaticRecords=records.map(row=>Number(row?.clientId)===oldId?{...row,clientId:newId}:row);
  }

  function decorate(client,state){
    const c=normalize(client),plans=Array.isArray(state?.plans)?state.plans:[],routers=Array.isArray(state?.routers)?state.routers:[];
    const plan=c.plan_id?plans.find(p=>Number(p?.id)===Number(c.plan_id)):null;
    const router=c.router_id?routers.find(r=>Number(r?.id)===Number(c.router_id)):null;
    return {...c,plan_name:c.plan_name||plan?.name||c.plan||'Sem plano',plan_speed:c.plan_speed||plan?.speed||'',plan_price_cents:Number(c.plan_price_cents||plan?.price_cents)||0,router_name:c.router_name||router?.name||'Sem MikroTik'};
  }

  async function reconcile(state){
    let clients=(Array.isArray(state.clients)?state.clients:[]).map(normalize),remote=[];
    try{remote=await cloudData('clients.list')}catch(error){console.error('Provedor Plus: falha ao ler clientes normalizados da nuvem.',error);return {state,clients,changed:false}}
    remote=Array.isArray(remote)?remote.map(normalize):[];
    let changed=false;
    for(let i=0;i<clients.length;i++){
      let local=clients[i],cloud=remote.find(r=>sameIdentity(local,r));
      if(!cloud){
        try{cloud=normalize(await cloudData('clients.save',local));remote.push(cloud);changed=true}catch(error){console.error('Provedor Plus: falha ao normalizar cliente na nuvem.',error);continue}
      }
      if(cloud?.id&&Number(local.id)!==Number(cloud.id)){remapClientReferences(state,local.id,cloud.id);local={...local,id:Number(cloud.id)};changed=true}
      const merged=overlayCloudFields(local,cloud);
      if(JSON.stringify(merged)!==JSON.stringify(clients[i]))changed=true;
      clients[i]=merged;
    }
    for(const cloud of remote)if(!clients.some(c=>sameIdentity(c,cloud))){clients.push(normalize(cloud));changed=true}
    clients.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    if(changed){state={...state,clients};state=await writeState(state)}
    return {state,clients:Array.isArray(state.clients)?state.clients.map(normalize):clients,changed};
  }

  async function list(){
    const state=await readState(),result=await reconcile(state);
    mirrorState(result.state);
    return result.clients.map(c=>decorate(c,result.state));
  }

  async function save(data){
    let state=await readState();state.clients=Array.isArray(state.clients)?state.clients.map(normalize):[];
    const existing=state.clients.find(c=>sameIdentity(c,data))||null,oldId=Number(existing?.id||data?.id)||0,candidate=normalize({...existing,...data});
    if(!String(candidate.name||'').trim())throw new Error('Informe o nome ou a razão social do cliente.');
    const remote=normalize(await cloudData('clients.save',candidate));
    if(!remote?.id)throw new Error('A nuvem não retornou o identificador do cliente.');
    const finalRecord=overlayCloudFields({...candidate,id:Number(remote.id)},remote);
    if(oldId&&oldId!==Number(remote.id))remapClientReferences(state,oldId,Number(remote.id));
    let replaced=false;
    state.clients=state.clients.map(row=>{if(sameIdentity(row,existing||data)){replaced=true;return finalRecord}return row});
    if(!replaced)state.clients.push(finalRecord);
    state=await writeState(state);
    const saved=(Array.isArray(state.clients)?state.clients:[]).find(c=>Number(c?.id)===Number(remote.id))||finalRecord;
    return decorate(saved,state);
  }

  async function remove(id){
    id=Number(id)||0;if(!id)return {deleted:false,id};
    await cloudData('clients.delete',{id});
    let state=await readState();
    state.clients=(Array.isArray(state.clients)?state.clients:[]).filter(c=>Number(c?.id)!==id);
    state.invoices=(Array.isArray(state.invoices)?state.invoices:[]).filter(x=>Number(x?.client_id)!==id);
    await writeState(state);
    return {deleted:true,id};
  }

  async function findClient(id){const rows=await list(),client=rows.find(c=>Number(c?.id)===Number(id));if(!client)throw new Error('Cliente não encontrado.');return client}

  async function status(id){
    const client=await findClient(id),until=client.trust_release_until?new Date(client.trust_release_until).getTime():0;
    return {client,trust:{usedThisMonth:Boolean(client.trust_release_at&&String(client.trust_release_at).slice(0,7)===new Date().toISOString().slice(0,7)),active:Boolean(until>Date.now()),until:client.trust_release_until||null},traffic:{current:{month:new Date().toISOString().slice(0,7),download_bytes:0,upload_bytes:0},history:[]},router:null,pppoe:null,device:null,connectionState:client.connection_type==='PPPoE'?'unavailable':'not_applicable',connectionError:'',liveRatesAvailable:false,downloadBps:0,uploadBps:0};
  }

  async function setMikrotikState(id,value={}){
    const client=await findClient(id),stamp=value.lastSync||new Date().toISOString();
    return save({...client,mikrotik_secret_id:value.secretId||client.mikrotik_secret_id||'',mikrotik_status:value.status||client.mikrotik_status||'Não sincronizado',mikrotik_last_sync:stamp,last_mikrotik_sync:stamp});
  }
  async function block(id){const client=await findClient(id);return save({...client,status:'Bloqueado'})}
  async function unblock(id){const client=await findClient(id);return save({...client,status:'Ativo'})}
  async function trustRelease(id,hours=48){const client=await findClient(id),at=new Date(),until=new Date(at.getTime()+Math.max(1,Number(hours)||48)*3600000);return save({...client,status:'Ativo',trust_release_at:at.toISOString(),trust_release_until:until.toISOString()})}
  async function nextContract(){const state=await readState(),clients=Array.isArray(state.clients)?state.clients:[],year=new Date().getFullYear();let n=Math.max(0,...clients.map(c=>Number(c?.id)||0))+1,code;do{code=`CTR-${year}-${String(n++).padStart(6,'0')}`}while(clients.some(c=>String(c?.contract_number||'')===code));return code}

  api.clients.list=list;api.clients.save=save;api.clients.delete=remove;api.clients.status=status;
  api.clients.setMikrotikState=setMikrotikState;api.clients.block=block;api.clients.unblock=unblock;api.clients.trustRelease=trustRelease;api.clients.nextContract=nextContract;
  api.clients.openRouter=async()=>({opened:false,mode:'cloud-rest',message:'O acesso ao MikroTik é feito pela integração REST HTTPS em nuvem.'});
  api.clients.__legacyLocal=original;
  Object.defineProperty(api.clients,'__cloudClientStoreV2Installed',{value:true,enumerable:false});
  list().catch(error=>console.error('Provedor Plus: falha ao carregar clientes da nuvem.',error));
})();
