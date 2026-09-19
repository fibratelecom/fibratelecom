import { statusKind, text } from './model.js';

const BASE_NAV = [
  ['dashboard','Central','⌂'],['clients','Clientes','◉'],['plans','Planos','◇'],['invoices','Mensalidades','▤'],
  ['finance','Financeiro','◈'],['cashback','Cashback','◆'],['routers','Rede','⌁'],['protocols','Atendimento','◫'],
  ['employees','Equipe','◎'],['communication','Comunicação','✦'],['integrations','Integrações','⇄'],
  ['settings','Automação','⚙'],['history','Auditoria','◷'],
];

export const NAV = BASE_NAV;
export const VIEW_ROUTES = Object.freeze({
  dashboard:'/central',
  clients:'/clientes',
  plans:'/planos',
  invoices:'/mensalidades',
  finance:'/financeiro',
  cashback:'/cashback',
  routers:'/rede',
  protocols:'/atendimento',
  employees:'/equipe',
  communication:'/comunicacao',
  integrations:'/integracoes',
  settings:'/automacao',
  history:'/auditoria',
});
export const pathForView=(id)=>VIEW_ROUTES[id]||'/central';
export const viewForPath=(pathname=globalThis.location?.pathname||'/')=>{
  const path=String(pathname||'/').replace(/\/+$/,'')||'/';
  if(path==='/')return 'dashboard';
  return Object.entries(VIEW_ROUTES).find(([,route])=>route===path)?.[0]||'dashboard';
};

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  if(window.location.pathname==='/'&&window.history?.replaceState)window.history.replaceState(null,'','/central');
  document.addEventListener('click',(event)=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const target=event.target?.closest?.('[data-view]'),id=target?.dataset?.view,next=id?VIEW_ROUTES[id]:'';
    if(!next)return;
    if(target instanceof HTMLAnchorElement)event.preventDefault();
    if(window.location.pathname!==next)window.history.pushState({view:id},'',next);
  },true);
  window.addEventListener('popstate',()=>window.location.reload());
}

export const PERMISSIONS=['dashboard','clients','plans','finance','billing','tickets','network'];
function permissionAllowed(user,id){
  if(String(user?.role||'').toLowerCase()==='admin')return true;
  const permissions=Array.isArray(user?.permissions)?user.permissions:[];
  const map={dashboard:'dashboard',clients:'clients',plans:'plans',invoices:'billing',finance:'finance',cashback:'finance',routers:'network',protocols:'tickets'};
  return Boolean(map[id]&&permissions.includes(map[id]));
}

