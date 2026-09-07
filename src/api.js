async function parseResponse(response) {
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok || body?.ok !== true) {
    const error = new Error(body?.error || `Falha na comunicação (HTTP ${response.status}).`);
    error.status = response.status;
    error.data = body?.data;
    throw error;
  }
  return body.data;
}

async function request(path, action, data = {}) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
  });
  return parseResponse(response);
}

async function raw(path, payload = {}) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(response);
}

export const authApi = Object.freeze({
  status: () => request('/api/auth', 'status'),
  login: (login, password) => request('/api/auth', 'login', { login, password }),
  setup: (name, login, password) => request('/api/auth', 'setup', { name, login, password }),
  logout: () => request('/api/auth', 'logout'),
  employees: () => request('/api/auth', 'employees.list'),
  employeesAvailable: () => request('/api/auth', 'employees.available'),
  employeeSave: (data) => request('/api/auth', 'employees.save', data),
  employeeToggle: (id, active) => request('/api/auth', 'employees.toggle', { id, active }),
  employeeDelete: (id) => request('/api/auth', 'employees.delete', { id }),
});

export const stateApi = Object.freeze({
  load: () => request('/api/cloud-state', 'state.get'),
  save: (state, baseUpdatedAt = '') => request('/api/cloud-state', 'state.save', { state, baseUpdatedAt }),
  health: () => request('/api/cloud-state', 'health'),
});

export const dataApi = Object.freeze({
  clients: () => request('/api/cloud-data', 'clients.list'),
  clientSave: (data) => request('/api/cloud-data', 'clients.save', data),
  clientDelete: (id) => request('/api/cloud-data', 'clients.delete', { id }),
  routers: () => request('/api/cloud-data', 'routers.list'),
  routerSave: (data) => request('/api/cloud-data', 'routers.save', data),
  routerDelete: (id) => request('/api/cloud-data', 'routers.delete', { id }),
  routerSecret: (id) => request('/api/cloud-data', 'routers.secret.get', { id }),
  routerSecretSave: (id, password) => request('/api/cloud-data', 'routers.secret.save', { id, password }),
  routerSecretDelete: (id) => request('/api/cloud-data', 'routers.secret.delete', { id }),
  cashbackWallet: (clientId) => request('/api/cloud-data', 'cashback.wallet.get', { clientId }),
  cashbackAdjust: (data) => request('/api/cloud-data', 'cashback.wallet.adjust', data),
  trafficRecord: (clientId, live, month = '') => request('/api/cloud-data', 'traffic.record', { clientId, live, month }),
  billingRun: () => request('/api/cloud-data', 'billing.run'),
});

export const bankApi = Object.freeze({
  safe: () => request('/api/bank-settings', 'get-safe'),
  vault: () => request('/api/bank-settings', 'get'),
  saveEfi: (data) => request('/api/bank-settings', 'save-efi', data),
  deleteEfi: () => request('/api/bank-settings', 'delete-efi'),
  saveMercadoPago: (data) => request('/api/bank-settings', 'save-mercado-pago', data),
  deleteMercadoPago: () => request('/api/bank-settings', 'delete-mercado-pago'),
  saveMercadoPagoWebhook: (webhookSecret) => request('/api/bank-settings', 'save-mercado-pago-webhook', { webhookSecret }),
  deleteMercadoPagoWebhook: () => request('/api/bank-settings', 'delete-mercado-pago-webhook'),
  testEfi: () => request('/api/bank-settings', 'test-efi'),
  testMercadoPago: () => request('/api/bank-settings', 'test-mercado-pago'),
  configureEfiWebhooks: () => request('/api/bank-settings', 'configure-efi-webhooks'),
  setDefault: (provider) => request('/api/bank-settings', 'save-default', { provider }),
  proxy: (payload) => raw('/api/bank-proxy', payload),
});

export const mikrotikApi = Object.freeze({
  run: (action, router, data = {}) => raw('/api/mikrotik-proxy', { action, router, data }),
});

export const protocolApi = Object.freeze({
  list: (clientId = null, limit = 200) => request('/api/protocols', 'list', { clientId, limit }),
  create: (data) => request('/api/protocols', 'create', data),
  close: (protocol, status = 'Concluído') => request('/api/protocols', 'close', { protocol, status }),
});

export const pushApi = Object.freeze({
  stats: () => request('/api/push-admin', 'stats'),
  send: (data) => request('/api/push-admin', 'send', data),
});

export const pushOpsApi = Object.freeze({
  get: () => request('/api/push-operations', 'get'),
  save: (settings) => request('/api/push-operations', 'save', { settings }),
  scanNow: () => request('/api/push-operations', 'scan-now'),
  saveTemplate: (data) => request('/api/push-operations', 'save-template', data),
  deleteTemplate: (id) => request('/api/push-operations', 'delete-template', { id }),
  schedule: (data) => request('/api/push-operations', 'schedule-notification', data),
  cancelSchedule: (id) => request('/api/push-operations', 'cancel-schedule', { id }),
});

export const storiesApi = Object.freeze({
  list: () => request('/api/stories', 'list'),
  save: (data) => request('/api/stories', 'save', data),
  remove: (id) => request('/api/stories', 'delete', { id }),
  toggle: (id, active) => request('/api/stories', 'toggle', { id, active }),
});
