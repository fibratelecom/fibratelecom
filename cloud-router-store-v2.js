(()=>{
  const api=window.provedor;
  if(!api?.routers||api.routers.__cloudStoreV2Installed)return;
  const STATE_KEY='provedor_plus_web_1_0_17';
  const LEGACY_KEY='provedor_plus_cloud_routers_1017_v1';
  const LEGACY_DELETED='provedor_plus_cloud_routers_deleted_1017_v1';
  const original={...api.routers};

  const readState=()=>{try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')||{}}catch{return{}}};
  const writeState=state=>localStorage.setItem(STATE_KEY,JSON.stringify(state||{}));
  const withoutSecret=data=>{const out={...(data||{})};delete out.password;delete out.secret;return out};
  const readLegacy=()=>{try{const rows=JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}};
  const clearLegacy=()=>{try{localStorage.removeItem(LEGACY_KEY);localStorage.removeItem(LEGACY_DELETED)}catch{}};

  async function cloud(action,data={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch('/api/cloud-data',{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal
      });
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw new Error(body.error||`Falha na sincronização com a nuvem (HTTP ${response.status}).`);
      return body.data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error(`Tempo limite ao consultar ${action}.`);
      throw error;
    }finally{clearTimeout(timer)}
  }

  function cacheRouters(rows,{markMigrated=true}={}){
    const state=readState();
    state.routers=(Array.isArray(rows)?rows:[]).map(withoutSecret);
    if(markMigrated){state.__cloud_migrations={...(state.__cloud_migrations||{}),routers_v2:true}}
    writeState(state);
  }

  async function migrateLegacyIfNeeded(remote){
    const state=readState();
    if(state.__cloud_migrations?.routers_v2)return remote;
    let legacy=[];try{legacy=await original.list()}catch{}
    const merged=new Map();
    for(const r of [...(Array.isArray(legacy)?legacy:[]),...readLegacy()]){const id=Number(r?.id);if(id&&r?.host&&r?.username)merged.set(id,withoutSecret(r))}
    const candidates=[...merged.values()];
    if(!remote.length&&candidates.length){
      await Promise.allSettled(candidates.map(r=>cloud('routers.save',r)));
      remote=await cloud('routers.list');
    }
    cacheRouters(remote,{markMigrated:true});
    clearLegacy();
    return remote;
  }

  async function list(){
    let remote=await cloud('routers.list');
    if(!Array.isArray(remote))remote=[];
    remote=await migrateLegacyIfNeeded(remote);
    cacheRouters(remote,{markMigrated:true});
    clearLegacy();
    const state=readState(),clients=Array.isArray(state.clients)?state.clients:[];
    return remote.map(r=>({...r,has_password:Boolean(r.has_password),client_count:clients.filter(c=>Number(c.router_id)===Number(r.id)).length})).sort((a,b)=>Number(a.id)-Number(b.id));
  }

  async function save(data){
    const record={...withoutSecret(data),connection_method:'rest',host:String(data?.host||'').trim(),port:Number(data?.port)||443,updated_at:new Date().toISOString()};
    const remote=await cloud('routers.save',record);
    if(!remote?.id)throw new Error('O MikroTik foi enviado à nuvem, mas não retornou o identificador do cadastro.');
    const rows=await cloud('routers.list');
    cacheRouters(Array.isArray(rows)?rows:[remote],{markMigrated:true});
    return {...record,...remote,id:Number(remote.id)};
  }

  async function remove(id){
    id=Number(id);if(!id)return {deleted:false,id};
    await cloud('routers.delete',{id});
    const rows=await cloud('routers.list');
    cacheRouters(Array.isArray(rows)?rows:[],{markMigrated:true});
    return {deleted:true,id};
  }

  api.routers.list=list;
  api.routers.save=save;
  api.routers.delete=remove;
  Object.defineProperty(api.routers,'__cloudStoreV2Installed',{value:true,enumerable:false});
  list().catch(error=>console.error('Provedor Plus: falha ao carregar MikroTiks da nuvem.',error));
})();
