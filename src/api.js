async function request(path, action, data = {}) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
  });

  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok || body?.ok !== true) {
    const error = new Error(body?.error || `Falha na comunicação (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body.data;
}

export const authApi = Object.freeze({
  status: () => request('/api/auth', 'status'),
  login: (login, password) => request('/api/auth', 'login', { login, password }),
  setup: (name, login, password) => request('/api/auth', 'setup', { name, login, password }),
  logout: () => request('/api/auth', 'logout'),
  employees: () => request('/api/auth', 'employees.list'),
});

export const cloudApi = Object.freeze({
  state: () => request('/api/cloud-state', 'state.get'),
});
