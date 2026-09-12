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
  { id:'whatsapp', name:'WhatsApp Business', category:'Meta', kind:'meta', endpoint:'https://metastatus.com/whatsapp-business-api', page:'https://metastatus.com/whatsapp-business-api', note:'Status automático da plataforma oficial do WhatsApp Business.' },
  { id:'instagram', name:'Instagram / Meta API', category:'Meta', kind:'meta', endpoint:'https://metastatus.com/graph-api', page:'https://metastatus.com/graph-api', note:'Status automático da Graph API da Meta, usada por integrações do Instagram.' },
  { id:'facebook', name:'Facebook / Meta API', category:'Meta', kind:'meta', endpoint:'https://metastatus.com/graph-api', page:'https://metastatus.com/graph-api', note:'Status automático da Graph API da Meta, usada por integrações do Facebook.' },
  { id:'riot', name:'Riot Games · LoL / VALORANT', category:'Jogos', kind:'riot', endpoint:'https://status.riotgames.com/api/v1/incidents', page:'https://status.riotgames.com/?locale=pt_BR&product=all&region=br', note:'Incidentes oficiais da Riot Games para consulta automática.' },
  { id:'xbox', name:'Xbox Network', category:'Jogos', kind:'xbox', endpoint:'https://xbguide.com/status', page:'https://support.xbox.com/pt-BR/xbox-live-status', note:'Sinal automático gratuito combinado com a página oficial do Xbox.' },
];

const SOURCES = [...STATUS_PAGE_SOURCES, ...EXTRA_SOURCES];
const PUBLIC_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://allorigins.vercel.app/raw?url=${encodeURIComponent(url)}`,
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function statusMeta(kind) {
  const map = {
    operational: ['Normal', 'ok'],
    degraded: ['Instabilidade', 'warn'],
    outage: ['Fora do ar', 'down'],
    maintenance: ['Manutenção', 'maint'],
    unknown: ['Sem confirmação', 'unknown'],
    error: ['Sem resposta', 'unknown'],
    loading: ['Consultando…', 'loading'],
  };
  return map[kind] || map.unknown;
}

