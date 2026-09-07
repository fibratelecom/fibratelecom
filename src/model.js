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

export function statusKind(value) {
  const normalized = text(value).toLowerCase();
  if (/pago|paid|online|ativo|conectado|success|conclu|resolvido|liberado/.test(normalized)) return 'success';
  if (/vencid|atras|offline|bloque|erro|falh|cancel|rejeit|inativ|suspens/.test(normalized)) return 'danger';
  if (/pend|aguard|process|andamento|agendad/.test(normalized)) return 'warning';
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
    audit: arr(state.audit || state.audit_log || state.history || state.logs),
  };
}

export function clientName(clients, id) {
  return text(arr(clients).find((item) => Number(item?.id) === Number(id))?.name) || `Cliente #${id || '—'}`;
}

export function nextId(items = [], fallback = 0) {
  return Math.max(Number(fallback) || 0, ...arr(items).map((item) => Number(item?.id) || 0)) + 1;
}

export function dashboardStats({ state = {}, clients = [], protocols = [] } = {}) {
  const invoices = arr(state.invoices), today = new Date().toISOString().slice(0, 10);
  const active = clients.filter((item) => !/cancel|inativ/.test(text(item.status).toLowerCase())).length;
  const blocked = clients.filter((item) => /bloque|suspens/.test(text(item.status).toLowerCase())).length;
  const overdue = invoices.filter((item) => {
    const s = text(item.status).toLowerCase();
    return !/pago|paid|baixado|cancel|renegoci/.test(s) && text(item.due_date || item.dueDate).slice(0, 10) < today;
  }).length;
  const paidRevenue = invoices.filter((item) => /pago|paid|baixado/.test(text(item.status).toLowerCase())).reduce((sum, item) => sum + invoiceCents(item), 0);
  const openProtocols = arr(protocols).filter((item) => !/conclu|resolvid|fechad|cancel/.test(text(item.status).toLowerCase())).length;
  return { active, blocked, overdue, paidRevenue, openProtocols, invoices };
}
