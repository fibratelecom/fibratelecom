(()=>{
  if(window.__ProvedorPlusClientStatusEnhancementsInstalled)return;
  window.__ProvedorPlusClientStatusEnhancementsInstalled=true;

  const css=document.createElement('link');
  css.rel='stylesheet';css.href='/client-status-enhancements.css?v=1017-status1';css.id='pp-client-status-enhancements-css';
  if(!document.getElementById(css.id))document.head.appendChild(css);

  const api=window.provedor;
  if(!api?.clients?.status)return;
  const originalStatus=api.clients.status.bind(api.clients);
  const originalBlock=typeof api.clients.block==='function'?api.clients.block.bind(api.clients):null;
  const originalUnblock=typeof api.clients.unblock==='function'?api.clients.unblock.bind(api.clients):null;
  const originalTrust=typeof api.clients.trustRelease==='function'?api.clients.trustRelease.bind(api.clients):null;
  let lastResult=null,lastClientId=0,renderTimer=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pad=n=>String(n).padStart(2,'0');
  const dateTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
  const dateOnly=value=>{const d=new Date(`${String(value||'').slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?'—':`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`};
  const relative=value=>{const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const sec=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));if(sec<60)return `há ${sec}s`;const min=Math.floor(sec/60);if(min<60)return `há ${min} min`;const h=Math.floor(min/60);if(h<24)return `há ${h}h ${min%60}min`;const days=Math.floor(h/24);return `há ${days} dia${days===1?'':'s'}`};
  const money=cents=>Number.isFinite(Number(cents))?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100):'';
  const dayKey=value=>{const d=value instanceof Date?value:new Date(value);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};

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

  function financial(clientId){
    const current=state(),invoices=(Array.isArray(current?.invoices)?current.invoices:[]).filter(x=>invoiceClientId(x)===Number(clientId)&&!isPaid(x));
    const today=dayKey(new Date());
    const pending=invoices.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10));
    const overdue=pending.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10)<today).sort((a,b)=>String(a?.due_date||a?.dueDate||'').localeCompare(String(b?.due_date||b?.dueDate||'')));
    const future=pending.filter(x=>String(x?.due_date||x?.dueDate||'').slice(0,10)>=today).sort((a,b)=>String(a?.due_date||a?.dueDate||'').localeCompare(String(b?.due_date||b?.dueDate||'')));
    let overdueDays=0;
    if(overdue[0]){
      const due=new Date(`${String(overdue[0]?.due_date||overdue[0]?.dueDate).slice(0,10)}T12:00:00`),now=new Date();now.setHours(12,0,0,0);
      overdueDays=Math.max(0,Math.floor((now-due)/86400000));
    }
    const next=future[0]||(!overdue.length?pending[0]:null);
    return {overdueCount:overdue.length,overdueDays,next,nextDate:next?String(next?.due_date||next?.dueDate||'').slice(0,10):'',nextCents:next?invoiceCents(next):NaN};
  }

  function quality(result){
    if(result?.connectionState==='offline')return {label:'Sem conexão',tone:'bad',detail:'PPPoE offline',latency:'—',loss:'—'};
    if(result?.connectionState==='unavailable')return {label:'Indisponível',tone:'warn',detail:'MikroTik sem resposta',latency:'—',loss:'—'};
    if(result?.qualityAvailable){
      const latency=Math.max(0,Math.round(Number(result.latencyMs)||0)),loss=Math.max(0,Math.min(100,Number(result.packetLoss)||0));
      const raw=String(result.quality||'').toLowerCase();
      const tone=raw.includes('ruim')?'bad':raw.includes('aten')?'warn':'good';
      return {label:String(result.quality||'Boa'),tone,detail:'Ping pelo MikroTik',latency:`${latency} ms`,loss:`${Math.round(loss)}%`};
    }
    if(result?.connectionState==='online')return {label:'Conectado',tone:'good',detail:'Sessão PPPoE ativa',latency:'Não medido',loss:'Não medido'};
    return {label:'Não aplicável',tone:'neutral',detail:'Sem monitoramento PPPoE',latency:'—',loss:'—'};
  }

  async function persistTransition(id,result){
    const client=result?.client;if(!client)return client;
    const next=result?.connectionState;
    if(next!=='online'&&next!=='offline')return client;
    if(String(client.connection_last_state||'')===next)return client;
    const at=String(result?.checkedAt||new Date().toISOString());
    const patch={...client,connection_last_state:next,connection_last_checked_at:at};
    if(next==='online')patch.last_online_at=at;else patch.last_offline_at=at;
    try{return await api.clients.save(patch)}catch(error){console.error('Provedor Plus: não foi possível registrar a transição da conexão.',error);return patch}
  }

  async function appendAccessHistory(client,action,detail=''){
    if(!client?.id)return client;
    const current=Array.isArray(client.access_history)?client.access_history:[];
    const event={at:new Date().toISOString(),action:String(action),user:userName(),detail:String(detail||'')};
    const updated={...client,access_history:[event,...current].slice(0,20)};
    try{return await api.clients.save(updated)}catch(error){console.error('Provedor Plus: ação concluída, mas o histórico de acesso não pôde ser registrado.',error);return client}
  }

  function scheduleRender(id,result){lastClientId=Number(id)||0;lastResult=result||lastResult;clearTimeout(renderTimer);renderTimer=setTimeout(()=>render(lastClientId,lastResult),40)}

  function render(id,result){
    const modal=document.querySelector('.client-status-modal');if(!modal||!result?.client)return;
    const client=result.client,title=modal.querySelector('.modal-head h2,h2')?.textContent||'';
    if(client.name&&title&&!title.includes(client.name))return;
    const columns=modal.querySelector('.client-status-columns');if(!columns)return;
    const fin=financial(id),q=quality(result),lastOnline=client.last_online_at,lastOffline=client.last_offline_at;
    let summary=modal.querySelector('.client-extra-summary');
    if(!summary){summary=document.createElement('section');summary.className='client-extra-summary';columns.before(summary)}
    const nextText=fin.nextDate?`${dateOnly(fin.nextDate)}${Number.isFinite(fin.nextCents)?` • ${money(fin.nextCents)}`:''}`:'Nenhuma cobrança futura';
    const financeMain=fin.overdueCount?`${fin.overdueCount} vencida${fin.overdueCount===1?'':'s'}`:'Em dia';
    const financeDetail=fin.overdueCount?`${fin.overdueDays} dia${fin.overdueDays===1?'':'s'} de atraso`:`Próxima: ${nextText}`;
    summary.innerHTML=`
      <article class="client-extra-card">
        <div class="client-extra-title"><span>CONEXÃO RECENTE</span><b class="tone-${result.connectionState==='online'?'good':result.connectionState==='offline'?'bad':'warn'}">${esc(result.connectionState==='online'?'Online':result.connectionState==='offline'?'Offline':'Indisponível')}</b></div>
        <strong>${esc(lastOnline?dateTime(lastOnline):'Último online não registrado')}</strong>
        <small>${esc(lastOffline?`Última queda detectada: ${dateTime(lastOffline)} ${relative(lastOffline)}`:'Nenhuma queda registrada pelo painel')}</small>
      </article>
      <article class="client-extra-card">
        <div class="client-extra-title"><span>QUALIDADE DA CONEXÃO</span><b class="tone-${q.tone}">${esc(q.label)}</b></div>
        <strong>${esc(q.latency)} <em>latência</em></strong>
        <small>Perda: ${esc(q.loss)} • ${esc(q.detail)}</small>
      </article>
      <article class="client-extra-card">
        <div class="client-extra-title"><span>SITUAÇÃO FINANCEIRA</span><b class="tone-${fin.overdueCount?'bad':'good'}">${esc(fin.overdueCount?'Atenção':'Regular')}</b></div>
        <strong>${esc(financeMain)}</strong>
        <small>${esc(financeDetail)}</small>
      </article>`;

    let history=modal.querySelector('.client-access-history-panel');
    if(!history){history=document.createElement('section');history.className='client-access-history-panel';columns.after(history)}
    const rows=(Array.isArray(client.access_history)?client.access_history:[]).slice(0,5);
    history.innerHTML=`<div class="client-access-history-head"><div><h3>Histórico de ações no acesso</h3><p>Bloqueios, desbloqueios e liberações realizados pelo painel.</p></div><span>Últimas ${rows.length||0}</span></div>${rows.length?`<div class="client-access-history-list">${rows.map(item=>`<article><span class="client-access-action-dot"></span><div><strong>${esc(item.action||'Ação')}</strong><small>${esc(item.detail||'Sem observação')}</small></div><div><b>${esc(item.user||'Administrador')}</b><small>${esc(dateTime(item.at))}</small></div></article>`).join('')}</div>`:`<div class="client-access-history-empty">Nenhuma ação de acesso registrada a partir desta atualização.</div>`}`;
  }

  api.clients.status=async id=>{
    const result=await originalStatus(id);
    if(result?.client){const updated=await persistTransition(id,result);if(updated)result.client={...result.client,...updated}}
    scheduleRender(id,result);
    return result;
  };

  if(originalBlock)api.clients.block=async id=>{const saved=await originalBlock(id);const updated=await appendAccessHistory(saved,'Bloqueio','Acesso PPPoE bloqueado pelo painel');scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
  if(originalUnblock)api.clients.unblock=async id=>{const saved=await originalUnblock(id);const updated=await appendAccessHistory(saved,'Desbloqueio','Acesso PPPoE liberado pelo painel');scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};
  if(originalTrust)api.clients.trustRelease=async(id,hours=48)=>{const saved=await originalTrust(id,hours);const safeHours=Math.min(48,Math.max(1,Math.floor(Number(hours)||48)));const updated=await appendAccessHistory(saved,'Liberação em confiança',`Liberação temporária por ${safeHours} hora${safeHours===1?'':'s'}`);scheduleRender(id,{...(lastResult||{}),client:updated||saved,connectionState:lastResult?.connectionState});return updated||saved};

  const observer=new MutationObserver(()=>{const modal=document.querySelector('.client-status-modal');if(modal&&lastResult&&!modal.querySelector('.client-extra-summary'))scheduleRender(lastClientId,lastResult)});
  observer.observe(document.body,{childList:true,subtree:true});
})();
