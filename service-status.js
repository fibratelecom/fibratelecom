const refreshButton = document.querySelector('#refresh-status');
const grid = document.querySelector('#services-grid');
const summary = document.querySelector('#status-summary');
const checkedAt = document.querySelector('#checked-at');

const STATUS_PAGE_SOURCES = [
  { id:'discord', name:'Discord', category:'Comunicação', endpoint:'https://discordstatus.com/api/v2/summary.json', page:'https://discordstatus.com/' },
  { id:'epic', name:'Epic Games / Fortnite', category:'Jogos', endpoint:'https://status.epicgames.com/api/v2/summary.json', page:'https://status.epicgames.com/' },
  { id:'roblox', name:'Roblox', category:'Jogos', endpoint:'https://status.roblox.com/api/v2/summary.json', page:'https://status.roblox.com/' },
  { id:'mercado-pago', name:'Mercado Pago', category:'Pagamentos', endpoint:'https://status.mercadopago.com/api/v2/summary.json', page:'https://status.mercadopago.com/' },
  { id:'cloudflare', name:'Cloudflare', category:'Infraestrutura', endpoint:'https://www.cloudflarestatus.com/api/v2/summary.json', page:'https://www.cloudflarestatus.com/' },
  { id:'github', name:'GitHub', category:'Infraestrutura', endpoint:'https://www.githubstatus.com/api/v2/summary.json', page:'https://www.githubstatus.com/' },
  { id:'pagbank', name:'PagBank', category:'Pagamentos', endpoint:'https://status.pagbank.com.br/api/v2/summary.json', page:'https://status.pagbank.com.br/' },
];

const EXTRA_SOURCES = [
  { id:'google-cloud', name:'Google Cloud', category:'Infraestrutura', kind:'google', endpoint:'https://status.cloud.google.com/incidents.json', page:'https://status.cloud.google.com/' },
  { id:'playstation', name:'PlayStation Network', category:'Jogos', kind:'playstation', endpoint:'https://status.playstation.com/data/statuses/region/SCEA.json', page:'https://status.playstation.com/pt-br/' },
  { id:'whatsapp', name:'WhatsApp Business', category:'Meta', kind:'official', page:'https://metastatus.com/whatsapp-business-api', note:'Status oficial do WhatsApp Business/API; não representa todos os problemas do aplicativo comum.' },
  { id:'instagram', name:'Instagram / Meta API', category:'Meta', kind:'official', page:'https://metastatus.com/graph-api', note:'Fonte oficial da plataforma/API da Meta; não equivale a relatos de usuários do Instagram.' },
  { id:'facebook', name:'Facebook / Meta API', category:'Meta', kind:'official', page:'https://metastatus.com/graph-api', note:'Fonte oficial da plataforma/API da Meta; não equivale a relatos de usuários do Facebook.' },
  { id:'riot', name:'Riot Games · LoL / VALORANT', category:'Jogos', kind:'official', page:'https://status.riotgames.com/?locale=pt_BR&product=all&region=br', note:'Página oficial da Riot para o Brasil.' },
  { id:'xbox', name:'Xbox Network', category:'Jogos', kind:'official', page:'https://support.xbox.com/pt-BR/xbox-live-status', note:'Página oficial de status do Xbox.' },
];

const SOURCES = [...STATUS_PAGE_SOURCES, ...EXTRA_SOURCES];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function statusMeta(kind) {
  const map = {
    operational: ['Normal', 'ok'],
    degraded: ['Instabilidade', 'warn'],
    outage: ['Fora do ar', 'down'],
    maintenance: ['Manutenção', 'maint'],
    unknown: ['Consultar fonte', 'unknown'],
    error: ['Fonte indisponível', 'unknown'],
    loading: ['Consultando…', 'loading'],
  };
  return map[kind] || map.unknown;
}

function card(source, result = { kind:'loading', detail:'Consultando fonte oficial…' }) {
  const [label, cls] = statusMeta(result.kind);
  const detail = result.detail || source.note || 'Fonte oficial do serviço.';
  const components = Array.isArray(result.components) && result.components.length
    ? `<small class="components">${esc(result.components.join(' · '))}</small>` : '';
  return `<article class="service-card" data-service="${esc(source.id)}">
    <div class="service-top">
      <div><span class="service-category">${esc(source.category)}</span><h2>${esc(source.name)}</h2></div>
      <span class="service-status ${cls}"><i></i>${esc(label)}</span>
    </div>
    <p>${esc(detail)}</p>
    ${components}
    <div class="service-actions">
      <a href="${esc(source.page)}" target="_blank" rel="noopener noreferrer">Abrir fonte oficial</a>
      <span>${result.checked ? `Verificado ${esc(result.checked)}` : ''}</span>
    </div>
  </article>`;
}

function renderInitial() {
  grid.innerHTML = SOURCES.map(source => card(source)).join('');
}

function updateCard(source, result) {
  const old = grid.querySelector(`[data-service="${CSS.escape(source.id)}"]`);
  if (!old) return;
  const holder = document.createElement('div');
  holder.innerHTML = card(source, result);
  old.replaceWith(holder.firstElementChild);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { cache:'no-store', signal:controller.signal, credentials:'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function checkedLabel() {
  return new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }).format(new Date());
}

