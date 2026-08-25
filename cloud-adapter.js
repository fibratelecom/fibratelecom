(()=>{
  const LEGACY_SECURE_DB='provedor_plus_router_secure_1017_cloud';
  const TRAFFIC_KEY='provedor_plus_mikrotik_traffic_1017_cloud';
  const now=()=>new Date().toISOString();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function openLegacyDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(LEGACY_SECURE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv');if(!db.objectStoreNames.contains('keys'))db.createObjectStore('keys')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Falha ao abrir armazenamento legado.'))})}
  async function legacyCryptoKey(){const db=await openLegacyDb();let key=await new Promise((resolve,reject)=>{const tx=db.transaction('keys','readonly'),r=tx.objectStore('keys').get('router-aes');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});if(!key){db.close();return null}db.close();return key}
  const bytes=text=>{const s=atob(text||''),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a};
  async function legacySecretGet(id){try{const db=await openLegacyDb(),rec=await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),r=tx.objectStore('kv').get(`router:${id}`);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});db.close();if(!rec)return '';const key=await legacyCryptoKey();if(!key)return '';const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(rec.iv)},key,bytes(rec.data));return new TextDecoder().decode(plain)}catch{return ''}}
  async function legacySecretDelete(id){try{const db=await openLegacyDb();await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),r=tx.objectStore('kv').delete(`router:${id}`);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)});db.close()}catch{}}

  async function secretCloud(action,data={}){const response=await fetch('/api/cloud-secrets',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok)throw Error(body.error||`Falha no cofre da nuvem (HTTP ${response.status}).`);return body.data}
  const routerHasCloud=async id=>Boolean((await secretCloud('router.has',{id}))?.configured);
  const routerSecretSet=async(id,password)=>secretCloud('router.set',{id,password});
  const routerSecretDelete=async id=>secretCloud('router.delete',{id});

  async function cloudCall(action,{router=null,data=null}={}){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);try{const response=await fetch('/api/mikrotik-proxy',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,router,data}),signal:ctl.signal});let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok)throw Error(body.error||`Falha na integração MikroTik (HTTP ${response.status}).`);return body.data}finally{clearTimeout(timer)}}
  function cleanHost(value){return String(value||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/^\[|\]$/g,'')}
  function normalizeRouter(r,password=''){let port=Number(r?.port)||443;if(port===8728||port===8729||port===80)port=443;return {id:Number(r?.id)||0,name:String(r?.name||'MikroTik'),connection_method:'rest',host:cleanHost(r?.host),port,username:String(r?.username||'').trim(),password:String(password||''),allow_self_signed:Boolean(r?.allow_self_signed)}}
  function trafficLoad(){try{return JSON.parse(localStorage.getItem(TRAFFIC_KEY)||'{}')}catch{return{}}}
  function trafficSave(v){localStorage.setItem(TRAFFIC_KEY,JSON.stringify(v))}
  function emptyTraffic(){return {current:{month:new Date().toISOString().slice(0,7),download_bytes:0,upload_bytes:0},history:[],downloadBps:0,uploadBps:0}}
  function trafficRecord(clientId,live){const all=trafficLoad(),key=String(clientId),month=new Date().toISOString().slice(0,7),t=Date.now();let x=all[key]||{month,download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0,history:[]};if(x.month!==month){if(x.month)x.history=[{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},...(x.history||[])].slice(0,12);x={...x,month,download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0}}let downBps=Number(live?.downloadBps)||0,upBps=Number(live?.uploadBps)||0;if(live?.online&&live.sessionId){const d=Math.max(0,Number(live.downloadBytes)||0),u=Math.max(0,Number(live.uploadBytes)||0),same=x.lastSession===live.sessionId,dd=same?Math.max(0,d-(Number(x.lastDownload)||0)):d,du=same?Math.max(0,u-(Number(x.lastUpload)||0)):u;if(!downBps&&same&&x.lastAt){const seconds=Math.max(.25,(t-x.lastAt)/1000);downBps=Math.round(dd*8/seconds);upBps=Math.round(du*8/seconds)}x.download_bytes=(Number(x.download_bytes)||0)+dd;x.upload_bytes=(Number(x.upload_bytes)||0)+du;x.lastSession=live.sessionId;x.lastDownload=d;x.lastUpload=u;x.lastAt=t}all[key]=x;trafficSave(all);return {current:{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},history:x.history||[],downloadBps:downBps,uploadBps:upBps}}

  window.ProvedorPlusInstallCloudAdapter=async()=>{
    const api=window.provedor;if(!api||api.__cloudAdapterInstalled)return;
    const base={routers:{...api.routers},mikrotik:{...api.mikrotik},clients:{...api.clients},vpn:{...api.vpn}};
    async function routerRecord(id){const list=await base.routers.list(),r=(list||[]).find(x=>Number(x.id)===Number(id));if(!r)throw Error('MikroTik cadastrado não encontrado.');return r}
    async function ensureCloudRouterSecret(id){
      if(await routerHasCloud(id).catch(()=>false))return true;
      const legacy=await legacySecretGet(id);
      if(!legacy)return false;
      await routerSecretSet(id,legacy);await legacySecretDelete(id);return true;
    }
    async function routerAuth(id,password=''){
      const r=await routerRecord(id),entered=String(password||'').trim();
      if(entered)return normalizeRouter(r,entered);
      if(await ensureCloudRouterSecret(id))return normalizeRouter(r,'');
      throw Error('A senha deste MikroTik ainda não está no cofre da nuvem. Edite o MikroTik, informe a senha e clique em Salvar e conectar.');
    }
    async function clientRecord(id){const list=await base.clients.list(),c=(list||[]).find(x=>Number(x.id)===Number(id));if(!c)throw Error('Cliente não encontrado.');return c}
    function safeStatus(baseStatus,client){const traffic=baseStatus?.traffic||emptyTraffic();return {...(baseStatus||{}),client,connectionState:baseStatus?.connectionState||'offline',connectionError:baseStatus?.connectionError||'',liveRatesAvailable:Boolean(baseStatus?.liveRatesAvailable),downloadBps:Number(baseStatus?.downloadBps)||0,uploadBps:Number(baseStatus?.uploadBps)||0,traffic,trust:baseStatus?.trust||{active:false,usedThisMonth:false,until:null,hours:48}}}

    api.routers.list=async()=>{const list=await base.routers.list();return Promise.all((list||[]).map(async r=>{const configured=await ensureCloudRouterSecret(r.id).catch(()=>false);return {...r,connection_method:'rest',port:Number(r.port)===8728?443:(Number(r.port)||443),has_password:configured}}))};
    api.routers.save=async data=>{const entered=String(data?.password||'').trim();if(!entered&&!data?.id)throw Error('Informe a senha do MikroTik.');let candidate;if(entered)candidate=normalizeRouter(data,entered);else candidate=await routerAuth(data.id);if(!candidate.host||!candidate.username)throw Error('Informe o DNS público/IP público, usuário e senha do MikroTik.');const snapshot=await cloudCall('router.test',{router:candidate});const raw=await base.routers.save({...data,connection_method:'rest',host:candidate.host,port:candidate.port,password:''});const saved=raw?.router||raw;if(!saved?.id)throw Error('O MikroTik conectou, mas o cadastro não retornou o identificador.');if(entered)await routerSecretSet(saved.id,entered);else if(data?.id&&Number(saved.id)!==Number(data.id)){const legacy=await legacySecretGet(data.id);if(legacy)await routerSecretSet(saved.id,legacy)}await legacySecretDelete(saved.id);return {router:{...saved,connection_method:'rest',port:candidate.port,has_password:true},snapshot:{...snapshot,routerId:Number(saved.id),routerName:String(saved.name)}}};
    api.routers.delete=async id=>{const r=await base.routers.delete(id);await routerSecretDelete(id).catch(()=>{});await legacySecretDelete(id);return r};
    api.mikrotik.sync=async routerId=>{const r=await routerRecord(routerId),result=await cloudCall('router.sync',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.profiles=async routerId=>{const r=await routerRecord(routerId),result=await cloudCall('router.profiles',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.remoteAccess=async routerId=>{const r=await routerRecord(routerId),result=await cloudCall('router.remote',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.savePppoe=async(routerId,data)=>{const r=await routerRecord(routerId),result=await cloudCall('pppoe.save',{router:await routerAuth(routerId),data:clone(data)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.deletePppoe=async(routerId,data)=>{const r=await routerRecord(routerId),result=await cloudCall('pppoe.delete',{router:await routerAuth(routerId),data:clone(data)});return {...result,routerId:Number(routerId),routerName:r.name}};

    api.clients.status=async id=>{
      let baseStatus={};
      try{baseStatus=await base.clients.status(id)||{}}catch(error){if(!/Cliente não encontrado/i.test(String(error?.message||error||'')))throw error}
      const client=baseStatus?.client||await clientRecord(id),safe=safeStatus(baseStatus,client);
      if(client?.connection_type!=='PPPoE'||!client?.router_id||!client?.pppoe_username)return safe;
      try{
        const router=await routerAuth(client.router_id),live=await cloudCall('client.status',{router,data:clone(client)}),traffic=trafficRecord(id,live);
        return {...safe,...live,client,routerId:Number(client.router_id)||0,routerName:client.router_name||router.name,routerHost:router.host,connectionState:live.online?'online':'offline',connectionError:'',liveRatesAvailable:Boolean(live.liveRatesAvailable)||traffic.downloadBps>0||traffic.uploadBps>0,downloadBps:Number(live.downloadBps)||traffic.downloadBps,uploadBps:Number(live.uploadBps)||traffic.uploadBps,traffic};
      }catch(error){return {...safe,client,connectionState:'unavailable',connectionError:error instanceof Error?error.message:String(error)}}
    };
    api.clients.block=async id=>{const c=await clientRecord(id),r=await routerAuth(c.router_id),remote=await cloudCall('client.block',{router:r,data:clone(c)}),local=await base.clients.block(id);if(base.clients.setMikrotikState)await base.clients.setMikrotikState(id,{secretId:remote?.secretId||'',status:'Bloqueado no MikroTik',lastSync:now()});return local};
    api.clients.unblock=async id=>{const c=await clientRecord(id),r=await routerAuth(c.router_id),remote=await cloudCall('client.unblock',{router:r,data:clone(c)}),local=await base.clients.unblock(id);if(base.clients.setMikrotikState)await base.clients.setMikrotikState(id,{secretId:remote?.secretId||'',status:'Sincronizado',lastSync:now()});return local};
    api.clients.trustRelease=async(id,hours=48)=>{let before={};try{before=await base.clients.status(id)||{}}catch(error){if(!/Cliente não encontrado/i.test(String(error?.message||error||'')))throw error}if(before?.trust?.usedThisMonth)throw Error('A liberação em confiança já foi utilizada neste mês para este cliente.');const c=before?.client||await clientRecord(id),r=await routerAuth(c.router_id);await cloudCall('client.unblock',{router:r,data:clone(c)});return base.clients.trustRelease(id,hours)};
    api.vpn.status=async()=>({installed:true,web:true,mode:'cloud-rest',message:'A conexão web usa REST HTTPS; não é necessário instalar conector ou WireGuard no computador.'});
    api.vpn.activate=async()=>({queued:false,mode:'cloud-rest',message:'Não é necessário: o acesso usa REST HTTPS do MikroTik pela nuvem.'});
    api.vpn.remove=async()=>({removed:false,mode:'cloud-rest'});api.vpn.save=async()=>({saved:false,mode:'cloud-rest'});api.vpn.openWireGuard=async()=>({opened:false,mode:'cloud-rest'});
    Object.defineProperty(api,'__cloudAdapterInstalled',{value:true,enumerable:false});
  };
})();
