(()=>{
  const api=window.provedor;
  if(!api?.routers||api.routers.__cloudStoreInstalled)return;
  const KEY='provedor_plus_cloud_routers_1017_v1';
  const DELETED='provedor_plus_cloud_routers_deleted_1017_v1';
  const original={...api.routers};
  const readJson=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'');return v??fallback}catch{return fallback}};
  const writeJson=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const localList=()=>{const v=readJson(KEY,[]);return Array.isArray(v)?v:[]};
  const deletedSet=()=>new Set((readJson(DELETED,[])||[]).map(Number).filter(Number.isFinite));
  const withoutSecret=data=>{const out={...(data||{})};delete out.password;delete out.secret;return out};
  async function list(){
    let legacy=[];
    try{legacy=await original.list()}catch{}
    const deleted=deletedSet();
    const merged=new Map();
    for(const r of Array.isArray(legacy)?legacy:[]){const id=Number(r?.id);if(id&&deleted.has(id))continue;if(id)merged.set(id,{...r})}
    for(const r of localList()){const id=Number(r?.id);if(id&&!deleted.has(id))merged.set(id,{...merged.get(id),...r})}
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
    return record;
  }
  async function remove(id){
    id=Number(id);writeJson(KEY,localList().filter(r=>Number(r.id)!==id));const deleted=deletedSet();if(id)deleted.add(id);writeJson(DELETED,[...deleted]);return {deleted:true,id};
  }
  api.routers.list=list;
  api.routers.save=save;
  api.routers.delete=remove;
  Object.defineProperty(api.routers,'__cloudStoreInstalled',{value:true,enumerable:false});
})();