function statusPageKind(indicator) {
  const value = String(indicator || '').toLowerCase();
  if (!value || value === 'none') return 'operational';
  if (value === 'maintenance') return 'maintenance';
  if (value === 'minor') return 'degraded';
  if (value === 'major' || value === 'critical') return 'outage';
  return 'unknown';
}

async function checkStatusPage(source) {
  const data = await fetchWithTimeout(source.endpoint);
  const indicator = data?.status?.indicator || 'none';
  const activeIncident = (data?.incidents || []).find(item => !/resolved|completed/i.test(String(item?.status || '')));
  const affected = (data?.components || [])
    .filter(item => item && item.group !== true && item.status && item.status !== 'operational')
    .slice(0, 4)
    .map(item => item.name);
  const kind = activeIncident && statusPageKind(indicator) === 'operational' ? 'degraded' : statusPageKind(indicator);
  return {
    kind,
    detail: activeIncident?.name || data?.status?.description || (kind === 'operational' ? 'Todos os sistemas operacionais.' : 'A fonte oficial reportou alteração no serviço.'),
    components: affected,
    checked: checkedLabel(),
  };
}

async function checkGoogle(source) {
  const incidents = await fetchWithTimeout(source.endpoint);
  const active = Array.isArray(incidents) ? incidents.filter(item => !item?.end) : [];
  if (!active.length) return { kind:'operational', detail:'Nenhum incidente ativo amplo no Google Cloud.', checked:checkedLabel() };
  const latest = active[0];
  const update = Array.isArray(latest?.updates) ? latest.updates[0] : null;
  const rawStatus = String(update?.status || '').toUpperCase();
  return {
    kind: rawStatus.includes('OUTAGE') ? 'outage' : 'degraded',
    detail: latest?.external_desc || latest?.most_recent_update?.text || 'O Google Cloud possui incidente ativo.',
    components: Array.isArray(latest?.affected_products) ? latest.affected_products.slice(0, 4).map(item => item?.title || item?.id || item).filter(Boolean) : [],
    checked: checkedLabel(),
  };
}

async function checkPlayStation(source) {
  const data = await fetchWithTimeout(source.endpoint);
  const raw = JSON.stringify(data || {}).toLowerCase();
  const isEmpty = (Array.isArray(data) && data.length === 0) || raw === '{}' || raw === '[]';
  if (isEmpty) return { kind:'operational', detail:'Nenhuma ocorrência ativa informada pela fonte oficial.', checked:checkedLabel() };
  const problem = /outage|offline|degrad|down|maintenance|incident|issue|interruption|affected|unavailable/.test(raw);
  return {
    kind: problem ? 'degraded' : 'operational',
    detail: problem ? 'A fonte oficial do PlayStation reportou ocorrência ou manutenção.' : 'Nenhuma falha ativa identificada na resposta oficial.',
    checked: checkedLabel(),
  };
}

function officialOnly(source) {
  return {
    kind:'unknown',
    detail: source.note || 'A fonte oficial não oferece uma API pública aberta e confiável para consulta automática.',
    checked: checkedLabel(),
  };
}

async function checkOne(source) {
  try {
    if (source.kind === 'google') return await checkGoogle(source);
    if (source.kind === 'playstation') return await checkPlayStation(source);
    if (source.kind === 'official') return officialOnly(source);
    return await checkStatusPage(source);
  } catch (error) {
    return {
      kind:'error',
      detail:`Não foi possível consultar automaticamente esta fonte agora (${error?.name === 'AbortError' ? 'tempo esgotado' : 'bloqueio ou indisponibilidade da fonte'}).`,
      checked: checkedLabel(),
    };
  }
}

function refreshSummary(results) {
  const values = [...results.values()];
  const auto = values.filter(item => !['unknown','error'].includes(item.kind));
  const affected = auto.filter(item => ['degraded','outage','maintenance'].includes(item.kind));
  const unavailable = values.filter(item => ['unknown','error'].includes(item.kind));
  summary.innerHTML = `<article><span>Monitorados automaticamente</span><strong>${auto.length}</strong></article>
    <article><span>Com atenção agora</span><strong>${affected.length}</strong></article>
    <article><span>Fontes com consulta limitada</span><strong>${unavailable.length}</strong></article>`;
}

async function ensureSession() {
  try {
    const response = await fetch('/api/auth', {
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'status',data:{}}),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true || body?.data?.authenticated !== true) {
      location.replace('/');
      return false;
    }
    return true;
  } catch {
    location.replace('/');
    return false;
  }
}

let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  refreshButton.disabled = true;
  refreshButton.textContent = 'Atualizando…';
  const results = new Map();
  await Promise.all(SOURCES.map(async source => {
    const result = await checkOne(source);
    results.set(source.id, result);
    updateCard(source, result);
  }));
  refreshSummary(results);
  checkedAt.textContent = `Última atualização: ${new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'medium' }).format(new Date())}`;
  refreshButton.disabled = false;
  refreshButton.textContent = 'Atualizar agora';
  refreshing = false;
}

renderInitial();
refreshButton.addEventListener('click', refreshAll);

if (await ensureSession()) {
  await refreshAll();
  setInterval(refreshAll, 60000);
}
