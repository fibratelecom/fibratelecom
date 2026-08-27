(()=>{
  const now=()=>new Date().toISOString();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const bool=(v,fallback=false)=>{if(v===undefined||v===null||v==='')return fallback;if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;const x=String(v).trim().toLowerCase();if(['true','1','sim','yes','on'].includes(x))return true;if(['false','0','nao','não','no','off'].includes(x))return false;return fallback};
  const localMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function dataCall(action,data={}){
    const response=await fetch('/api/cloud-data',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
    return body.data;
  }
  async function secretSet(id,password){return dataCall('routers.secret.save',{id:Number(id),password:String(password||'')})}
  async function secretGet(id){try{return String((await dataCall('routers.secret.get',{id:Number(id)}))?.password||'')}catch{return ''}}
  async function secretDelete(id){try{return await dataCall('routers.secret.delete',{id:Number(id)})}catch{return {deleted:false,id:Number(id)||0}}}
  async function trafficRecord(clientId,live){return dataCall('traffic.record',{clientId:Number(clientId),month:localMonthKey(),live:clone(live)})}

  async function cloudCall(action,{router=null,data=null}={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
    try{
      const response=await fetch('/api/mikrotik-proxy',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,router,data}),signal:ctl.signal});
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw Error(body.error||`Falha na integração MikroTik (HTTP ${response.status}).`);
      return body.data;
    }finally{clearTimeout(timer)}
  }
  async function cloudRead(action,options){
    let lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{return await cloudCall(action,options)}
      catch(error){lastError=error;if(attempt===0)await wait(450)}
    }
    throw lastError||Error('Falha temporária na leitura do MikroTik.');
  }

  function cleanHost(value){return String(value||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/^\[|\]$/g,'')}
  function normalizeRouter(r,password=''){let port=Number(r?.port)||443;if(port===8728||port===8729||port===80)port=443;return {id:Number(r?.id)||0,name:String(r?.name||'MikroTik'),connection_method:'rest',host:cleanHost(r?.host),port,username:String(r?.username||'').trim(),password:String(password||''),allow_self_signed:bool(r?.allow_self_signed,false)}}

  window.ProvedorPlusInstallCloudAdapter=async()=>{
    const api=window.provedor;if(!api||api.__cloudAdapterInstalled)return;
    const base={routers:{...api.routers},mikrotik:{...api.mikrotik},clients:{...api.clients},vpn:{...api.vpn}};
    async function routerRecord(id){const list=await base.routers.list(),r=(list||[]).find(x=>Number(x.id)===Number(id));if(!r)throw Error('MikroTik cadastrado não encontrado.');return r}
    async function routerAuth(id,password=''){const r=await routerRecord(id),pass=String(password||'').trim()||await secretGet(id);if(!pass)throw Error('A credencial deste MikroTik não está disponível na nuvem. Edite o MikroTik, informe a senha e clique em Salvar e conectar.');return normalizeRouter(r,pass)}
    async function clientRecord(id){const list=await base.clients.list(),c=(list||[]).find(x=>Number(x.id)===Number(id));if(!c)throw Error('Cliente não encontrado.');return c}

    api.routers.list=async()=>{const list=await base.routers.list();return Promise.all((list||[]).map(async r=>({...r,connection_method:'rest',port:Number(r.port)===8728?443:(Number(r.port)||443),has_password:Boolean(await secretGet(r.id))||Boolean(r.has_password)})))};
    api.routers.save=async data=>{
      const entered=String(data?.password||'').trim(),existing=data?.id?await secretGet(data.id):'',password=entered||existing;
      if(!password)throw Error('Informe a senha do MikroTik.');
      const candidate=normalizeRouter(data,password);
      if(!candidate.host||!candidate.username)throw Error('Informe o DNS público/IP público, usuário e senha do MikroTik.');
      const snapshot=await cloudCall('router.test',{router:candidate});
      const raw=await base.routers.save({...data,connection_method:'rest',host:candidate.host,port:candidate.port,password}),saved=raw?.router||raw;
      if(!saved?.id)throw Error('O MikroTik conectou, mas o cadastro não retornou o identificador.');
      await secretSet(saved.id,password);
      return {router:{...saved,connection_method:'rest',port:candidate.port,has_password:true},snapshot:{...snapshot,routerId:Number(saved.id),routerName:String(saved.name)}};
    };
    api.routers.delete=async id=>{const r=await base.routers.delete(id);await secretDelete(id);return r};

    api.mikrotik.sync=async routerId=>{const r=await routerRecord(routerId),result=await cloudRead('router.sync',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.profiles=async routerId=>{const r=await routerRecord(routerId),result=await cloudRead('router.profiles',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.remoteAccess=async routerId=>{const r=await routerRecord(routerId),result=await cloudRead('router.remote',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.savePppoe=async(routerId,data)=>{const r=await routerRecord(routerId),result=await cloudCall('pppoe.save',{router:await routerAuth(routerId),data:clone(data)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.deletePppoe=async(routerId,data)=>{const r=await routerRecord(routerId),result=await cloudCall('pppoe.delete',{router:await routerAuth(routerId),data:clone(data)});return {...result,routerId:Number(routerId),routerName:r.name}};

    api.clients.status=async id=>{
      const baseStatus=await base.clients.status(id),client=baseStatus?.client||await clientRecord(id);
      if(client?.connection_type!=='PPPoE'||!client?.router_id||!client?.pppoe_username)return baseStatus;
      try{
        const router=await routerAuth(client.router_id),live=await cloudRead('client.status',{router,data:clone(client)});
        let traffic=baseStatus.traffic||null,trafficError='';
        try{traffic=await trafficRecord(id,live)||traffic}catch(error){trafficError=error instanceof Error?error.message:String(error);console.error('Provedor Plus: leitura do MikroTik concluída, mas o consumo mensal não pôde ser gravado.',error)}
        const liveDown=Number(live.downloadBps),liveUp=Number(live.uploadBps),trafficDown=Number(traffic?.downloadBps),trafficUp=Number(traffic?.uploadBps);
        return {...baseStatus,...live,routerId:Number(client.router_id)||0,routerName:client.router_name||router.name,routerHost:router.host,connectionState:live.online?'online':'offline',connectionError:'',trafficError,liveRatesAvailable:Boolean(live.liveRatesAvailable)||(Number.isFinite(trafficDown)&&trafficDown>0)||(Number.isFinite(trafficUp)&&trafficUp>0),downloadBps:Number.isFinite(liveDown)?Math.max(0,liveDown):(Number.isFinite(trafficDown)?Math.max(0,trafficDown):0),uploadBps:Number.isFinite(liveUp)?Math.max(0,liveUp):(Number.isFinite(trafficUp)?Math.max(0,trafficUp):0),traffic:traffic||baseStatus.traffic};
      }catch(error){return {...baseStatus,connectionState:'unavailable',connectionError:error instanceof Error?error.message:String(error),liveRatesAvailable:false}}
    };
    api.clients.block=async id=>{
      const c=await clientRecord(id),r=await routerAuth(c.router_id),remote=await cloudCall('client.block',{router:r,data:clone(c)});let saved;
      try{saved=await base.clients.block(id)}catch(error){try{await cloudCall('client.unblock',{router:r,data:clone(c)})}catch{}throw error}
      if(base.clients.setMikrotikState)try{saved=await base.clients.setMikrotikState(id,{secretId:remote?.secretId||'',status:'Bloqueado no MikroTik',lastSync:now()})}catch(error){console.error('Provedor Plus: bloqueio aplicado, mas falhou ao registrar o estado do MikroTik.',error)}
      return saved;
    };
    api.clients.unblock=async id=>{
      const c=await clientRecord(id),r=await routerAuth(c.router_id),remote=await cloudCall('client.unblock',{router:r,data:clone(c)});let saved;
      try{saved=await base.clients.unblock(id)}catch(error){try{await cloudCall('client.block',{router:r,data:clone(c)})}catch{}throw error}
      if(base.clients.setMikrotikState)try{saved=await base.clients.setMikrotikState(id,{secretId:remote?.secretId||'',status:'Sincronizado',lastSync:now()})}catch(error){console.error('Provedor Plus: desbloqueio aplicado, mas falhou ao registrar o estado do MikroTik.',error)}
      return saved;
    };
    api.clients.trustRelease=async(id,hours=48)=>{const before=await base.clients.status(id);if(before?.trust?.usedThisMonth)throw Error('A liberação em confiança já foi utilizada neste mês para este cliente.');const c=before?.client||await clientRecord(id),r=await routerAuth(c.router_id);await cloudCall('client.unblock',{router:r,data:clone(c)});try{return await base.clients.trustRelease(id,hours)}catch(error){try{await cloudCall('client.block',{router:r,data:clone(c)})}catch{}throw error}};

    api.vpn.status=async()=>({installed:true,web:true,mode:'cloud-rest',message:'A conexão web usa REST HTTPS pelo MikroTik Cloud.'});
    api.vpn.activate=async()=>({queued:false,mode:'cloud-rest',message:'O acesso é feito diretamente pela integração REST HTTPS em nuvem.'});
    api.vpn.remove=async()=>({removed:false,mode:'cloud-rest'});api.vpn.save=async()=>({saved:false,mode:'cloud-rest'});api.vpn.openWireGuard=async()=>({opened:false,mode:'cloud-rest'});
    Object.defineProperty(api,'__cloudAdapterInstalled',{value:true,enumerable:false});
  };
})();
