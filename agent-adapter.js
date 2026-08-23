(()=>{
  const AGENT_URLS=['http://127.0.0.1:8765/api','http://localhost:8765/api'];
  const SECURE_DB='provedor_plus_router_secure_1017';
  const TRAFFIC_KEY='provedor_plus_mikrotik_traffic_1017';
  const now=()=>new Date().toISOString();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(SECURE_DB,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if(!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Falha ao abrir armazenamento seguro.'));
    });
  }
  async function cryptoKey(){
    const db=await openDb();
    let key=await new Promise((resolve,reject)=>{
      const tx=db.transaction('keys','readonly');
      const r=tx.objectStore('keys').get('router-aes');
      r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
    });
    if(!key){
      key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('keys','readwrite');
        const r=tx.objectStore('keys').put(key,'router-aes');
        r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);
      });
    }
    db.close();
    return key;
  }
  const b64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(s)};
  const bytes=text=>{const s=atob(text||''),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a};
  async function secretSet(id,password){
    const key=await cryptoKey(),iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=new TextEncoder().encode(String(password||''));
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
    const db=await openDb();
    await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),r=tx.objectStore('kv').put({iv:b64(iv),data:b64(cipher)},`router:${id}`);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)});
    db.close();
  }
  async function secretGet(id){
    try{
      const db=await openDb();
      const rec=await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),r=tx.objectStore('kv').get(`router:${id}`);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});
      db.close();
      if(!rec)return '';
      const key=await cryptoKey();
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(rec.iv)},key,bytes(rec.data));
      return new TextDecoder().decode(plain);
    }catch{return ''}
  }
  async function secretDelete(id){
    try{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),r=tx.objectStore('kv').delete(`router:${id}`);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)});db.close()}catch{}
  }

  async function agentCall(action,{router=null,data=null,config='',routerName=''}={}){
    let lastError=null;
    for(const url of AGENT_URLS){
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),30000);
      try{
        const response=await fetch(url,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,router,data,config,routerName}),signal:ctl.signal});
        let body={};try{body=await response.json()}catch{}
        if(!response.ok||!body.ok) throw new Error(body.error||`Conector local respondeu HTTP ${response.status}.`);
        clearTimeout(timer);return body.data;
      }catch(error){clearTimeout(timer);lastError=error}
    }
    const detail=lastError?.name==='AbortError'?'Tempo esgotado ao chamar o conector.':(lastError?.message||'Conector não respondeu.');
    throw new Error(`ProvedorPlus-Conector não está acessível neste computador. Abra o ProvedorPlus-Conector.exe e mantenha-o aberto. ${detail}`);
  }

  function normalizeRouter(r,password=''){
    return {id:Number(r?.id)||0,name:String(r?.name||'MikroTik'),connection_method:r?.connection_method==='rest'?'rest':'api',host:String(r?.host||'').trim(),port:Number(r?.port)||(r?.connection_method==='rest'?443:8728),username:String(r?.username||'').trim(),password:String(password||''),allow_self_signed:Boolean(r?.allow_self_signed)};
  }

  function trafficLoad(){try{return JSON.parse(localStorage.getItem(TRAFFIC_KEY)||'{}')}catch{return{}}}
  function trafficSave(v){localStorage.setItem(TRAFFIC_KEY,JSON.stringify(v))}
  function trafficRecord(clientId,live){
    const all=trafficLoad(),key=String(clientId),month=new Date().toISOString().slice(0,7),t=Date.now();
    let x=all[key]||{month,download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0,history:[]};
    if(x.month!==month){
      if(x.month)x.history=[{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},...(x.history||[])].slice(0,12);
      x={...x,month,download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0};
    }
    let downBps=0,upBps=0;
    if(live?.online&&live.sessionId){
      const d=Math.max(0,Number(live.downloadBytes)||0),u=Math.max(0,Number(live.uploadBytes)||0),same=x.lastSession===live.sessionId;
      let dd=same?Math.max(0,d-(Number(x.lastDownload)||0)):d;
      let du=same?Math.max(0,u-(Number(x.lastUpload)||0)):u;
      if(same&&x.lastAt){const seconds=Math.max(.25,(t-x.lastAt)/1000);downBps=Math.round(dd*8/seconds);upBps=Math.round(du*8/seconds)}
      x.download_bytes=(Number(x.download_bytes)||0)+dd;x.upload_bytes=(Number(x.upload_bytes)||0)+du;
      x.lastSession=live.sessionId;x.lastDownload=d;x.lastUpload=u;x.lastAt=t;
    }
    all[key]=x;trafficSave(all);
    return {current:{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},history:x.history||[],downloadBps:downBps,uploadBps:upBps};
  }

  window.ProvedorPlusInstallAgentAdapter=async()=>{
    const api=window.provedor;
    if(!api||api.__agentAdapterInstalled)return;
    const base={
      routers:{...api.routers},mikrotik:{...api.mikrotik},clients:{...api.clients},vpn:{...api.vpn}
    };
    async function routerRecord(id){
      const list=await base.routers.list();
      const r=(list||[]).find(x=>Number(x.id)===Number(id));
      if(!r)throw new Error('MikroTik cadastrado não encontrado.');
      return r;
    }
    async function routerAuth(id,password=''){
      const r=await routerRecord(id),pass=String(password||'').trim()||await secretGet(id);
      if(!pass)throw new Error('A senha deste MikroTik não está salva neste navegador. Edite o MikroTik, informe a senha e clique em Salvar e conectar.');
      return normalizeRouter(r,pass);
    }
    async function clientRecord(id){
      const list=await base.clients.list();
      const c=(list||[]).find(x=>Number(x.id)===Number(id));
      if(!c)throw new Error('Cliente não encontrado.');
      return c;
    }

    api.routers.list=async()=>{
      const list=await base.routers.list();
      return Promise.all((list||[]).map(async r=>({...r,has_password:Boolean(await secretGet(r.id))||Boolean(r.has_password)})));
    };
    api.routers.save=async data=>{
      const entered=String(data?.password||'').trim();
      const existing=data?.id?await secretGet(data.id):'';
      const password=entered||existing;
      if(!password)throw new Error('Informe a senha do MikroTik para testar a conexão.');
      const candidate=normalizeRouter(data,password);
      if(!candidate.host||!candidate.username)throw new Error('Informe IP, usuário e senha do MikroTik.');
      const snapshot=await agentCall('router.test',{router:candidate});
      const raw=await base.routers.save({...data,password});
      const saved=raw?.router||raw;
      if(!saved?.id)throw new Error('O MikroTik conectou, mas o cadastro não retornou o identificador.');
      await secretSet(saved.id,password);
      return {router:{...saved,has_password:true},snapshot};
    };
    api.routers.delete=async id=>{const r=await base.routers.delete(id);await secretDelete(id);return r};

    api.mikrotik.sync=async routerId=>agentCall('router.sync',{router:await routerAuth(routerId)});
    api.mikrotik.profiles=async routerId=>agentCall('router.profiles',{router:await routerAuth(routerId)});
    api.mikrotik.remoteAccess=async routerId=>agentCall('router.remote',{router:await routerAuth(routerId)});
    api.mikrotik.savePppoe=async(routerId,data)=>agentCall('pppoe.save',{router:await routerAuth(routerId),data:clone(data)});
    api.mikrotik.deletePppoe=async(routerId,data)=>agentCall('pppoe.delete',{router:await routerAuth(routerId),data:clone(data)});

    api.clients.status=async id=>{
      const baseStatus=await base.clients.status(id),client=baseStatus?.client||await clientRecord(id);
      if(client?.connection_type!=='PPPoE'||!client?.router_id||!client?.pppoe_username)return baseStatus;
      try{
        const router=await routerAuth(client.router_id);
        const live=await agentCall('client.status',{router,data:clone(client)});
        const traffic=trafficRecord(id,live);
        return {...baseStatus,...live,routerId:Number(client.router_id)||0,routerName:client.router_name||router.name,routerHost:router.host,connectionState:live.online?'online':'offline',connectionError:'',liveRatesAvailable:true,downloadBps:traffic.downloadBps,uploadBps:traffic.uploadBps,traffic};
      }catch(error){return {...baseStatus,connectionState:'unavailable',connectionError:error instanceof Error?error.message:String(error)}}
    };
    api.clients.block=async id=>{
      const c=await clientRecord(id),r=await routerAuth(c.router_id),remote=await agentCall('client.block',{router:r,data:clone(c)});
      const local=await base.clients.block(id);
      if(base.clients.setMikrotikState)await base.clients.setMikrotikState(id,{secretId:remote?.secretId||'',status:'Bloqueado no MikroTik',lastSync:now()});
      return local;
    };
    api.clients.unblock=async id=>{
      const c=await clientRecord(id),r=await routerAuth(c.router_id),remote=await agentCall('client.unblock',{router:r,data:clone(c)});
      const local=await base.clients.unblock(id);
      if(base.clients.setMikrotikState)await base.clients.setMikrotikState(id,{secretId:remote?.secretId||'',status:'Sincronizado',lastSync:now()});
      return local;
    };
    api.clients.trustRelease=async(id,hours=48)=>{
      const before=await base.clients.status(id);
      if(before?.trust?.usedThisMonth)throw new Error('A liberação em confiança já foi utilizada neste mês para este cliente.');
      const c=before?.client||await clientRecord(id),r=await routerAuth(c.router_id);
      await agentCall('client.unblock',{router:r,data:clone(c)});
      try{return await base.clients.trustRelease(id,hours)}catch(error){try{await agentCall('client.block',{router:r,data:clone(c)})}catch{}throw error}
    };

    api.vpn.status=async()=>agentCall('vpn.status');
    api.vpn.save=async(routerId,routerName,config)=>agentCall('vpn.save',{routerName:String(routerName||''),router:{id:Number(routerId)||0,name:String(routerName||'')},config:String(config||'')});
    api.vpn.activate=async(routerId,routerName,config)=>agentCall('vpn.activate',{routerName:String(routerName||''),router:{id:Number(routerId)||0,name:String(routerName||'')},config:String(config||'')});
    api.vpn.remove=async(routerId,routerName)=>agentCall('vpn.remove',{routerName:String(routerName||''),router:{id:Number(routerId)||0,name:String(routerName||'')}});
    api.vpn.openWireGuard=base.vpn.openWireGuard;

    Object.defineProperty(api,'__agentAdapterInstalled',{value:true,enumerable:false});
  };
})();
