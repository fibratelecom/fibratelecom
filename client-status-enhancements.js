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
  let lastResult=null,lastClientId=0,renderSequence=0,liveSampleCount=0;

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
  function invoiceCents(row){for(const key of ['amount_cents','value_cents','total_cents','price_cents'])if(Number.isFinite(Number(row?.[key])))return Number(row[key]);for(const key of ['amount','value','total','price'])if(Number.isFinite(Number(row?.[key])))return Math.round(Number(row[key])*100);return NaN}
  function vlanName(result){const raw=result?.vlanId??result?.vlan??result?.client?.vlan_id??result?.client?.vlan;if(raw===undefined||raw===null||raw==='')return 'Não identificada';const valueText=String(raw).trim();if(!valueText||['undefined','null','nan','0'].includes(valueText.toLowerCase()))return 'Não identificada';const n=Number(valueText);return Number.isFinite(n)&&n>0?`VLAN ${Math.trunc(n)}`:(/^vlan\s+/i.test(valueText)?valueText:`VLAN ${valueText}`)}
  function peakStore(clientId,down,up){const key=`pp_client_peak_${Number(clientId)||0}_${dayKey(new Date())}`,value={down:0,up:0};try{Object.assign(value,JSON.parse(localStorage.getItem(key)||'{}'))}catch{}if(Number.isFinite(Number(down)))value.down=Math.max(num(value.down),num(down));if(Number.isFinite(Number(up)))value.up=Math.max(num(value.up),num(up));try{localStorage.setItem(key,JSON.stringify(value))}catch{}return value}

  function financial(clientId){
    const current=state(),invoices=(Array.isArray(current?.invoices)?current.invoices:[]).filter(x=>invoiceClientId(x)===Number(clientId)&&!isPaid(x));
    const today=dayKey(new Date()),pending=invoices.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10));
    const overdue=pending.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10)<today).sort((a,b)=>String(a?.due_date||a?.dueDate||'').localeCompare(String(b?.due_date||b?.dueDate||'')));
    const future=pending.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10)>=today).sort((a,b)=>String(a?.due_date||a?.dueDate||'').localeCompare(String(b?.due_date||b?.dueDate||'')));
    let overdueDays=0;if(overdue[0]){const due=new Date(`${String(overdue[0]?.due_date||overdue[0]?.dueDate).slice(0,10)}T12:00:00`),now=new Date();now.setHours(12,0,0,0);overdueDays=Math.max(0,Math.floor((now-due)/86400000))}
    const next=future[0]||(!overdue.length?pending[0]:null);return {overdueCount:overdue.length,overdueDays,next,nextDate:next?String(next?.due_date||next?.dueDate||'').slice(0,10):'',nextCents:next?invoiceCents(next):NaN};
  }
  function quality(result){if(result?.connectionState==='offline')return {label:'Sem conexão',tone:'bad',detail:'PPPoE offline',latency:'—',loss:'—'};if(result?.connectionState==='unavailable')return {label:'Indisponível',tone:'warn',detail:'MikroTik sem resposta',latency:'—',loss:'—'};if(result?.qualityAvailable){const latency=Math.max(0,Math.round(Number(result.latencyMs)||0)),loss=Math.max(0,Math.min(100,Number(result.packetLoss)||0)),raw=String(result.quality||'').toLowerCase(),tone=raw.includes('ruim')?'bad':raw.includes('aten')?'warn':'good';return {label:String(result.quality||'Boa'),tone,detail:'Ping pelo MikroTik',latency:`${latency} ms`,loss:`${Math.round(loss)}%`}}if(result?.connectionState==='online')return {label:'Conectado',tone:'good',detail:'Sessão PPPoE ativa',latency:'Não medido',loss:'Não medido'};return {label:'Não aplicável',tone:'neutral',detail:'Sem monitoramento PPPoE',latency:'—',loss:'—'}}

  async function persistTransition(id,result){const client=result?.client;if(!client)return client;const next=result?.connectionState;if(next!=='online'&&next!=='offline')return client;if(String(client.connection_last_state||'')===next)return client;const at=String(result?.checkedAt||new Date().toISOString()),patch={...client,connection_last_state:next,connection_last_checked_at:at};if(next==='online')patch.last_online_at=at;else patch.last_offline_at=at;try{return await api.clients.save(patch)}catch(error){console.error('Provedor Plus: não foi possível registrar a transição da conexão.',error);return patch}}
  async function appendAccessHistory(client,action,detail=''){if(!client?.id)return client;const current=Array.isArray(client.access_history)?client.access_history:[],event={at:new Date().toISOString(),action:String(action),user:userName(),detail:String(detail||'')},updated={...client,access_history:[event,...current].slice(0,20)};try{return await api.clients.save(updated)}catch(error){console.error('Provedor Plus: ação concluída, mas o histórico de acesso não pôde ser registrado.',error);return client}}

  function legacyCandidate(label,modal){
    if(!label||label.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))return null;
    const direct=label.closest('article,.client-status-item,.client-stat,.status-item,.info-item,.stat-card,.metric-card,.client-status-progress,.traffic-progress,.progress-card,.status-card,.card');
    if(direct&&direct!==modal&&!direct.classList.contains('client-status-columns'))return direct;
    let node=label.parentElement,candidate=null,depth=0;
    while(node&&node!==modal&&!node.classList.contains('client-status-columns')&&depth<5){const text=normalizeLabel(node.textContent);if(text&&text.length<=260&&!text.includes('controle do acesso')&&!text.includes('conexao recente')&&!text.includes('qualidade da conexao')&&!text.includes('situacao financeira'))candidate=node;node=node.parentElement;depth++}
    return candidate;
  }
  function hideBlockFromLabel(label,modal){const block=legacyCandidate(label,modal);if(block&&block.style.display!=='none')block.style.display='none'}
  function hideLegacyDuplicates(modal){
    const columns=modal.querySelector('.client-status-columns');
    const duplicateTitles=new Set(['dados da conexao','consumo do cliente','consumo mensal','consumo do mes','trafego do cliente','consumo de dados']);
    for(const heading of modal.querySelectorAll('h2,h3,h4')){if(heading.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))continue;if(!duplicateTitles.has(normalizeLabel(heading.textContent)))continue;const block=legacyCandidate(heading,modal);if(block&&block.style.display!=='none')block.style.display='none'}
    const oldLabels=new Set(['tempo conectado','download agora','upload agora','consumo do mes','download no mes','upload no mes','consumo total do mes']);
    for(const label of modal.querySelectorAll('span,small,b,strong'))if(oldLabels.has(normalizeLabel(label.textContent)))hideBlockFromLabel(label,modal);
    const oldProgressLabels=[...modal.querySelectorAll('span,small,b,strong,label')].filter(label=>{if(label.closest('.client-live-consumption-panel,.client-extra-summary,.client-access-history-panel'))return false;const text=normalizeLabel(label.textContent);return text==='download'||text==='upload'});
    for(const label of oldProgressLabels)hideBlockFromLabel(label,modal);
    if(columns){const visible=[...columns.children].filter(child=>getComputedStyle(child).display!=='none');if(visible.length===1)columns.style.gridTemplateColumns='minmax(0,1fr)'}
  }

  function contractSection(modal){const heading=[...modal.querySelectorAll('h2,h3,h4')].find(el=>normalizeLabel(el.textContent)==='contrato e acesso');if(!heading)return null;let node=heading.parentElement,depth=0;while(node&&node!==modal&&depth<7){const text=normalizeLabel(node.textContent);if(text.includes('contrato e acesso')&&text.includes('roteador/onu do cliente'))return node;node=node.parentElement;depth++}return heading.parentElement}
  function setContractValue(section,label,value){if(!section||!value||value==='Não identificado')return;const target=normalizeLabel(label),labelEl=[...section.querySelectorAll('span,small,label,div,p')].find(el=>el.children.length===0&&normalizeLabel(el.textContent)===target);if(!labelEl)return;let row=labelEl.parentElement,depth=0;while(row&&row!==section&&depth<4){const values=[...row.querySelectorAll('strong,b,span,small,p')].filter(el=>el!==labelEl&&el.children.length===0);if(values.length){if(values[values.length-1].textContent!==value)values[values.length-1].textContent=value;return}row=row.parentElement;depth++}}
  function updateContractAccess(modal,result,client){const section=contractSection(modal);if(!section)return;const port=displayValue(result?.accessPort,result?.accessInterface),encoding=displayValue(result?.encoding),device=String(client?.device_ip||'').trim();if(port!=='Não identificado')setContractValue(section,'Porta de acesso',port);if(encoding!=='Não identificado')setContractValue(section,'Codificação PPPoE',encoding);if(device)setContractValue(section,'Roteador/ONU do cliente',device)}

  function setText(root,selector,value){const el=root?.querySelector(selector);const text=String(value??'');if(el&&el.textContent!==text)el.textContent=text;return el}
  function setTone(el,tone){if(!el)return;const next=`tone-${tone}`;if(el.className!==next)el.className=next}

  function ensureSummary(columns){
    let summary=columns.parentElement?.querySelector('.client-extra-summary')||document.querySelector('.client-status-modal .client-extra-summary');
    if(summary)return summary;
    summary=document.createElement('section');summary.className='client-extra-summary';
    summary.innerHTML=`
      <article class="client-extra-card"><div class="client-extra-title"><span>CONEXÃO RECENTE</span><b data-pp-recent-tone></b></div><strong data-pp-last-online></strong><small data-pp-last-offline></small></article>
      <article class="client-extra-card"><div class="client-extra-title"><span>QUALIDADE DA CONEXÃO</span><b data-pp-quality-tone></b></div><strong><span data-pp-latency></span> <em>latência</em></strong><small data-pp-quality-detail></small></article>
      <article class="client-extra-card"><div class="client-extra-title"><span>SITUAÇÃO FINANCEIRA</span><b data-pp-finance-tone></b></div><strong data-pp-finance-main></strong><small data-pp-finance-detail></small></article>
      <article class="client-extra-card client-uptime-card"><div class="client-extra-title"><span>◷ TEMPO CONECTADO</span><b data-pp-uptime-tone></b></div><strong data-pp-uptime></strong><small data-pp-uptime-detail></small></article>`;
    columns.before(summary);return summary;
  }

  function ensureConsumption(columns){
    let panel=columns.parentElement?.querySelector('.client-live-consumption-panel')||document.querySelector('.client-status-modal .client-live-consumption-panel');
    if(panel)return panel;
    panel=document.createElement('section');panel.className='client-live-consumption-panel';
    panel.innerHTML=`
      <div class="client-live-consumption-head"><div><h3>Consumo e conexão do cliente</h3><p>Tráfego PPPoE, consumo do mês e dados técnicos da conexão</p></div><span data-pp-live-status></span></div>
      <div class="client-live-consumption-body">
        <div class="client-traffic-gauges">
          <div class="client-traffic-gauge-item"><div class="client-traffic-ring" data-pp-gauge="down" style="--client-ring-deg:0deg"><b>0</b><small>bps</small></div><span>Download atual</span></div>
          <div class="client-traffic-gauge-item"><div class="client-traffic-ring client-traffic-ring-up" data-pp-gauge="up" style="--client-ring-deg:0deg"><b>0</b><small>bps</small></div><span>Upload atual</span></div>
        </div>
        <div class="client-month-usage"><article><span>Download no mês</span><strong data-pp-month-down></strong></article><article><span>Upload no mês</span><strong data-pp-month-up></strong></article><article><span>Consumo total do mês</span><strong data-pp-month-total></strong></article></div>
      </div>
      <div class="client-access-facts">
        <article><span>PPPoE</span><strong data-pp-fact="pppoe"></strong></article>
        <article><span>IP conectado</span><strong data-pp-fact="ip"></strong></article>
        <article><span>VLAN</span><strong data-pp-fact="vlan"></strong></article>
        <article><span>Interface PPPoE</span><strong data-pp-fact="interface"></strong></article>
        <article><span>Perfil PPPoE</span><strong data-pp-fact="profile"></strong></article>
        <article><span>MTU</span><strong data-pp-fact="mtu"></strong></article>
        <article><span>MAC / Caller ID</span><strong data-pp-fact="mac"></strong></article>
      </div>`;
    columns.before(panel);return panel;
  }

  function updateGauge(panel,kind,value,peak,mode){
    const ring=panel.querySelector(`[data-pp-gauge="${kind}"]`);if(!ring)return;
    const parts=rateParts(value),collecting=mode==='collecting',unavailable=mode==='unavailable',deg=collecting?55:(peak>0?Math.max(0,Math.min(360,num(value)/peak*360)):0);
    ring.classList.toggle('is-collecting',collecting);ring.classList.toggle('is-unavailable',unavailable);ring.style.setProperty('--client-ring-deg',`${deg}deg`);
    setText(ring,'b',collecting?'…':unavailable?'—':parts.value);setText(ring,'small',collecting?'COLETANDO':unavailable?'SEM LEITURA':parts.unit);
  }

  function renderConsumption(modal,columns,id,result){
    const client=result?.client;if(!client)return null;
    const panel=ensureConsumption(columns),current=result?.traffic?.current||{},monthDown=Math.max(0,num(current.download_bytes)),monthUp=Math.max(0,num(current.upload_bytes)),monthTotal=monthDown+monthUp;
    const down=Math.max(0,num(result?.downloadBps)),up=Math.max(0,num(result?.uploadBps)),online=result?.connectionState==='online'||result?.online===true,liveAvailable=Boolean(result?.liveRatesAvailable);
    const mode=!online?'ready':liveAvailable?'ready':liveSampleCount<2?'collecting':'unavailable',peak=peakStore(id,down,up);
    const liveStatus=panel.querySelector('[data-pp-live-status]');setTone(liveStatus,online?'good':result?.connectionState==='offline'?'bad':'warn');if(liveStatus)liveStatus.textContent=online?'Online':result?.connectionState==='offline'?'Offline':'Indisponível';
    updateGauge(panel,'down',down,peak.down,mode);updateGauge(panel,'up',up,peak.up,mode);
    setText(panel,'[data-pp-month-down]',formatBytes(monthDown));setText(panel,'[data-pp-month-up]',formatBytes(monthUp));setText(panel,'[data-pp-month-total]',formatBytes(monthTotal));
    const values={pppoe:displayValue(result?.username,client?.pppoe_username,client?.pppoe_user),ip:displayValue(result?.ip,client?.ip),vlan:vlanName(result),interface:displayValue(result?.pppoeInterface),profile:displayValue(result?.profile,client?.mikrotik_profile),mtu:Number(result?.mtu)>0?String(Math.trunc(Number(result.mtu))):'Não identificado',mac:displayValue(result?.callerId,client?.mac_address)};
    for(const [key,value] of Object.entries(values))setText(panel,`[data-pp-fact="${key}"]`,value);
    updateContractAccess(modal,result,client);return panel;
  }

  function renderHistory(columns,client){
    let history=columns.parentElement?.querySelector('.client-access-history-panel')||document.querySelector('.client-status-modal .client-access-history-panel');
    if(!history){history=document.createElement('section');history.className='client-access-history-panel';columns.after(history)}
    const rows=(Array.isArray(client.access_history)?client.access_history:[]).slice(0,5),signature=JSON.stringify(rows.map(x=>[x.at,x.action,x.user,x.detail]));
    if(history.dataset.ppSignature===signature)return;
    history.dataset.ppSignature=signature;
    history.innerHTML=`<div class="client-access-history-head"><div><h3>Histórico de ações no acesso</h3><p>Bloqueios, desbloqueios e liberações realizados pelo painel.</p></div><span>Últimas ${rows.length||0}</span></div>${rows.length?`<div class="client-access-history-list">${rows.map(item=>`<article><span class="client-access-action-dot"></span><div><strong>${esc(item.action||'Ação')}</strong><small>${esc(item.detail||'Sem observação')}</small></div><div><b>${esc(item.user||'Administrador')}</b><small>${esc(dateTime(item.at))}</small></div></article>`).join('')}</div>`:`<div class="client-access-history-empty">Nenhuma ação de acesso registrada a partir desta atualização.</div>`}`;
  }

  function render(id,result){
    const modal=document.querySelector('.client-status-modal');if(!modal||!result?.client)return false;
    const client=result.client,title=modal.querySelector('.modal-head h2,h2')?.textContent||'';if(client.name&&title&&!title.includes(client.name))return false;
    const columns=modal.querySelector('.client-status-columns');if(!columns)return false;
    hideLegacyDuplicates(modal);
    const summary=ensureSummary(columns),fin=financial(id),q=quality(result),lastOnline=client.last_online_at,lastOffline=client.last_offline_at,online=result.connectionState==='online'||result.online===true,uptime=online?displayValue(result?.uptime):'—';
    const recentTone=summary.querySelector('[data-pp-recent-tone]');setTone(recentTone,online?'good':result.connectionState==='offline'?'bad':'warn');if(recentTone)recentTone.textContent=online?'Online':result.connectionState==='offline'?'Offline':'Indisponível';
    setText(summary,'[data-pp-last-online]',lastOnline?dateTime(lastOnline):'Último online não registrado');setText(summary,'[data-pp-last-offline]',lastOffline?`Última queda detectada: ${dateTime(lastOffline)} ${relative(lastOffline)}`:'Nenhuma queda registrada pelo painel');
    const qualityTone=summary.querySelector('[data-pp-quality-tone]');setTone(qualityTone,q.tone);if(qualityTone)qualityTone.textContent=q.label;setText(summary,'[data-pp-latency]',q.latency);setText(summary,'[data-pp-quality-detail]',`Perda: ${q.loss} • ${q.detail}`);
    const nextText=fin.nextDate?`${dateOnly(fin.nextDate)}${Number.isFinite(fin.nextCents)?` • ${money(fin.nextCents)}`:''}`:'Nenhuma cobrança futura',financeMain=fin.overdueCount?`${fin.overdueCount} vencida${fin.overdueCount===1?'':'s'}`:'Em dia',financeDetail=fin.overdueCount?`${fin.overdueDays} dia${fin.overdueDays===1?'':'s'} de atraso`:`Próxima: ${nextText}`;
    const financeTone=summary.querySelector('[data-pp-finance-tone]');setTone(financeTone,fin.overdueCount?'bad':'good');if(financeTone)financeTone.textContent=fin.overdueCount?'Atenção':'Regular';setText(summary,'[data-pp-finance-main]',financeMain);setText(summary,'[data-pp-finance-detail]',financeDetail);
    const uptimeTone=summary.querySelector('[data-pp-uptime-tone]');setTone(uptimeTone,online?'good':'neutral');if(uptimeTone)uptimeTone.textContent=online?'Ativo':'Offline';setText(summary,'[data-pp-uptime]',uptime);setText(summary,'[data-pp-uptime-detail]',online?'Sessão ativa':'Sem sessão PPPoE ativa');
    renderConsumption(modal,columns,id,result);renderHistory(columns,client);modal.classList.add('pp-client-status-ready');
    document.dispatchEvent(new CustomEvent('pp:client-status-rendered',{detail:{id:Number(id)||0,result,modal}}));
    return true;
  }

  function scheduleRender(id,result){
    lastClientId=Number(id)||0;lastResult=result||lastResult;const sequence=++renderSequence;
    const tryRender=()=>{if(sequence!==renderSequence)return;render(lastClientId,lastResult)};
    tryRender();requestAnimationFrame(tryRender);setTimeout(tryRender,60);
  }

  api.clients.status=async id=>{
    const numericId=Number(id)||0;if(numericId!==lastClientId)liveSampleCount=0;
    const result=await originalStatus(id);liveSampleCount++;
    if(result?.client){const updated=await persistTransition(id,result);if(updated)result.client={...result.client,...updated}}
    scheduleRender(id,result);return result;
  };
  if(originalBlock)api.clients.block=async id=>{const saved=await originalBlock(id),updated=await appendAccessHistory(saved,'Bloqueio','Acesso PPPoE bloqueado pelo painel');scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
  if(originalUnblock)api.clients.unblock=async id=>{const saved=await originalUnblock(id),updated=await appendAccessHistory(saved,'Desbloqueio','Acesso PPPoE liberado pelo painel');scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
  if(originalTrust)api.clients.trustRelease=async(id,hours=48)=>{const saved=await originalTrust(id,hours),safeHours=Math.min(48,Math.max(1,Math.floor(Number(hours)||48))),updated=await appendAccessHistory(saved,'Liberação em confiança',`Liberação temporária por ${safeHours} hora${safeHours===1?'':'s'}`);scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
})();
