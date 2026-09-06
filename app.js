import { authApi, cloudApi } from './src/api.js';
import { createPanel } from './src/ui.js';

const root = document.querySelector('#app');
const panel = createPanel(root, { authApi, cloudApi });

panel.start().catch((error) => {
  console.error('Provedor Plus:', error);
  root.innerHTML = `<main class="fatal"><section class="fatal-card"><span class="brand-mark">F+</span><h1>Provedor Plus</h1><p>Não foi possível iniciar o painel.</p><pre>${String(error?.message || error)}</pre><button type="button" onclick="location.reload()">Tentar novamente</button></section></main>`;
});
