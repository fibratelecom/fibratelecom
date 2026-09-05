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
  let lastSyncedAt=null;
  let retryDelay=1200;
  let prepareGeneration=0;
  let activeSyncPromise=null;
  let activeSyncRaw=null;

  const parse=raw=>{try{return raw?JSON.parse(raw):null}catch{return null}};
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
  const same=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b)}catch{return a===b}};
  const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj||{},key);
  function entityKey(item){
    if(!isObject(item))return '';
    for(const key of ['id','key','protocol','code']){
      const value=item[key];
      if(value!==undefined&&value!==null&&String(value)!=='')return `${key}:${String(value)}`;
    }
    return '';
  }
  function mergeArray(base=[],local=[],remote=[]){
    if(same(local,base))return clone(remote);
    if(same(remote,base))return clone(local);
    const all=[...base,...local,...remote],keys=all.map(entityKey),entityMode=all.length>0&&all.every((item,index)=>isObject(item)&&Boolean(keys[index]));
    if(!entityMode){
      const out=[],seen=new Set();
      for(const item of [...remote,...local]){
        let key;try{key=JSON.stringify(item)}catch{key=String(item)}
        if(seen.has(key))continue;seen.add(key);out.push(clone(item));
      }
      return out;
    }
    const b=new Map(base.map(item=>[entityKey(item),item])),l=new Map(local.map(item=>[entityKey(item),item])),r=new Map(remote.map(item=>[entityKey(item),item]));
    const order=[];for(const item of remote){const key=entityKey(item);if(key&&!order.includes(key))order.push(key)}for(const item of local){const key=entityKey(item);if(key&&!order.includes(key))order.push(key)};
    const out=[];
    for(const key of order){
      const hb=b.has(key),hl=l.has(key),hr=r.has(key),bv=b.get(key),lv=l.get(key),rv=r.get(key);
      if(!hl&&hb){if(!hr)continue;if(same(rv,bv))continue;out.push(clone(rv));continue}
      if(!hr&&hb){if(same(lv,bv))continue;out.push(clone(lv));continue}
      if(!hb){if(hl&&hr)out.push(merge3(undefined,lv,rv));else if(hl)out.push(clone(lv));else if(hr)out.push(clone(rv));continue}
      if(hl&&hr)out.push(merge3(bv,lv,rv));
    }
    return out;
  }
  function merge3(base,local,remote){
    if(same(local,base))return clone(remote);
    if(same(remote,base))return clone(local);
    if(Array.isArray(base)||Array.isArray(local)||Array.isArray(remote))return mergeArray(Array.isArray(base)?base:[],Array.isArray(local)?local:[],Array.isArray(remote)?remote:[]);
    if(isObject(base)||isObject(local)||isObject(remote)){
      const b=isObject(base)?base:{},l=isObject(local)?local:{},r=isObject(remote)?remote:{},out={};
      const keys=new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)]);
      for(const key of keys){
        const hb=has(b,key),hl=has(l,key),hr=has(r,key);
        if(!hl&&hb){if(!hr)continue;if(same(r[key],b[key]))continue;out[key]=clone(r[key]);continue}
        if(!hr&&hb){if(same(l[key],b[key]))continue;out[key]=clone(l[key]);continue}
        if(!hb){if(hl&&hr)out[key]=merge3(undefined,l[key],r[key]);else if(hl)out[key]=clone(l[key]);else if(hr)out[key]=clone(r[key]);continue}
        if(hl&&hr)out[key]=merge3(b[key],l[key],r[key]);
      }
      return out;
    }
    return clone(local);
  }

  async function cloud(action,data={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch('/api/cloud-state',{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal
      });
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok){const error=new Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);error.statusCode=response.status;throw error}
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
    const localState=parse(raw);
    if(!localState||typeof localState!=='object')throw new Error('O estado do Provedor Plus está inválido e não pode ser sincronizado.');
    const baseState=parse(lastSyncedRaw)||{};
    let state=localState,lastResult=null;
    for(let attempt=0;attempt<3;attempt++){
      const remote=await cloud('state.get'),remoteState=remote?.state&&typeof remote.state==='object'?remote.state:{};
      state=merge3(baseState,localState,remoteState);
      let result;
      try{result=await cloud('state.save',{state,baseState,baseUpdatedAt:remote?.updated_at||null})}
      catch(error){if(Number(error?.statusCode)===409||/estado foi atualizado em outro acesso/i.test(String(error?.message||error)))continue;throw error}
      lastResult=result;
      const savedState=result?.state&&typeof result.state==='object'?result.state:state,savedAt=result?.updated_at||null;
      const confirm=await cloud('state.get'),confirmedState=confirm?.state&&typeof confirm.state==='object'?confirm.state:savedState,confirmedAt=confirm?.updated_at||savedAt;
      if(!savedAt||!confirmedAt||String(savedAt)===String(confirmedAt)){
        const savedRaw=JSON.stringify(confirmedState);
        if(savedRaw!==raw){nativeSet.call(window.localStorage,KEY,savedRaw);latestRaw=savedRaw}
        lastSyncedRaw=savedRaw;lastSyncedAt=confirmedAt||savedAt||null;
        return {...(result||{}),state:confirmedState,updated_at:lastSyncedAt};
      }
    }
    throw new Error(lastResult?.error||'O estado mudou simultaneamente em outro acesso. A sincronização será tentada novamente.');
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
      if(this===window.localStorage&&String(key)===KEY){latestRaw='';lastSyncedRaw=null;lastSyncedAt=null}
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
    nativeSet.call(window.localStorage,KEY,raw);restoreAux(remote.state);latestRaw=raw;lastSyncedRaw=raw;lastSyncedAt=remote.updated_at||null;
    return {source:'cloud',updatedAt:remote.updated_at||null};
  }
  if(local){
    let state=parse(local);
    if(state&&typeof state==='object'){
      if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
      state=collectAux(state);
      const saved=await cloud('state.save',{state,baseState:{},baseUpdatedAt:null});
      if(generation!==prepareGeneration)return {source:'stale-ignored',updatedAt:null};
      const raw=JSON.stringify(saved?.state||state);
      nativeSet.call(window.localStorage,KEY,raw);latestRaw=raw;lastSyncedRaw=raw;lastSyncedAt=saved?.updated_at||null;
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