(()=>{
  if(window.__ProvedorPlusClientStatusEnhancementsInstalled)return;
  window.__ProvedorPlusClientStatusEnhancementsInstalled=true;

  const css=document.createElement('link');
  css.rel='stylesheet';css.href='/client-status-enhancements.css?v=1017-status6';css.id='pp-client-status-enhancements-css';
  if(!document.getElementById(css.id))document.head.appendChild(css);

  const api=window.provedor;
  if(!api?.clients?.status)return;
  const originalStatus=api.clients.status.bind(api.clients);
  const originalBlock=typeof api.clients.block==='function'?api.clients.block.bind(api.clients):null;
  const originalUnblock=typeof api.clients.unblock==='function'?api.clients.unblock.bind(api.clients):null;
  const originalTrust=typeof api.clients.trustRelease==='function'?api.clients.trustRelease.bind(api.clients):null;
  let lastResult=null,lastClientId=0,renderTimer=null,liveTimer=null,liveBusy=false,liveSampleCount=0;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const pad=n=>String(n).padStart(2,'0');
  const dateTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
  const dateOnly=value=>{const d=new Date(`${String(value||'').slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?'—':`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`};
  const relative=value=>{const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const sec=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));if(sec<60)return `há ${sec}s`;const min=Math.floor(sec/60);if(min<60)return `há ${min} min`;const h=Math.floor(min/60);if(h<24)return `há ${h}h ${min%60}min`;const days=Math.floor(h/24);return `há ${days} dia${days===1?'':'s'}`};
  const money=cents=>Number.isFinite(Number(cents))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100):'';
  const dayKey=value=>{const d=value instanceof Date?value:new Date(value);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const formatBytes=value=>{let n=Math.max(0,num(value));const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++}return `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:i<2?0:1}).format(n)} ${units[i]}`};
  const rateParts=value=>{let n=Math.max(0,num(value));const units=['bps','Kbps','Mbps','Gbps'];let i=0;while(n>=1000&&i<units.length-1){n/=1000;i++}return {value:new Intl.NumberFormat('pt-BR',{maximumFractionDigits:i<2?0:1}).format(n),unit:units[i]}};
  const normalizeLabel=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const displayValue=(...values)=>{for(const value of values){if(value===undefined||value===null)continue;const valueText=String(value).trim();if(!valueText||['undefined','null','nan'].includes(valueText.toLowerCase()))continue;return valueText}return 'Não identificado'};

  function state(){return window.ProvedorPlusCloudState?.getState?.()||{}}
  function userName(){return String(state()?.settings?.current_user_name||'Administrador').trim()||'Administrador'}
  function invoiceClientId(row){return Number(row?.client_id??row?.clientId??row?.customer_id)||0}
  function invoiceStatus(row){return String(row?.status||'').trim().toLowerCase()}
  function isPaid(row){return ['pago','paga','paid','recebido','recebida','quitado','quitada'].includes(invoiceStatus(row))}
  function invoiceCents(row){
    for(const key of ['amount_cents','value_cents','total_cents','price_cents'])if(Number.isFinite(Number(row?.[key])))return Number(row[key]);
    for(const key of ['amount','value','total','price'])if(Number.isFinite(Number(row?.[key])))return Math.round(Number(row[key])*100);
    return NaN;
  }
  function vlanName(result){
    const raw=result?.vlanId??result?.vlan??result?.client?.vlan_id??result?.client?.vlan;
    if(raw===undefined||raw===null||raw==='')return 'Não identificada';
    const valueText=String(raw).trim();
    if(!valueText||['undefined','null','nan','0'].includes(valueText.toLowerCase()))return 'Não identificada';
    const n=Number(valueText);return Number.isFinite(n)&&n>0?`VLAN ${Math.trunc(n)}`:(/^vlan\s+/i.test(valueText)?valueText:`VLAN ${valueText}`);
  }
  function peakStore(clientId,down,up){
    const key=`pp_client_peak_${Number(clientId)||0}_${dayKey(new Date())}`,value={down:0,up:0};
    try{Object.assign(value,JSON.parse(localStorage.getItem(key)||'{}'))}catch{}
    if(Number.isFinite(Number(down)))value.down=Math.max(num(value.down),num(down));
    if(Number.isFinite(Number(up)))value.up=Math.max(num(value.up),num(up));
    try{localStorage.setItem(key,JSON.stringify(value))}catch{}
    return value;
  }
  function trafficRing(value,peak,kind,mode='ready'){
    const parts=rateParts(value),collecting=mode==='collecting',unavailable=mode==='unavailable',deg=collecting?55:(peak>0?Math.max(0,Math.min(360,num(value)/peak*360)):0);
    const main=collecting?'…':unavailable?'—':esc(parts.value),unit=collecting?'COLETANDO':unavailable?'SEM LEITURA':esc(parts.unit);
    return `<div class="client-traffic-gauge-item"><div class="client-traffic-ring ${kind==='up'?'client-traffic-ring-up':''} ${collecting?'is-collecting':''} ${unavailable?'is-unavailable':''}" style="--client-ring-deg:${deg}deg"><b>${main}</b><small>${unit}</small></div><span>${kind==='up'?'Upload':'Download'} atual</span></div>`;
  }

  function financial(clientId){
    const current=state(),invoices=(Array.isArray(current?.invoices)?current.invoices:[]).filter(x=>invoiceClientId(x)===Number(clientId)&&!isPaid(x));
    const today=dayKey(new Date()),pending=invoices.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10));
    const overdue=pending.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10)<today).sort((a,b)=>String(a?.due_date||a?.dueDate||'').localeCompare(String(b?.due_date||b?.dueDate||'')));
    const future=pending.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10)>=today).sort((a,b)=>String(a?.due_date||a?.dueDate||'').localeCompare(String(b?.due_date||b?.dueDate||'')));
    let overdueDays=0;
    if(overdue[0]){const due=new Date(`${String(overdue[0]?.due_date||overdue[0]?.dueDate).slice(0,10)}T12:00:00`),now=new Date();now.setHours(12,0,0,0);overdueDays=Math.max(0,Math.floor((now-due)/86400000))}
    const next=future[0]||(!overdue.length?pending[0]:null);
    return {overdueCount:overdue.length,overdueDays,next,nextDate:next?String(next?.due_date||next?.dueDate||'').slice(0,10):'',nextCents:next?invoiceCents(next):NaN};
  }
  function quality(result){
    if(result?.connectionState==='offline')return {label:'Sem conexão',tone:'bad',detail:'PPPoE offline',latency:'—',loss:'—'};
    if(result?.connectionState==='unavailable')return {label:'Indisponível',tone:'warn',detail:'MikroTik sem resposta',latency:'—',loss:'—'};
    if(result?.qualityAvailable){
      const latency=Math.max(0,Math.round(Number(result.latencyMs)||0)),loss=Math.max(0,Math.min(100,Number(result.packetLoss)||0)),raw=String(result.quality||'').toLowerCase(),tone=raw.includes('ruim')?'bad':raw.includes('aten')?'warn':'good';
      return {label:String(result.quality||'Boa'),tone,detail:'Ping pelo MikroTik',latency:`${latency} ms`,loss:`${Math.round(loss)}%`};
    }
    if(result?.connectionState==='online')return {label:'Conectado',tone:'good',detail:'Sessão PPPoE ativa',latency:'Não medido',loss:'Não medido'};
    return {label:'Não aplicável',tone:'neutral',detail:'Sem monitoramento PPPoE',latency:'—',loss:'—'};
  }

  async function persistTransition(id,result){
    const client=result?.client;if(!client)return client;
    const next=result?.connectionState;if(next!=='online'&&next!=='offline')return client;if(String(client.connection_last_state||'')===next)return client;
    const at=String(result?.checkedAt||new Date().toISOString()),patch={...client,connection_last_state:next,connection_last_checked_at:at};
    if(next==='online')patch.last_online_at=at;else patch.last_offline_at=at;
    try{return await api.clients.save(patch)}catch(error){console.error('Provedor Plus: não foi possível registrar a transição da conexão.',error);return patch}
  }
  async function appendAccessHistory(client,action,detail=''){
    if(!client?.id)return client;
    const current=Array.isArray(client.access_history)?client.access_history:[],event={at:new Date().toISOString(),action:String(action),user:userName(),detail:String(detail||'')},updated={...client,access_history:[event,...current].slice(0,20)};
    try{return await api.clients.save(updated)}catch(error){console.error('Provedor Plus: ação concluída, mas o histórico de acesso não pôde ser registrado.',error);return client}
  }

  function scheduleRender(id,result){lastClientId=Number(id)||0;lastResult=result||lastResult;clearTimeout(renderTimer);renderTimer=setTimeout(()=>render(lastClientId,lastResult),20)}
  function legacyCandidate(label,modal){
    if(!label||label.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))return null;
    const direct=label.closest('article,.client-status-item,.client-stat,.status-item,.info-item,.stat-card,.metric-card,.client-status-progress,.traffic-progress,.progress-card,.status-card,.card');
    if(direct&&direct!==modal&&!direct.classList.contains('client-status-columns'))return direct;
    let node=label.parentElement,candidate=null,depth=0;
    while(node&&node!==modal&&!node.classList.contains('client-status-columns')&&depth<5){
      const text=normalizeLabel(node.textContent);
      if(text&&text.length<=260&&!text.includes('controle do acesso')&&!text.includes('conexao recente')&&!text.includes('qualidade da conexao')&&!text.includes('situacao financeira'))candidate=node;
      node=node.parentElement;depth++;
    }
    return candidate;
  }
  function hideBlockFromLabel(label,modal){const block=legacyCandidate(label,modal);if(block)block.style.display='none'}
  function hideLegacyDuplicates(modal){
    const columns=modal.querySelector('.client-status-columns');
    const duplicateTitles=new Set(['dados da conexao','consumo do cliente','consumo mensal','consumo do mes','trafego do cliente','consumo de dados']);
    for(const heading of modal.querySelectorAll('h2,h3,h4')){
      if(heading.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))continue;
      if(!duplicateTitles.has(normalizeLabel(heading.textContent)))continue;
      const block=legacyCandidate(heading,modal);if(block)block.style.display='none';
    }
    const oldLabels=new Set(['tempo conectado','download agora','upload agora','consumo do mes','download no mes','upload no mes','consumo total do mes']);
    for(const label of modal.querySelectorAll('span,small,b,strong'))if(oldLabels.has(normalizeLabel(label.textContent)))hideBlockFromLabel(label,modal);
    const oldProgressLabels=[...modal.querySelectorAll('span,small,b,strong,label')].filter(label=>{
      if(label.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))return false;
      const text=normalizeLabel(label.textContent);return text==='download'||text==='upload';
    });
    for(const label of oldProgressLabels)hideBlockFromLabel(label,modal);
    if(columns){const visible=[...columns.children].filter(child=>getComputedStyle(child).display!=='none');if(visible.length===1)columns.style.gridTemplateColumns='minmax(0,1fr)'}
  }

  function contractSection(modal){
    const heading=[...modal.querySelectorAll('h2,h3,h4')].find(el=>normalizeLabel(el.textContent)==='contrato e acesso');
    if(!heading)return null;
    let node=heading.parentElement,depth=0;
    while(node&&node!==modal&&depth<7){const text=normalizeLabel(node.textContent);if(text.includes('contrato e acesso')&&text.includes('roteador/onu do cliente'))return node;node=node.parentElement;depth++}
    return heading.parentElement;
  }
  function setContractValue(section,label,value){
    if(!section||!value||value==='Não identificado')return;
    const target=normalizeLabel(label),labelEl=[...section.querySelectorAll('span,small,label,div,p')].find(el=>el.children.length===0&&normalizeLabel(el.textContent)===target);
    if(!labelEl)return;
    let row=labelEl.parentElement,depth=0;
    while(row&&row!==section&&depth<4){
      const values=[...row.querySelectorAll('strong,b,span,small,p')].filter(el=>el!==labelEl&&el.children.length===0);
      if(values.length){values[values.length-1].textContent=value;return}
      row=row.parentElement;depth++;
    }
  }
  function updateContractAccess(modal,result,client){
    const section=contractSection(modal);if(!section)return;
    section.style.removeProperty('display');
    const port=displayValue(result?.accessPort,result?.accessInterface),encoding=displayValue(result?.encoding),device=String(client?.device_ip||'').trim();
    if(port!=='Não identificado')setContractValue(section,'Porta de acesso',port);
    if(encoding!=='Não identificado')setContractValue(section,'Codificação PPPoE',encoding);
    if(device)setContractValue(section,'Roteador/ONU do cliente',device);
  }

  function renderConsumption(modal,id,result){
    const client=result?.client;if(!client)return;
    const columns=modal.querySelector('.client-status-columns');if(!columns)return;
    hideLegacyDuplicates(modal);
    let panel=modal.querySelector('.client-live-consumption-panel');if(!panel){panel=document.createElement('section');panel.className='client-live-consumption-panel';columns.before(panel)}
    const current=result?.traffic?.current||{},monthDown=Math.max(0,num(current.download_bytes)),monthUp=Math.max(0,num(current.upload_bytes)),monthTotal=monthDown+monthUp;
    const down=Math.max(0,num(result?.downloadBps)),up=Math.max(0,num(result?.uploadBps)),online=result?.connectionState==='online'||result?.online===true,liveAvailable=Boolean(result?.liveRatesAvailable);
    const mode=!online?'ready':liveAvailable?'ready':liveSampleCount<2?'collecting':'unavailable',peak=peakStore(id,down,up);
    const vlan=vlanName(result),pppInterface=displayValue(result?.pppoeInterface),profile=displayValue(result?.profile,client?.mikrotik_profile),pppoe=displayValue(result?.username,client?.pppoe_username,client?.pppoe_user),ip=displayValue(result?.ip,client?.ip),mtu=Number(result?.mtu)>0?String(Math.trunc(Number(result.mtu))):'Não identificado',mac=displayValue(result?.callerId,client?.mac_address);
    panel.innerHTML=`
      <div class="client-live-consumption-head"><div><h3>Consumo e conexão do cliente</h3><p>Tráfego PPPoE, consumo do mês e dados técnicos da conexão</p></div><span class="tone-${online?'good':result?.connectionState==='offline'?'bad':'warn'}">${esc(online?'Online':result?.connectionState==='offline'?'Offline':'Indisponível')}</span></div>
      <div class="client-live-consumption-body">
        <div class="client-traffic-gauges">${trafficRing(down,peak.down,'down',mode)}${trafficRing(up,peak.up,'up',mode)}</div>
        <div class="client-month-usage"><article><span>Download no mês</span><strong>${esc(formatBytes(monthDown))}</strong></article><article><span>Upload no mês</span><strong>${esc(formatBytes(monthUp))}</strong></article><article><span>Consumo total do mês</span><strong>${esc(formatBytes(monthTotal))}</strong></article></div>
      </div>
      <div class="client-access-facts">
        <article><span>PPPoE</span><strong>${esc(pppoe)}</strong></article>
        <article><span>IP conectado</span><strong>${esc(ip)}</strong></article>
        <article><span>VLAN</span><strong>${esc(vlan)}</strong></article>
        <article><span>Interface PPPoE</span><strong>${esc(pppInterface)}</strong></article>
        <article><span>Perfil PPPoE</span><strong>${esc(profile)}</strong></article>
        <article><span>MTU</span><strong>${esc(mtu)}</strong></article>
        <article><span>MAC / Caller ID</span><strong>${esc(mac)}</strong></article>
      </div>`;
    updateContractAccess(modal,result,client);
  }

  function render(id,result){
    const modal=document.querySelector('.client-status-modal');if(!modal||!result?.client)return;
    const client=result.client,title=modal.querySelector('.modal-head h2,h2')?.textContent||'';if(client.name&&title&&!title.includes(client.name))return;
    const columns=modal.querySelector('.client-status-columns');if(!columns)return;
    hideLegacyDuplicates(modal);
    const fin=financial(id),q=quality(result),lastOnline=client.last_online_at,lastOffline=client.last_offline_at,online=result.connectionState==='online'||result.online===true,uptime=online?displayValue(result?.uptime):'—';
    let summary=modal.querySelector('.client-extra-summary');if(!summary){summary=document.createElement('section');summary.className='client-extra-summary';columns.before(summary)}
    const nextText=fin.nextDate?`${dateOnly(fin.nextDate)}${Number.isFinite(fin.nextCents)?` • ${money(fin.nextCents)}`:''}`:'Nenhuma cobrança futura',financeMain=fin.overdueCount?`${fin.overdueCount} vencida${fin.overdueCount===1?'':'s'}`:'Em dia',financeDetail=fin.overdueCount?`${fin.overdueDays} dia${fin.overdueDays===1?'':'s'} de atraso`:`Próxima: ${nextText}`;
    summary.innerHTML=`
      <article class="client-extra-card"><div class="client-extra-title"><span>CONEXÃO RECENTE</span><b class="tone-${online?'good':result.connectionState==='offline'?'bad':'warn'}">${esc(online?'Online':result.connectionState==='offline'?'Offline':'Indisponível')}</b></div><strong>${esc(lastOnline?dateTime(lastOnline):'Último online não registrado')}</strong><small>${esc(lastOffline?`Última queda detectada: ${dateTime(lastOffline)} ${relative(lastOffline)}`:'Nenhuma queda registrada pelo painel')}</small></article>
      <article class="client-extra-card"><div class="client-extra-title"><span>QUALIDADE DA CONEXÃO</span><b class="tone-${q.tone}">${esc(q.label)}</b></div><strong>${esc(q.latency)} <em>latência</em></strong><small>Perda: ${esc(q.loss)} • ${esc(q.detail)}</small></article>
      <article class="client-extra-card"><div class="client-extra-title"><span>SITUAÇÃO FINANCEIRA</span><b class="tone-${fin.overdueCount?'bad':'good'}">${esc(fin.overdueCount?'Atenção':'Regular')}</b></div><strong>${esc(financeMain)}</strong><small>${esc(financeDetail)}</small></article>
      <article class="client-extra-card client-uptime-card"><div class="client-extra-title"><span>◷ TEMPO CONECTADO</span><b class="tone-${online?'good':'neutral'}">${esc(online?'Ativo':'Offline')}</b></div><strong>${esc(uptime)}</strong><small>${esc(online?'Sessão ativa':'Sem sessão PPPoE ativa')}</small></article>`;
    renderConsumption(modal,id,result);
    let history=modal.querySelector('.client-access-history-panel');if(!history){history=document.createElement('section');history.className='client-access-history-panel';columns.after(history)}
    const rows=(Array.isArray(client.access_history)?client.access_history:[]).slice(0,5);
    history.innerHTML=`<div class="client-access-history-head"><div><h3>Histórico de ações no acesso</h3><p>Bloqueios, desbloqueios e liberações realizados pelo painel.</p></div><span>Últimas ${rows.length||0}</span></div>${rows.length?`<div class="client-access-history-list">${rows.map(item=>`<article><span class="client-access-action-dot"></span><div><strong>${esc(item.action||'Ação')}</strong><small>${esc(item.detail||'Sem observação')}</small></div><div><b>${esc(item.user||'Administrador')}</b><small>${esc(dateTime(item.at))}</small></div></article>`).join('')}</div>`:`<div class="client-access-history-empty">Nenhuma ação de acesso registrada a partir desta atualização.</div>`}`;
    modal.classList.add('pp-client-status-ready');
  }

  function stopLivePolling(){if(liveTimer){clearInterval(liveTimer);liveTimer=null}liveBusy=false}
  function startLivePolling(){
    stopLivePolling();
    liveTimer=setInterval(async()=>{
      const modal=document.querySelector('.client-status-modal');if(!modal||!lastClientId){stopLivePolling();return}if(liveBusy)return;
      liveBusy=true;
      try{const result=await originalStatus(lastClientId);liveSampleCount++;if(result?.client){const updated=await persistTransition(lastClientId,result);if(updated)result.client={...result.client,...updated}}scheduleRender(lastClientId,result)}
      catch(error){console.error('Provedor Plus: falha ao atualizar consumo do cliente.',error)}finally{liveBusy=false}
    },3000);
  }

  api.clients.status=async id=>{
    const numericId=Number(id)||0;if(numericId!==lastClientId)liveSampleCount=0;
    const result=await originalStatus(id);if(result?.client){const updated=await persistTransition(id,result);if(updated)result.client={...result.client,...updated}}
    scheduleRender(id,result);startLivePolling();return result;
  };
  if(originalBlock)api.clients.block=async id=>{const saved=await originalBlock(id),updated=await appendAccessHistory(saved,'Bloqueio','Acesso PPPoE bloqueado pelo painel');scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
  if(originalUnblock)api.clients.unblock=async id=>{const saved=await originalUnblock(id),updated=await appendAccessHistory(saved,'Desbloqueio','Acesso PPPoE liberado pelo painel');scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
  if(originalTrust)api.clients.trustRelease=async(id,hours=48)=>{const saved=await originalTrust(id,hours),safeHours=Math.min(48,Math.max(1,Math.floor(Number(hours)||48))),updated=await appendAccessHistory(saved,'Liberação em confiança',`Liberação temporária por ${safeHours} hora${safeHours===1?'':'s'}`);scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};

  const observer=new MutationObserver(()=>{
    const modal=document.querySelector('.client-status-modal');
    if(modal&&lastResult){hideLegacyDuplicates(modal);if(!modal.querySelector('.client-extra-summary'))scheduleRender(lastClientId,lastResult)}
    if(!modal)stopLivePolling();
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
