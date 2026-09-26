const PRESETS = [
  {
    key: 'maintenance',
    name: 'Manutenção programada',
    title: 'Manutenção programada',
    body: 'Olá, {nome}. Informamos que realizaremos uma manutenção programada em nossa rede. Durante esse período poderão ocorrer pequenas interrupções. Nossa equipe trabalhará para concluir o serviço o mais rápido possível. Agradecemos a compreensão.',
    url: '/#conexao',
  },
  {
    key: 'regional-issue',
    name: 'Problema na região',
    title: 'Instabilidade na sua região',
    body: 'Olá, {nome}. Identificamos uma instabilidade afetando alguns clientes da sua região. Nossa equipe já está atuando para normalizar o serviço o mais rápido possível. Pedimos desculpas pelo transtorno.',
    url: '/#conexao',
  },
  {
    key: 'fiber-break',
    name: 'Rompimento de fibra',
    title: 'Rompimento de fibra na região',
    body: 'Olá, {nome}. Identificamos um rompimento de fibra que está afetando o serviço na região. Nossa equipe técnica já está trabalhando no reparo. Assim que o serviço for normalizado, enviaremos uma nova atualização.',
    url: '/#conexao',
  },
  {
    key: 'technical-team',
    name: 'Equipe técnica atuando',
    title: 'Equipe técnica em atendimento',
    body: 'Olá, {nome}. Nossa equipe técnica já está atuando na ocorrência informada. Estamos trabalhando para restabelecer o serviço o mais rápido possível. Agradecemos pela compreensão.',
    url: '/#conexao',
  },
  {
    key: 'normalized',
    name: 'Serviço normalizado',
    title: 'Serviço normalizado',
    body: 'Olá, {nome}. O serviço em sua região foi normalizado. Caso ainda perceba alguma dificuldade, reinicie o roteador e aguarde alguns minutos. Se o problema continuar, entre em contato com nosso atendimento.',
    url: '/#conexao',
  },
  {
    key: 'payment-reminder',
    name: 'Lembrete de pagamento',
    title: 'Lembrete de vencimento',
    body: 'Olá, {nome}. Sua mensalidade no valor de {valor} vence em {vencimento}. Para manter seu serviço em dia, realize o pagamento até a data do vencimento. Se já pagou, desconsidere esta mensagem.',
    url: '/#faturas',
  },
  {
    key: 'invoice-ready',
    name: 'Mensalidade disponível',
    title: 'Sua mensalidade está disponível',
    body: 'Olá, {nome}. Sua mensalidade no valor de {valor}, com vencimento em {vencimento}, já está disponível na Área do Cliente. Acesse suas faturas para consultar e realizar o pagamento.',
    url: '/#faturas',
  },
  {
    key: 'holiday-hours',
    name: 'Horário de atendimento',
    title: 'Aviso de atendimento',
    body: 'Olá, {nome}. Informamos que nosso horário de atendimento poderá sofrer alteração nesta data. Para suporte e informações, acompanhe os canais oficiais da Fibra+.',
    url: '/',
  },
];

function presetList() {
  const box = document.createElement('div');
  box.dataset.manualPresetBox = '1';
  box.style.marginBottom = '18px';
  box.innerHTML = `<div class="panel-title" style="margin-bottom:12px"><div><span>Mensagens prontas</span><h3>Envio manual rápido</h3><small class="cell-note" style="display:block;margin-top:5px;line-height:1.45">Escolha uma mensagem pronta, confira o texto e envie manualmente para um cliente ou para todos.</small></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:10px">${PRESETS.map((item) => `<article style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:74px;padding:12px 13px;border:1px solid #e5dde9;border-radius:14px;background:#fbf9fc"><div style="min-width:0"><strong style="display:block;font-size:11px;line-height:1.35;color:#2d2233">${item.name}</strong><small style="display:block;margin-top:4px;color:#8b8091;font-size:9px;line-height:1.35">${item.title}</small></div><div class="row-actions" style="flex:0 0 auto"><button class="btn secondary" type="button" data-manual-preset="${item.key}" style="min-width:54px">Usar</button></div></article>`).join('')}</div>`;
  return box;
}

function mountPresets() {
  const form = document.querySelector('#push-form');
  if (!(form instanceof HTMLFormElement)) return;
  const parent = form.parentElement;
  if (!parent || parent.querySelector('[data-manual-preset-box]')) return;
  parent.insertBefore(presetList(), form);
}

function applyPreset(key) {
  const preset = PRESETS.find((item) => item.key === key);
  const form = document.querySelector('#push-form');
  if (!preset || !(form instanceof HTMLFormElement)) return;
  if (form.elements.title) form.elements.title.value = preset.title;
  if (form.elements.body) form.elements.body.value = preset.body;
  if (form.elements.url) form.elements.url.value = preset.url;
  form.elements.title?.dispatchEvent(new Event('input', { bubbles: true }));
  form.elements.body?.dispatchEvent(new Event('input', { bubbles: true }));
  form.elements.url?.dispatchEvent(new Event('change', { bubbles: true }));
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const app = document.querySelector('#app');
app?.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-manual-preset]');
  if (!button) return;
  applyPreset(button.dataset.manualPreset || '');
});

const observer = new MutationObserver(mountPresets);
if (app) observer.observe(app, { childList: true, subtree: true });
mountPresets();
