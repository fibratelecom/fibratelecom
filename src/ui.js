import { collections, dashboardStats, dateLabel, displayName, invoiceValue, money, statusKind, textValue } from './model.js';

const NAV = [
  ['dashboard','Central','⌂'],
  ['clients','Clientes','◉'],
  ['plans','Planos','◇'],
  ['invoices','Mensalidades','▤'],
  ['cashback','Cashback','◆'],
  ['routers','Rede','⌁'],
  ['tickets','Atendimento','◫'],
  ['employees','Equipe','◎'],
  ['history','Auditoria','◷'],
];

const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const status=(value)=>`<span class="status ${statusKind(value)}"><i></i>${escapeHtml(textValue(value))}</span>`;
const empty=(message)=>`<div class="empty"><span>○</span><strong>Nenhum registro</strong><p>${escapeHtml(message)}</p></div>`;
const clientName=(state,id)=>{const client=collections(state).clients.find((item)=>Number(item?.id)===Number(id));return client?displayName(client):String(id??'—')};

function table(headers,rows,emptyMessage){
  if(!rows.length)return empty(emptyMessage);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h)=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function metric(label,value,note,tone='default',icon='•'){
  return `<article class="metric ${tone}"><div class="metric-icon">${icon}</div><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div></article>`;
}

function loginTemplate(configured=true,message=''){
  return `<main class="login-page">
    <section class="login-visual">
      <div class="fiber-orb one"></div><div class="fiber-orb two"></div><div class="fiber-line l1"></div><div class="fiber-line l2"></div>
      <div class="login-visual-copy"><span class="brand-kicker">FIBRA+</span><h1>Operação de provedor<br><em>em um único lugar.</em></h1><p>Rede, cobrança, clientes e atendimento conectados ao mesmo núcleo operacional.</p><div class="visual-badges"><span>Cloudflare</span><span>Neon</span><span>MikroTik</span><span>Mercado Pago / Efí</span></div></div>
    </section>
    <section class="login-panel">
      <div class="login-box">
        <div class="login-brand"><span class="brand-symbol">F+</span><div><strong>Provedor Plus</strong><small>Centro de Operações</small></div></div>
        <div class="login-copy"><span class="section-label">ACESSO SEGURO</span><h2>${configured?'Entrar no sistema':'Configurar administrador'}</h2><p>${configured?'Use seu acesso para continuar a operação.':'Crie o primeiro administrador desta instalação.'}</p></div>
        <form id="login-form" class="form-stack">
          ${configured?'':'<label>Nome<input name="name" autocomplete="name" required minlength="2" placeholder="Nome do administrador"></label>'}
          <label>Usuário<input name="login" autocomplete="username" required minlength="3" placeholder="Seu usuário"></label>
          <label>Senha<input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="••••••••"></label>
          <p class="form-error" id="login-error">${escapeHtml(message)}</p>
          <button class="primary" type="submit">${configured?'Entrar no Provedor Plus':'Criar administrador'}</button>
        </form>
        <div class="login-foot"><span class="signal-dot"></span> Ambiente operacional protegido</div>
      </div>
    </section>
  </main>`;
}

function shellTemplate(user){
  const initial=escapeHtml((user?.name||'A').slice(0,1).toUpperCase());
  return `<div class="app-shell">
    <header class="command-header">
      <div class="command-top">
        <div class="brand-lockup"><span class="brand-symbol">F+</span><div><strong>Provedor Plus</strong><small>Centro de Operações ISP</small></div></div>
        <div class="command-status"><span class="live-pill"><i></i> Sistema online</span><span class="infra-pill">Cloudflare + Neon</span></div>
        <div class="command-user"><button class="round-action" id="refresh-button" type="button" title="Atualizar">↻</button><div class="avatar">${initial}</div><div class="user-meta"><strong>${escapeHtml(user?.name||'Administrador')}</strong><small>${escapeHtml(user?.role||'admin')}</small></div><button class="exit-button" id="logout-button" type="button">Sair</button></div>
      </div>
      <div class="command-title"><div><span class="section-label light">OPERAÇÃO</span><h1 id="page-title">Central</h1></div><p>Controle o provedor sem sair do mesmo fluxo operacional.</p></div>
    </header>
    <nav class="module-nav" id="module-nav">${NAV.map(([id,label,icon],index)=>`<button class="module-tab${index===0?' active':''}" data-view="${id}" type="button"><span>${icon}</span>${label}</button>`).join('')}</nav>
    <main class="workspace" id="content"><div class="loading-card"><span class="loader"></span>Carregando operação...</div></main>
    <footer class="app-footer"><span>Provedor Plus</span><span>•</span><span>Fibra+ Operações</span></footer>
  </div>`;
}

