const arr = (value) => Array.isArray(value) ? value : [];
export const text = (value) => String(value ?? '').trim();
export const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));

export function money(value, cents = false) {
  const amount = cents ? number(value) / 100 : number(value);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

export function dateLabel(value, withTime = false) {
  if (!value) return '—';
  const raw = text(value);
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return `${direct[3]}/${direct[2]}/${direct[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw || '—';
  return new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date);
}

export function invoiceCents(invoice = {}) {
  for (const key of ['amount_cents', 'total_cents', 'value_cents', 'price_cents']) {
    const value = Number(invoice?.[key]);
    if (Number.isFinite(value)) return Math.max(0, Math.round(value));
  }
  for (const key of ['amount', 'total', 'value', 'price']) {
    const value = Number(invoice?.[key]);
    if (Number.isFinite(value)) return Math.max(0, Math.round(value * 100));
  }
  return 0;
}

export function normalized(value) {
  return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function paidInvoice(invoice = {}) {
  return /pago|paga|paid|baixado|recebido|quitado/.test(normalized(invoice.status));
}

export function invoiceCashbackUsedCents(invoice = {}) {
  if (!paidInvoice(invoice)) return 0;
  const amount = Math.max(0, Math.round(Number(invoice?.cashback_discount_applied_cents) || 0));
  if (!amount) return 0;
  const discountStatus = normalized(invoice?.cashback_discount_status);
  if (/released|refund|estorn|cancel/.test(discountStatus)) return 0;
  return Math.min(invoiceCents(invoice), amount);
}

export function invoiceReceivedCents(invoice = {}) {
  if (!paidInvoice(invoice)) return 0;
  const gross = invoiceCents(invoice), cashback = invoiceCashbackUsedCents(invoice);
  if (cashback > 0) {
    const explicit = Number(invoice?.cashback_pix_amount_cents);
    if (Number.isFinite(explicit)) return Math.max(0, Math.min(gross, Math.round(explicit)));
  }
  return Math.max(0, gross - cashback);
}

export function paymentGroup(invoice = {}) {
  const source = normalized(`${invoice?.payment_method || ''} ${invoice?.bank_status_detail || ''} ${invoice?.bank_provider || ''}`);
  if (/cartao|card|credito|credit/.test(source)) return 'card';
  if (/pix/.test(source)) return 'pix';
  if (/boleto|ticket|carnet|carne|billet/.test(source)) return 'boleto';
  if (/cashback/.test(source)) return 'cashback';
  return 'other';
}

export function clientCashbackBalanceCents(client = {}) {
  const direct = Number(client?.cashback_balance_cents);
  if (Number.isFinite(direct)) return Math.max(0, Math.round(direct));
  const legacy = Number(client?.cashback_balance);
  return Number.isFinite(legacy) ? Math.max(0, Math.round(legacy * 100)) : 0;
}

export function canceledInvoice(invoice = {}) {
  return /cancel|renegoci|substitu|rejeit|expirad/.test(normalized(invoice.status));
}

export function openInvoice(invoice = {}) {
  return !paidInvoice(invoice) && !canceledInvoice(invoice);
}

export function overdueInvoice(invoice = {}, today = new Date().toISOString().slice(0, 10)) {
  return openInvoice(invoice) && Boolean(text(invoice.due_date).slice(0, 10)) && text(invoice.due_date).slice(0, 10) < today;
}

export function statusKind(value) {
  const normalizedValue = normalized(value);
  if (/pago|paid|online|ativo|conectado|success|conclu|resolvido|liberado|sincronizado/.test(normalizedValue)) return 'success';
  if (/vencid|atras|offline|bloque|erro|falh|cancel|rejeit|inativ|suspens|urgente/.test(normalizedValue)) return 'danger';
  if (/pend|aguard|process|andamento|atendimento|agendad|atencao|alta/.test(normalizedValue)) return 'warning';
  return 'neutral';
}

export function mergedClients(state = {}, remote = []) {
  const local = arr(state.clients), map = new Map(local.map((item) => [Number(item?.id), item]));
  for (const item of arr(remote)) map.set(Number(item?.id), { ...(map.get(Number(item?.id)) || {}), ...item });
  return [...map.values()].filter((item) => Number(item?.id) > 0).sort((a, b) => text(a.name).localeCompare(text(b.name), 'pt-BR'));
}

export function mergedRouters(state = {}, remote = []) {
  const local = arr(state.routers), map = new Map(local.map((item) => [Number(item?.id), item]));
  for (const item of arr(remote)) map.set(Number(item?.id), { ...(map.get(Number(item?.id)) || {}), ...item });
  return [...map.values()].filter((item) => Number(item?.id) > 0).sort((a, b) => text(a.name).localeCompare(text(b.name), 'pt-BR'));
}

export function collections(state = {}) {
  return {
    plans: arr(state.plans),
    invoices: arr(state.invoices),
    cashback: arr(state.cashback_transactions),
    negotiations: arr(state.negotiations),
    tickets: arr(state.tickets),
    audit: arr(state.audit || state.audit_log || state.history || state.logs),
  };
}

export function clientName(clients, id, snapshot = '') {
  return text(arr(clients).find((item) => Number(item?.id) === Number(id))?.name) || text(snapshot) || `Cliente #${id || '—'}`;
}

export function nextId(items = [], fallback = 0) {
  return Math.max(Number(fallback) || 0, ...arr(items).map((item) => Number(item?.id) || 0)) + 1;
}

export function nextContract(clients = []) {
  const year = new Date().getFullYear();
  let seq = Math.max(0, ...arr(clients).map((item) => {
    const match = text(item?.contract_number).match(/(\d+)$/);
    return match ? Number(match[1]) || 0 : Number(item?.id) || 0;
  })) + 1;
  let code = '';
  do { code = `CTR-${year}-${String(seq++).padStart(6, '0')}`; }
  while (arr(clients).some((item) => text(item?.contract_number) === code));
  return code;
}

export function ticketNumber(ticket = {}) {
  const explicit = text(ticket.ticket_number || ticket.number);
  return explicit || `CH-${String(Number(ticket.id) || 0).padStart(6, '0')}`;
}

export function ticketClosed(ticket = {}) {
  return /resolvido|concluido|concluído|cancelado|fechado/.test(normalized(ticket.status));
}

export function ticketSlaDue(priority = 'Normal', base = new Date()) {
  const hours = { baixa: 24, normal: 12, alta: 4, urgente: 2 }[normalized(priority)] || 12;
  const date = new Date(base);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export function ticketOverdue(ticket = {}) {
  if (ticketClosed(ticket) || !ticket.sla_due_at) return false;
  const due = new Date(ticket.sla_due_at);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

export function formatBytes(value) {
  let amount = Math.max(0, Number(value) || 0), unit = 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit < 2 ? 0 : 1 }).format(amount)} ${units[unit]}`;
}

export function formatRate(value) {
  let amount = Math.max(0, Number(value) || 0), unit = 0;
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  while (amount >= 1000 && unit < units.length - 1) { amount /= 1000; unit += 1; }
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: unit < 2 ? 0 : 1 }).format(amount)} ${units[unit]}`;
}

export function dashboardStats({ state = {}, clients = [], protocols = [], tickets = null } = {}) {
  const invoices = arr(state.invoices), today = new Date().toISOString().slice(0, 10), support = tickets === null ? arr(protocols) : arr(tickets);
  const active = clients.filter((item) => !/cancel|inativ/.test(normalized(item.status))).length;
  const blocked = clients.filter((item) => /bloque|suspens/.test(normalized(item.status))).length;
  const overdue = invoices.filter((item) => overdueInvoice(item, today)).length;
  const paidRevenue = invoices.filter(paidInvoice).reduce((sum, item) => sum + invoiceReceivedCents(item), 0);
  const openProtocols = support.filter((item) => !ticketClosed(item)).length;
  return { active, blocked, overdue, paidRevenue, openProtocols, invoices };
}
