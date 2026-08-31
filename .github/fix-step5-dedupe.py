from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrao nao encontrado em {path}: {old[:100]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')

# 1) O merge de negociacoes passa para o backend: uma unica chamada HTTP por save.
worker='worker-native-api.js'
worker_text=Path(worker).read_text(encoding='utf-8')
helper="""
function preservePortalState(incoming,existing){
  const state=incoming&&typeof incoming==='object'&&!Array.isArray(incoming)?{...incoming}:{},remote=existing&&typeof existing==='object'&&!Array.isArray(existing)?existing:{};
  const localNegotiations=Array.isArray(state.negotiations)?[...state.negotiations]:[],remoteNegotiations=Array.isArray(remote.negotiations)?remote.negotiations:[],known=new Set(localNegotiations.map(item=>String(item?.id||'')).filter(Boolean));
  for(const item of remoteNegotiations){const id=String(item?.id||'');if(id&&!known.has(id)){localNegotiations.push(item);known.add(id)}}
  if(localNegotiations.length)state.negotiations=localNegotiations;
  const localInvoices=Array.isArray(state.invoices)?[...state.invoices]:[],remoteInvoices=Array.isArray(remote.invoices)?remote.invoices:[],index=new Map(localInvoices.map((item,i)=>[String(item?.id??''),i]));
  for(const remoteInvoice of remoteInvoices){if(!remoteInvoice?.negotiation_id)continue;const key=String(remoteInvoice?.id??''),position=index.get(key);if(position===undefined){index.set(key,localInvoices.length);localInvoices.push(remoteInvoice);continue}const localInvoice=localInvoices[position];if(!localInvoice?.negotiation_id||String(localInvoice.negotiation_id)!==String(remoteInvoice.negotiation_id))localInvoices[position]=remoteInvoice;}
  if(localInvoices.length)state.invoices=localInvoices;
  const maxInvoiceId=Math.max(Number(state?.seq?.invoices)||0,...localInvoices.map(item=>Number(item?.id)||0));if(maxInvoiceId)state.seq={...(state.seq||{}),invoices:maxInvoiceId};
  return state;
}
"""
marker="function sanitize(value,depth=0){"
if 'function preservePortalState(' not in worker_text:
    idx=worker_text.find(marker)
    if idx<0: raise SystemExit('Marcador sanitize nao encontrado no worker')
    worker_text=worker_text[:idx]+helper+worker_text[idx:]
old_save="else if(action==='state.save'){if(!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});const clean=sanitize(data.state),row=await setSetting(sql,STATE_KEY,clean);result={state:row?.value||clean,updated_at:row?.updated_at||new Date().toISOString()};}"
new_save="else if(action==='state.save'){if(!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});const previous=await getSetting(sql,STATE_KEY),merged=preservePortalState(data.state,previous?.value),clean=sanitize(merged),row=await setSetting(sql,STATE_KEY,clean);result={state:row?.value||clean,updated_at:row?.updated_at||new Date().toISOString()};}"
if old_save not in worker_text:
    raise SystemExit('Bloco state.save original nao encontrado')
worker_text=worker_text.replace(old_save,new_save,1)
Path(worker).write_text(worker_text,encoding='utf-8')

# 2) Cliente nao faz mais state.get antes de cada state.save.
store='cloud-state-store.js'
text=Path(store).read_text(encoding='utf-8')
start=text.find('  function preservePortalNegotiations(')
end=text.find('  async function saveRaw(raw){',start)
if start<0 or end<0: raise SystemExit('Bloco preservePortalNegotiations nao encontrado')
text=text[:start]+text[end:]
old="""  async function saveRaw(raw){
    let state=parse(raw);
    if(!state||typeof state!=='object')throw new Error('O estado do Provedor Plus está inválido e não pode ser sincronizado.');
    try{
      const remote=await cloud('state.get');
      if(remote?.state&&typeof remote.state==='object')state=preservePortalNegotiations(state,remote.state);
    }catch(error){console.warn('Provedor Plus: não foi possível conferir acordos do portal antes da sincronização.',error)}
    const mergedRaw=JSON.stringify(state);
    if(mergedRaw!==raw){nativeSet.call(window.localStorage,KEY,mergedRaw);latestRaw=mergedRaw}
    const result=await cloud('state.save',{state});
    lastSyncedRaw=mergedRaw;
    return result;
  }
"""
new="""  async function saveRaw(raw){
    const state=parse(raw);
    if(!state||typeof state!=='object')throw new Error('O estado do Provedor Plus está inválido e não pode ser sincronizado.');
    const result=await cloud('state.save',{state});
    const savedState=result?.state&&typeof result.state==='object'?result.state:state;
    const savedRaw=JSON.stringify(savedState);
    if(savedRaw!==raw){nativeSet.call(window.localStorage,KEY,savedRaw);latestRaw=savedRaw}
    lastSyncedRaw=savedRaw;
    return result;
  }
"""
if old not in text: raise SystemExit('saveRaw antigo nao encontrado')
text=text.replace(old,new,1)
# Dedupe: um mesmo raw em voo compartilha a mesma Promise; raw ja sincronizado nao grava de novo.
text=text.replace('  let prepareGeneration=0;','  let prepareGeneration=0;\n  let activeSyncPromise=null;\n  let activeSyncRaw=null;',1)
old_force="""  async function forceSync(){
    clearTimeout(timer);
    latestRaw=localRaw();
    if(!latestRaw)return {saved:false};
    if(syncing){
      pending=true;
      await new Promise(resolve=>setTimeout(resolve,250));
      return forceSync();
    }
    syncing=true;
    try{
      const result=await saveRaw(latestRaw);
      return {saved:true,...(result||{})};
    }finally{syncing=false}
  }
"""
new_force="""  async function forceSync(){
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
"""
if old_force not in text: raise SystemExit('forceSync antigo nao encontrado')
text=text.replace(old_force,new_force,1)
# Queue nao agenda save do mesmo conteudo ja sincronizado.
text=text.replace("  function queue(raw){\n    latestRaw=String(raw??'');\n    clearTimeout(timer);\n    timer=setTimeout(flush,180);\n  }","  function queue(raw){\n    latestRaw=String(raw??'');\n    clearTimeout(timer);\n    if(!latestRaw||latestRaw===lastSyncedRaw)return;\n    timer=setTimeout(flush,180);\n  }",1)
Path(store).write_text(text,encoding='utf-8')

# 3) Cache somente dos arquivos desta etapa.
replace_once('bootstrap.js',"const BUILD_TOKEN='20260831-step4-sync1';","const BUILD_TOKEN='20260831-step5-dedupe1';")
replace_once('bootstrap.js',"/cloud-state-store.js?v=20260831-step4-sync1","/cloud-state-store.js?v=20260831-step5-dedupe1")
replace_once('index.html',"/bootstrap.js?v=20260831-step4-sync1","/bootstrap.js?v=20260831-step5-dedupe1")

# Validacoes de escopo e deduplicacao.
store_text=Path(store).read_text(encoding='utf-8')
worker_text=Path(worker).read_text(encoding='utf-8')
if "const remote=await cloud('state.get')" in store_text: raise SystemExit('saveRaw ainda faz state.get')
if 'preservePortalNegotiations' in store_text: raise SystemExit('merge antigo ainda existe no cliente')
for required in ['activeSyncPromise','raw===lastSyncedRaw','function preservePortalState(','merged=preservePortalState']:
    if required not in (store_text+worker_text): raise SystemExit(f'Marcador ausente: {required}')
print('ETAPA 5 VALIDADA: uma chamada HTTP por save e dedupe de sincronizacoes')