// O controlador atual inicia em "dashboard". Durante a primeira montagem de uma
// rota direta, esta etapa faz o próprio fluxo existente escolher a view da URL.
// Depois da montagem, navAllowed volta a ser apenas a checagem normal de permissão.
const initialRouteView=viewForPath();
let routeBootstrapPhase=initialRouteView!=='dashboard'?'scan':'done';
export function navAllowed(user,id){
  const allowed=permissionAllowed(user,id);
  if(routeBootstrapPhase==='scan'){
    if(id!==initialRouteView)return false;
    if(!allowed){routeBootstrapPhase='done';return false;}
    routeBootstrapPhase='confirm';
    return true;
  }
  if(routeBootstrapPhase==='confirm'&&id==='dashboard'){
    routeBootstrapPhase='done';
    return false;
  }
  return allowed;
}
export function hasPermission(user,permission){return String(user?.role||'').toLowerCase()==='admin'||(Array.isArray(user?.permissions)&&user.permissions.includes(permission));}
export const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const attr=esc;
export const status=(value)=>`<span class="status ${statusKind(value)}"><i></i>${esc(text(value)||'—')}</span>`;
export const formMoney=(cents)=>(Math.max(0,Number(cents)||0)/100).toFixed(2).replace('.',',');
export function formatPhone(value=''){
  let digits=String(value??'').replace(/\D/g,'');
  if((digits.length===12||digits.length===13)&&digits.startsWith('55'))digits=digits.slice(2);
  digits=digits.slice(0,11);
  if(!digits)return '';
  if(digits.length<=2)return `(${digits}`;
  if(digits.length<=6)return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
  if(digits.length<=10)return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
}
export function moneyToCents(value){
  let raw=String(value??'').trim().replace(/\s/g,'').replace(/^R\$/i,'').replace(/[^\d,.-]/g,'');
  if(!raw||raw.startsWith('-'))return 0;
  raw=raw.replace(/-/g,'');
  const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.');
  let normalized=raw;
  if(comma>=0&&dot>=0){
    const decimal=comma>dot?',':'.',thousand=decimal===','?'.':',';
    normalized=raw.split(thousand).join('').replace(decimal,'.');
  }else if(comma>=0||dot>=0){
    const separator=comma>=0?',':'.',index=raw.lastIndexOf(separator),decimalDigits=raw.length-index-1;
    if(decimalDigits>=1&&decimalDigits<=2)normalized=raw.slice(0,index).split(separator).join('')+'.'+raw.slice(index+1);
    else normalized=raw.split(separator).join('');
  }
  const amount=Number(normalized);
  return Number.isFinite(amount)&&amount>0?Math.round(amount*100):0;
}
export const checkbox=(value)=>value===true||String(value).toLowerCase()==='true';
export const option=(value,label,selected)=>`<option value="${attr(value)}"${String(value)===String(selected)?' selected':''}>${esc(label)}</option>`;
export function empty(title,message){return `<div class="empty"><span>○</span><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;}
export function table(headers,rows){const body=Array.isArray(rows)?rows.join(''):String(rows??'');return `<div class="table-wrap"><table><thead><tr>${headers.map((h)=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;}
export function actions(items){return `<div class="row-actions">${items.filter(Boolean).join('')}</div>`;}
export function button(label,action,id='',kind='secondary',extra=''){
  const actionRoutes={'go-invoices':VIEW_ROUTES.invoices,'go-connections':VIEW_ROUTES.routers},href=actionRoutes[action];
  if(href)return `<a class="btn ${kind}" href="${attr(href)}" data-action="${attr(action)}"${id!==''?` data-id="${attr(id)}"`:''} ${extra}>${label}</a>`;
  return `<button class="btn ${kind}" type="button" data-action="${attr(action)}"${id!==''?` data-id="${attr(id)}"`:''} ${extra}>${label}</button>`;
}
export function pageHead(eyebrow,title,textLine,action=''){return `<section class="page-head"><div><span class="section-label">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(textLine)}</p></div>${action}</section>`;}
export function field(label,name,value='',type='text',extra=''){
  const isPhone=['phone','company_whatsapp'].includes(String(name)),shown=isPhone?formatPhone(value):value,phoneExtra=isPhone?'inputmode="tel" maxlength="15" autocomplete="tel" data-phone-mask':'';
  return `<label>${esc(label)}<input name="${attr(name)}" type="${attr(type)}" value="${attr(shown)}" ${phoneExtra} ${extra}></label>`;
}
export function selectField(label,name,optionsHtml,extra=''){return `<label>${esc(label)}<select name="${attr(name)}" ${extra}>${optionsHtml}</select></label>`;}
export function textareaField(label,name,value='',extra=''){return `<label class="span-2">${esc(label)}<textarea name="${attr(name)}" ${extra}>${esc(value)}</textarea></label>`;}
export function loginTemplate(configured=true,message=''){
  return `<main class="login-page">
    <section class="login-visual"><div class="fiber-orb one"></div><div class="fiber-orb two"></div><div class="fiber-line l1"></div><div class="fiber-line l2"></div><div class="login-visual-copy"><span class="brand-kicker">FIBRA+</span><h1>Operação de provedor<br><em>em um único lugar.</em></h1><p>Rede, cobrança, clientes e atendimento conectados ao mesmo núcleo operacional.</p><div class="visual-badges"><span>Cloudflare</span><span>Neon</span><span>MikroTik</span><span>Mercado Pago / Efí</span></div></div></section>
    <section class="login-panel"><div class="login-box"><div class="login-brand"><span class="brand-symbol">F+</span><div><strong>Provedor Plus</strong><small>Centro de Operações</small></div></div><div class="login-copy"><span class="section-label">ACESSO SEGURO</span><h2>${configured?'Entrar no sistema':'Configurar administrador'}</h2><p>${configured?'Use seu acesso para continuar a operação.':'Crie o primeiro administrador desta instalação.'}</p></div><form id="login-form" class="form-stack">${configured?'':field('Nome','name','','text','required minlength="2"')}${field('Usuário','login','','text','required minlength="3" autocomplete="username"')}${field('Senha','password','','password','required minlength="8" autocomplete="current-password"')}<p class="form-error" id="login-error">${esc(message)}</p><button class="btn primary full" type="submit">${configured?'Entrar no Provedor Plus':'Criar administrador'}</button></form><div class="login-foot"><span class="signal-dot"></span> Ambiente operacional protegido</div></div></section>
  </main>`;
}
export function shellTemplate(user){
  const current=viewForPath();
  const nav=NAV.filter(([id])=>navAllowed(user,id)).map(([id,label,icon])=>`<a class="module-tab${id===current?' active':''}" href="${attr(pathForView(id))}" data-view="${id}" aria-current="${id===current?'page':'false'}" style="text-decoration:none"><span>${icon}</span>${label}</a>`).join('');
  const serviceStatusLink='<a class="module-tab" href="/service-status" style="text-decoration:none"><span>◌</span>Status Serviços</a>';
  const initial=esc((user?.name||'A').slice(0,1).toUpperCase());
  return `<div class="app-shell"><header class="status-header"><div class="status-brand"><span class="brand-symbol">F+</span><div><strong>Provedor Plus</strong><small id="page-title">Central</small></div></div><div class="status-header-actions"><span class="live-pill"><i></i> Sistema online</span><button class="round-action" data-action="refresh" type="button" title="Atualizar">↻</button><div class="avatar">${initial}</div><div class="user-meta"><strong>${esc(user?.name||'Administrador')}</strong><small>${esc(user?.role||'admin')}</small></div><button class="exit-button" data-action="logout" type="button">Sair</button></div></header><nav class="module-nav" id="module-nav" style="position:relative;top:auto;margin:14px auto 0">${nav}${serviceStatusLink}</nav><main class="status-workspace" id="content"><div class="loading-card"><span class="loader"></span>Carregando operação...</div></main><footer class="app-footer"><span>Provedor Plus</span><span>•</span><span>Fibra+ Operações</span></footer><div id="modal-root"></div><div id="toast-root"></div></div>`;
}
