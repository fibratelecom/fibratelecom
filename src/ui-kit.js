import { statusKind, text } from './model.js';

export const NAV = [
  ['dashboard','Central','⌂'],['clients','Clientes','◉'],['plans','Planos','◇'],['invoices','Mensalidades','▤'],
  ['finance','Financeiro','◈'],['cashback','Cashback','◆'],['routers','Rede','⌁'],['protocols','Atendimento','◫'],
  ['employees','Equipe','◎'],['communication','Comunicação','✦'],['integrations','Integrações','⇄'],
  ['settings','Automação','⚙'],['history','Auditoria','◷'],
];
export const PERMISSIONS=['dashboard','clients','plans','finance','billing','tickets','network'];
export function hasPermission(user,permission){return String(user?.role||'').toLowerCase()==='admin'||(Array.isArray(user?.permissions)&&user.permissions.includes(permission));}
export function navAllowed(user,id){
  if(String(user?.role||'').toLowerCase()==='admin')return true;
  const permissions=Array.isArray(user?.permissions)?user.permissions:[];
  const map={dashboard:'dashboard',clients:'clients',plans:'plans',invoices:'billing',finance:'finance',cashback:'finance',routers:'network',protocols:'tickets'};
  return Boolean(map[id]&&permissions.includes(map[id]));
}
export const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const attr=esc;
export const status=(value)=>`<span class="status ${statusKind(value)}"><i></i>${esc(text(value)||'—')}</span>`;
export const formMoney=(cents)=>(Math.max(0,Number(cents)||0)/100).toFixed(2).replace('.',',');
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
export function button(label,action,id='',kind='secondary',extra=''){return `<button class="btn ${kind}" type="button" data-action="${attr(action)}"${id!==''?` data-id="${attr(id)}"`:''} ${extra}>${label}</button>`;}
export function pageHead(eyebrow,title,textLine,action=''){return `<section class="page-head"><div><span class="section-label">${esc(eyebrow)}</span><h2>${esc(title)}</h2><p>${esc(textLine)}</p></div>${action}</section>`;}
export function field(label,name,value='',type='text',extra=''){return `<label>${esc(label)}<input name="${attr(name)}" type="${attr(type)}" value="${attr(value)}" ${extra}></label>`;}
export function selectField(label,name,optionsHtml,extra=''){return `<label>${esc(label)}<select name="${attr(name)}" ${extra}>${optionsHtml}</select></label>`;}
export function textareaField(label,name,value='',extra=''){return `<label class="span-2">${esc(label)}<textarea name="${attr(name)}" ${extra}>${esc(value)}</textarea></label>`;}
export function loginTemplate(configured=true,message=''){
  return `<main class="login-page">
    <section class="login-visual"><div class="fiber-orb one"></div><div class="fiber-orb two"></div><div class="fiber-line l1"></div><div class="fiber-line l2"></div><div class="login-visual-copy"><span class="brand-kicker">FIBRA+</span><h1>Operação de provedor<br><em>em um único lugar.</em></h1><p>Rede, cobrança, clientes e atendimento conectados ao mesmo núcleo operacional.</p><div class="visual-badges"><span>Cloudflare</span><span>Neon</span><span>MikroTik</span><span>Mercado Pago / Efí</span></div></div></section>
    <section class="login-panel"><div class="login-box"><div class="login-brand"><span class="brand-symbol">F+</span><div><strong>Provedor Plus</strong><small>Centro de Operações</small></div></div><div class="login-copy"><span class="section-label">ACESSO SEGURO</span><h2>${configured?'Entrar no sistema':'Configurar administrador'}</h2><p>${configured?'Use seu acesso para continuar a operação.':'Crie o primeiro administrador desta instalação.'}</p></div><form id="login-form" class="form-stack">${configured?'':field('Nome','name','','text','required minlength="2"')}${field('Usuário','login','','text','required minlength="3" autocomplete="username"')}${field('Senha','password','','password','required minlength="8" autocomplete="current-password"')}<p class="form-error" id="login-error">${esc(message)}</p><button class="btn primary full" type="submit">${configured?'Entrar no Provedor Plus':'Criar administrador'}</button></form><div class="login-foot"><span class="signal-dot"></span> Ambiente operacional protegido</div></div></section>
  </main>`;
}
export function shellTemplate(user){
  const nav=NAV.filter(([id])=>navAllowed(user,id)).map(([id,label,icon],i)=>`<button class="module-tab${i===0?' active':''}" data-view="${id}" type="button"><span>${icon}</span>${label}</button>`).join('');
  const serviceStatusLink='<a class="module-tab" href="/service-status.html"><span>◌</span>Status Serviços</a>';
  const initial=esc((user?.name||'A').slice(0,1).toUpperCase());
  return `<div class="app-shell"><header class="command-header"><div class="command-top"><div class="brand-lockup"><span class="brand-symbol">F+</span><div><strong>Provedor Plus</strong><small>Centro de Operações ISP</small></div></div><div class="command-status"><span class="live-pill"><i></i> Sistema online</span><span class="infra-pill">Cloudflare + Neon</span></div><div class="command-user"><button class="round-action" data-action="refresh" type="button" title="Atualizar">↻</button><div class="avatar">${initial}</div><div class="user-meta"><strong>${esc(user?.name||'Administrador')}</strong><small>${esc(user?.role||'admin')}</small></div><button class="exit-button" data-action="logout" type="button">Sair</button></div></div><div class="command-title"><div><span class="section-label light">OPERAÇÃO</span><h1 id="page-title">Central</h1></div><p>Cadastros, cobrança, rede e Área do Cliente no mesmo fluxo.</p></div></header><nav class="module-nav" id="module-nav">${nav}${serviceStatusLink}</nav><main class="workspace" id="content"><div class="loading-card"><span class="loader"></span>Carregando operação...</div></main><footer class="app-footer"><span>Provedor Plus</span><span>•</span><span>Fibra+ Operações</span></footer><div id="modal-root"></div><div id="toast-root"></div></div>`;
}
