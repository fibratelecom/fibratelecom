(()=>{
  const KEY='provedor_plus_web_1_0_17';
  const nativeGet=Storage.prototype.getItem;
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;
  const AUX_KEYS=['provedor_plus_mikrotik_traffic_1017_cloud','provedor_plus_cloud_routers_1017_v1','provedor_plus_cloud_routers_deleted_1017_v1'];
  let hookInstalled=false;
  let apiWrapped=false;
  let timer=null;
  let syncing=false;
  let pending=false;
  let latestRaw=null;
  let lastSyncedRaw=null;
  let retryDelay=1200;
  let prepareGeneration=0;
  let activeSyncPromise=null;
  let activeSyncRaw=null;

  const parse=raw=>{try{return raw?JSON.parse(raw):null}catch{return null}};

  async function cloud(action,data={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch('/api/cloud-state',{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal
      });
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw new Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
      return body.data;
    }catch(error){
      if(error?.name==='AbortError')throw new Error(`Tempo limite ao consultar ${action}.`);
      throw error;
    }finally{clearTimeout(timer)}
  }

  function localRaw(){return nativeGet.call(window.localStorage,KEY)||''}
  const parseAux=raw=>{try{return raw?JSON.parse(raw):null}catch{return raw||null}};
  function collectAux(state){
    const out={...(state||{})};
    out.__cloud_aux={...(out.__cloud_aux||{})};
    for(const key of AUX_KEYS){const raw=nativeGet.call(window.localStorage,key);if(raw!=null)out.__cloud_aux[key]=parseAux(raw)}
    return out;
  }
  function restoreAux(state){
    const aux=state?.__cloud_aux||{};
    for(const key of AUX_KEYS){if(!Object.prototype.hasOwnProperty.call(aux,key))continue;const value=aux[key];nativeSet.call(window.localStorage,key,typeof value==='string'?value:JSON.stringify(value))}
  }

  async function saveRaw(raw){
    const state=parse(raw);
    if(!state||typeof state!=='object')throw new Error('O estado do Provedor Plus está inválido e não pode ser sincronizado.');
    const result=await cloud('state.save',{state});
    const savedState=result?.state&&typeof result.state==='object'?result.state:state;
    const savedRaw=JSON.stringify(savedState);
    if(savedRaw!==raw){nativeSet.call(window.localStorage,KEY,savedRaw);latestRaw=savedRaw}
    lastSyncedRaw=savedRaw;
    return result;
  }

  async function flush(){
    if(syncing){pending=true;return}
    const raw=latestRaw??localRaw();
    if(!raw||raw===lastSyncedRaw)return;
    syncing=true;let failed=false;
    try{await saveRaw(raw);retryDelay=1200}catch(error){
      failed=true;pending=true;retryDelay=Math.min(60000,Math.max(2400,retryDelay*2));
      console.error('Provedor Plus: falha ao sincronizar estado com a nuvem.',error);
      window.dispatchEvent(new CustomEvent('provedor-plus-cloud-error',{detail:{message:error?.message||String(error)}}));
    }finally{
      syncing=false;
      if(pending){pending=false;clearTimeout(timer);timer=setTimeout(flush,failed?retryDelay:1200)}
    }
  }

  function queue(raw){
    latestRaw=String(raw??'');
    clearTimeout(timer);
    if(!latestRaw||latestRaw===lastSyncedRaw)return;
    timer=setTimeout(flush,180);
  }

  function installHook(){
    if(hookInstalled)return;
    hookInstalled=true;
    Storage.prototype.setItem=function(key,value){
      const result=nativeSet.call(this,key,value);
      if(this===window.localStorage&&String(key)===KEY)queue(String(value));
      else if(this===window.localStorage&&AUX_KEYS.includes(String(key))){
        const state=parse(localRaw())||{};state.__cloud_aux={...(state.__cloud_aux||{}),[String(key)]:parseAux(String(value))};
        const raw=JSON.stringify(state);nativeSet.call(window.localStorage,KEY,raw);queue(raw);
      }
      return result;
    };
    Storage.prototype.removeItem=function(key){
      const result=nativeRemove.call(this,key);
      if(this===window.localStorage&&String(key)===KEY){latestRaw='';lastSyncedRaw=null}
      else if(this===window.localStorage&&AUX_KEYS.includes(String(key))){
        const state=parse(localRaw())||{};if(state.__cloud_aux)delete state.__cloud_aux[String(key)];const raw=JSON.stringify(state);nativeSet.call(window.localStorage,KEY,raw);queue(raw);
      }
      return result;
    };
  }

  async function prepare(){
  installHook();
  const generation=++prepareGeneration;
  const local=localRaw();
  let remote;
  try{remote=await cloud('state.get')}catch(error){
    if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
    throw new Error(`Não foi possível conectar ao banco da nuvem: ${error?.message||error}`);
  }
  if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
  if(remote?.state&&typeof remote.state==='object'){
    const raw=JSON.stringify(remote.state);
    if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
    nativeSet.call(window.localStorage,KEY,raw);restoreAux(remote.state);latestRaw=raw;lastSyncedRaw=raw;
    return {source:'cloud',updatedAt:remote.updated_at||null};
  }
  if(local){
    let state=parse(local);
    if(state&&typeof state==='object'){
      if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
      state=collectAux(state);
      const saved=await cloud('state.save',{state});
      if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
      const raw=JSON.stringify(saved?.state||state);
      nativeSet.call(window.localStorage,KEY,raw);latestRaw=raw;lastSyncedRaw=raw;
      return {source:'local-migrated',updatedAt:saved?.updated_at||null};
    }
  }
  return {source:'empty',updatedAt:null};
}

function cancelPrepare(){prepareGeneration++}

  async function forceSync(){
    clearTimeout(timer);
    latestRaw=localRaw();
    const raw=latestRaw;
    if(!raw||raw===lastSyncedRaw)return {saved:false};
    if(activeSyncPromise&&activeSyncRaw===raw)return activeSyncPromise;
    if(activeSyncPromise){
      pending=true;
      try{await activeSyncPromise}catch{}
      latestRaw=localRaw();
      if(!latestRaw||latestRaw===lastSyncedRaw)return {saved:false};
      return forceSync();
    }
    syncing=true;activeSyncRaw=raw;
    activeSyncPromise=(async()=>{const result=await saveRaw(raw);return {saved:true,...(result||{})}})();
    try{return await activeSyncPromise}finally{syncing=false;activeSyncPromise=null;activeSyncRaw=null}
  }

  function wrapApi(api){
    if(apiWrapped||!api||typeof api!=='object')return;
    apiWrapped=true;
    const skipGroups=new Set(['app','dashboard','reports']);
    for(const [groupName,group] of Object.entries(api)){
      if(skipGroups.has(groupName)||!group||typeof group!=='object'||group.__cloudOwnsStateSync)continue;
      for(const [methodName,fn] of Object.entries(group)){
        if(typeof fn!=='function')continue;
        group[methodName]=async function(...args){
          const before=localRaw();
          const result=await fn.apply(this,args);
          const after=localRaw();
          if(after!==before)await forceSync();
          return result;
        };
      }
    }
  }

  window.addEventListener('beforeunload',()=>{if(latestRaw&&latestRaw!==lastSyncedRaw)flush().catch(()=>{})});
  window.ProvedorPlusCloudState={prepare,cancelPrepare,forceSync,wrapApi,getState:()=>parse(localRaw())};
})();