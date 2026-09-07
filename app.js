const BUILD = '20260907-submit-native2';
const root = document.querySelector('#app');
let lastValidationToastAt = 0;

function showRuntimeMessage(message, kind = 'error') {
  const host = root?.querySelector('#toast-root');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = `toast ${kind}`;
  toast.textContent = String(message || 'Falha inesperada no painel.');
  host.appendChild(toast);
  setTimeout(() => toast.remove(), kind === 'error' ? 7000 : 2500);
}

function showRuntimeError(value) {
  const error = value instanceof Error ? value : new Error(String(value || 'Falha inesperada no painel.'));
  console.error('Provedor Plus:', error);
  showRuntimeMessage(error.message || 'Falha inesperada no painel.', 'error');
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

// Encaminha o clique usando o submit nativo do navegador. A regra de negócio
// continua sendo executada exclusivamente pelo único handler submit do src/ui.js.
root?.addEventListener('click', (event) => {
  const button = event.target.closest?.('button[type="submit"]');
  const form = button?.form;
  if (!button) return;
  if (!form) {
    event.preventDefault();
    showRuntimeError(new Error('Este botão não está vinculado ao formulário. Recarregue a página.'));
    return;
  }
  event.preventDefault();
  const original = button.textContent;
  button.textContent = 'Processando…';
  showRuntimeMessage('Ação recebida. Processando…', 'success');
  try {
    form.requestSubmit(button);
  } catch (error) {
    button.textContent = original;
    showRuntimeError(error);
    return;
  }
  setTimeout(() => {
    if (button.isConnected && button.textContent === 'Processando…') button.textContent = original;
  }, 12000);
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
  const footer = root?.querySelector('.app-footer');
  if (footer && !footer.querySelector('[data-panel-build]')) {
    const mark = document.createElement('span');
    mark.dataset.panelBuild = BUILD;
    mark.textContent = `• ${BUILD}`;
    footer.appendChild(mark);
  }
}

bootstrap().catch((error) => {
  console.error('Provedor Plus:', error);
  root.innerHTML = `<main class="fatal"><section class="fatal-card"><span class="brand-mark">F+</span><h1>Provedor Plus</h1><p>Não foi possível iniciar o painel.</p><pre>${String(error?.message || error)}</pre><button id="fatal-reload" type="button">Tentar novamente</button></section></main>`;
  root.querySelector('#fatal-reload')?.addEventListener('click', () => location.reload());
});
