(()=>{
  const api=window.provedor;
  if(!api?.routers||api.routers.__cloudStoreV2Installed)return;
  const KEY='provedor_plus_cloud_routers_1017_v1';
  const DELETED='provedor_plus_cloud_routers_deleted_1017_v1';
  const original={...api.routers};
  const readJson=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'');return v??fallback}catch{return fallback}};
  const writeJson=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const localList=()=>{const v=readJson(KEY,[]);return Array.isArray(v)?v:[]};
  const deletedSet=()=>new Set((readJson(DELETED,[])||[]).map(Number).filter(Number.isFinite));
  const withoutSecret=data=>{const out={...(data||{})};delete out.password;delete out.secret;return out};

  async function cloud(action,data={}){
    const response=await fetch('/api/cloud-data',{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})
    });
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw new Error(body.error||`Falha na sincronização com a nuvem (HTTP ${response.status}).`);
    return body.data;
  }

  async function collectLocal(){
    let legacy=[];try{legacy=await original.list()}catch{}
    const deleted=deletedSet(),merged=new Map();
    for(const r of Array.isArray(legacy)?legacy:[]){const id=Number(r?.id);if(id&&deleted.has(id))continue;if(id)merged.set(id,{...r})}
    for(const r of localList()){const id=Number(r?.id);if(id&&!deleted.has(id))merged.set(id,{...merged.get(id),...r})}
    return [...merged.values()].sort((a,b)=>Number(a.id)-Number(b.id));
  }

  async function list(){
    const local=await collectLocal();
    let remote=null;try{remote=await cloud('routers.list')}catch{}
    if(!Array.isArray(remote))return local;

    const remoteIds=new Set(remote.map(x=>Number(x?.id)).filter(Boolean));
    const missing=local.filter(x=>x?.id&&x?.host&&x?.username&&!remoteIds.has(Number(x.id)));
    if(missing.length){
      await Promise.allSettled(missing.map(x=>cloud('routers.save',withoutSecret(x))));
      try{remote=await cloud('routers.list')}catch{}
    }

    const deleted=deletedSet(),merged=new Map();
    for(const r of Array.isArray(remote)?remote:[]){const id=Number(r?.id);if(id&&!deleted.has(id))merged.set(id,{...r})}
    for(const r of local){const id=Number(r?.id);if(id&&!deleted.has(id))merged.set(id,{...merged.get(id),...r})}
    return [...merged.values()].sort((a,b)=>Number(a.id)-Number(b.id));
  }

  async function save(data){
    const current=await list();
    let id=Number(data?.id)||0;
    if(!id){id=current.reduce((m,r)=>Math.max(m,Number(r?.id)||0),0)+1;if(id<1)id=1}
    const existing=current.find(r=>Number(r.id)===id)||{};
    const record={...existing,...withoutSecret(data),id,connection_method:'rest',host:String(data?.host||existing.host||'').trim(),port:Number(data?.port)||443,updated_at:new Date().toISOString()};
    const locals=localList().filter(r=>Number(r.id)!==id);locals.push(record);writeJson(KEY,locals);
    const deleted=deletedSet();deleted.delete(id);writeJson(DELETED,[...deleted]);
    const remote=await cloud('routers.save',record);
    return {...record,...(remote||{}),id};
  }

  async function remove(id){
    id=Number(id);if(!id)return {deleted:false,id};
    await cloud('routers.delete',{id});
    writeJson(KEY,localList().filter(r=>Number(r.id)!==id));
    const deleted=deletedSet();deleted.add(id);writeJson(DELETED,[...deleted]);
    return {deleted:true,id};
  }

  api.routers.list=list;
  api.routers.save=save;
  api.routers.delete=remove;
  Object.defineProperty(api.routers,'__cloudStoreV2Installed',{value:true,enumerable:false});
  list().catch(()=>{});
})();
