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

const stateCache = { state: null, updatedAt: '' };
const stateClone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stateEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stateObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const valueText = (value) => String(value ?? '').trim();
const normalizeConnection = (value) => valueText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const pppoeMigrations = new Map();

function mergeArrayChanges(base = [], next = [], latest = []) {
  if (stateEqual(base, next)) return stateClone(latest);
  const all = [...base, ...next, ...latest];
  const keyed = all.length > 0 && all.every((item) => stateObject(item) && item.id !== undefined && item.id !== null && String(item.id) !== '');
  if (!keyed) return stateClone(next);
  const key = (item) => String(item.id);
  const baseMap = new Map(base.map((item) => [key(item), item]));
  const nextMap = new Map(next.map((item) => [key(item), item]));
  const resultMap = new Map(latest.map((item) => [key(item), stateClone(item)]));
  for (const [id] of baseMap) if (!nextMap.has(id)) resultMap.delete(id);
  for (const item of next) {
    const id = key(item), before = baseMap.get(id);
    if (!before || !stateEqual(before, item)) resultMap.set(id, stateClone(item));
  }
  const order = [];
  for (const item of latest) if (resultMap.has(key(item))) order.push(key(item));
  for (const item of next) if (!order.includes(key(item)) && resultMap.has(key(item))) order.push(key(item));
  return order.map((id) => resultMap.get(id));
}

function mergeConcurrentState(base, next, latest) {
  if (stateEqual(base, next)) return stateClone(latest);
  if (Array.isArray(base) && Array.isArray(next) && Array.isArray(latest)) return mergeArrayChanges(base, next, latest);
  if (stateObject(base) && stateObject(next) && stateObject(latest)) {
    const result = stateClone(latest) || {};
    const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
    for (const key of keys) {
      if (!(key in next) && key in base) { delete result[key]; continue; }
      if (!(key in base)) { result[key] = stateClone(next[key]); continue; }
      if (stateEqual(base[key], next[key])) continue;
      result[key] = mergeConcurrentState(base[key], next[key], latest[key]);
    }
    return result;
  }
  return stateClone(next);
}

async function loadState() {
  const result = await request('/api/cloud-state', 'state.get');
  stateCache.state = stateClone(result?.state || {});
  stateCache.updatedAt = String(result?.updated_at || '');
  return result;
}

async function saveState(state, baseUpdatedAt = '') {
  const submitted = stateClone(state || {}), base = stateClone(stateCache.state || {});
  try {
    const result = await request('/api/cloud-state', 'state.save', { state: submitted, baseUpdatedAt });
    stateCache.state = stateClone(result?.state || submitted);
    stateCache.updatedAt = String(result?.updated_at || '');
    return result;
  } catch (error) {
    if (Number(error?.status) !== 409) throw error;
    const latest = await request('/api/cloud-state', 'state.get');
    const merged = mergeConcurrentState(base, submitted, latest?.state || {});
    const result = await request('/api/cloud-state', 'state.save', { state: merged, baseUpdatedAt: latest?.updated_at || '' });
    stateCache.state = stateClone(result?.state || merged);
    stateCache.updatedAt = String(result?.updated_at || '');
    return result;
  }
}

function hasPppoeAccess(client) {
  return normalizeConnection(client?.connection_type) === 'pppoe' && Number(client?.router_id) > 0 && Boolean(valueText(client?.pppoe_username));
}

function previousNetworkPayload(saved, previous) {
  return {
    ...saved,
    router_id: Number(previous?.router_id) || null,
    connection_type: valueText(previous?.connection_type) || 'PPPoE',
    pppoe_username: valueText(previous?.pppoe_username),
    mikrotik_profile: valueText(previous?.mikrotik_profile) || 'default',
    ip: valueText(previous?.ip),
    mac_address: valueText(previous?.mac_address),
    mikrotik_secret_id: valueText(previous?.mikrotik_secret_id),
    mikrotik_status: valueText(previous?.mikrotik_status) || 'Sincronizado',
    mikrotik_last_sync: previous?.mikrotik_last_sync || null,
  };
}

async function cloudClientById(id) {
  const list = await request('/api/cloud-data', 'clients.list');
  return (Array.isArray(list) ? list : []).find((item) => Number(item?.id) === Number(id)) || null;
}

async function routerWithSecret(id) {
  const routers = await request('/api/cloud-data', 'routers.list');
  const router = (Array.isArray(routers) ? routers : []).find((item) => Number(item?.id) === Number(id));
  if (!router) throw new Error('MikroTik anterior não encontrado para concluir a migração PPPoE.');
  const secret = await request('/api/cloud-data', 'routers.secret.get', { id: Number(id) });
  if (!secret?.password) throw new Error(`Senha segura do MikroTik ${router.name || id} não encontrada.`);
  return { ...router, password: secret.password };
}