function card(source, result = { kind:'loading', detail:'Consultando fonte de status…' }) {
  const [label, cls] = statusMeta(result.kind);
  const detail = result.detail || source.note || 'Fonte pública de status do serviço.';
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
      <a href="${esc(source.page)}" target="_blank" rel="noopener noreferrer">Abrir fonte</a>
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

async function fetchTextOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { cache:'no-store', signal:controller.signal, credentials:'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPublicText(url) {
  let lastError = null;
  for (const target of [url, ...PUBLIC_PROXIES.map(proxy => proxy(url))]) {
    try { return await fetchTextOnce(target); }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error('Fonte sem resposta.');
}

async function fetchPublicJson(url) {
  const raw = await fetchPublicText(url);
  try { return JSON.parse(raw); }
  catch { throw new Error('Resposta de status inválida.'); }
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
  const data = await fetchPublicJson(source.endpoint);
  const indicator = data?.status?.indicator || 'none';
  const activeIncident = (data?.incidents || []).find(item => !/resolved|completed/i.test(String(item?.status || '')));
  const affected = (data?.components || [])
    .filter(item => item && item.group !== true && item.status && item.status !== 'operational')
    .slice(0, 4)
    .map(item => item.name);
  const kind = activeIncident && statusPageKind(indicator) === 'operational' ? 'degraded' : statusPageKind(indicator);
  return {
    kind,
    detail: activeIncident?.name || data?.status?.description || (kind === 'operational' ? 'Todos os sistemas operacionais.' : 'A fonte reportou alteração no serviço.'),
    components: affected,
    checked: checkedLabel(),
  };
}

async function checkGoogle(source) {
  const incidents = await fetchPublicJson(source.endpoint);
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
  const data = await fetchPublicJson(source.endpoint);
  const incidents = Array.isArray(data?.status) ? data.status : Array.isArray(data) ? data : [];
  if (!incidents.length) return { kind:'operational', detail:'Todos os serviços do PlayStation Network estão operacionais.', checked:checkedLabel() };
  const raw = JSON.stringify(incidents).toLowerCase();
  const kind = /maintenance|manuten/.test(raw) ? 'maintenance' : /outage|offline|down|unavailable|indispon/.test(raw) ? 'outage' : 'degraded';
  const components = incidents.slice(0, 4).map(item => item?.serviceName || item?.name || item?.title || item?.message).filter(Boolean);
  return {
    kind,
    detail: 'A fonte oficial do PlayStation Network informou ocorrência ativa.',
    components,
    checked: checkedLabel(),
  };
}

function readablePageText(raw) {
  return String(raw || '')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function firstPhrase(text, phrases) {
  const found = phrases
    .map(item => ({ ...item, index:text.indexOf(item.phrase) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  return found[0] || null;
}

async function checkMeta(source) {
  const text = readablePageText(await fetchPublicText(source.endpoint));
  const current = firstPhrase(text, [
    { phrase:'high disruptions', kind:'outage', detail:'A Meta informa alta interrupção neste serviço.' },
    { phrase:'major disruptions', kind:'outage', detail:'A Meta informa interrupção importante neste serviço.' },
    { phrase:'some disruptions', kind:'degraded', detail:'A Meta informa instabilidade neste serviço.' },
    { phrase:'partial disruptions', kind:'degraded', detail:'A Meta informa instabilidade parcial neste serviço.' },
    { phrase:'minor disruptions', kind:'degraded', detail:'A Meta informa instabilidade leve neste serviço.' },
    { phrase:'no known issues', kind:'operational', detail:'A Meta não informa problemas conhecidos neste serviço.' },
  ]);
  if (current) return { kind:current.kind, detail:current.detail, checked:checkedLabel() };
  if (/maintenance|manuten/.test(text)) return { kind:'maintenance', detail:'A fonte da Meta indica manutenção em andamento.', checked:checkedLabel() };
  if (/status and outages of meta business products|meta business/.test(text)) return { kind:'operational', detail:'A fonte oficial da Meta respondeu e nenhum alerta atual reconhecido foi encontrado.', checked:checkedLabel() };
  throw new Error('A fonte da Meta respondeu sem um estado reconhecível.');
}

function riotIncidentTitle(item) {
  if (typeof item?.title === 'string') return item.title;
  if (Array.isArray(item?.titles)) return item.titles.find(value => value?.locale === 'pt_BR')?.content || item.titles[0]?.content || '';
  if (Array.isArray(item?.updates)) return item.updates[0]?.translations?.find(value => value?.locale === 'pt_BR')?.content || item.updates[0]?.translations?.[0]?.content || '';
  return item?.name || '';
}

async function checkRiot(source) {
  try {
    const data = await fetchPublicJson(source.endpoint);
    const incidents = Array.isArray(data) ? data : Array.isArray(data?.incidents) ? data.incidents : [];
    const active = incidents.filter(item => {
      const state = String(item?.status || item?.state || '').toLowerCase();
      return item?.active !== false && !/resolved|completed|closed/.test(state);
    });
    if (!active.length) return { kind:'operational', detail:'Nenhum incidente ativo informado pela Riot Games.', checked:checkedLabel() };
    const first = active[0];
    const raw = JSON.stringify(first).toLowerCase();
    const kind = /maintenance|manuten/.test(raw) ? 'maintenance' : /critical|major|outage/.test(raw) ? 'outage' : 'degraded';
    return { kind, detail:riotIncidentTitle(first) || 'A Riot Games informou uma ocorrência ativa.', checked:checkedLabel() };
  } catch {
    const page = readablePageText(await fetchPublicText(source.page));
    if (/nenhum problema ou ocorrência recente|no recent issues or events to report/.test(page)) return { kind:'operational', detail:'Nenhum problema recente informado pela Riot Games para o Brasil.', checked:checkedLabel() };
    if (/manutenção|maintenance/.test(page)) return { kind:'maintenance', detail:'A Riot Games informa manutenção ou intervenção ativa.', checked:checkedLabel() };
    if (/warning|aviso|incident|incidente|problemas para|issues with/.test(page)) return { kind:'degraded', detail:'A Riot Games informa uma ocorrência ativa.', checked:checkedLabel() };
    return { kind:'operational', detail:'A página oficial da Riot respondeu sem alerta atual reconhecido.', checked:checkedLabel() };
  }
}

async function checkXbox(source) {
  const page = readablePageText(await fetchPublicText(source.endpoint));
  const current = page.split('recent incidents')[0];
  if (/microsoft reports all services healthy|all services up and running/.test(current)) return { kind:'operational', detail:'Xbox Network operacional segundo o status Microsoft e verificações públicas.', checked:checkedLabel() };
  if (/major outage|service outage|\bdown\b|offline/.test(current)) return { kind:'outage', detail:'O monitoramento do Xbox indica indisponibilidade de um ou mais serviços.', checked:checkedLabel() };
  if (/degraded|limited|service issue|issues detected|partial/.test(current)) return { kind:'degraded', detail:'O monitoramento do Xbox indica instabilidade em um ou mais serviços.', checked:checkedLabel() };
  if (/\bup\b|operational|healthy/.test(current)) return { kind:'operational', detail:'Os principais serviços do Xbox estão respondendo normalmente.', checked:checkedLabel() };
  throw new Error('O monitor do Xbox respondeu sem um estado reconhecível.');
}

async function checkOne(source) {
  try {
    if (source.kind === 'google') return await checkGoogle(source);
    if (source.kind === 'playstation') return await checkPlayStation(source);
    if (source.kind === 'meta') return await checkMeta(source);
    if (source.kind === 'riot') return await checkRiot(source);
    if (source.kind === 'xbox') return await checkXbox(source);
    return await checkStatusPage(source);
  } catch (error) {
    return {
      kind:'error',
      detail:`A consulta automática falhou agora (${error?.name === 'AbortError' ? 'tempo esgotado' : 'fonte ou proxy sem resposta'}). Tente Atualizar novamente.`,
      checked: checkedLabel(),
    };
  }
}

function refreshSummary(results) {
  const values = [...results.values()];
  const automatic = values.filter(item => !['unknown','error'].includes(item.kind));
  const affected = automatic.filter(item => ['degraded','outage','maintenance'].includes(item.kind));
  const unavailable = values.filter(item => ['unknown','error'].includes(item.kind));
  summary.innerHTML = `<article><span>Monitorados automaticamente</span><strong>${automatic.length}</strong></article>
    <article><span>Com atenção agora</span><strong>${affected.length}</strong></article>
    <article><span>Sem resposta agora</span><strong>${unavailable.length}</strong></article>`;
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
