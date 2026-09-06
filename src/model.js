const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function collections(state = {}) {
  return {
    clients: array(state.clients),
    plans: array(state.plans),
    invoices: array(state.invoices),
    cashback: array(state.cashback_transactions),
    routers: array(state.routers),
    tickets: array(state.tickets),
    history: array(state.audit_log || state.history || state.logs),
  };
}

export function statusKind(value) {
  const normalized = text(value).toLowerCase();
  if (/pago|paid|online|ativo|aberto|conectado|success|resolvido/.test(normalized)) return 'success';
  if (/vencid|atras|offline|bloque|erro|cancel|rejeit|inativ/.test(normalized)) return 'danger';
  if (/pend|aguard|process|andamento/.test(normalized)) return 'warning';
  return 'neutral';
}

export function money(value, cents = false) {
  const amount = cents ? number(value) / 100 : number(value);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

export function invoiceValue(invoice = {}) {
  if (invoice.amount_cents != null) return number(invoice.amount_cents) / 100;
  if (invoice.total_cents != null) return number(invoice.total_cents) / 100;
  return number(invoice.amount ?? invoice.total ?? invoice.value);
}

export function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return date.toLocaleDateString('pt-BR');
}

export function dashboardStats(state = {}) {
  const data = collections(state);
  const activeClients = data.clients.filter((item) => !/cancel|inativ/.test(text(item.status).toLowerCase())).length;
  const overdue = data.invoices.filter((item) => /vencid|atras/.test(text(item.status).toLowerCase())).length;
  const openTickets = data.tickets.filter((item) => !/resolvid|fechad|cancel/.test(text(item.status).toLowerCase())).length;
  const paidRevenue = data.invoices
    .filter((item) => /pago|paid|baixado/.test(text(item.status).toLowerCase()))
    .reduce((sum, item) => sum + invoiceValue(item), 0);
  return { activeClients, overdue, openTickets, paidRevenue, ...data };
}

export function displayName(item = {}) {
  return text(item.name || item.title || item.description || item.reference || item.id) || '—';
}

export function textValue(value) { return text(value) || '—'; }
