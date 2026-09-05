(()=>{
  const now=()=>new Date().toISOString();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const bool=(v,fallback=false)=>{if(v===undefined||v===null||v==='')return fallback;if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;const x=String(v).trim().toLowerCase();if(['true','1','sim','yes','on'].includes(x))return true;if(['false','0','nao','não','no','off'].includes(x))return false;return fallback};
  const localMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const BANK_TIMEOUT_MS=15000;
  const nativeFetch=window.fetch.bind(window);
  if(!window.__ProvedorPlusBankTimeoutFetchInstalled){
    window.fetch=async(input,init={})=>{
      const rawUrl=typeof input==='string'?input:String(input?.url||'');let pathname='';
      try{pathname=new URL(rawUrl,location.href).pathname}catch{}
      if(pathname!=='/api/bank-settings'||init?.signal||input?.signal)return nativeFetch(input,init);
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),BANK_TIMEOUT_MS);
      try{return await nativeFetch(input,{...init,signal:ctl.signal})}
      catch(error){if(error?.name==='AbortError')throw Error('Tempo limite ao consultar a integração bancária. Tente novamente.');throw error}
      finally{clearTimeout(timer)}
    };
    Object.defineProperty(window,'__ProvedorPlusBankTimeoutFetchInstalled',{value:true,enumerable:false});
  }

  async function dataCall(action,data={}){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch('/api/cloud-data',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal});
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw Error(body.error||`Falha no banco da nuvem (HTTP ${response.status}).`);
      return body.data;
    }catch(error){
      if(error?.name==='AbortError')throw Error(`Tempo limite ao consultar ${action}.`);
      throw error;
    }finally{clearTimeout(timer)}
  }
  async function bankSettingsCall(action,data={}){
    const response=await fetch('/api/bank-settings',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body.ok)throw Error(body.error||`Falha ao salvar a integração bancária (HTTP ${response.status}).`);
    return body.data;
  }
  function safeBankView(local={},remote={}){
    const le=local?.efi||{},re=remote?.efi||{},lm=local?.mercadoPago||{},rm=remote?.mercadoPago||{};
    return {
      ...local,
      efi:{...le,...re,clientId:'',clientSecret:'',certificatePassword:'',certificateBase64:'',clientIdConfigured:Boolean(re.clientIdConfigured??le.clientIdConfigured),clientSecretConfigured:Boolean(re.clientSecretConfigured??le.clientSecretConfigured),certificatePasswordConfigured:Boolean(re.certificatePasswordConfigured??le.certificatePasswordConfigured),certificateConfigured:Boolean(re.certificateConfigured??le.certificateConfigured)},
      mercadoPago:{...lm,...rm,accessToken:'',accessTokenConfigured:Boolean(rm.accessTokenConfigured??lm.accessTokenConfigured)}
    };
  }
  function scrubLocalBankSecrets(){
    const key='provedor_plus_web_1_0_17';
    try{
      const raw=localStorage.getItem(key);if(!raw)return;const state=JSON.parse(raw);if(!state||typeof state!=='object'||!state.banks||typeof state.banks!=='object')return;
      let changed=false;const banks={...state.banks};
      if(banks.efi&&typeof banks.efi==='object'){
        const efi={...banks.efi};
        for(const name of ['clientSecret','certificatePassword','certificateBase64'])if(efi[name]){efi[name]='';changed=true}
        banks.efi=efi;
      }
      if(banks.mercadoPago&&typeof banks.mercadoPago==='object'){
        const mp={...banks.mercadoPago};if(mp.accessToken){mp.accessToken='';changed=true}banks.mercadoPago=mp;
      }
      if(changed)localStorage.setItem(key,JSON.stringify({...state,banks}));
    }catch{}
  }
  async function secretSet(id,password){return dataCall('routers.secret.save',{id:Number(id),password:String(password||'')})}
  async function secretGet(id){return String((await dataCall('routers.secret.get',{id:Number(id)}))?.password||'')}
  async function secretDelete(id){try{return await dataCall('routers.secret.delete',{id:Number(id)})}catch{return {deleted:false,id:Number(id)||0}}}
  async function trafficRecord(clientId,live){return dataCall('traffic.record',{clientId:Number(clientId),month:localMonthKey(),live:clone(live)})}

  async function cloudCall(action,{router=null,data=null}={},timeoutMs=20000){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Math.max(1000,Number(timeoutMs)||20000));
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
    const base={routers:{...api.routers},mikrotik:{...api.mikrotik},clients:{...api.clients},vpn:{...api.vpn},banks:{...api.banks}};

    async function hydrateBankSettings({strict=false}={}){
      try{const remote=await bankSettingsCall('get-safe');scrubLocalBankSecrets();return remote}
      catch(error){
        if(strict)throw error;
        if(!/Somente o administrador|Sessão expirada/i.test(String(error?.message||error)))console.warn('Provedor Plus: estado seguro das integrações bancárias não pôde ser restaurado.',error);
        return null;
      }
    }

    async function routerRecord(id){const list=await base.routers.list(),r=(list||[]).find(x=>Number(x.id)===Number(id));if(!r)throw Error('MikroTik cadastrado não encontrado.');return r}
    async function routerAuth(id,password=''){
      const entered=String(password||'').trim(),r=await routerRecord(id);let stored='';
      if(!entered){
        try{stored=await secretGet(id)}
        catch(error){throw Error(`Não foi possível consultar a credencial do MikroTik: ${error instanceof Error?error.message:String(error)}`)}
      }
      const pass=entered||stored;
      if(!pass)throw Error('A credencial deste MikroTik não está cadastrada. Edite o MikroTik, informe a senha e clique em Salvar e conectar.');
      return normalizeRouter(r,pass);
    }
    async function clientRecord(id){const list=await base.clients.list(),c=(list||[]).find(x=>Number(x.id)===Number(id));if(!c)throw Error('Cliente não encontrado.');return c}
    async function controlTruth(router,client){
      const snapshot=await cloudRead('router.sync',{router}),username=String(client?.pppoe_username||client?.pppoe_user||'').trim();
      const secret=(Array.isArray(snapshot?.pppSecrets)?snapshot.pppSecrets:[]).find(item=>String(item?.name||'').trim()===username);
      if(!secret)throw Error('Não foi possível confirmar o acesso PPPoE deste cliente no MikroTik.');
      return {blocked:Boolean(secret.disabled),secretId:String(secret.id||'')};
    }
    async function persistControlTruth(id,truth){
      let saved=truth.blocked?await base.clients.block(id):await base.clients.unblock(id);
      if(base.clients.setMikrotikState)saved=await base.clients.setMikrotikState(id,{secretId:truth.secretId||'',status:truth.blocked?'Bloqueado no MikroTik':'Sincronizado',lastSync:now()});
      return saved;
    }
    async function runClientControl(id,wantBlocked){
      const c=await clientRecord(id),r=await routerAuth(c.router_id),action=wantBlocked?'client.block':'client.unblock',rollback=wantBlocked?'client.unblock':'client.block';
      let commandError=null;
      try{await cloudCall(action,{router:r,data:clone(c)})}catch(error){commandError=error}
      let truth;
      try{truth=await controlTruth(r,c)}catch(error){if(commandError)throw commandError;throw error}
      if(truth.blocked===wantBlocked){
        try{return await persistControlTruth(id,truth)}catch(persistError){
          let rollbackError=null;
          try{await cloudCall(rollback,{router:r,data:clone(c)})}catch(error){rollbackError=error}
          try{
            const repairedTruth=await controlTruth(r,c);
            await persistControlTruth(id,repairedTruth);
            if(rollbackError)console.error('Provedor Plus: a compensação no MikroTik falhou, mas o painel foi realinhado ao estado real.',rollbackError);
          }catch(reconcileError){
            const baseMessage=persistError instanceof Error?persistError.message:String(persistError),detail=reconcileError instanceof Error?reconcileError.message:String(reconcileError);
            throw new Error(`${baseMessage} Não foi possível confirmar e realinhar o estado entre o painel e o MikroTik: ${detail}`);
          }
          throw persistError;
        }
      }
      try{await persistControlTruth(id,truth)}catch(error){
        const detail=error instanceof Error?error.message:String(error);
        throw new Error(`O MikroTik ficou em um estado diferente do solicitado e o painel não pôde ser realinhado: ${detail}`);
      }
      if(commandError)throw commandError;
      throw new Error(`O MikroTik não confirmou o ${wantBlocked?'bloqueio':'desbloqueio'} solicitado. O painel foi mantido de acordo com o estado real do PPPoE.`);
    }

    hydrateBankSettings().catch(error=>console.warn('Provedor Plus: leitura segura das integrações bancárias em segundo plano falhou.',error));

    if(base.banks?.get){
      api.banks.get=async()=>{
        let local={};try{local=await base.banks.get()||{}}catch{}
        try{const remote=await bankSettingsCall('get-safe');scrubLocalBankSecrets();return safeBankView(local,remote)}catch{return safeBankView(local,{})}
      };
    }
    if(base.banks?.saveEfi){
      api.banks.saveEfi=async data=>{
        const remote=await bankSettingsCall('save-efi',data||{}),efi=remote?.efi||{};scrubLocalBankSecrets();
        return {...efi,clientId:'',clientSecret:'',certificatePassword:'',certificateBase64:''};
      };
    }
    if(base.banks?.saveMercadoPago){
      api.banks.saveMercadoPago=async data=>{
        const remote=await bankSettingsCall('save-mercado-pago',data||{}),mercadoPago=remote?.mercadoPago||{};scrubLocalBankSecrets();
        return {...mercadoPago,accessToken:''};
      };
    }
    if(typeof base.banks?.testEfi==='function'){
      api.banks.testEfi=async()=>{const result=await bankSettingsCall('test-efi');return result?.test||result};
    }
    if(typeof base.banks?.configureEfiWebhooks==='function'){
      api.banks.configureEfiWebhooks=async()=>{const result=await bankSettingsCall('configure-efi-webhooks');return result?.test||result};
    }
    if(typeof base.banks?.createEfiPixAutomatic==='function'){
      api.banks.createEfiPixAutomatic=async(...args)=>{
        const first=args[0],data=args.length===1&&first&&typeof first==='object'&&first.client?first:{client:first,startDate:args[1],endDate:args[2],amountCents:args[3]};
        return bankSettingsCall('efi-pix-auto-create',data);
      };
    }
    if(typeof base.banks?.refreshEfiPixAutomatic==='function'){
      api.banks.refreshEfiPixAutomatic=async(...args)=>{const first=args[0],idRec=first&&typeof first==='object'?(first.idRec||first.id_rec||first.id):first;return bankSettingsCall('efi-pix-auto-refresh',{idRec})};
    }
    if(typeof base.banks?.testMercadoPago==='function'){
      api.banks.testMercadoPago=async()=>{const result=await bankSettingsCall('test-mercado-pago');return result?.test||result};
    }

    api.routers.list=async()=>{
      const list=await base.routers.list();
      return Promise.all((list||[]).map(async r=>{
        let hasPassword=Boolean(r.has_password),credentialError='';
        try{hasPassword=Boolean(await secretGet(r.id))||hasPassword}catch(error){credentialError=error instanceof Error?error.message:String(error)}
        return {...r,connection_method:'rest',port:Number(r.port)===8728?443:(Number(r.port)||443),has_password:hasPassword,credential_status:credentialError?'unavailable':hasPassword?'configured':'missing',credential_error:credentialError};
      }));
    };
    api.routers.save=async data=>{
      const entered=String(data?.password||'').trim();let existing='';
      if(data?.id&&!entered){
        try{existing=await secretGet(data.id)}
        catch(error){throw Error(`Não foi possível consultar a credencial atual do MikroTik: ${error instanceof Error?error.message:String(error)}`)}
      }
      const password=entered||existing;
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
    api.mikrotik.metrics=async routerId=>{const r=await routerRecord(routerId),result=await cloudCall('router.metrics',{router:await routerAuth(routerId)},17500);return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.profiles=async routerId=>{const r=await routerRecord(routerId),result=await cloudRead('router.profiles',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.remoteAccess=async routerId=>{const r=await routerRecord(routerId),result=await cloudRead('router.remote',{router:await routerAuth(routerId)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.savePppoe=async(routerId,data)=>{const r=await routerRecord(routerId),result=await cloudCall('pppoe.save',{router:await routerAuth(routerId),data:clone(data)});return {...result,routerId:Number(routerId),routerName:r.name}};
    api.mikrotik.deletePppoe=async(routerId,data)=>{const r=await routerRecord(routerId),result=await cloudCall('pppoe.delete',{router:await routerAuth(routerId),data:clone(data)});return {...result,routerId:Number(routerId),routerName:r.name}};

    api.clients.status=async id=>{
      const baseStatus=await base.clients.status(id),client=baseStatus?.client||await clientRecord(id);
      if(client?.connection_type!=='PPPoE'||!client?.router_id||!client?.pppoe_username)return baseStatus;
      try{
        const router=await routerAuth(client.router_id),live=await cloudRead('client.status',{router,data:clone(client)});
        let traffic=baseStatus.traffic||null;
        try{traffic=await trafficRecord(id,live)}catch(error){console.error('Provedor Plus: leitura do MikroTik concluída, mas o consumo mensal não pôde ser gravado.',error)}
        const liveDown=Number(live.downloadBps),liveUp=Number(live.uploadBps),trafficDown=Number(traffic?.downloadBps),trafficUp=Number(traffic?.uploadBps);
        return {...baseStatus,...live,routerId:Number(client.router_id)||0,routerName:client.router_name||router.name,routerHost:router.host,connectionState:live.online?'online':'offline',connectionError:'',trafficError:'',liveRatesAvailable:Boolean(live.liveRatesAvailable)||(Number.isFinite(trafficDown)&&trafficDown>0)||(Number.isFinite(trafficUp)&&trafficUp>0),downloadBps:Number.isFinite(liveDown)?Math.max(0,liveDown):(Number.isFinite(trafficDown)?Math.max(0,trafficDown):0),uploadBps:Number.isFinite(liveUp)?Math.max(0,liveUp):(Number.isFinite(trafficUp)?Math.max(0,trafficUp):0),traffic:traffic||baseStatus.traffic};
      }catch(error){return {...baseStatus,connectionState:'unavailable',connectionError:error instanceof Error?error.message:String(error),liveRatesAvailable:false}}
    };
    api.clients.block=async id=>runClientControl(id,true);
    api.clients.unblock=async id=>runClientControl(id,false);
    api.clients.trustRelease=async(id,hours=48)=>{
      const before=await base.clients.status(id);
      if(before?.trust?.usedThisMonth)throw Error('A liberação em confiança já foi utilizada neste mês para este cliente.');
      const c=before?.client||await clientRecord(id),r=await routerAuth(c.router_id);
      let commandError=null;
      try{await cloudCall('client.unblock',{router:r,data:clone(c)})}catch(error){commandError=error}
      let truth;
      try{truth=await controlTruth(r,c)}catch(error){if(commandError)throw commandError;throw error}
      if(truth.blocked){
        try{await persistControlTruth(id,truth)}catch(persistError){throw new Error(`O MikroTik não confirmou a liberação e o painel não pôde ser realinhado: ${persistError instanceof Error?persistError.message:String(persistError)}`)}
        if(commandError)throw commandError;
        throw Error('O MikroTik não confirmou a liberação em confiança. O painel foi mantido de acordo com o estado real do PPPoE.');
      }
      try{
        let saved=await base.clients.trustRelease(id,hours);
        if(base.clients.setMikrotikState)saved=await base.clients.setMikrotikState(id,{secretId:truth.secretId||'',status:'Sincronizado',lastSync:now()});
        return saved;
      }catch(error){
        let rollbackError=null;
        try{await cloudCall('client.block',{router:r,data:clone(c)})}catch(compensationError){rollbackError=compensationError}
        try{
          const repairedTruth=await controlTruth(r,c);
          await persistControlTruth(id,repairedTruth);
          if(rollbackError)console.error('Provedor Plus: a compensação da liberação em confiança falhou, mas o painel foi realinhado ao estado real.',rollbackError);
        }catch(reconcileError){
          const original=error instanceof Error?error.message:String(error),detail=reconcileError instanceof Error?reconcileError.message:String(reconcileError);
          throw new Error(`${original} Não foi possível confirmar e realinhar o estado entre o painel e o MikroTik: ${detail}`);
        }
        throw error;
      }
    };

    api.vpn.status=async()=>({installed:true,web:true,mode:'cloud-rest',message:'A conexão web usa REST HTTPS pelo MikroTik Cloud.'});
    api.vpn.activate=async()=>({queued:false,mode:'cloud-rest',message:'O acesso é feito diretamente pela integração REST HTTPS em nuvem.'});
    api.vpn.remove=async()=>({removed:false,mode:'cloud-rest'});api.vpn.save=async()=>({saved:false,mode:'cloud-rest'});api.vpn.openWireGuard=async()=>({opened:false,mode:'cloud-rest'});
    Object.defineProperty(api,'__cloudAdapterInstalled',{value:true,enumerable:false});
  };
})();