function dashboardView(state){
  const data=dashboardStats(state),clients=data.clients,invoices=data.invoices,routers=data.routers,tickets=data.tickets;
  const overdueValue=invoices.filter((x)=>/vencid|atras/.test(String(x?.status||'').toLowerCase())).reduce((s,x)=>s+invoiceValue(x),0);
  const onlineRouters=routers.filter((x)=>!/offline|erro|inativ/.test(String(x?.status||x?.last_status||'').toLowerCase())).length;
  const recentInvoices=[...invoices].slice(-6).reverse();
  const recentClients=[...clients].slice(-5).reverse();
  return `<section class="ops-hero">
    <div class="ops-hero-copy"><span class="section-label">CENTRAL OPERACIONAL</span><h2>O que precisa da sua atenção agora.</h2><p>Clientes, rede, cobrança e atendimento reunidos numa visão de operação, não apenas em relatórios.</p><div class="hero-actions"><button type="button" data-jump="clients">Ver clientes</button><button type="button" data-jump="routers" class="ghost">Abrir rede</button></div></div>
    <div class="network-core"><div class="core-ring"><div class="core-center"><strong>${data.activeClients}</strong><span>clientes<br>ativos</span></div></div><div class="core-legend"><span><i class="ok"></i>${onlineRouters}/${routers.length||0} roteadores disponíveis</span><span><i class="warn"></i>${data.overdue} mensalidades vencidas</span><span><i class="info"></i>${data.openTickets} chamados em aberto</span></div></div>
  </section>
  <section class="metric-grid">
    ${metric('Clientes ativos',String(data.activeClients),`${clients.length} cadastrados`,'purple','◉')}
    ${metric('Recebido',money(data.paidRevenue),'faturas confirmadas','dark','↗')}
    ${metric('Em atraso',money(overdueValue),`${data.overdue} cobranças`,'orange','!')}
    ${metric('Atendimento',String(data.openTickets),'chamados aguardando','light','◫')}
  </section>
  <section class="operation-grid">
    <article class="operation-card network"><div class="operation-head"><div><span>REDE</span><h3>MikroTik e conectividade</h3></div><button type="button" data-jump="routers">Abrir</button></div><div class="operation-number"><strong>${routers.length}</strong><span>roteadores cadastrados</span></div><div class="operation-foot">Status real de infraestrutura e acesso PPPoE centralizados.</div></article>
    <article class="operation-card finance"><div class="operation-head"><div><span>FINANCEIRO</span><h3>Mensalidades e recebimentos</h3></div><button type="button" data-jump="invoices">Abrir</button></div><div class="operation-number"><strong>${invoices.length}</strong><span>cobranças registradas</span></div><div class="operation-foot">Acompanhe pagamento, vencimento e origem bancária.</div></article>
    <article class="operation-card support"><div class="operation-head"><div><span>ATENDIMENTO</span><h3>Fila de chamados</h3></div><button type="button" data-jump="tickets">Abrir</button></div><div class="operation-number"><strong>${tickets.length}</strong><span>chamados registrados</span></div><div class="operation-foot">Histórico e suporte vinculados ao cliente.</div></article>
  </section>
  <section class="data-grid">
    <article class="data-panel"><div class="panel-head"><div><span>COBRANÇA</span><h3>Movimento recente</h3></div><button type="button" data-jump="invoices">Ver tudo</button></div>${table(['Referência','Cliente','Valor','Status'],recentInvoices.map((x)=>`<tr><td>${escapeHtml(x.reference||x.competency||x.id||'—')}</td><td>${escapeHtml(x.client_name||x.customer_name||clientName(state,x.client_id))}</td><td><strong>${money(invoiceValue(x))}</strong></td><td>${status(x.status)}</td></tr>`),'Nenhuma mensalidade encontrada.')}</article>
    <article class="data-panel"><div class="panel-head"><div><span>CLIENTES</span><h3>Cadastros recentes</h3></div><button type="button" data-jump="clients">Ver todos</button></div>${table(['Cliente','Plano','Venc.','Status'],recentClients.map((x)=>`<tr><td><strong>${escapeHtml(displayName(x))}</strong><small class="cell-note">${escapeHtml(x.contract_number||x.document||'')}</small></td><td>${escapeHtml(x.plan||x.plan_name||x.plan_id||'—')}</td><td>dia ${escapeHtml(x.due_day||'—')}</td><td>${status(x.status)}</td></tr>`),'Nenhum cliente encontrado.')}</article>
  </section>`;
}

function moduleHeader(kicker,title,description,aside=''){
  return `<section class="module-head"><div><span class="section-label">${escapeHtml(kicker)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${aside}</section>`;
}

