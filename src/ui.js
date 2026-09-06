import { collections, dashboardStats, dateLabel, displayName, invoiceValue, money, statusKind, textValue } from './model.js';

const NAV = [
  ['dashboard', 'Visão geral', '⌂'],
  ['clients', 'Clientes', '◉'],
  ['plans', 'Planos', '◇'],
  ['invoices', 'Mensalidades', '▤'],
  ['cashback', 'Cashback', '◆'],
  ['routers', 'MikroTik', '⌁'],
  ['tickets', 'Chamados', '◫'],
  ['employees', 'Funcionários', '◎'],
  ['history', 'Histórico', '◷'],
];

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const status = (value) => `<span class="status ${statusKind(value)}">${escapeHtml(textValue(value))}</span>`;
const empty = (message) => `<div class="empty"><span>○</span><strong>Nenhum registro</strong><p>${escapeHtml(message)}</p></div>`;

function table(headers, rows, emptyMessage) {
  if (!rows.length) return empty(emptyMessage);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function loginTemplate(configured = true, message = '') {
  return `<main class="login-page">
    <section class="login-card">
      <div class="login-brand"><span class="brand-mark">F+</span><div><strong>Provedor Plus</strong><small>Novo painel administrativo</small></div></div>
      <div class="login-copy"><span class="eyebrow">Fibra+</span><h1>${configured ? 'Bem-vindo de volta' : 'Configurar administrador'}</h1><p>${configured ? 'Entre com seu usuário para acessar a operação da rede.' : 'Crie o primeiro acesso administrativo do novo painel.'}</p></div>
      <form id="login-form" class="form-stack">
        ${configured ? '' : '<label>Nome<input name="name" autocomplete="name" required minlength="2" placeholder="Nome do administrador" /></label>'}
        <label>Usuário<input name="login" autocomplete="username" required minlength="3" placeholder="Seu usuário" /></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="••••••••" /></label>
        <p class="form-error" id="login-error">${escapeHtml(message)}</p>
        <button class="primary" type="submit">${configured ? 'Entrar no painel' : 'Criar administrador'}</button>
      </form>
      <footer>Arquitetura limpa · Neon preservado · Área do Cliente protegida</footer>
    </section>
  </main>`;
}

function shellTemplate(user) {
  return `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><span class="brand-mark">F+</span><div><strong>Provedor Plus</strong><small>Painel administrativo</small></div></div>
      <nav>${NAV.map(([id, label, icon], index) => `<button class="nav-item${index === 0 ? ' active' : ''}" data-view="${id}" type="button"><span>${icon}</span>${label}</button>`).join('')}</nav>
      <div class="sidebar-foot"><span class="online-dot"></span><div><strong>Sistema conectado</strong><small>Dados via Neon</small></div></div>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <button class="menu-button" id="menu-button" type="button" aria-label="Abrir menu">☰</button>
        <div><span class="eyebrow">Fibra+</span><h1 id="page-title">Visão geral</h1></div>
        <div class="top-actions"><button class="icon-button" id="refresh-button" type="button" title="Atualizar dados">↻</button><div class="user-chip"><span>${escapeHtml((user?.name || 'A').slice(0,1).toUpperCase())}</span><div><strong>${escapeHtml(user?.name || 'Administrador')}</strong><small>${escapeHtml(user?.role || 'admin')}</small></div></div><button class="logout" id="logout-button" type="button">Sair</button></div>
      </header>
      <main class="content" id="content"><div class="loading-card">Carregando dados...</div></main>
    </section>
  </div>`;
}

function dashboardView(state) {
  const data = dashboardStats(state);
  const recentInvoices = [...data.invoices].slice(-6).reverse();
  const recentClients = [...data.clients].slice(-5).reverse();
  return `<section class="page-head"><div><span class="eyebrow">Operação em tempo real</span><h2>Resumo do provedor</h2><p>Uma visão limpa do que precisa de atenção hoje.</p></div><span class="clean-badge">Base nova</span></section>
  <section class="stats">
    <article class="stat-card"><span>Clientes ativos</span><strong>${data.activeClients}</strong><small>${data.clients.length} cadastrados</small></article>
    <article class="stat-card"><span>Mensalidades vencidas</span><strong>${data.overdue}</strong><small>necessitam acompanhamento</small></article>
    <article class="stat-card"><span>Chamados abertos</span><strong>${data.openTickets}</strong><small>fila atual de atendimento</small></article>
    <article class="stat-card featured"><span>Receita recebida</span><strong>${money(data.paidRevenue)}</strong><small>faturas marcadas como pagas</small></article>
  </section>
  <section class="grid-two">
    <article class="panel-card"><div class="panel-title"><div><span>Financeiro</span><h3>Mensalidades recentes</h3></div></div>${table(['Referência','Cliente','Valor','Status'], recentInvoices.map((item) => `<tr><td>${escapeHtml(item.reference || item.competency || item.id || '—')}</td><td>${escapeHtml(item.client_name || item.customer_name || item.client_id || '—')}</td><td>${money(invoiceValue(item))}</td><td>${status(item.status)}</td></tr>`), 'Nenhuma mensalidade encontrada.')}</article>
    <article class="panel-card"><div class="panel-title"><div><span>Clientes</span><h3>Cadastros recentes</h3></div></div>${table(['Cliente','Plano','Vencimento','Status'], recentClients.map((item) => `<tr><td><strong>${escapeHtml(displayName(item))}</strong><small class="cell-note">${escapeHtml(item.document || item.contract_number || '')}</small></td><td>${escapeHtml(item.plan || item.plan_name || item.plan_id || '—')}</td><td>${escapeHtml(item.due_day || '—')}</td><td>${status(item.status)}</td></tr>`), 'Nenhum cliente encontrado.')}</article>
  </section>`;
}

function clientsView(state) {
  const items = collections(state).clients;
  return `<section class="page-head"><div><span class="eyebrow">Cadastro central</span><h2>Clientes</h2><p>${items.length} clientes encontrados na base atual.</p></div></section>${table(['Cliente','Contrato','Plano','Contato','Status'], items.map((item) => `<tr><td><strong>${escapeHtml(displayName(item))}</strong><small class="cell-note">${escapeHtml(item.document || '')}</small></td><td>${escapeHtml(item.contract_number || item.contract || '—')}</td><td>${escapeHtml(item.plan || item.plan_name || item.plan_id || '—')}</td><td>${escapeHtml(item.phone || item.whatsapp || item.email || '—')}</td><td>${status(item.status)}</td></tr>`), 'Ainda não há clientes cadastrados.')}`;
}

function plansView(state) {
  const items = collections(state).plans;
  return `<section class="page-head"><div><span class="eyebrow">Catálogo</span><h2>Planos</h2><p>Planos existentes preservados do banco atual.</p></div></section>${table(['Plano','Velocidade','Valor','Status'], items.map((item) => `<tr><td><strong>${escapeHtml(displayName(item))}</strong></td><td>${escapeHtml(item.speed || item.bandwidth || '—')}</td><td>${money(item.price_cents != null ? Number(item.price_cents)/100 : item.price || item.amount || 0)}</td><td>${status(item.active === false ? 'Inativo' : 'Ativo')}</td></tr>`), 'Nenhum plano encontrado.')}`;
}

function invoicesView(state) {
  const items = collections(state).invoices;
  return `<section class="page-head"><div><span class="eyebrow">Financeiro</span><h2>Mensalidades</h2><p>Leitura direta das mensalidades existentes.</p></div></section>${table(['Referência','Cliente','Vencimento','Valor','Pagamento','Status'], items.map((item) => `<tr><td>${escapeHtml(item.reference || item.competency || item.id || '—')}</td><td>${escapeHtml(item.client_name || item.customer_name || item.client_id || '—')}</td><td>${escapeHtml(dateLabel(item.due_date || item.dueDate))}</td><td>${money(invoiceValue(item))}</td><td>${escapeHtml(item.payment_method || item.payment_provider || '—')}</td><td>${status(item.status)}</td></tr>`), 'Nenhuma mensalidade encontrada.')}`;
}

function cashbackView(state) {
  const items = collections(state).cashback;
  return `<section class="page-head"><div><span class="eyebrow">Carteira</span><h2>Cashback</h2><p>Extrato das movimentações já registradas.</p></div></section>${table(['Data','Cliente','Descrição','Tipo','Valor'], [...items].reverse().map((item) => `<tr><td>${escapeHtml(dateLabel(item.created_at || item.createdAt))}</td><td>${escapeHtml(item.client_name || item.client_id || '—')}</td><td>${escapeHtml(item.reason || item.description || item.source || '—')}</td><td>${status(item.type || '—')}</td><td>${money(item.amount_cents || 0, true)}</td></tr>`), 'Nenhuma movimentação de cashback encontrada.')}`;
}

function routersView(state) {
  const items = collections(state).routers;
  return `<section class="page-head"><div><span class="eyebrow">Rede</span><h2>MikroTik</h2><p>Roteadores cadastrados preservados na base.</p></div></section>${table(['Roteador','Host','Porta','Última sincronização','Status'], items.map((item) => `<tr><td><strong>${escapeHtml(displayName(item))}</strong></td><td>${escapeHtml(item.host || item.address || item.ip || '—')}</td><td>${escapeHtml(item.port || '—')}</td><td>${escapeHtml(dateLabel(item.last_sync || item.updated_at))}</td><td>${status(item.status || (item.enabled === false ? 'Inativo' : 'Ativo'))}</td></tr>`), 'Nenhum roteador encontrado.')}`;
}

function ticketsView(state) {
  const items = collections(state).tickets;
  return `<section class="page-head"><div><span class="eyebrow">Atendimento</span><h2>Chamados</h2><p>Histórico de suporte preservado.</p></div></section>${table(['Chamado','Cliente','Assunto','Prioridade','Status'], items.map((item) => `<tr><td>#${escapeHtml(item.id || '—')}</td><td>${escapeHtml(item.client_name || item.client_id || '—')}</td><td>${escapeHtml(item.subject || item.title || item.description || '—')}</td><td>${escapeHtml(item.priority || 'Normal')}</td><td>${status(item.status)}</td></tr>`), 'Nenhum chamado encontrado.')}`;
}

function historyView(state) {
  const items = collections(state).history;
  return `<section class="page-head"><div><span class="eyebrow">Auditoria</span><h2>Histórico</h2><p>Eventos disponíveis no estado atual.</p></div></section>${table(['Data','Responsável','Ação','Registro'], [...items].reverse().map((item) => `<tr><td>${escapeHtml(dateLabel(item.created_at || item.at || item.date))}</td><td>${escapeHtml(item.user_name || item.actor || item.created_by_name || '—')}</td><td>${escapeHtml(item.action || item.type || '—')}</td><td>${escapeHtml(item.description || item.entity || item.reference || '—')}</td></tr>`), 'Nenhum evento de auditoria encontrado.')}`;
}

function employeesView(items) {
  return `<section class="page-head"><div><span class="eyebrow">Acessos</span><h2>Funcionários</h2><p>Usuários administrativos e permissões.</p></div></section>${table(['Nome','Usuário','Perfil','Status'], items.map((item) => `<tr><td><strong>${escapeHtml(item.name || '—')}</strong></td><td>${escapeHtml(item.email || '—')}</td><td>${escapeHtml(item.role || '—')}</td><td>${status(item.active === false ? 'Inativo' : 'Ativo')}</td></tr>`), 'Nenhum funcionário encontrado.')}`;
}

export function createPanel(root, { authApi, cloudApi }) {
  let configured = true;
  let user = null;
  let state = {};
  let employees = [];
  let currentView = 'dashboard';

  async function showLogin(message = '') {
    root.innerHTML = loginTemplate(configured, message);
    const form = root.querySelector('#login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const errorNode = form.querySelector('#login-error');
      const data = new FormData(form);
      button.disabled = true;
      button.textContent = 'Aguarde...';
      errorNode.textContent = '';
      try {
        const result = configured
          ? await authApi.login(data.get('login'), data.get('password'))
          : await authApi.setup(data.get('name'), data.get('login'), data.get('password'));
        user = result.user;
        await showShell();
      } catch (error) {
        errorNode.textContent = error.message;
        button.disabled = false;
        button.textContent = configured ? 'Entrar no painel' : 'Criar administrador';
      }
    });
  }

  async function loadState() {
    const result = await cloudApi.state();
    state = result?.state && typeof result.state === 'object' ? result.state : {};
    return state;
  }

  async function loadEmployees() {
    if (user?.role !== 'admin') return [];
    try { employees = await authApi.employees() || []; } catch { employees = []; }
    return employees;
  }

  function render() {
    const content = root.querySelector('#content');
    const title = root.querySelector('#page-title');
    if (!content) return;
    const label = NAV.find(([id]) => id === currentView)?.[1] || 'Visão geral';
    if (title) title.textContent = label;
    if (currentView === 'dashboard') content.innerHTML = dashboardView(state);
    else if (currentView === 'clients') content.innerHTML = clientsView(state);
    else if (currentView === 'plans') content.innerHTML = plansView(state);
    else if (currentView === 'invoices') content.innerHTML = invoicesView(state);
    else if (currentView === 'cashback') content.innerHTML = cashbackView(state);
    else if (currentView === 'routers') content.innerHTML = routersView(state);
    else if (currentView === 'tickets') content.innerHTML = ticketsView(state);
    else if (currentView === 'employees') content.innerHTML = employeesView(employees);
    else if (currentView === 'history') content.innerHTML = historyView(state);
  }

  async function refresh() {
    const button = root.querySelector('#refresh-button');
    if (button) button.disabled = true;
    try { await Promise.all([loadState(), loadEmployees()]); render(); }
    finally { if (button) button.disabled = false; }
  }

  async function showShell() {
    root.innerHTML = shellTemplate(user);
    await refresh();
    root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
      currentView = button.dataset.view;
      root.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
      root.querySelector('#sidebar')?.classList.remove('open');
      render();
    }));
    root.querySelector('#refresh-button')?.addEventListener('click', refresh);
    root.querySelector('#menu-button')?.addEventListener('click', () => root.querySelector('#sidebar')?.classList.toggle('open'));
    root.querySelector('#logout-button')?.addEventListener('click', async () => {
      try { await authApi.logout(); } finally { user = null; await showLogin(); }
    });
  }

  async function start() {
    const auth = await authApi.status();
    configured = auth?.configured !== false;
    if (!auth?.authenticated) return showLogin();
    user = auth.user;
    return showShell();
  }

  return { start, refresh };
}
