(()=>{
  const KEY='provedor_plus_web_1_0_17';
  const nativeGet=Storage.prototype.getItem;
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;
  const AUX_KEYS=['provedor_plus_mikrotik_traffic_1017_cloud','provedor_plus_cloud_routers_1017_v1','provedor_plus_cloud_routers_deleted_1017_v1'];
  let hookInstalled=false;
  let apiWrapped=false;
  let timer=null;
  let retryTimer=null;
  let syncChain=Promise.resolve();
  let latestRaw=null;
  let lastSyncedRaw=null;
  let lastSyncedState=null;
  let remoteUpdatedAt=null;
  let retryDelay=1200;

  const parse=raw=>{try{return raw?JSON.parse(raw):null}catch{return null}};
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const json=value=>{try{return JSON.stringify(value)}catch{return''}};
  const same=(a,b)=>json(a)===json(b);
  const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
  const paidStatus=value=>/^(pago|paga|paid|baixado|recebido|recebida|quitado|quitada)$/i.test(String(value||'').trim());

  async function cloud(action,data={}){
    const response=await fetch('/api/cloud-state',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})
    });
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok){
      const error=new Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
      error.status=response.status;error.data=body.data||null;throw error;
    }
    return body.data;
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

  function identity(item){
    if(!isObject(item))return '';
    if(item.id!==undefined&&item.id!==null&&String(item.id)!=='')return `id:${String(item.id)}`;
    if(item.key!==undefined&&item.key!==null&&String(item.key)!=='')return `key:${String(item.key)}`;
    if(item.client_id!==undefined&&item.created_at)return `client:${item.client_id}:${item.created_at}:${item.source||item.type||''}`;
    return '';
  }

  function mergeArray(base,local,remote,path){
    const all=[...(base||[]),...(local||[]),...(remote||[])];
    if(!all.length)return [];
    if(!all.every(item=>!isObject(item)||identity(item))){
      if(same(local,base))return clone(remote);
      if(same(remote,base))return clone(local);
      return clone(local);
    }
    const b=new Map((base||[]).map(item=>[identity(item),item]));
    const l=new Map((local||[]).map(item=>[identity(item),item]));
    const r=new Map((remote||[]).map(item=>[identity(item),item]));
    const order=[];for(const item of remote||[])order.push(identity(item));for(const item of local||[])if(!order.includes(identity(item)))order.push(identity(item));
    const out=[];
    for(const key of order){
      const bv=b.get(key),lv=l.get(key),rv=r.get(key);
      if(lv===undefined){if(bv!==undefined&&same(rv,bv))continue;if(rv!==undefined)out.push(clone(rv));continue}
      if(rv===undefined){if(bv!==undefined&&same(lv,bv))continue;out.push(clone(lv));continue}
      out.push(mergeValue(bv,lv,rv,`${path}[${key}]`));
    }
    return out;
  }

  function mergeValue(base,local,remote,path='state'){
    if(same(local,base))return clone(remote);
    if(same(remote,base))return clone(local);
    if(Array.isArray(local)&&Array.isArray(remote))return mergeArray(Array.isArray(base)?base:[],local,remote,path);
    if(isObject(local)&&isObject(remote)){
      const out={};
      const keys=new Set([...Object.keys(isObject(base)?base:{}),...Object.keys(local),...Object.keys(remote)]);
      for(const key of keys){
        const bv=isObject(base)?base[key]:undefined,lv=local[key],rv=remote[key];
        if(lv===undefined){if(rv!==undefined)out[key]=clone(rv);continue}
        if(rv===undefined){out[key]=clone(lv);continue}
        if(key==='status'&&paidStatus(rv)&&!paidStatus(lv)){out[key]=rv;continue}
        if((key==='paid_at'||key==='paidAt'||key==='paid_date')&&rv&&!lv){out[key]=rv;continue}
        out[key]=mergeValue(bv,lv,rv,`${path}.${key}`);
      }
      return out;
    }
    if(/\.status$/.test(path)&&paidStatus(remote)&&!paidStatus(local))return remote;
    return clone(local);
  }

  function transientConflict(error){
    const message=String(error?.message||error||'');
    return Number(error?.status)===409||/simultaneamente|outro acesso|conflito|conflict/i.test(message);
  }

  function scheduleRetry(){
    clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{retryTimer=null;flush().catch(()=>{})},retryDelay);
  }

  function acceptRemote(state,updatedAt){
    const raw=JSON.stringify(state||{});
    lastSyncedState=clone(state||{});lastSyncedRaw=raw;remoteUpdatedAt=updatedAt||null;
    return raw;
  }

  async function saveRaw(raw){
    const state=parse(raw);
    if(!state||typeof state!=='object')throw new Error('O estado do Provedor Plus está inválido e não pode ser sincronizado.');
    try{
      const result=await cloud('state.save',{state,expected_updated_at:remoteUpdatedAt});
      const savedState=result?.state&&typeof result.state==='object'?result.state:state;
      const savedRaw=acceptRemote(savedState,result?.updated_at||remoteUpdatedAt);
      if(savedRaw!==raw){nativeSet.call(window.localStorage,KEY,savedRaw);latestRaw=savedRaw}else latestRaw=raw;
      return result;
    }catch(error){
      if(transientConflict(error)&&error?.data?.state&&typeof error.data.state==='object'){
        const remoteState=error.data.state,base=lastSyncedState||{},merged=mergeValue(base,state,remoteState),remoteRaw=acceptRemote(remoteState,error.data.updated_at||null),mergedRaw=JSON.stringify(merged);
        nativeSet.call(window.localStorage,KEY,mergedRaw);restoreAux(merged);latestRaw=mergedRaw;
        if(mergedRaw===remoteRaw)return {state:remoteState,updated_at:remoteUpdatedAt,merged:true,saved:false};
      }
      throw error;
    }
  }

  function enqueueSync(raw,{notify=true}={}){
    latestRaw=String(raw??'');
    const task=syncChain.catch(()=>{}).then(async()=>{
      const target=latestRaw||localRaw();
      if(!target||target===lastSyncedRaw)return {saved:false};
      try{
        const result=await saveRaw(target);
        retryDelay=1200;clearTimeout(retryTimer);retryTimer=null;
        if(latestRaw&&latestRaw!==lastSyncedRaw)scheduleRetry();
        return {saved:result?.saved!==false,...(result||{})};
      }catch(error){
        retryDelay=Math.min(60000,Math.max(2400,retryDelay*2));scheduleRetry();
        if(transientConflict(error))console.warn('Provedor Plus: estado conciliado com outra alteração; nova tentativa agendada.');
        else{
          console.error('Provedor Plus: falha ao sincronizar estado com a nuvem.',error);
          if(notify)window.dispatchEvent(new CustomEvent('provedor-plus-cloud-error',{detail:{message:error?.message||String(error)}}));
        }
        throw error;
      }
    });
    syncChain=task.catch(()=>{});return task;
  }

  async function flush(){
    clearTimeout(timer);timer=null;
    const raw=latestRaw??localRaw();
    if(!raw||raw===lastSyncedRaw)return {saved:false};
    try{return await enqueueSync(raw,{notify:true})}catch{return {saved:false}}
  }

  function queue(raw){latestRaw=String(raw??'');clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),220)}

  function installHook(){
    if(hookInstalled)return;hookInstalled=true;
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
      if(this===window.localStorage&&String(key)===KEY){latestRaw='';lastSyncedRaw=null;lastSyncedState=null;remoteUpdatedAt=null}
      else if(this===window.localStorage&&AUX_KEYS.includes(String(key))){
        const state=parse(localRaw())||{};if(state.__cloud_aux)delete state.__cloud_aux[String(key)];const raw=JSON.stringify(state);nativeSet.call(window.localStorage,KEY,raw);queue(raw);
      }
      return result;
    };
  }

  async function prepare(){
    installHook();const local=localRaw();let remote;
    try{remote=await cloud('state.get')}catch(error){throw new Error(`Não foi possível conectar ao banco da nuvem: ${error?.message||error}`)}
    if(remote?.state&&typeof remote.state==='object'){
      const raw=acceptRemote(remote.state,remote.updated_at||null);nativeSet.call(window.localStorage,KEY,raw);restoreAux(remote.state);latestRaw=raw;
      return {source:'cloud',updatedAt:remote.updated_at||null};
    }
    if(local){
      let state=parse(local);
      if(state&&typeof state==='object'){
        state=collectAux(state);remoteUpdatedAt=null;lastSyncedState=null;lastSyncedRaw=null;
        const saved=await cloud('state.save',{state,expected_updated_at:null});
        const savedState=saved?.state||state,raw=acceptRemote(savedState,saved?.updated_at||null);nativeSet.call(window.localStorage,KEY,raw);latestRaw=raw;
        return {source:'local-migrated',updatedAt:saved?.updated_at||null};
      }
    }
    return {source:'empty',updatedAt:null};
  }

  async function forceSync(){clearTimeout(timer);timer=null;const raw=localRaw();latestRaw=raw;if(!raw)return {saved:false};return enqueueSync(raw,{notify:true})}

  function wrapApi(api){
    if(apiWrapped||!api||typeof api!=='object')return;apiWrapped=true;
    const skipGroups=new Set(['app','dashboard','reports']);
    for(const [groupName,group] of Object.entries(api)){
      if(skipGroups.has(groupName)||!group||typeof group!=='object'||group.__cloudOwnsStateSync)continue;
      for(const [methodName,fn] of Object.entries(group)){
        if(typeof fn!=='function')continue;
        group[methodName]=async function(...args){
          const before=localRaw(),result=await fn.apply(this,args),after=localRaw();
          if(after!==before){latestRaw=after;clearTimeout(timer);timer=null;await flush()}
          return result;
        };
      }
    }
  }

  window.addEventListener('beforeunload',()=>{if(latestRaw&&latestRaw!==lastSyncedRaw)flush().catch(()=>{})});
  window.ProvedorPlusCloudState={prepare,forceSync,wrapApi,getState:()=>parse(localRaw())};
})();