function clientsView(state){
  const items=collections(state).clients,active=items.filter((x)=>!/cancel|inativ/.test(String(x?.status||'').toLowerCase())).length;
  return `${moduleHeader('BASE DE ASSINANTES','Clientes','Cadastro central de assinantes, contrato, plano e situação da conexão.',`<div class="module-summary"><strong>${items.length}</strong><span>clientes</span><strong>${active}</strong><span>ativos</span></div>`)}${table(['Cliente','Contrato','Plano','Contato','Vencimento','Status'],items.map((x)=>`<tr><td><strong>${escapeHtml(displayName(x))}</strong><small class="cell-note">${escapeHtml(x.document||'')}</small></td><td>${escapeHtml(x.contract_number||x.contract||'—')}</td><td>${escapeHtml(x.plan||x.plan_name||x.plan_id||'—')}</td><td>${escapeHtml(x.phone||x.whatsapp||x.email||'—')}</td><td>dia ${escapeHtml(x.due_day||'—')}</td><td>${status(x.status)}</td></tr>`),'Ainda não há clientes cadastrados.')}`;
}

function plansView(state){const items=collections(state).plans;return `${moduleHeader('CATÁLOGO COMERCIAL','Planos','Ofertas de internet vinculadas aos clientes e à cobrança.',`<div class="module-summary"><strong>${items.length}</strong><span>planos</span></div>`)}<section class="plan-grid">${items.length?items.map((x)=>`<article class="plan-card"><span class="plan-speed">${escapeHtml(x.speed||x.bandwidth||'Plano')}</span><h3>${escapeHtml(displayName(x))}</h3><strong>${money(x.price_cents!=null?Number(x.price_cents)/100:x.price||x.amount||0)}</strong><small>/ mês</small><div>${status(x.active===false?'Inativo':'Ativo')}</div></article>`).join(''):empty('Nenhum plano encontrado.')}</section>`}

function invoicesView(state){const items=collections(state).invoices;return `${moduleHeader('COBRANÇA','Mensalidades','Acompanhe vencimento, pagamento e origem da cobrança.',`<div class="module-summary"><strong>${items.length}</strong><span>mensalidades</span></div>`)}${table(['Referência','Cliente','Vencimento','Valor','Pagamento','Status'],items.map((x)=>`<tr><td><strong>${escapeHtml(x.reference||x.competency||x.id||'—')}</strong></td><td>${escapeHtml(x.client_name||x.customer_name||clientName(state,x.client_id))}</td><td>${escapeHtml(dateLabel(x.due_date||x.dueDate))}</td><td><strong>${money(invoiceValue(x))}</strong></td><td>${escapeHtml(x.payment_method||x.payment_provider||x.bank_provider||'—')}</td><td>${status(x.status)}</td></tr>`),'Nenhuma mensalidade encontrada.')}`}

function cashbackView(state){const items=collections(state).cashback;return `${moduleHeader('CARTEIRA DO CLIENTE','Cashback','Movimentações de crédito e débito refletidas na Área do Cliente.',`<div class="module-summary"><strong>${items.length}</strong><span>movimentos</span></div>`)}${table(['Data','Cliente','Descrição','Tipo','Valor'],[...items].reverse().map((x)=>`<tr><td>${escapeHtml(dateLabel(x.created_at||x.createdAt))}</td><td>${escapeHtml(x.client_name||clientName(state,x.client_id))}</td><td>${escapeHtml(x.reason||x.description||x.source||'—')}</td><td>${status(x.type||'—')}</td><td><strong>${money(x.amount_cents||0,true)}</strong></td></tr>`),'Nenhuma movimentação de cashback encontrada.')}`}

function routersView(state){const items=collections(state).routers;return `${moduleHeader('NÚCLEO DE REDE','MikroTik','Roteadores, disponibilidade e sincronização da rede do provedor.',`<div class="module-summary"><strong>${items.length}</strong><span>roteadores</span></div>`)}<section class="router-grid">${items.length?items.map((x)=>`<article class="router-card"><div class="router-top"><div class="router-icon">⌁</div>${status(x.status||x.last_status||(x.active===false?'Inativo':'Ativo'))}</div><h3>${escapeHtml(displayName(x))}</h3><p>${escapeHtml(x.host||x.address||x.ip||'Host não informado')} : ${escapeHtml(x.port||'—')}</p><div class="router-meta"><span>Última sincronização</span><strong>${escapeHtml(dateLabel(x.last_sync||x.updated_at))}</strong></div></article>`).join(''):empty('Nenhum roteador encontrado.')}</section>`}

