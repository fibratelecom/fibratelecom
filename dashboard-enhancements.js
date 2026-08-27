(()=>{
  if(window.__ProvedorPlusDashboardEnhancementsInstalled)return;
  window.__ProvedorPlusDashboardEnhancementsInstalled=true;

  const css=document.createElement('link');
  css.rel='stylesheet';css.href='/dashboard-enhancements.css?v=1017-dashboard1';css.id='pp-dashboard-enhancements-css';
  if(!document.getElementById(css.id))document.head.appendChild(css);
  if(!document.getElementById('pp-dashboard-multirouter-style')){
    const style=document.createElement('style');style.id='pp-dashboard-multirouter-style';style.textContent=`
      .pp-multi-router-card{min-height:230px}
      .pp-router-monitor-list{display:grid;gap:12px;margin-top:15px;padding-top:14px;border-top:1px solid #edf1f0}
      .pp-router-monitor-item{min-width:0;padding:13px;background:#f7faf9;border:1px solid #e7efed;border-radius:10px}
      .pp-router-monitor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .pp-router-monitor-head>div{display:flex;flex-direction:column;min-width:0}
      .pp-router-monitor-head strong{color:#263d39;font-size:13px;line-height:1.35}
      .pp-router-monitor-head small{margin-top:3px;color:#718184;font-size:10px;line-height:1.4}
      .pp-router-monitor-head>b{flex:0 0 auto;padding:5px 8px;background:#eef4f2;border-radius:20px;font-size:10px;line-height:1.2}
      .pp-router-monitor-item .pp-live-trio{margin-top:11px;padding-top:11px}
      .pp-router-traffic-item .pp-traffic-gauges{margin-top:11px;padding-top:12px}
      .pp-traffic-unavailable{display:grid;place-items:center;min-height:86px;margin-top:11px;padding:12px;color:#718184;background:#fff;border:1px dashed #dbe6e3;border-radius:9px;font-size:11px;line-height:1.45;text-align:center}
      @media(max-width:720px){.pp-router-monitor-head{flex-direction:column}.pp-router-monitor-head>b{align-self:flex-start}}
    `;document.head.appendChild(style);
  }

  const api=window.provedor;
  if(!api)return;

  const pad=n=>String(n).padStart(2,'0');
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const state=()=>window.ProvedorPlusCloudState?.getState?.()||{};
  const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const monthKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const moneyCents=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(num(cents)/100);
  const moneyExact=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(cents)/100);
  const integer=value=>new Intl.NumberFormat('pt-BR').format(Math.max(0,Math.round(num(value))));
  const percent=value=>`${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(num(value))}%`;
  const formatBytes=value=>{let n=Math.max(0,num(value));const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++}return `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:i<2?0:1}).format(n)} ${units[i]}`};
  const formatBps=value=>{let n=Math.max(0,num(value));const units=['bps','Kbps','Mbps','Gbps'];let i=0;while(n>=1000&&i<units.length-1){n/=1000;i++}return `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:i<2?0:1}).format(n)} ${units[i]}`};
  const rateParts=value=>{let n=Math.max(0,num(value));const units=['bps','Kbps','Mbps','Gbps'];let i=0;while(n>=1000&&i<units.length-1){n/=1000;i++}return {value:new Intl.NumberFormat('pt-BR',{maximumFractionDigits:i<2?0:1}).format(n),unit:units[i]}};
  const statusText=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const pppoeUser=c=>String(c?.pppoe_username||c?.pppoe_user||'').trim();
  const isPppoe=c=>statusText(c?.connection_type)==='pppoe'&&Boolean(Number(c?.router_id))&&Boolean(pppoeUser(c));
  const isClosedTicket=t=>['fechado','fechada','resolvido','resolvida','concluido','concluida','closed','resolved'].includes(statusText(t?.status));
  const invoiceStatus=i=>statusText(i?.status);
  const isPaid=i=>['pago','paga','paid','recebido','recebida','quitado','quitada'].includes(invoiceStatus(i));
  const invoiceClientId=i=>Number(i?.client_id??i?.clientId??i?.customer_id)||0;
  const invoiceCents=i=>{for(const k of ['amount_cents','value_cents','total_cents','price_cents'])if(Number.isFinite(Number(i?.[k])))return Number(i[k]);for(const k of ['amount','value','total','price'])if(Number.isFinite(Number(i?.[k])))return Math.round(Number(i[k])*100);return 0};
  const invoicePaidAt=i=>i?.paid_at||i?.paidAt||i?.payment_date||i?.paid_date||i?.received_at||i?.receivedAt||'';
  const invoiceDue=i=>String(i?.due_date||i?.dueDate||'').slice(0,10);
  const createdAt=x=>x?.created_at||x?.createdAt||x?.updated_at||x?.updatedAt||'';
  const clientPlanCents=(client,plans)=>{const direct=Number(client?.plan_price_cents);if(Number.isFinite(direct)&&direct>0)return direct;const plan=(plans||[]).find(p=>Number(p?.id)===Number(client?.plan_id))||null;const cents=Number(plan?.price_cents??plan?.value_cents);if(Number.isFinite(cents)&&cents>0)return cents;const value=Number(plan?.price??plan?.value);return Number.isFinite(value)&&value>0?Math.round(value*100):0};

  let root=null,refreshing=false,prevRouterTraffic=new Map(),lastSampleAt=0,refreshTimer=null,observerTimer=null;

  function dashboardActive(){const active=document.querySelector('nav button.active,.sidebar nav button.active');const text=statusText(active?.textContent||'');return text.includes('dashboard')||text.includes('visao geral')}
  function navigate(label){const target=statusText(label);const buttons=[...document.querySelectorAll('nav button,.sidebar nav button')];const button=buttons.find(b=>statusText(b.textContent).includes(target));if(button)button.click()}
  function metric(id,icon,label,value,note){return `<article class="pp-dashboard-metric"><span class="pp-metric-icon pp-${id}">${icon}</span><div><small>${label}</small><strong id="pp-metric-${id}">${value}</strong><em id="pp-metric-${id}-note">${note}</em></div></article>`}
  function setText(id,value){const el=root?.querySelector(`#${id}`);if(el)el.textContent=String(value??'—')}

  function build(){
    const host=document.querySelector('.page-wrap');if(!host||!dashboardActive())return null;host.classList.add('pp-dashboard-host');
    root=host.querySelector(':scope > .pp-dashboard-v2');if(root)return root;
    root=document.createElement('section');root.className='pp-dashboard-v2';
    root.innerHTML=`
      <div class="pp-dashboard-heading"><div><span>GESTÃO EM TEMPO REAL</span><h1>Dashboard</h1><p>Visão rápida da operação, financeiro, clientes e rede.</p></div><div class="pp-dashboard-refresh"><span id="pp-dashboard-updated">Aguardando atualização</span><button type="button" id="pp-dashboard-refresh">↻ Atualizar</button></div></div>
      <div class="pp-dashboard-metrics">${metric('clients','●','Clientes ativos','—','Base atual')}${metric('revenue','R$','Receita mensal','—','Receita recorrente atual')}${metric('overdue','!','Inadimplência','—','Clientes com cobrança vencida')}${metric('tickets','◆','Chamados abertos','—','Pendências de atendimento')}</div>
      <div class="pp-dashboard-primary-grid">
        <article class="pp-dashboard-panel pp-revenue-panel"><div class="pp-panel-head"><div><h2>Receita recorrente</h2><p>Evolução dos recebimentos nos últimos 12 meses</p></div><select id="pp-dashboard-period"><option value="12">Últimos 12 meses</option><option value="6">Últimos 6 meses</option></select></div><div class="pp-revenue-total"><strong id="pp-revenue-total">—</strong><span id="pp-revenue-note">Receita recorrente atual</span></div><div class="pp-revenue-chart" id="pp-revenue-chart"><div class="pp-empty-inline">Carregando financeiro…</div></div></article>
        <article class="pp-dashboard-panel pp-health-panel"><div class="pp-panel-head"><div><h2>Saúde da rede</h2><p>Monitoramento dos MikroTik em tempo real</p></div><button type="button" data-nav="rede mikrotik">Ver rede ↗</button></div><div class="pp-health-main"><div><span>Disponibilidade agora</span><strong id="pp-health-percent">—</strong><small id="pp-health-detail">Aguardando MikroTik</small></div><div class="pp-health-ring" id="pp-health-ring"><b id="pp-health-ring-text">—</b><small>ONLINE</small></div></div><div class="pp-health-stats"><div><i class="good"></i><span>Online<b id="pp-health-online">—</b></span></div><div><i class="bad"></i><span>Offline<b id="pp-health-offline">—</b></span></div><div><i class="warn"></i><span>Alertas<b id="pp-health-alerts">—</b></span></div></div><div class="pp-router-mini-list" id="pp-router-mini-list"><div class="pp-empty-inline">Nenhum dado de rede carregado.</div></div></article>
      </div>
      <div class="pp-network-title"><div><span>MONITORAMENTO</span><h2>Rede e assinantes</h2></div><small>Cada MikroTik é monitorado separadamente pelo nome cadastrado.</small></div>
      <div class="pp-network-grid">
        <article class="pp-dashboard-panel pp-live-card pp-multi-router-card"><div class="pp-live-card-head"><span class="pp-live-icon">P</span><div><h3>PPPoE em tempo real</h3><p>Sessões separadas por servidor MikroTik</p></div></div><div class="pp-router-monitor-list" id="pp-pppoe-router-list"><div class="pp-empty-inline">Aguardando MikroTik…</div></div></article>
        <article class="pp-dashboard-panel pp-live-card pp-traffic-card pp-multi-router-card"><div class="pp-live-card-head"><span class="pp-live-icon">⇅</span><div><h3>Tráfego da rede</h3><p>Download e upload geral da interface de saída de cada MikroTik</p></div></div><div class="pp-router-monitor-list pp-router-traffic-list" id="pp-traffic-router-list"><div class="pp-empty-inline">Aguardando leitura das interfaces…</div></div></article>
      </div>
      <div class="pp-dashboard-secondary-grid"><article class="pp-dashboard-panel"><div class="pp-panel-head"><div><h2>Top clientes por consumo</h2><p id="pp-consumption-subtitle">Sessões PPPoE atuais</p></div></div><div class="pp-ranking" id="pp-consumption-ranking"><div class="pp-empty-inline">Aguardando sessões PPPoE…</div></div></article><article class="pp-dashboard-panel"><div class="pp-panel-head"><div><h2>Planos mais contratados</h2><p>Distribuição atual da base de clientes</p></div><button type="button" data-nav="planos">Ver planos ↗</button></div><div class="pp-ranking" id="pp-plan-ranking"><div class="pp-empty-inline">Carregando planos…</div></div></article></div>
      <div class="pp-dashboard-secondary-grid pp-dashboard-bottom-grid"><article class="pp-dashboard-panel"><div class="pp-panel-head"><div><h2>Clientes recentes</h2><p>Últimos cadastros e movimentações</p></div><button type="button" data-nav="clientes">Ver todos →</button></div><div class="pp-dashboard-list" id="pp-recent-clients"><div class="pp-empty-inline">Carregando clientes…</div></div></article><article class="pp-dashboard-panel"><div class="pp-panel-head"><div><h2>Pagamentos recentes</h2><p>Últimos recebimentos registrados</p></div><button type="button" data-nav="financeiro">Ver todos →</button></div><div class="pp-dashboard-list" id="pp-recent-payments"><div class="pp-empty-inline">Carregando pagamentos…</div></div></article></div>`;
    host.appendChild(root);root.querySelector('#pp-dashboard-refresh')?.addEventListener('click',()=>refresh(true));root.querySelector('#pp-dashboard-period')?.addEventListener('change',()=>renderRevenue(collectStateOnly()));root.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.nav||'')));setTimeout(()=>refresh(true),30);return root;
  }

  async function collectBase(){const current=state(),plans=Array.isArray(current?.plans)?current.plans:[],invoices=Array.isArray(current?.invoices)?current.invoices:[],tickets=Array.isArray(current?.tickets)?current.tickets:[];let clients=[];try{clients=typeof api?.clients?.list==='function'?await api.clients.list():Array.isArray(current?.clients)?current.clients:[]}catch{clients=Array.isArray(current?.clients)?current.clients:[]}return {current,plans,invoices,tickets,clients:Array.isArray(clients)?clients:[]}}
  function collectStateOnly(){const s=state();return {clients:Array.isArray(s?.clients)?s.clients:[],plans:Array.isArray(s?.plans)?s.plans:[],invoices:Array.isArray(s?.invoices)?s.invoices:[],tickets:Array.isArray(s?.tickets)?s.tickets:[]}}

  function renderMetrics(data){const {clients,plans,invoices,tickets}=data,today=dayKey(),active=clients.filter(c=>statusText(c?.status)==='ativo'),billable=clients.filter(c=>!['cancelado','cancelada','inativo','inativa'].includes(statusText(c?.status))),recurring=billable.reduce((sum,c)=>sum+clientPlanCents(c,plans),0),overdueIds=new Set(invoices.filter(i=>!isPaid(i)&&invoiceDue(i)&&invoiceDue(i)<today).map(invoiceClientId).filter(Boolean)),overduePct=billable.length?overdueIds.size/billable.length*100:0,openTickets=tickets.filter(t=>!isClosedTicket(t)).length;setText('pp-metric-clients',integer(active.length));setText('pp-metric-clients-note',`${integer(clients.length)} clientes cadastrados`);setText('pp-metric-revenue',moneyCents(recurring));setText('pp-metric-revenue-note','Mensalidade recorrente da base atual');setText('pp-metric-overdue',percent(overduePct));setText('pp-metric-overdue-note',`${integer(overdueIds.size)} cliente${overdueIds.size===1?'':'s'} com vencimento`);setText('pp-metric-tickets',integer(openTickets));setText('pp-metric-tickets-note',openTickets?'Pendências de atendimento':'Nenhum chamado pendente')}

  function renderRevenue(data){if(!root)return;const months=Math.max(1,Number(root.querySelector('#pp-dashboard-period')?.value)||12),now=new Date(),keys=[];for(let offset=months-1;offset>=0;offset--){const d=new Date(now.getFullYear(),now.getMonth()-offset,1);keys.push({key:monthKey(d),label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(d).replace('.','')})}const totals=new Map(keys.map(x=>[x.key,0]));for(const invoice of data.invoices||[]){if(!isPaid(invoice))continue;const at=invoicePaidAt(invoice);if(!at)continue;const d=new Date(at);if(Number.isNaN(d.getTime()))continue;const key=monthKey(d);if(totals.has(key))totals.set(key,totals.get(key)+invoiceCents(invoice))}const values=keys.map(x=>totals.get(x.key)||0),max=Math.max(...values,0),chart=root.querySelector('#pp-revenue-chart'),currentRecurring=(data.clients||[]).filter(c=>!['cancelado','cancelada','inativo','inativa'].includes(statusText(c?.status))).reduce((s,c)=>s+clientPlanCents(c,data.plans||[]),0);setText('pp-revenue-total',moneyExact(currentRecurring));setText('pp-revenue-note','Receita recorrente atual da base');if(!chart)return;if(!values.some(v=>v>0)){chart.innerHTML='<div class="pp-empty-inline">Ainda não há histórico de pagamentos suficiente para montar o gráfico.</div>';return}chart.innerHTML=keys.map((item,index)=>{const value=values[index],height=max?Math.max(6,Math.round(value/max*100)):0;return `<div class="pp-bar-column" title="${esc(item.label)}: ${esc(moneyExact(value))}"><div class="pp-bar-value" style="height:${height}%"><span>${esc(moneyCents(value))}</span></div><small>${esc(item.label)}</small></div>`}).join('')}

  function parseMemory(resource){const total=num(resource?.['total-memory']??resource?.total_memory),free=num(resource?.['free-memory']??resource?.free_memory);return total>0?Math.max(0,Math.min(100,(1-free/total)*100)):null}
  function parseCpu(resource){const n=Number(resource?.['cpu-load']??resource?.cpu_load);return Number.isFinite(n)?n:null}
  function activeBytes(row){if(Number.isFinite(Number(row?.downloadBytes))||Number.isFinite(Number(row?.uploadBytes)))return {down:Math.max(0,num(row?.downloadBytes)),up:Math.max(0,num(row?.uploadBytes))};const [a='0',b='0']=String(row?.bytes||'0/0').split('/');return {down:Math.max(0,num(a)),up:Math.max(0,num(b))}}

  async function collectLive(clients){
    let routers=[];
    try{routers=typeof api?.routers?.list==='function'?await api.routers.list():[]}catch(error){return {available:false,error:String(error?.message||error),routers:[],results:[],routerMetrics:[],sessions:[]}}
    routers=Array.isArray(routers)?routers:[];
    if(!routers.length){prevRouterTraffic=new Map();lastSampleAt=0;return {available:true,routers:[],results:[],routerMetrics:[],sessions:[],online:0,offline:0,alerts:0}}
    const settled=await Promise.all(routers.map(async router=>{try{const sync=await api.mikrotik.sync(router.id);return {ok:true,router,sync}}catch(error){return {ok:false,router,error:String(error?.message||error)}}}));
    const now=Date.now(),elapsed=lastSampleAt?Math.max(.25,(now-lastSampleAt)/1000):0,hadPrevious=Boolean(lastSampleAt),currentTraffic=new Map(),sessions=[];
    const routerMetrics=settled.map(item=>{
      const routerId=Number(item.router?.id)||0,routerName=item.router?.name||`MikroTik ${routerId||''}`.trim(),routerClients=clients.filter(c=>isPppoe(c)&&Number(c.router_id)===routerId),routerSessions=item.ok&&Array.isArray(item.sync?.pppActive)?item.sync.pppActive:[];
      if(item.ok)for(const row of routerSessions)sessions.push({routerId,routerName,...row});
      const onlineNames=new Set(routerSessions.map(s=>String(s?.name||'').trim()).filter(Boolean)),onlineClients=routerClients.filter(c=>onlineNames.has(pppoeUser(c))).length;
      let traffic={available:false,interface:'',downloadBps:null,uploadBps:null,reason:item.ok?'Interface de saída não identificada.':'MikroTik sem resposta.'};
      if(item.ok&&item.sync?.wanTraffic?.available){
        const wan=item.sync.wanTraffic,rx=Math.max(0,num(wan.rxBytes)),tx=Math.max(0,num(wan.txBytes)),prev=prevRouterTraffic.get(routerId);
        currentTraffic.set(routerId,{rx,tx});
        if(hadPrevious&&prev&&elapsed&&rx>=prev.rx&&tx>=prev.tx){traffic={available:true,interface:String(wan.interface||''),downloadBps:Math.round((rx-prev.rx)*8/elapsed),uploadBps:Math.round((tx-prev.tx)*8/elapsed),reason:''}}
        else traffic={available:true,interface:String(wan.interface||''),downloadBps:null,uploadBps:null,reason:'Coletando segunda leitura.'};
      }else if(item.ok&&item.sync?.wanTraffic){traffic.reason=String(item.sync.wanTraffic.reason||traffic.reason)}
      return {...item,routerId,routerName,pppoe:{registered:routerClients.length,online:onlineClients,offline:Math.max(0,routerClients.length-onlineClients),activeSessions:routerSessions.length},traffic};
    });
    prevRouterTraffic=currentTraffic;lastSampleAt=now;
    const online=settled.filter(x=>x.ok).length,offline=routers.length-online,alerts=settled.filter(x=>x.ok&&(x.sync?.warning||parseCpu(x.sync?.resource)>=90||(parseMemory(x.sync?.resource)!=null&&parseMemory(x.sync?.resource)>=90))).length;
    return {available:true,routers,results:settled,routerMetrics,sessions,online,offline,alerts};
  }

  function peakStore(routerId,down,up){const key=`pp_dashboard_peak_${routerId}_${dayKey()}`;let value={down:0,up:0};try{value={...value,...JSON.parse(localStorage.getItem(key)||'{}')}}catch{}if(Number.isFinite(down))value.down=Math.max(num(value.down),down);if(Number.isFinite(up))value.up=Math.max(num(value.up),up);try{localStorage.setItem(key,JSON.stringify(value))}catch{}return value}
  function trafficRing(value,peak,kind){const parts=rateParts(value),deg=peak>0?Math.max(0,Math.min(360,value/peak*360)):0;return `<div class="pp-traffic-gauge-item"><div class="pp-traffic-ring ${kind==='up'?'pp-traffic-ring-up':''}" style="--pp-ring-deg:${deg}deg"><b>${esc(parts.value)}</b><small>${esc(parts.unit)}</small></div><span>${kind==='up'?'Upload':'Download'} atual</span></div>`}

  function renderRouterMonitors(live){
    const pppTarget=root?.querySelector('#pp-pppoe-router-list'),trafficTarget=root?.querySelector('#pp-traffic-router-list');
    const metrics=Array.isArray(live?.routerMetrics)?live.routerMetrics:[];
    if(pppTarget){
      if(!metrics.length)pppTarget.innerHTML='<div class="pp-empty-inline">Nenhum MikroTik cadastrado.</div>';
      else pppTarget.innerHTML=metrics.map(item=>`<article class="pp-router-monitor-item"><div class="pp-router-monitor-head"><div><strong>${esc(item.routerName)}</strong><small>${item.ok?'RouterOS conectado':esc(item.error||'Sem resposta')}</small></div><b class="${item.ok?'good':'bad'}">${item.ok?'Ao vivo':'Offline'}</b></div><div class="pp-live-trio"><div><span>Sessões ativas</span><strong>${item.ok?integer(item.pppoe.activeSessions):'—'}</strong></div><div><span>Clientes online</span><strong>${item.ok?integer(item.pppoe.online):'—'}</strong></div><div><span>Clientes vinculados</span><strong>${integer(item.pppoe.registered)}</strong></div></div></article>`).join('');
    }
    if(trafficTarget){
      if(!metrics.length)trafficTarget.innerHTML='<div class="pp-empty-inline">Nenhum MikroTik cadastrado.</div>';
      else trafficTarget.innerHTML=metrics.map(item=>{
        const traffic=item.traffic||{};
        if(!item.ok)return `<article class="pp-router-monitor-item pp-router-traffic-item"><div class="pp-router-monitor-head"><div><strong>${esc(item.routerName)}</strong><small>MikroTik sem resposta</small></div><b class="bad">Offline</b></div><div class="pp-traffic-unavailable">Tráfego indisponível</div></article>`;
        if(!traffic.available)return `<article class="pp-router-monitor-item pp-router-traffic-item"><div class="pp-router-monitor-head"><div><strong>${esc(item.routerName)}</strong><small>${esc(traffic.interface?`Interface ${traffic.interface}`:'Interface de saída')}</small></div><b class="warn">Indisponível</b></div><div class="pp-traffic-unavailable">${esc(traffic.reason||'Não foi possível identificar a interface de saída do MikroTik.')}</div></article>`;
        if(traffic.downloadBps==null||traffic.uploadBps==null)return `<article class="pp-router-monitor-item pp-router-traffic-item"><div class="pp-router-monitor-head"><div><strong>${esc(item.routerName)}</strong><small>Interface ${esc(traffic.interface||'WAN')}</small></div><b>Coletando</b></div><div class="pp-traffic-gauges"><div class="pp-traffic-gauge-item"><div class="pp-traffic-ring" style="--pp-ring-deg:65deg"><b>…</b><small>COLETANDO</small></div><span>Download atual</span></div><div class="pp-traffic-gauge-item"><div class="pp-traffic-ring pp-traffic-ring-up" style="--pp-ring-deg:65deg"><b>…</b><small>COLETANDO</small></div><span>Upload atual</span></div></div><small class="pp-traffic-peak">Aguardando segunda leitura do MikroTik.</small></article>`;
        const peak=peakStore(item.routerId,traffic.downloadBps,traffic.uploadBps);
        return `<article class="pp-router-monitor-item pp-router-traffic-item"><div class="pp-router-monitor-head"><div><strong>${esc(item.routerName)}</strong><small>Interface ${esc(traffic.interface||'WAN')}</small></div><b class="good">Ao vivo</b></div><div class="pp-traffic-gauges">${trafficRing(traffic.downloadBps,peak.down,'down')}${trafficRing(traffic.uploadBps,peak.up,'up')}</div><small class="pp-traffic-peak">Pico observado hoje: ↓ ${esc(formatBps(peak.down))} • ↑ ${esc(formatBps(peak.up))}</small></article>`;
      }).join('');
    }
  }

  function renderLive(live,clients){
    if(!root)return;
    if(!live?.available){['pp-health-percent','pp-health-ring-text','pp-health-online','pp-health-offline','pp-health-alerts'].forEach(id=>setText(id,'Indisponível'));setText('pp-health-detail','Não foi possível consultar os MikroTik');const p=root.querySelector('#pp-pppoe-router-list'),t=root.querySelector('#pp-traffic-router-list');if(p)p.innerHTML='<div class="pp-empty-inline">MikroTik indisponível.</div>';if(t)t.innerHTML='<div class="pp-empty-inline">Tráfego indisponível.</div>';return}
    const total=live.routers.length,pct=total?live.online/total*100:null;
    setText('pp-health-percent',pct==null?'Sem MikroTik':percent(pct));setText('pp-health-ring-text',pct==null?'—':`${Math.round(pct)}%`);setText('pp-health-detail',total?`${live.online} de ${total} roteador${total===1?'':'es'} respondendo`:'Nenhum MikroTik cadastrado');setText('pp-health-online',integer(live.online));setText('pp-health-offline',integer(live.offline));setText('pp-health-alerts',integer(live.alerts));const ring=root.querySelector('#pp-health-ring');if(ring)ring.style.setProperty('--pp-ring-deg',`${Math.max(0,Math.min(360,(pct||0)*3.6))}deg`);
    const list=root.querySelector('#pp-router-mini-list');if(list){if(!total)list.innerHTML='<div class="pp-empty-inline">Nenhum MikroTik cadastrado.</div>';else list.innerHTML=live.results.slice(0,4).map(item=>{const cpu=item.ok?parseCpu(item.sync?.resource):null,ram=item.ok?parseMemory(item.sync?.resource):null;return `<article><span class="pp-router-dot ${item.ok?(item.sync?.warning?'warn':'good'):'bad'}"></span><div><strong>${esc(item.router?.name||'MikroTik')}</strong><small>${item.ok?`CPU ${cpu==null?'—':`${Math.round(cpu)}%`} • RAM ${ram==null?'—':`${Math.round(ram)}%`}`:esc(item.error||'Sem resposta')}</small></div><b class="${item.ok?'good':'bad'}">${item.ok?'Online':'Offline'}</b></article>`}).join('')}
    renderRouterMonitors(live);renderConsumption(live,clients);
  }

  function monthlyUsage(client){const candidates=[client?.monthly_usage_bytes,client?.month_usage_bytes,client?.traffic_month_bytes,client?.usage_month_bytes];for(const value of candidates)if(Number.isFinite(Number(value))&&Number(value)>0)return Number(value);const current=client?.traffic?.current;if(current&&String(current.month||'')===monthKey())return num(current.download_bytes)+num(current.upload_bytes);return 0}
  function renderConsumption(live,clients){const target=root?.querySelector('#pp-consumption-ranking');if(!target)return;const byClient=[];let usesMonthly=false;for(const client of clients){let bytes=monthlyUsage(client);if(bytes>0)usesMonthly=true;else if(isPppoe(client)){const session=live.sessions.find(s=>Number(s.routerId)===Number(client.router_id)&&String(s.name||'').trim()===pppoeUser(client));if(session){const pair=activeBytes(session);bytes=pair.down+pair.up}}if(bytes>0)byClient.push({client,bytes})}byClient.sort((a,b)=>b.bytes-a.bytes);const rows=byClient.slice(0,5),max=rows[0]?.bytes||0;setText('pp-consumption-subtitle',usesMonthly?'Consumo mensal registrado pelo sistema':'Consumo das sessões PPPoE atuais');if(!rows.length){target.innerHTML='<div class="pp-empty-inline">Nenhum consumo disponível neste momento.</div>';return}target.innerHTML=rows.map((row,index)=>`<article><span class="pp-rank-number">${index+1}</span><div class="pp-rank-main"><div><strong>${esc(row.client?.name||pppoeUser(row.client)||'Cliente')}</strong><small>${esc(row.client?.plan_name||row.client?.plan||'Sem plano')}</small></div><i><b style="width:${max?Math.max(5,row.bytes/max*100):0}%"></b></i></div><strong class="pp-rank-value">${esc(formatBytes(row.bytes))}</strong></article>`).join('')}

  function renderPlans(data){const target=root?.querySelector('#pp-plan-ranking');if(!target)return;const plans=data.plans||[],clients=data.clients||[],counts=new Map();for(const client of clients){const id=Number(client?.plan_id)||0,name=String(client?.plan_name||client?.plan||'Sem plano').trim()||'Sem plano',key=id?`id:${id}`:`name:${name}`;counts.set(key,{id,name,count:(counts.get(key)?.count||0)+1})}const rows=[...counts.values()].sort((a,b)=>b.count-a.count).slice(0,5),max=rows[0]?.count||0,total=Math.max(1,clients.length);if(!rows.length){target.innerHTML='<div class="pp-empty-inline">Nenhum plano contratado ainda.</div>';return}target.innerHTML=rows.map((row,index)=>{const plan=row.id?plans.find(p=>Number(p?.id)===row.id):null,name=plan?.name||row.name;return `<article><span class="pp-rank-number">${index+1}</span><div class="pp-rank-main"><div><strong>${esc(name)}</strong><small>${percent(row.count/total*100)} da base</small></div><i><b style="width:${max?Math.max(5,row.count/max*100):0}%"></b></i></div><strong class="pp-rank-value">${integer(row.count)}</strong></article>`}).join('')}

  function renderRecent(data){const clientsTarget=root?.querySelector('#pp-recent-clients'),paymentsTarget=root?.querySelector('#pp-recent-payments');if(clientsTarget){const clients=[...data.clients].sort((a,b)=>new Date(createdAt(b)||0)-new Date(createdAt(a)||0)).slice(0,5);clientsTarget.innerHTML=clients.length?clients.map(c=>`<article><span class="pp-list-avatar">${esc(String(c?.name||'?').trim().slice(0,1).toUpperCase())}</span><div><strong>${esc(c?.name||'Cliente')}</strong><small>${esc(c?.contract_number||c?.document||'Sem contrato informado')}</small></div><b>${esc(c?.status||'—')}</b></article>`).join(''):'<div class="pp-empty-inline">Nenhum cliente cadastrado.</div>'}if(paymentsTarget){const payments=data.invoices.filter(isPaid).sort((a,b)=>new Date(invoicePaidAt(b)||0)-new Date(invoicePaidAt(a)||0)).slice(0,5),clientsById=new Map(data.clients.map(c=>[Number(c.id),c]));paymentsTarget.innerHTML=payments.length?payments.map(i=>{const client=clientsById.get(invoiceClientId(i));let paidLabel='Data não informada';const at=invoicePaidAt(i);if(at){const d=new Date(at);if(!Number.isNaN(d.getTime()))paidLabel=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d)}return `<article><span class="pp-payment-check">✓</span><div><strong>${esc(client?.name||i?.client_name||'Pagamento recebido')}</strong><small>${esc(paidLabel)}</small></div><b>${esc(moneyExact(invoiceCents(i)))}</b></article>`}).join(''):'<div class="pp-empty-inline">Nenhum pagamento registrado.</div>'}}

  async function refresh(){if(refreshing||!dashboardActive())return;const view=build();if(!view)return;refreshing=true;const button=root.querySelector('#pp-dashboard-refresh');if(button)button.disabled=true;try{const data=await collectBase();renderMetrics(data);renderRevenue(data);renderPlans(data);renderRecent(data);const live=await collectLive(data.clients);renderLive(live,data.clients);const now=new Date();setText('pp-dashboard-updated',`Atualizado às ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)}catch(error){console.error('Provedor Plus: falha ao atualizar o Dashboard.',error);setText('pp-dashboard-updated','Falha ao atualizar alguns indicadores')}finally{refreshing=false;if(button)button.disabled=false}}

  function schedule(){clearTimeout(observerTimer);observerTimer=setTimeout(()=>{if(dashboardActive()){build();if(!refreshTimer)refreshTimer=setInterval(refresh,15000)}else{document.querySelector('.page-wrap')?.classList.remove('pp-dashboard-host');root=null}},80)}
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
