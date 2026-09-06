(()=>{
  const now=()=>new Date().toISOString();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const bool=(v,fallback=false)=>{if(v===undefined||v===null||v==='')return fallback;if(typeof v==='boolean')return v;if(typeof v==='number')return v!==0;const x=String(v).trim().toLowerCase();if(['true','1','sim','yes','on'].includes(x))return true;if(['false','0','nao','não','no','off'].includes(x))return false;return fallback};
  const localMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const MP_WEBHOOK_URL='https://painel.fibramais.workers.dev/api/customer-portal?mp_webhook=1';

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

  const STATE_KEY='provedor_plus_web_1_0_17';
  function stateRead(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')||{}}catch{return{}}}
  function stateMpPatch(patch={}){
    const s=stateRead();
    s.banks={...(s.banks||{})};
    s.banks.mercadoPago={...(s.banks.mercadoPago||{}),...patch};
    localStorage.setItem(STATE_KEY,JSON.stringify(s));
    return clone(s.banks.mercadoPago);
  }
  const idbRequest=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error||Error('Falha no armazenamento seguro local.'))});
  async function openLegacySecureDb(){
    if(typeof indexedDB==='undefined')return null;
    if(typeof indexedDB.databases==='function'){
      try{const list=await indexedDB.databases();if(!list.some(item=>item?.name==='provedor_plus_secure_1017'))return null}catch{}
    }
    return new Promise((resolve,reject)=>{const req=indexedDB.open('provedor_plus_secure_1017');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onupgradeneeded=()=>{try{req.transaction?.abort()}catch{};resolve(null)}});
  }
  async function legacyMpAccessToken(){
    let db;
    try{
      db=await openLegacySecureDb();
      if(!db||!db.objectStoreNames.contains('kv')||!db.objectStoreNames.contains('keys'))return '';
      const record=await idbRequest(db.transaction('kv','readonly').objectStore('kv').get('mercadoPago'));
      const key=await idbRequest(db.transaction('keys','readonly').objectStore('keys').get('aes'));
      if(!record?.iv||!record?.data||!key)return '';
      const b64=value=>{const raw=atob(String(value||'')),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out};
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(record.iv)},key,b64(record.data));
      const value=JSON.parse(new TextDecoder().decode(plain));
      return String(value?.accessToken||'').trim();
    }catch{return ''}
    finally{try{db?.close()}catch{}}
  }
  async function clearLegacyMpSecret(){
    let db;
    try{
      db=await openLegacySecureDb();
      if(!db||!db.objectStoreNames.contains('kv'))return;
      await idbRequest(db.transaction('kv','readwrite').objectStore('kv').delete('mercadoPago'));
    }catch{}
    finally{try{db?.close()}catch{}}
  }
  async function mpSecretStatus(){return dataCall('banks.mercadoPago.secret.status')}
  async function ensureMpSecret(){
    let status=await mpSecretStatus();
    if(status?.configured){await clearLegacyMpSecret();return status}
    const legacy=await legacyMpAccessToken();
    if(legacy){
      status=await dataCall('banks.mercadoPago.secret.save',{accessToken:legacy});
      await clearLegacyMpSecret();
    }
    return status||{configured:false,accessTokenConfigured:false,webhookSecretConfigured:false};
  }

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

  function normalizeText(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
  function visibleNode(node){return Boolean(node&&!node.hidden&&(node.offsetParent!==null||node.getClientRects?.().length))}
  function mercadoPagoSettingsRoot(){
    const roots=[...document.querySelectorAll('form,section,article,.card,.panel,.modal-body,.integration-card,.settings-card')];
    const candidates=roots.filter(root=>{if(!visibleNode(root))return false;const t=normalizeText(root.textContent);return t.includes('mercado pago')&&(t.includes('access token')||t.includes('public key'))&&root.querySelector('input')});
    candidates.sort((a,b)=>String(a.textContent||'').length-String(b.textContent||'').length);
    if(candidates[0])return candidates[0];
    const input=[...document.querySelectorAll('input')].find(el=>{if(!visibleNode(el))return false;const t=normalizeText(`${el.name||''} ${el.id||''} ${el.placeholder||''} ${el.getAttribute('aria-label')||''} ${el.closest('label')?.textContent||''}`);return t.includes('access token')||t.includes('public key')});
    return input?.closest('form,section,article,.card,.panel,.modal-body,.integration-card,.settings-card')||null;
  }
  function webhookCard(){return document.getElementById('pp-mp-webhook-settings')}
  function setWebhookMessage(message,error=false){const node=webhookCard()?.querySelector('[data-pp-mp-webhook-message]');if(node){node.textContent=String(message||'');node.style.color=error?'#b42318':'#19725e'}}
  async function refreshWebhookCard(){
    const card=webhookCard();if(!card)return;
    try{
      const status=await dataCall('banks.mercadoPago.webhook.status'),badge=card.querySelector('[data-pp-mp-webhook-status]');
      if(badge){badge.textContent=status?.webhookSecretConfigured?'Configurado':'Não configurado';badge.dataset.configured=status?.webhookSecretConfigured?'1':'0';badge.style.color=status?.webhookSecretConfigured?'#19725e':'#8b5a16';badge.style.background=status?.webhookSecretConfigured?'#eaf7f2':'#fff6df'}
      stateMpPatch({webhookSecretConfigured:Boolean(status?.webhookSecretConfigured),accessTokenConfigured:Boolean(status?.accessTokenConfigured??status?.configured)});
    }catch(error){setWebhookMessage(error instanceof Error?error.message:String(error),true)}
  }
  function mountWebhookCard(){
    const existing=webhookCard();if(existing){if(!visibleNode(existing))existing.remove();else return}
    const root=mercadoPagoSettingsRoot();if(!root)return;
    const card=document.createElement('section');card.id='pp-mp-webhook-settings';card.style.cssText='margin-top:14px;padding:14px;border:1px solid #dfe8e5;border-radius:10px;background:#fbfdfc;color:#314b45;display:grid;gap:10px';
    card.innerHTML=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px"><div><strong style="display:block;font-size:12px">Webhook Mercado Pago — Produção</strong><small style="display:block;margin-top:3px;color:#6d7f7b;font-size:10px;line-height:1.45">Use esta URL no Mercado Pago e selecione o evento <b>Order (Mercado Pago)</b>.</small></div><span data-pp-mp-webhook-status style="padding:5px 8px;border-radius:999px;background:#fff6df;color:#8b5a16;font-size:9px;font-weight:800;white-space:nowrap">Verificando...</span></div><label style="display:grid;gap:5px"><span style="font-size:10px;font-weight:750">URL do Webhook</span><div style="display:flex;gap:6px"><input data-pp-mp-webhook-url readonly value="${MP_WEBHOOK_URL}" style="min-width:0;flex:1;height:36px;padding:0 9px;border:1px solid #cfdeda;border-radius:8px;background:#f4f7f6;color:#405853;font-size:10px"><button type="button" data-pp-mp-copy style="height:36px;padding:0 10px;border:1px solid #cfdeda;border-radius:8px;background:#fff;color:#315d54;font-size:10px;font-weight:800;cursor:pointer">Copiar</button></div></label><label style="display:grid;gap:5px"><span style="font-size:10px;font-weight:750">Chave secreta do Webhook</span><input data-pp-mp-webhook-secret type="password" autocomplete="new-password" placeholder="Cole aqui a chave secreta gerada pelo Mercado Pago" style="height:36px;padding:0 9px;border:1px solid #cfdeda;border-radius:8px;background:#fff;color:#405853;font-size:10px"></label><div style="display:flex;flex-wrap:wrap;gap:7px"><button type="button" data-pp-mp-webhook-save style="height:34px;padding:0 11px;border:0;border-radius:8px;background:#0d8b78;color:#fff;font-size:10px;font-weight:800;cursor:pointer">Salvar chave do Webhook</button><button type="button" data-pp-mp-webhook-remove style="height:34px;padding:0 11px;border:1px solid #dccfcf;border-radius:8px;background:#fff;color:#8d3e3e;font-size:10px;font-weight:750;cursor:pointer">Remover chave</button></div><small data-pp-mp-webhook-message style="min-height:13px;color:#6d7f7b;font-size:9px;line-height:1.4">A chave fica criptografada no servidor e não é exibida novamente.</small>`;
    root.appendChild(card);
    card.querySelector('[data-pp-mp-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(MP_WEBHOOK_URL);setWebhookMessage('URL copiada.')}catch{setWebhookMessage('Selecione a URL e copie manualmente.',true)}});
    card.querySelector('[data-pp-mp-webhook-save]')?.addEventListener('click',async event=>{
      const button=event.currentTarget,input=card.querySelector('[data-pp-mp-webhook-secret]'),secret=String(input?.value||'').trim();
      if(!secret){setWebhookMessage('Cole a chave secreta gerada pelo Mercado Pago.',true);return}
      button.disabled=true;try{const status=await dataCall('banks.mercadoPago.webhook.secret.save',{webhookSecret:secret});if(input)input.value='';stateMpPatch({webhookSecretConfigured:Boolean(status?.webhookSecretConfigured)});setWebhookMessage('Chave do Webhook salva com segurança.');await refreshWebhookCard()}catch(error){setWebhookMessage(error instanceof Error?error.message:String(error),true)}finally{button.disabled=false}
    });
    card.querySelector('[data-pp-mp-webhook-remove]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;try{await dataCall('banks.mercadoPago.webhook.secret.delete');stateMpPatch({webhookSecretConfigured:false});setWebhookMessage('Chave do Webhook removida.');await refreshWebhookCard()}catch(error){setWebhookMessage(error instanceof Error?error.message:String(error),true)}finally{button.disabled=false}
    });
    refreshWebhookCard();
  }
  let webhookMountQueued=false;
  function queueWebhookMount(){if(webhookMountQueued)return;webhookMountQueued=true;requestAnimationFrame(()=>{webhookMountQueued=false;mountWebhookCard()})}

  window.ProvedorPlusInstallCloudAdapter=async()=>{
    const api=window.provedor;if(!api||api.__cloudAdapterInstalled)return;
    const base={routers:{...api.routers},mikrotik:{...api.mikrotik},clients:{...api.clients},banks:{...api.banks},vpn:{...api.vpn}};
    async function routerRecord(id){const list=await base.routers.list(),r=(list||[]).find(x=>Number(x.id)===Number(id));if(!r)throw Error('MikroTik cadastrado não encontrado.');return r}
    async function routerAuth(id,password=''){
      const entered=String(password||'').trim();
      const [r,stored]=await Promise.all([routerRecord(id),entered?Promise.resolve(''):secretGet(id)]);
      const pass=entered||stored;
      if(!pass)throw Error('A credencial deste MikroTik não está disponível na nuvem. Edite o MikroTik, informe a senha e clique em Salvar e conectar.');
      return normalizeRouter(r,pass);
    }
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
        let traffic=baseStatus.traffic||null;
        try{traffic=await trafficRecord(id,live)}catch(error){console.error('Provedor Plus: leitura do MikroTik concluída, mas o consumo mensal não pôde ser gravado.',error)}
        const liveDown=Number(live.downloadBps),liveUp=Number(live.uploadBps),trafficDown=Number(traffic?.downloadBps),trafficUp=Number(traffic?.uploadBps);
        return {...baseStatus,...live,routerId:Number(client.router_id)||0,routerName:client.router_name||router.name,routerHost:router.host,connectionState:live.online?'online':'offline',connectionError:'',trafficError:'',liveRatesAvailable:Boolean(live.liveRatesAvailable)||(Number.isFinite(trafficDown)&&trafficDown>0)||(Number.isFinite(trafficUp)&&trafficUp>0),downloadBps:Number.isFinite(liveDown)?Math.max(0,liveDown):(Number.isFinite(trafficDown)?Math.max(0,trafficDown):0),uploadBps:Number.isFinite(liveUp)?Math.max(0,liveUp):(Number.isFinite(trafficUp)?Math.max(0,trafficUp):0),traffic:traffic||baseStatus.traffic};
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

    if(base.banks?.get&&base.banks?.saveMercadoPago&&base.banks?.testMercadoPago){
      api.banks.get=async()=>{
        const banks=await base.banks.get();
        try{
          const status=await ensureMpSecret();
          const mercadoPago={...(banks?.mercadoPago||{}),accessTokenConfigured:Boolean(status?.accessTokenConfigured??status?.configured),webhookSecretConfigured:Boolean(status?.webhookSecretConfigured)};
          stateMpPatch({accessTokenConfigured:mercadoPago.accessTokenConfigured,webhookSecretConfigured:mercadoPago.webhookSecretConfigured});
          return {...banks,mercadoPago};
        }catch(error){
          console.error('Provedor Plus: não foi possível consultar a credencial segura do Mercado Pago.',error);
          return banks;
        }
      };
      api.banks.saveMercadoPago=async data=>{
        const entered=String(data?.accessToken||'').trim();
        let status;
        if(entered)status=await dataCall('banks.mercadoPago.secret.save',{accessToken:entered});
        else status=await ensureMpSecret();
        if(Boolean(data?.enabled)&&!(status?.accessTokenConfigured??status?.configured))throw Error('Mercado Pago: informe o Access Token de produção.');
        const current=(await base.banks.get())?.mercadoPago||{},publicKey=String(data?.publicKey??current.publicKey??'').trim();
        if(Boolean(data?.enabled)&&!publicKey)throw Error('Mercado Pago: informe a Public Key de produção.');
        await clearLegacyMpSecret();
        const saved=await base.banks.saveMercadoPago({...data,accessToken:''});
        const merged=stateMpPatch({
          enabled:Boolean(data?.enabled),
          environment:data?.environment==='production'?'production':'sandbox',
          publicKey,
          accessTokenConfigured:Boolean(status?.accessTokenConfigured??status?.configured),
          webhookSecretConfigured:Boolean(status?.webhookSecretConfigured)
        });
        queueWebhookMount();
        return {...saved,...merged};
      };
      api.banks.testMercadoPago=async()=>{
        const status=await ensureMpSecret();
        if(!(status?.accessTokenConfigured??status?.configured))throw Error('Mercado Pago: informe e salve o Access Token de produção.');
        try{
          const result=await base.banks.testMercadoPago();
          stateMpPatch({enabled:true,accessTokenConfigured:true,webhookSecretConfigured:Boolean(status?.webhookSecretConfigured),lastTestStatus:'success',lastTestAt:result?.checkedAt||now(),lastTestMessage:result?.message||'Conectado.'});
          return result;
        }catch(error){
          stateMpPatch({enabled:false,accessTokenConfigured:true,webhookSecretConfigured:Boolean(status?.webhookSecretConfigured),lastTestStatus:'error',lastTestAt:now(),lastTestMessage:error instanceof Error?error.message:String(error)});
          throw error;
        }
      };
      for(const name of ['deleteMercadoPago','removeMercadoPago','clearMercadoPago']){
        if(typeof base.banks[name]!=='function')continue;
        api.banks[name]=async(...args)=>{
          await dataCall('banks.mercadoPago.secret.delete').catch(()=>{});
          await clearLegacyMpSecret();
          const result=await base.banks[name](...args);
          stateMpPatch({enabled:false,accessTokenConfigured:false,webhookSecretConfigured:false,lastTestStatus:'',lastTestAt:'',lastTestMessage:''});
          await refreshWebhookCard();
          return result;
        };
      }
    }

    api.vpn.status=async()=>({installed:true,web:true,mode:'cloud-rest',message:'A conexão web usa REST HTTPS pelo MikroTik Cloud.'});
    api.vpn.activate=async()=>({queued:false,mode:'cloud-rest',message:'O acesso é feito diretamente pela integração REST HTTPS em nuvem.'});
    api.vpn.remove=async()=>({removed:false,mode:'cloud-rest'});api.vpn.save=async()=>({saved:false,mode:'cloud-rest'});api.vpn.openWireGuard=async()=>({opened:false,mode:'cloud-rest'});
    Object.defineProperty(api,'__cloudAdapterInstalled',{value:true,enumerable:false});
    queueWebhookMount();
    const observer=new MutationObserver(queueWebhookMount);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
  };
})();