function ticketsView(state){const items=collections(state).tickets;return `${moduleHeader('SUPORTE','Chamados','Fila de atendimento e histórico de solicitações dos clientes.',`<div class="module-summary"><strong>${items.length}</strong><span>chamados</span></div>`)}${table(['Chamado','Cliente','Assunto','Prioridade','Status'],items.map((x)=>`<tr><td><strong>#${escapeHtml(x.id||'—')}</strong></td><td>${escapeHtml(x.client_name||clientName(state,x.client_id))}</td><td>${escapeHtml(x.subject||x.title||x.description||'—')}</td><td>${escapeHtml(x.priority||'Normal')}</td><td>${status(x.status)}</td></tr>`),'Nenhum chamado encontrado.')}`}

function employeesView(items){return `${moduleHeader('CONTROLE DE ACESSO','Equipe','Usuários administrativos, perfis e acesso ao Provedor Plus.',`<div class="module-summary"><strong>${items.length}</strong><span>usuários</span></div>`)}${table(['Nome','Usuário','Perfil','Status'],items.map((x)=>`<tr><td><strong>${escapeHtml(x.name||'—')}</strong></td><td>${escapeHtml(x.email||'—')}</td><td>${escapeHtml(x.role||'—')}</td><td>${status(x.active===false?'Inativo':'Ativo')}</td></tr>`),'Nenhum funcionário encontrado.')}`}

function historyView(state){const items=collections(state).history;return `${moduleHeader('RASTREABILIDADE','Auditoria','Eventos disponíveis para acompanhar alterações e operações do sistema.',`<div class="module-summary"><strong>${items.length}</strong><span>eventos</span></div>`)}${table(['Data','Responsável','Ação','Registro'],[...items].reverse().map((x)=>`<tr><td>${escapeHtml(dateLabel(x.created_at||x.at||x.date))}</td><td>${escapeHtml(x.user_name||x.actor||x.created_by_name||'—')}</td><td><strong>${escapeHtml(x.action||x.type||'—')}</strong></td><td>${escapeHtml(x.description||x.entity||x.reference||'—')}</td></tr>`),'Nenhum evento de auditoria encontrado.')}`}

export function createPanel(root,{authApi,cloudApi}){
  let configured=true,user=null,state={},employees=[],currentView='dashboard';

  async function showLogin(message=''){
    root.innerHTML=loginTemplate(configured,message);
    const form=root.querySelector('#login-form');
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();const button=form.querySelector('button[type="submit"]'),errorNode=form.querySelector('#login-error'),data=new FormData(form);button.disabled=true;button.textContent='Aguarde...';errorNode.textContent='';
      try{const result=configured?await authApi.login(data.get('login'),data.get('password')):await authApi.setup(data.get('name'),data.get('login'),data.get('password'));user=result.user;await showShell();}
      catch(error){errorNode.textContent=error.message;button.disabled=false;button.textContent=configured?'Entrar no Provedor Plus':'Criar administrador';}
    });
  }

  async function loadState(){const result=await cloudApi.state();state=result?.state&&typeof result.state==='object'?result.state:{};return state;}
  async function loadEmployees(){if(user?.role!=='admin'){employees=[];return employees;}try{employees=await authApi.employees()||[];}catch{employees=[];}return employees;}

  function setView(view){currentView=view;root.querySelectorAll('[data-view]').forEach((button)=>button.classList.toggle('active',button.dataset.view===view));render();window.scrollTo({top:0,behavior:'smooth'});}
  function bindJumps(){root.querySelectorAll('[data-jump]').forEach((button)=>button.addEventListener('click',()=>setView(button.dataset.jump)));}

  function render(){const content=root.querySelector('#content'),title=root.querySelector('#page-title');if(!content)return;const label=NAV.find(([id])=>id===currentView)?.[1]||'Central';if(title)title.textContent=label;
    if(currentView==='dashboard')content.innerHTML=dashboardView(state);else if(currentView==='clients')content.innerHTML=clientsView(state);else if(currentView==='plans')content.innerHTML=plansView(state);else if(currentView==='invoices')content.innerHTML=invoicesView(state);else if(currentView==='cashback')content.innerHTML=cashbackView(state);else if(currentView==='routers')content.innerHTML=routersView(state);else if(currentView==='tickets')content.innerHTML=ticketsView(state);else if(currentView==='employees')content.innerHTML=employeesView(employees);else if(currentView==='history')content.innerHTML=historyView(state);bindJumps();}

  async function refresh(){const button=root.querySelector('#refresh-button');if(button)button.disabled=true;try{await Promise.all([loadState(),loadEmployees()]);render();}finally{if(button)button.disabled=false;}}

  async function showShell(){root.innerHTML=shellTemplate(user);root.querySelectorAll('[data-view]').forEach((button)=>button.addEventListener('click',()=>setView(button.dataset.view)));root.querySelector('#refresh-button').addEventListener('click',refresh);root.querySelector('#logout-button').addEventListener('click',async()=>{try{await authApi.logout();}finally{user=null;await showLogin();}});await refresh();}

  async function start(){const result=await authApi.status();configured=result?.configured!==false;if(result?.authenticated&&result?.user){user=result.user;await showShell();}else await showLogin();}
  return {start};
}
