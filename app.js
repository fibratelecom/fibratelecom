const BUILD = '20260907-auditoria-formularios1';
const root = document.querySelector('#app');
let lastValidationToastAt = 0;

function showRuntimeError(value) {
  const error = value instanceof Error ? value : new Error(String(value || 'Falha inesperada no painel.'));
  console.error('Provedor Plus:', error);
  const host = root?.querySelector('#toast-root');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = 'toast error';
  toast.textContent = error.message || 'Falha inesperada no painel.';
  host.appendChild(toast);
  setTimeout(() => toast.remove(), 7000);
}

window.addEventListener('error', (event) => {
  if (event.error) showRuntimeError(event.error);
});
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  showRuntimeError(event.reason);
});

root?.addEventListener('invalid', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLElement)) return;
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const now = Date.now();
  if (now - lastValidationToastAt < 700) return;
  lastValidationToastAt = now;
  const label = control.closest('label');
  const fieldName = String(label?.childNodes?.[0]?.textContent || '').trim();
  const nativeMessage = String(control.validationMessage || '').trim();
  showRuntimeError(new Error(`${fieldName ? `${fieldName}: ` : ''}${nativeMessage || 'preencha este campo corretamente antes de salvar.'}`));
}, true);

async function refreshPanelModules() {
  const paths = ['/src/model.js', '/src/ui-kit.js', '/src/panel-forms.js', '/src/panel-views.js'];
  await Promise.all(paths.map(async (path) => {
    const response = await fetch(path, { cache: 'reload', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Não foi possível atualizar ${path} (HTTP ${response.status}).`);
  }));
}

async function bootstrap() {
  await refreshPanelModules();
  const [api, ui] = await Promise.all([
    import(`./src/api.js?v=${BUILD}`),
    import(`./src/ui.js?v=${BUILD}`),
  ]);
  const panel = ui.createPanel(root, api);
  await panel.start();
}

bootstrap().catch((error) => {
  console.error('Provedor Plus:', error);
  root.innerHTML = `<main class="fatal"><section class="fatal-card"><span class="brand-mark">F+</span><h1>Provedor Plus</h1><p>Não foi possível iniciar o painel.</p><pre>${String(error?.message || error)}</pre><button id="fatal-reload" type="button">Tentar novamente</button></section></main>`;
  root.querySelector('#fatal-reload')?.addEventListener('click', () => location.reload());
});
