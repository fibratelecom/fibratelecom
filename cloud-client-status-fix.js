(()=>{
  let retryTimer=null;

  const pad=n=>String(n).padStart(2,'0');
  const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const digits=v=>String(v??'').replace(/\D/g,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>Number.isFinite(Number(v))?Number(v):0;
  const localMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}`};
  const emptyCurrent=()=>({month:localMonthKey(),download_bytes:0,upload_bytes:0});
  const dateTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`};

  function trustInfo(client){
    const month=localMonthKey(),usedMonth=String(client?.trust_release_used_month||'')||String(client?.trust_release_at||'').slice(0,7),until=client?.trust_release_until?new Date(client.trust_release_until):null,next=new Date();
    next.setDate(1);next.setMonth(next.getMonth()+1);next.setHours(0,0,0,0);
    return {usedThisMonth:Boolean(usedMonth&&usedMonth===month),active:Boolean(until&&!Number.isNaN(until.getTime())&&until.getTime()>Date.now()),until:client?.trust_release_until||null,nextAvailableAt:usedMonth===month?next.toISOString():''};
  }

  function normalizeStatus(value,client){
    const out=value&&typeof value==='object'?{...value}:{},resolvedClient=out.client||client||null,traffic=out.traffic&&typeof out.traffic==='object'?out.traffic:{},current=traffic.current&&typeof traffic.current==='object'?traffic.current:emptyCurrent();
    out.client=resolvedClient;
    out.connectionState=out.connectionState||(resolvedClient?.connection_type==='PPPoE'?'unavailable':'not_applicable');
    out.connectionError=String(out.connectionError||'');
    out.liveRatesAvailable=Boolean(out.liveRatesAvailable||traffic.liveRatesAvailable);
    out.downloadBps=number(out.downloadBps||traffic.downloadBps);
    out.uploadBps=number(out.uploadBps||traffic.uploadBps);
    out.traffic={...traffic,downloadBps:number(traffic.downloadBps||out.downloadBps),uploadBps:number(traffic.uploadBps||out.uploadBps),current:{...emptyCurrent(),...current,download_bytes:number(current.download_bytes),upload_bytes:number(current.upload_bytes)},history:Array.isArray(traffic.history)?traffic.history:[]};
    if(!out.trust||typeof out.trust!=='object')out.trust=trustInfo(resolvedClient);
    return out;
  }

  async function request(url,action,data={},timeoutMs=18000){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Math.max(1000,Number(timeoutMs)||18000));
    try{
      const response=await fetch(url,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:ctl.signal});
      let body={};try{body=await response.json()}catch{}
      if(!response.ok||!body.ok)throw new Error(body.error||`Falha na consulta (${response.status}).`);
      return body.data;
    }finally{clearTimeout(timer)}
  }

  async function cloudStatusFallback(api,id){
    const rows=await api.clients.list(),client=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(id));
    if(!client)throw new Error('Cliente não encontrado.');
    const base=normalizeStatus({client,trust:trustInfo(client),connectionState:client.connection_type==='PPPoE'?'unavailable':'not_applicable',connectionError:'',liveRatesAvailable:false},client);
    if(client.connection_type!=='PPPoE'||!Number(client.router_id)||!String(client.pppoe_username||client.pppoe_user||'').trim())return base;
    try{
      const routers=await api.routers.list(),routerRow=(Array.isArray(routers)?routers:[]).find(x=>Number(x?.id)===Number(client.router_id));
      if(!routerRow)throw new Error('MikroTik do cliente não encontrado.');
      const secret=await request('/api/cloud-data','routers.secret.get',{id:Number(routerRow.id)},9000),password=String(secret?.password||'');
      if(!password)throw new Error('Credencial do MikroTik indisponível.');
      let port=Number(routerRow.port)||443;if([80,8728,8729].includes(port))port=443;
      const host=String(routerRow.host||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/^\[|\]$/g,'');
      const router={id:Number(routerRow.id)||0,name:String(routerRow.name||'MikroTik'),connection_method:'rest',host,port,username:String(routerRow.username||'').trim(),password,allow_self_signed:Boolean(routerRow.allow_self_signed)};
      const live=await request('/api/mikrotik-proxy','client.status',{router,data:{...client,pppoe_username:client.pppoe_username||client.pppoe_user}},18000);
      let traffic=null;
      try{traffic=await request('/api/cloud-data','traffic.record',{clientId:Number(id),month:localMonthKey(),live},9000)}catch(error){console.warn('Provedor Plus: consumo do cliente não pôde ser gravado agora.',error)}
      const liveDown=Number(live?.downloadBps),liveUp=Number(live?.uploadBps),trafficDown=Number(traffic?.downloadBps),trafficUp=Number(traffic?.uploadBps);
      return normalizeStatus({...base,...live,client,trust:trustInfo(client),connectionState:live?.online?'online':'offline',connectionError:'',traffic:traffic||base.traffic,downloadBps:Number.isFinite(liveDown)?Math.max(0,liveDown):(Number.isFinite(trafficDown)?Math.max(0,trafficDown):0),uploadBps:Number.isFinite(liveUp)?Math.max(0,liveUp):(Number.isFinite(trafficUp)?Math.max(0,trafficUp):0)},client);
    }catch(error){
      console.warn('Provedor Plus: leitura ao vivo do cliente indisponível; ficha continuará acessível.',error);
      return {...base,connectionState:'unavailable',connectionError:''};
    }
  }

  function installStyles(){
    if(document.getElementById('pp-client-new-access-style'))return;
    const style=document.createElement('style');style.id='pp-client-new-access-style';style.textContent=`
      .ppc-access-control{background:#fbfdfc!important}.ppc-access-state{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.ppc-access-state article{padding:9px 10px;border:1px solid #e5eeeb;border-radius:9px;background:#fff}.ppc-access-state small{display:block;color:#879792;font-size:8px}.ppc-access-state strong{display:block;margin-top:4px;color:#35564e;font-size:9px;overflow-wrap:anywhere}.ppc-access-actions{display:flex;flex-wrap:wrap;gap:7px}.ppc-access-actions button{height:33px;padding:0 10px;border:1px solid #d5e3df;border-radius:8px;background:#fff;color:#49635d;font:800 8.5px Segoe UI,Arial;cursor:pointer}.ppc-access-actions button.primary{border-color:#087866;background:#087866;color:#fff}.ppc-access-actions button.warn{border-color:#e7d5ac;background:#fff8e9;color:#8a641e}.ppc-access-actions button.danger{border-color:#edcec9;background:#fff5f3;color:#a84c3c}.ppc-access-actions button:disabled{opacity:.48;cursor:not-allowed}.ppc-access-note{display:block;margin-top:9px;color:#7e8f8a;font-size:8px;line-height:1.45}.ppc-live-friendly{padding:12px;border:1px solid #e2ece9;border-radius:9px;background:#f8fbfa;color:#667b75;font-size:9px}.ppc-client-live-grid.ppc-client-live-dedup{grid-template-columns:repeat(4,minmax(0,1fr))}@media(max-width:760px){.ppc-access-state{grid-template-columns:1fr}.ppc-client-live-grid.ppc-client-live-dedup{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;document.head.appendChild(style);
  }

  async function resolveModalClient(api,modal){
    const info=String(modal.querySelector('.ppc-detail-id p')?.textContent||''),contract=(info.match(/Contrato\s+([^·]+)/i)?.[1]||'').trim(),doc=digits(info.split('·').pop()||''),name=norm(modal.querySelector('.ppc-detail-id h2')?.textContent||''),rows=await api.clients.list();
    return (Array.isArray(rows)?rows:[]).find(c=>(contract&&String(c?.contract_number||'').trim()===contract)||(doc&&digits(c?.document)===doc)||(name&&norm(c?.name)===name))||null;
  }

  function refreshBadge(modal,client){
    const badge=modal.querySelector('.ppc-detail-hero .ppc-status');if(!badge)return;badge.textContent=String(client?.status||'Ativo');
  }

  async function renderAccessControl(api,modal,client){
    if(!modal?.isConnected||!client?.id)return;
    let section=modal.querySelector('.ppc-access-control');
    if(!section){
      section=document.createElement('section');section.className='ppc-detail-section full ppc-access-control';
      const bills=[...modal.querySelectorAll('.ppc-detail-section.full')].find(x=>norm(x.querySelector('h3')?.textContent)==='boletos do cliente');
      if(bills)bills.before(section);else modal.querySelector('.ppc-detail-body')?.appendChild(section);
    }
    const trust=trustInfo(client),blocked=norm(client.status).includes('bloque'),remoteReady=Boolean(String(client.device_ip||'').trim()&&typeof api.clients.openRouter==='function'),trustLabel=trust.active?`Ativa até ${dateTime(trust.until)}`:trust.usedThisMonth?`Usada neste mês · volta em ${dateTime(trust.nextAvailableAt)}`:'Disponível neste mês';
    section.innerHTML=`<h3>Controle de acesso</h3><div class="ppc-access-state"><article><small>ACESSO PPPoE</small><strong>${esc(client.status||'Ativo')}</strong></article><article><small>LIBERAÇÃO EM CONFIANÇA</small><strong>${esc(trustLabel)}</strong></article><article><small>ACESSO REMOTO</small><strong>${remoteReady?esc(`${client.device_ip}${client.device_port?`:${client.device_port}`:''}`):'IP/porta não cadastrados'}</strong></article></div><div class="ppc-access-actions">${blocked?'<button type="button" data-ppc-unblock>Desbloquear acesso</button>':'<button type="button" class="danger" data-ppc-block>Bloquear acesso</button>'}<button type="button" class="warn" data-ppc-trust ${(!blocked||trust.usedThisMonth||trust.active)?'disabled':''}>Liberação em confiança · 48h</button><button type="button" class="primary" data-ppc-remote ${remoteReady?'':'disabled'}>Acesso remoto</button></div><small class="ppc-access-note">A liberação em confiança mantém o acesso temporariamente por até 48 horas e pode ser utilizada uma vez por mês. O desbloqueio normal permanece separado.</small>`;
    const run=async(button,action)=>{if(button.disabled)return;button.disabled=true;try{await action();const rows=await api.clients.list(),updated=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(client.id))||client;refreshBadge(modal,updated);await renderAccessControl(api,modal,updated)}catch(error){button.disabled=false;alert(error?.message||String(error))}};
    section.querySelector('[data-ppc-block]')?.addEventListener('click',e=>{if(confirm('Bloquear agora o acesso PPPoE deste cliente?'))void run(e.currentTarget,()=>api.clients.block(Number(client.id)))});
    section.querySelector('[data-ppc-unblock]')?.addEventListener('click',e=>{if(confirm('Desbloquear o acesso PPPoE deste cliente?'))void run(e.currentTarget,()=>api.clients.unblock(Number(client.id)))});
    section.querySelector('[data-ppc-trust]')?.addEventListener('click',e=>{if(confirm('Liberar este cliente em confiança por 48 horas? Esta liberação só pode ser utilizada uma vez no mês.'))void run(e.currentTarget,()=>api.clients.trustRelease(Number(client.id),48))});
    section.querySelector('[data-ppc-remote]')?.addEventListener('click',e=>void run(e.currentTarget,()=>api.clients.openRouter(Number(client.id))));
  }

  function cleanLiveBlock(modal){
    const liveSection=[...modal.querySelectorAll('.ppc-detail-section.full')].find(x=>x.hasAttribute('data-pp-live-section')||x.querySelector('[data-client-live]'));
    if(!liveSection)return;
    liveSection.dataset.ppLiveSection='1';
    const title=liveSection.querySelector('h3');if(title&&title.textContent!=='Status, consumo e acesso remoto')title.textContent='Status, consumo e acesso remoto';
    const host=liveSection.querySelector('[data-client-live]');if(!host)return;
    const error=host.querySelector('.ppc-message.error');if(error&&/banco local do navegador|indexeddb|versão online|versao online/i.test(error.textContent||''))error.outerHTML='<div class="ppc-live-friendly">Atualizando o status pela conexão em nuvem. Use “Atualizar conexão” para tentar novamente.</div>';
    const grid=host.querySelector('.ppc-client-live-grid');if(grid){grid.classList.add('ppc-client-live-dedup');for(const box of [...grid.querySelectorAll('.ppc-client-live-box')]){const label=norm(box.querySelector('small')?.textContent);if(label==='profile'||label==='mac / caller id')box.remove()}}
  }

  function installModalEnhancer(api){
    if(window.__ProvedorPlusNewClientCardAccessInstalled)return;window.__ProvedorPlusNewClientCardAccessInstalled=true;installStyles();let scheduled=false;
    const scan=()=>{scheduled=false;for(const modal of document.querySelectorAll('.ppc-detail-layer')){cleanLiveBlock(modal);if(modal.dataset.ppAccessControlsReady==='1')continue;modal.dataset.ppAccessControlsReady='loading';resolveModalClient(api,modal).then(client=>{if(!modal.isConnected)return;if(!client){delete modal.dataset.ppAccessControlsReady;return}modal.dataset.ppAccessControlsReady='1';return renderAccessControl(api,modal,client)}).catch(error=>{delete modal.dataset.ppAccessControlsReady;console.warn('Provedor Plus: controle de acesso da ficha não pôde ser montado.',error)})}};
    const schedule=()=>{if(scheduled)return;scheduled=true;setTimeout(scan,25)};
    const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});schedule();
  }

  function install(){
    const api=window.provedor;
    if(!api?.clients||!api?.__cloudAdapterInstalled||!api.clients.__cloudClientStoreV2Installed||typeof api.clients.status!=='function')return false;
    if(api.clients.__cloudStatusFixV2Installed){installModalEnhancer(api);return true}
    const originalStatus=api.clients.status.bind(api.clients);
    api.clients.status=async id=>{
      try{return normalizeStatus(await originalStatus(id),null)}catch(error){
        const message=String(error?.message||error||'');
        if(!/cliente não encontrado|banco local do navegador|indexeddb|versão online|versao online/i.test(message))throw error;
        return cloudStatusFallback(api,id);
      }
    };
    Object.defineProperty(api.clients,'__cloudStatusFixV2Installed',{value:true,enumerable:false});
    try{Object.defineProperty(api.clients,'__cloudStatusFixInstalled',{value:true,enumerable:false})}catch{}
    installModalEnhancer(api);return true;
  }

  if(install())return;
  let attempts=0;retryTimer=setInterval(()=>{attempts++;if(install()||attempts>=160){clearInterval(retryTimer);retryTimer=null}},50);
})();
