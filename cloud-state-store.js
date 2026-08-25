(()=>{
  const KEY='provedor_plus_web_1_0_17';
  const AUX_KEYS=['provedor_plus_mikrotik_traffic_1017_cloud','provedor_plus_cloud_routers_1017_v1','provedor_plus_cloud_routers_deleted_1017_v1'];
  const TARGET_KEYS=new Set([KEY,...AUX_KEYS]);
  const nativeGet=Storage.prototype.getItem;
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;
  const memory=new Map();
  let hookInstalled=false,apiWrapped=false,timer=null,syncing=false,pending=false,latestRaw=null,lastSyncedRaw=null;

  const parse=raw=>{try{return raw?JSON.parse(raw):null}catch{return null}};
  const parseAux=raw=>{try{return raw?JSON.parse(raw):null}catch{return raw||null}};
  const memoryGet=key=>memory.has(key)?memory.get(key):null;
  const memorySet=(key,value)=>memory.set(String(key),String(value));
  const memoryRemove=key=>memory.delete(String(key));

  async function cloud(action,data={}){
    const response=await fetch('/api/cloud-state',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
    return body.data;
  }

  function currentRaw(){return memoryGet(KEY)||''}
  function collectLegacy(state){
    const out={...(state||{})};out.__cloud_aux={...(out.__cloud_aux||{})};
    for(const key of AUX_KEYS){const raw=nativeGet.call(window.localStorage,key);if(raw!=null)out.__cloud_aux[key]=parseAux(raw)}
    return out;
  }
  function restoreAux(state){
    const aux=state?.__cloud_aux||{};
    for(const key of AUX_KEYS){if(!Object.prototype.hasOwnProperty.call(aux,key))continue;const value=aux[key];memorySet(key,typeof value==='string'?value:JSON.stringify(value))}
  }
  function clearPersistentLegacy(){
    nativeRemove.call(window.localStorage,KEY);
    for(const key of AUX_KEYS)nativeRemove.call(window.localStorage,key);
  }

  async function saveRaw(raw){
    const state=parse(raw);if(!state||typeof state!=='object')throw new Error('O estado do Provedor Plus está inválido e não pode ser sincronizado.');
    const result=await cloud('state.save',{state});lastSyncedRaw=raw;return result;
  }
  async function flush(){
    if(syncing){pending=true;return}
    const raw=latestRaw??currentRaw();if(!raw||raw===lastSyncedRaw)return;
    syncing=true;
    try{await saveRaw(raw)}catch(error){console.error('Provedor Plus: falha ao sincronizar estado com a nuvem.',error);pending=true;window.dispatchEvent(new CustomEvent('provedor-plus-cloud-error',{detail:{message:error?.message||String(error)}}))}finally{syncing=false;if(pending){pending=false;clearTimeout(timer);timer=setTimeout(flush,1200)}}
  }
  function queue(raw){latestRaw=String(raw??'');clearTimeout(timer);timer=setTimeout(flush,180)}

  function installHook(){
    if(hookInstalled)return;hookInstalled=true;
    Storage.prototype.getItem=function(key){key=String(key);if(this===window.localStorage&&TARGET_KEYS.has(key))return memoryGet(key);return nativeGet.call(this,key)};
    Storage.prototype.setItem=function(key,value){
      key=String(key);value=String(value);
      if(this!==window.localStorage||!TARGET_KEYS.has(key))return nativeSet.call(this,key,value);
      memorySet(key,value);
      if(key===KEY)queue(value);
      else{
        const state=parse(currentRaw())||{};state.__cloud_aux={...(state.__cloud_aux||{}),[key]:parseAux(value)};const raw=JSON.stringify(state);memorySet(KEY,raw);queue(raw);
      }
    };
    Storage.prototype.removeItem=function(key){
      key=String(key);if(this!==window.localStorage||!TARGET_KEYS.has(key))return nativeRemove.call(this,key);
      memoryRemove(key);
      if(key===KEY){latestRaw='';lastSyncedRaw=null}
      else{const state=parse(currentRaw())||{};if(state.__cloud_aux)delete state.__cloud_aux[key];const raw=JSON.stringify(state);memorySet(KEY,raw);queue(raw)}
    };
  }

  async function prepare(){
    const legacyRaw=nativeGet.call(window.localStorage,KEY)||'';
    installHook();
    let remote;
    try{remote=await cloud('state.get')}catch(error){throw new Error(`Não foi possível conectar ao banco da nuvem: ${error?.message||error}`)}
    if(remote?.state&&typeof remote.state==='object'){
      const raw=JSON.stringify(remote.state);memorySet(KEY,raw);restoreAux(remote.state);latestRaw=raw;lastSyncedRaw=raw;clearPersistentLegacy();return {source:'cloud',updatedAt:remote.updated_at||null};
    }
    if(legacyRaw){
      let state=parse(legacyRaw);if(state&&typeof state==='object'){
        state=collectLegacy(state);const saved=await cloud('state.save',{state}),raw=JSON.stringify(saved?.state||state);memorySet(KEY,raw);restoreAux(saved?.state||state);latestRaw=raw;lastSyncedRaw=raw;clearPersistentLegacy();return {source:'local-migrated',updatedAt:saved?.updated_at||null};
      }
    }
    clearPersistentLegacy();return {source:'empty',updatedAt:null};
  }

  async function forceSync(){
    clearTimeout(timer);latestRaw=currentRaw();if(!latestRaw)return {saved:false};
    if(syncing){pending=true;await new Promise(resolve=>setTimeout(resolve,250));return forceSync()}
    syncing=true;try{const result=await saveRaw(latestRaw);return {saved:true,...(result||{})}}finally{syncing=false}
  }

  function setState(state,{sync=true}={}){const raw=JSON.stringify(state||{});memorySet(KEY,raw);latestRaw=raw;if(sync)queue(raw);return state}
  function wrapApi(api){
    if(apiWrapped||!api||typeof api!=='object')return;apiWrapped=true;
    const skipGroups=new Set(['app','dashboard','reports']);
    for(const [groupName,group] of Object.entries(api)){
      if(skipGroups.has(groupName)||!group||typeof group!=='object')continue;
      for(const [methodName,fn] of Object.entries(group)){
        if(typeof fn!=='function')continue;
        group[methodName]=async function(...args){const before=currentRaw(),result=await fn.apply(this,args),after=currentRaw();if(after!==before)await forceSync();return result};
      }
    }
  }

  window.addEventListener('beforeunload',()=>{if(latestRaw&&latestRaw!==lastSyncedRaw)flush().catch(()=>{})});
  window.ProvedorPlusCloudState={prepare,forceSync,wrapApi,getState:()=>parse(currentRaw()),setState};
})();
