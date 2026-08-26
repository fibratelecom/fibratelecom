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

  const localDayKey=(value=new Date())=>{const d=value instanceof Date?value:new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const localMonthKey=(value=new Date())=>localDayKey(value).slice(0,7);

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

  function hasValue(value){return value!==undefined&&value!==null&&value!==''}
  function dedupeClients(rows){
    const out=[];
    for(const raw of Array.isArray(rows)?rows:[]){
      const row=normalize(raw),index=out.findIndex(existing=>sameIdentity(existing,row));
      if(index<0){out.push(row);continue}
      const merged={...out[index]};
      for(const [key,value] of Object.entries(row))if(!hasValue(merged[key])&&hasValue(value))merged[key]=value;
      out[index]=normalize(merged);
    }
    return out;
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

  function hasOverdue(state,clientId){
    const today=localDayKey();
    return (Array.isArray(state?.invoices)?state.invoices:[]).some(row=>Number(row?.client_id)===Number(clientId)&&row?.status==='Pendente'&&String(row?.due_date||'').slice(0,10)<today);
  }
  const statusAfterEnable=(state,clientId)=>hasOverdue(state,clientId)?'Em atraso':'Ativo';

  function trustInfo(client){
    const currentMonth=localMonthKey(),until=client?.trust_release_until?new Date(client.trust_release_until):null;
    const usedMonth=String(client?.trust_release_used_month||'')||String(client?.trust_release_at||'').slice(0,7);
    const next=new Date();next.setDate(1);next.setMonth(next.getMonth()+1);next.setHours(0,0,0,0);
    return {usedThisMonth:Boolean(usedMonth&&usedMonth===currentMonth),usedMonth,active:Boolean(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()),startedAt:client?.trust_release_at||'',until:client?.trust_release_until||null,nextAvailableAt:usedMonth===currentMonth?next.toISOString():''};
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
    const deduped=dedupeClients(clients);
    if(deduped.length!==clients.length||JSON.stringify(deduped)!==JSON.stringify(clients))changed=true;
    clients=deduped;
    clients.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
    if(changed){state={...state,clients};state=await writeState(state)}
    return {state,clients:Array.isArray(state.clients)?dedupeClients(state.clients):clients,changed};
  }

  async function list(){
    const state=await readState(),result=await reconcile(state);
    mirrorState(result.state);
    return result.clients.map(c=>decorate(c,result.state));
  }

  async function save(data){
    let state=await readState();state.clients=dedupeClients(Array.isArray(state.clients)?state.clients:[]);
    const existing=state.clients.find(c=>sameIdentity(c,data))||null,oldId=Number(existing?.id||data?.id)||0,candidate=normalize({...existing,...data});
    if(existing&&Object.prototype.hasOwnProperty.call(data||{},'pppoe_password')&&!String(data?.pppoe_password||'').trim())candidate.pppoe_password=String(existing.pppoe_password||'');
    if(!String(candidate.name||'').trim())throw new Error('Informe o nome ou a razão social do cliente.');
    const remote=normalize(await cloudData('clients.save',candidate));
    if(!remote?.id)throw new Error('A nuvem não retornou o identificador do cliente.');
    const finalRecord=overlayCloudFields({...candidate,id:Number(remote.id)},remote);
    if(oldId&&oldId!==Number(remote.id))remapClientReferences(state,oldId,Number(remote.id));
    let replaced=false;
    state.clients=state.clients.map(row=>{if(sameIdentity(row,existing||data)){replaced=true;return finalRecord}return row});
    if(!replaced)state.clients.push(finalRecord);
    state.clients=dedupeClients(state.clients);
    state=await writeState(state);
    const saved=(Array.isArray(state.clients)?state.clients:[]).find(c=>Number(c?.id)===Number(remote.id))||finalRecord;
    return decorate(saved,state);
  }

  async function remove(id){
    id=Number(id)||0;if(!id)return {deleted:false,id};
    await cloudData('clients.delete',{id});
    let state=await readState();
    state.clients=(Array.isArray(state.clients)?state.clients:[]).filter(c=>Number(c?.id)!==id);
    state.invoices=(Array.isArray(state.invoices)?state.invoices:[]).map(row=>Number(row?.client_id)===id?{...row,client_id:null}:row);
    await writeState(state);
    return {deleted:true,id};
  }

  async function findClient(id){const rows=await list(),client=rows.find(c=>Number(c?.id)===Number(id));if(!client)throw new Error('Cliente não encontrado.');return client}

  async function status(id){
    const client=await findClient(id);
    return {client,trust:trustInfo(client),traffic:{current:{month:localMonthKey(),download_bytes:0,upload_bytes:0},history:[]},router:null,pppoe:null,device:null,connectionState:client.connection_type==='PPPoE'?'unavailable':'not_applicable',connectionError:'',liveRatesAvailable:false,downloadBps:0,uploadBps:0};
  }

  async function setMikrotikState(id,value={}){
    const client=await findClient(id),stamp=value.lastSync||new Date().toISOString(),hasSecret=Object.prototype.hasOwnProperty.call(value,'secretId');
    return save({...client,mikrotik_secret_id:hasSecret?String(value.secretId||''):(client.mikrotik_secret_id||''),mikrotik_status:value.status||client.mikrotik_status||'Não sincronizado',mikrotik_last_sync:stamp,last_mikrotik_sync:stamp});
  }
  async function block(id){const client=await findClient(id);return save({...client,status:'Bloqueado',trust_release_until:''})}
  async function unblock(id){const client=await findClient(id),state=await readState();return save({...client,status:statusAfterEnable(state,id),trust_release_until:''})}
  async function trustRelease(id,hours=48){
    const client=await findClient(id),state=await readState(),info=trustInfo(client);
    if(client.status!=='Bloqueado')throw new Error('A liberação em confiança está disponível quando o cliente estiver bloqueado.');
    if(client.connection_type!=='PPPoE'||!client.router_id||!String(client.pppoe_username||'').trim())throw new Error('Este cliente precisa ter um acesso PPPoE vinculado a um MikroTik.');
    if(info.usedThisMonth)throw new Error('A liberação em confiança já foi utilizada por este cliente neste mês. Ela fica disponível novamente no próximo mês.');
    const safeHours=Math.min(48,Math.max(1,Math.floor(Number(hours)||48))),at=new Date(),until=new Date(at.getTime()+safeHours*3600000);
    return save({...client,status:statusAfterEnable(state,id),trust_release_used_month:localMonthKey(at),trust_release_at:at.toISOString(),trust_release_until:until.toISOString()});
  }
  async function openRouter(id){
    const popup=window.open('about:blank','_blank');
    try{
      const client=await findClient(id),raw=String(client.device_ip||'').trim(),port=Math.min(65535,Math.max(0,Number(client.device_port)||0));
      if(!raw)throw new Error('Cadastre o IP do roteador ou ONU deste cliente.');
      let url,host;
      try{
        const parsed=/^https?:\/\//i.test(raw)?new URL(raw):new URL(`http://${raw}`);
        if(!['http:','https:'].includes(parsed.protocol))throw new Error('Protocolo inválido.');
        if(port)parsed.port=String(port);
        parsed.pathname=parsed.pathname||'/';url=parsed.toString();host=parsed.hostname;
      }catch{throw new Error('O endereço do roteador ou ONU deste cliente é inválido.')}
      if(popup){try{popup.opener=null;popup.location.href=url}catch{popup.close()}}
      else{const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';document.body.appendChild(link);link.click();link.remove()}
      return {opened:true,deviceAccess:{host,port:port||null,url}};
    }catch(error){try{popup?.close()}catch{}throw error}
  }
  async function nextContract(){const state=await readState(),clients=dedupeClients(Array.isArray(state.clients)?state.clients:[]),year=new Date().getFullYear();let n=Math.max(0,...clients.map(c=>Number(c?.id)||0))+1,code;do{code=`CTR-${year}-${String(n++).padStart(6,'0')}`}while(clients.some(c=>String(c?.contract_number||'')===code));return code}

  api.clients.list=list;api.clients.save=save;api.clients.delete=remove;api.clients.status=status;
  api.clients.setMikrotikState=setMikrotikState;api.clients.block=block;api.clients.unblock=unblock;api.clients.trustRelease=trustRelease;api.clients.openRouter=openRouter;api.clients.nextContract=nextContract;
  api.clients.__legacyLocal=original;
  Object.defineProperty(api.clients,'__cloudClientStoreV2Installed',{value:true,enumerable:false});
  Object.defineProperty(api.clients,'__cloudOwnsStateSync',{value:true,enumerable:false});
  list().catch(error=>console.error('Provedor Plus: falha ao carregar clientes da nuvem.',error));
})();