async function removePppoeAccess(client) {
  if (!hasPppoeAccess(client)) return { action: 'not_configured' };
  const router = await routerWithSecret(client.router_id);
  return raw('/api/mikrotik-proxy', { action: 'pppoe.delete', router, data: client });
}

function clientLocalFields(data = {}) {
  const local = { rg: valueText(data?.rg), birth_date: valueText(data?.birth_date) };
  if (typeof document === 'undefined' || typeof HTMLFormElement === 'undefined') return local;
  const form = document.querySelector('#client-form');
  if (!(form instanceof HTMLFormElement)) return local;
  const formId = Number(form.elements?.id?.value) || 0, dataId = Number(data?.id) || 0;
  if (formId && dataId && formId !== dataId) return local;
  return {
    rg: valueText(form.elements?.rg?.value ?? local.rg),
    birth_date: valueText(form.elements?.birth_date?.value ?? local.birth_date),
  };
}

async function saveCloudClient(data) {
  const local = clientLocalFields(data);
  const saved = await request('/api/cloud-data', 'clients.save', { ...data, ...local });
  return { ...saved, ...local };
}

async function clientSaveSafe(data) {
  const id = Number(data?.id) || 0;
  let pending = id ? pppoeMigrations.get(id) : null;
  let createdPending = false;

  if (id && !pending) {
    const previous = await cloudClientById(id);
    if (previous && hasPppoeAccess(previous)) {
      const nextHasPppoe = hasPppoeAccess(data);
      const changedRouter = nextHasPppoe && Number(previous.router_id) !== Number(data?.router_id);
      const changedUsername = nextHasPppoe && valueText(previous.pppoe_username) !== valueText(data?.pppoe_username);
      const changedPppoeIdentity = changedRouter || changedUsername;
      if (!nextHasPppoe) {
        const saved = await saveCloudClient(data);
        try {
          await removePppoeAccess(previous);
          return saveCloudClient({ ...saved, mikrotik_secret_id: '', mikrotik_status: 'Sem PPPoE', mikrotik_last_sync: new Date().toISOString() });
        } catch (error) {
          await saveCloudClient(previousNetworkPayload(saved, previous));
          throw new Error(`Não foi possível remover o PPPoE antigo. O cadastro de rede foi restaurado: ${error.message || error}`);
        }
      }
      if (changedPppoeIdentity) {
        pending = { previous: stateClone(previous) };
        pppoeMigrations.set(id, pending);
        createdPending = true;
      }
    }
  }

  const payload = createdPending ? { ...data, mikrotik_status: 'Migração PPPoE pendente' } : data;
  const saved = await saveCloudClient(payload);
  if (!pending || createdPending) return saved;

  const failed = /^falha de sincroniza/i.test(normalizeConnection(data?.mikrotik_status));
  const confirmed = /sincronizado|bloqueado no mikrotik/i.test(normalizeConnection(data?.mikrotik_status));

  if (failed) {
    pppoeMigrations.delete(id);
    return saveCloudClient(previousNetworkPayload(saved, pending.previous));
  }
  if (!confirmed) return saved;

  try {
    await removePppoeAccess(pending.previous);
    pppoeMigrations.delete(id);
    return saved;
  } catch (oldError) {
    let newRollbackError = null;
    try { await removePppoeAccess(data); } catch (error) { newRollbackError = error; }
    const restored = await saveCloudClient(previousNetworkPayload(saved, pending.previous));
    pppoeMigrations.delete(id);
    if (newRollbackError) {
      throw new Error(`O novo PPPoE foi criado, mas não foi possível remover o acesso antigo nem compensar o acesso novo. Cadastro restaurado para o roteador anterior. Antigo: ${oldError.message || oldError}. Novo: ${newRollbackError.message || newRollbackError}`);
    }
    throw new Error(`Não foi possível remover o PPPoE do MikroTik anterior. O novo acesso foi removido e o cadastro voltou ao roteador anterior: ${oldError.message || oldError}`);
  }
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
  load: loadState,
  save: saveState,
  health: () => request('/api/cloud-state', 'health'),
});

export const dataApi = Object.freeze({
  clients: () => request('/api/cloud-data', 'clients.list'),
  clientSave: clientSaveSafe,
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
  supportNegotiationOptions: (clientId) => request('/api/cloud-data', 'negotiation.support.options', { clientId }),
  supportNegotiationCreate: (data) => request('/api/cloud-data', 'negotiation.support.create', data),
});

export const bankApi = Object.freeze({
  safe: () => request('/api/bank-settings', 'get-safe'),
  vault: () => request('/api/bank-settings', 'get-safe'),
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