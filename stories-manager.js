(()=>{
'use strict';
if(window.__PP_STORIES_MANAGER_INSTALLED__)return;
window.__PP_STORIES_MANAGER_INSTALLED__=true;

const API='/api/stories';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let stories=[];
let loading=false;
let activeButton=null;
let overlay=null;
let rootObserver=null;
let scanTimer=null;

function toast(message,error=false){
  document.querySelector('.pp-stories-toast')?.remove();
  const node=document.createElement('div');
  node.className='pp-stories-toast';
  node.textContent=message;
  Object.assign(node.style,{position:'fixed',left:'50%',bottom:'18px',zIndex:'15000',transform:'translateX(-50%)',padding:'11px 15px',borderRadius:'10px',background:error?'#9b2c2c':'#174f44',color:'#fff',font:'700 11px/1.4 Segoe UI,Arial',boxShadow:'0 12px 35px rgba(0,0,0,.2)'});
  document.body.appendChild(node);
  setTimeout(()=>node.remove(),4200);
}

async function api(action,data={}){
  const response=await fetch(API,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})});
  let body={};
  try{body=await response.json()}catch{}
  if(!response.ok||!body.ok)throw new Error(body.error||`Falha ao acessar publicidade (HTTP ${response.status}).`);
  return body.data||{};
}

function fmtDate(value){
  if(!value)return 'Sem limite';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date);
}
function toLocalInput(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}
function toIso(value){
  if(!value)return '';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toISOString();
}

function injectStyle(){
  if($('#pp-stories-style'))return;
  const style=document.createElement('style');
  style.id='pp-stories-style';
  style.textContent=`
.pp-stories-layer{display:none;position:fixed;z-index:1200;overflow:auto;box-sizing:border-box;padding:24px;background:#f6f8f7;color:#243b36;font-family:Segoe UI,Arial,sans-serif}.pp-stories-layer.pp-stories-visible{display:block!important;visibility:visible!important;opacity:1!important}.pp-stories-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}.pp-stories-head h2{margin:0;color:#173c35;font-size:22px}.pp-stories-head p{margin:5px 0 0;color:#6f817c;font-size:11px}.pp-stories-primary{min-height:40px;padding:0 15px;border:0;border-radius:10px;background:#0b8f7c;color:#fff;font-weight:800;font-size:11px;cursor:pointer}.pp-stories-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.pp-stories-summary article{padding:14px;border:1px solid #dfe9e6;border-radius:12px;background:#fff}.pp-stories-summary span,.pp-stories-summary strong{display:block}.pp-stories-summary span{color:#82918d;font-size:8px;text-transform:uppercase}.pp-stories-summary strong{margin-top:5px;color:#173c35;font-size:20px}.pp-stories-list{display:grid;gap:10px}.pp-story-row{display:grid;grid-template-columns:76px minmax(180px,1.6fr) minmax(120px,.75fr) minmax(145px,.8fr) auto;align-items:center;gap:12px;padding:12px;border:1px solid #dfe9e6;border-radius:14px;background:#fff}.pp-story-thumb{width:76px;height:76px;border-radius:12px;overflow:hidden;background:#edf3f1;display:grid;place-items:center;color:#6b7f79;font-size:10px;font-weight:800}.pp-story-thumb img{width:100%;height:100%;object-fit:cover}.pp-story-main strong{display:block;color:#213d36;font-size:12px}.pp-story-main p{margin:4px 0 0;color:#74847f;font-size:9px;line-height:1.4}.pp-story-meta span{display:block;color:#82918d;font-size:8px}.pp-story-meta b{display:block;margin-top:3px;color:#405852;font-size:10px}.pp-story-status{display:inline-flex;width:max-content;margin-top:5px;padding:4px 7px;border-radius:999px;background:#eaf8f2;color:#16765a;font-size:8px;font-weight:900}.pp-story-status.off{background:#f1f2f2;color:#7b8582}.pp-story-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pp-story-actions button{min-height:32px;padding:0 9px;border:1px solid #d5e0dd;border-radius:8px;background:#fff;color:#28554b;font-size:9px;font-weight:800;cursor:pointer}.pp-story-actions button.danger{color:#a34242;border-color:#ead0d0}.pp-story-empty{padding:32px;border:1px dashed #cfded9;border-radius:14px;text-align:center;color:#7b8a86;background:#fff;font-size:11px}.pp-stories-modal{position:fixed;inset:0;z-index:14500;display:grid;place-items:center;padding:18px;background:rgba(16,35,30,.48)}.pp-stories-dialog{width:min(760px,96vw);max-height:92vh;overflow:auto;border-radius:16px;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.25)}.pp-stories-dialog-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e6eeeb}.pp-stories-dialog-head h3{margin:0;color:#173c35;font-size:16px}.pp-stories-close{width:34px;height:34px;border:0;border-radius:9px;background:#eef4f2;color:#395f56;cursor:pointer}.pp-stories-form{padding:18px 20px}.pp-stories-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pp-stories-grid label{display:grid;gap:5px;color:#61736e;font-size:9px;font-weight:750}.pp-stories-grid label.full{grid-column:1/-1}.pp-stories-grid input,.pp-stories-grid select,.pp-stories-grid textarea{width:100%;box-sizing:border-box;border:1px solid #d7e1de;border-radius:9px;background:#fff;padding:9px;color:#27453e;font:500 11px/1.35 Segoe UI,Arial}.pp-stories-grid textarea{min-height:84px;resize:vertical}.pp-stories-hint{margin:10px 0 0;color:#899792;font-size:8px;line-height:1.4}.pp-stories-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.pp-stories-form-actions button{min-height:38px;padding:0 14px;border-radius:9px;font-size:10px;font-weight:800;cursor:pointer}.pp-stories-cancel{border:1px solid #d7e1de;background:#fff;color:#526862}.pp-stories-save{border:0;background:#0b8f7c;color:#fff}@media(max-width:980px){.pp-stories-summary{grid-template-columns:repeat(2,1fr)}.pp-story-row{grid-template-columns:68px 1fr auto}.pp-story-meta{grid-column:2}.pp-story-actions{grid-column:3;grid-row:1/3;flex-direction:column}}@media(max-width:640px){.pp-stories-layer{padding:15px}.pp-stories-head{flex-direction:column}.pp-stories-primary{width:100%}.pp-stories-summary{grid-template-columns:1fr 1fr}.pp-story-row{grid-template-columns:58px 1fr}.pp-story-thumb{width:58px;height:58px}.pp-story-meta,.pp-story-actions{grid-column:1/-1}.pp-story-actions{grid-column:1/-1;grid-row:auto;flex-direction:row;justify-content:flex-start}.pp-stories-grid{grid-template-columns:1fr}.pp-stories-grid label.full{grid-column:auto}}
`;
  document.head.appendChild(style);
}

function storyIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>'}
function visibleNav(){
  const navs=$$('.app-shell .sidebar nav,.app-shell aside nav');
  return navs.find(nav=>{const r=nav.getBoundingClientRect();return r.width>0&&r.height>0})||navs[0]||null;
}
function ensureButton(){
  const nav=visibleNav();
  if(!nav)return null;
  let button=nav.querySelector('[data-pp-stories="1"]');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.dataset.ppStories='1';
    button.innerHTML=`${storyIcon()}<span>Publicidade</span>`;
    const staff=[...nav.querySelectorAll('button')].find(item=>/funcion/i.test(item.textContent||''));
    staff?nav.insertBefore(button,staff):nav.appendChild(button);
  }
  return button;
}
function resolveContent(button){
  const shell=button?.closest?.('.app-shell')||document.querySelector('.app-shell');
  const candidates=shell?$$('.content',shell):$$('.content');
  const visible=candidates.filter(node=>{const r=node.getBoundingClientRect();return r.width>250&&r.height>180});
  return visible.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return br.width*br.height-ar.width*ar.height})[0]||candidates[0]||null;
}
function ensureOverlay(){
  injectStyle();
  if(overlay?.isConnected)return overlay;
  overlay=document.createElement('section');
  overlay.className='pp-stories-layer';
  overlay.innerHTML='<div class="pp-stories-head"><div><h2>Publicidade / Stories</h2><p>Publique campanhas na Área do Cliente e acompanhe visualizações e cliques.</p></div><button class="pp-stories-primary" data-story-new type="button">+ Novo story</button></div><div class="pp-stories-summary" data-story-summary></div><div class="pp-stories-list" data-story-list><div class="pp-story-empty">Carregando publicidades...</div></div>';
  document.body.appendChild(overlay);
  return overlay;
}
function positionOverlay(){
  if(!overlay?.classList.contains('pp-stories-visible')||!activeButton)return;
  const content=resolveContent(activeButton);
  const rect=content?.getBoundingClientRect();
  if(rect&&rect.width>250&&rect.height>180){
    overlay.style.left=`${Math.max(0,rect.left)}px`;
    overlay.style.top=`${Math.max(0,rect.top)}px`;
    overlay.style.width=`${rect.width}px`;
    overlay.style.height=`${Math.max(rect.height,window.innerHeight-rect.top)}px`;
  }else{
    const sidebar=activeButton.closest('.sidebar,aside');
    const sideRect=sidebar?.getBoundingClientRect();
    const left=Math.max(0,sideRect?.right||245);
    overlay.style.left=`${left}px`;
    overlay.style.top='0';
    overlay.style.width=`${Math.max(320,window.innerWidth-left)}px`;
    overlay.style.height='100vh';
  }
}
function audienceLabel(story){if(story.audience==='active')return 'Clientes ativos';if(story.audience==='blocked')return 'Clientes bloqueados';return 'Todos os clientes'}
function render(data={}){
  stories=Array.isArray(data.stories)?data.stories:stories;
  const layer=ensureOverlay();
  const summary=data.summary||{total:stories.length,active:stories.filter(item=>item.active!==false).length,uniqueViews:stories.reduce((sum,item)=>sum+(Number(item.uniqueViews)||0),0),clicks:stories.reduce((sum,item)=>sum+(Number(item.clicks)||0),0)};
  $('[data-story-summary]',layer).innerHTML=`<article><span>Stories</span><strong>${Number(summary.total)||0}</strong></article><article><span>Ativos</span><strong>${Number(summary.active)||0}</strong></article><article><span>Clientes alcançados</span><strong>${Number(summary.uniqueViews)||0}</strong></article><article><span>Cliques</span><strong>${Number(summary.clicks)||0}</strong></article>`;
  const list=$('[data-story-list]',layer);
  if(!stories.length){list.innerHTML='<div class="pp-story-empty">Nenhum story cadastrado. Clique em “Novo story” para publicar a primeira campanha.</div>';return}
  list.innerHTML=stories.slice().sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)).map(story=>`<article class="pp-story-row" data-story-id="${esc(story.id)}"><div class="pp-story-thumb">${story.mediaType==='image'?`<img src="${esc(story.mediaUrl)}" alt="">`:'▶ Vídeo'}</div><div class="pp-story-main"><strong>${esc(story.title)}</strong><p>${esc(story.message||'Sem texto adicional')}</p><span class="pp-story-status ${story.active===false?'off':''}">${story.active===false?'Pausado':'Ativo'}</span></div><div class="pp-story-meta"><span>Público</span><b>${esc(audienceLabel(story))}</b><span style="margin-top:6px">Período</span><b>${esc(fmtDate(story.startAt))} → ${esc(fmtDate(story.endAt))}</b></div><div class="pp-story-meta"><span>Resultado</span><b>${Number(story.views)||0} visualizações</b><b>${Number(story.uniqueViews)||0} clientes</b><b>${Number(story.clicks)||0} cliques</b></div><div class="pp-story-actions"><button data-story-edit type="button">Editar</button><button data-story-toggle type="button">${story.active===false?'Ativar':'Pausar'}</button><button class="danger" data-story-delete type="button">Excluir</button></div></article>`).join('');
}
async function load(){
  if(loading)return;
  loading=true;
  try{render(await api('list'))}
  catch(error){toast(error.message||String(error),true);const list=overlay?.querySelector('[data-story-list]');if(list)list.innerHTML=`<div class="pp-story-empty">${esc(error.message||String(error))}</div>`}
  finally{loading=false}
}
function open(button){
  activeButton=button;
  const layer=ensureOverlay();
  layer.classList.add('pp-stories-visible');
  positionOverlay();
  $$('.app-shell .sidebar nav button,.app-shell aside nav button').forEach(item=>item.classList.toggle('active',item===button));
  load();
}
function close(){
  overlay?.classList.remove('pp-stories-visible');
  if(activeButton)activeButton.classList.remove('active');
  activeButton=null;
}
function storyById(id){return stories.find(item=>String(item.id)===String(id))||null}
function modal(story=null){
  document.querySelector('.pp-stories-modal')?.remove();
  const node=document.createElement('div');
  node.className='pp-stories-modal';
  node.innerHTML=`<div class="pp-stories-dialog"><div class="pp-stories-dialog-head"><h3>${story?'Editar story':'Novo story'}</h3><button class="pp-stories-close" type="button" data-story-modal-close>×</button></div><form class="pp-stories-form" data-story-form><input type="hidden" name="id" value="${esc(story?.id||'')}"><div class="pp-stories-grid"><label><span>Título</span><input name="title" maxlength="80" required value="${esc(story?.title||'')}"></label><label><span>Tipo de mídia</span><select name="mediaType"><option value="image" ${story?.mediaType!=='video'?'selected':''}>Imagem</option><option value="video" ${story?.mediaType==='video'?'selected':''}>Vídeo</option></select></label><label class="full"><span>URL HTTPS da imagem ou vídeo</span><input name="mediaUrl" type="url" required placeholder="https://..." value="${esc(story?.mediaUrl||'')}"></label><label class="full"><span>Texto da publicidade</span><textarea name="message" maxlength="400">${esc(story?.message||'')}</textarea></label><label><span>Texto do botão</span><input name="actionLabel" maxlength="40" placeholder="Saiba mais" value="${esc(story?.actionLabel||'')}"></label><label><span>Link do botão</span><input name="actionUrl" type="url" placeholder="https://..." value="${esc(story?.actionUrl||'')}"></label><label><span>Público</span><select name="audience"><option value="all" ${!story||story.audience==='all'?'selected':''}>Todos os clientes</option><option value="active" ${story?.audience==='active'?'selected':''}>Somente ativos</option><option value="blocked" ${story?.audience==='blocked'?'selected':''}>Somente bloqueados</option></select></label><label><span>Plano específico (ID, opcional)</span><input name="planId" type="number" min="0" value="${esc(story?.planId||'')}"></label><label><span>Cidade (opcional)</span><input name="city" maxlength="80" value="${esc(story?.city||'')}"></label><label><span>Ordem</span><input name="order" type="number" min="0" max="9999" value="${Number(story?.order)||0}"></label><label><span>Início da publicação</span><input name="startAt" type="datetime-local" value="${esc(toLocalInput(story?.startAt))}"></label><label><span>Fim da publicação</span><input name="endAt" type="datetime-local" value="${esc(toLocalInput(story?.endAt))}"></label><label><span>Status</span><select name="active"><option value="true" ${story?.active!==false?'selected':''}>Ativo</option><option value="false" ${story?.active===false?'selected':''}>Pausado</option></select></label></div><p class="pp-stories-hint">Você pode deixar início e fim em branco para manter a publicação sem limite de data. O story só aparece para clientes que atendem ao público definido.</p><div class="pp-stories-form-actions"><button class="pp-stories-cancel" type="button" data-story-modal-close>Cancelar</button><button class="pp-stories-save" type="submit">Salvar story</button></div></form></div>`;
  document.body.appendChild(node);
}
async function saveForm(form){
  const fd=new FormData(form);
  const payload={id:String(fd.get('id')||''),title:String(fd.get('title')||''),mediaType:String(fd.get('mediaType')||'image'),mediaUrl:String(fd.get('mediaUrl')||''),message:String(fd.get('message')||''),actionLabel:String(fd.get('actionLabel')||''),actionUrl:String(fd.get('actionUrl')||''),audience:String(fd.get('audience')||'all'),planId:Number(fd.get('planId')||0)||null,city:String(fd.get('city')||''),order:Number(fd.get('order')||0),startAt:toIso(fd.get('startAt')),endAt:toIso(fd.get('endAt')),active:String(fd.get('active'))!=='false'};
  const button=$('.pp-stories-save',form);
  if(button){button.disabled=true;button.textContent='Salvando...'}
  try{await api('save',payload);document.querySelector('.pp-stories-modal')?.remove();toast('Story salvo e sincronizado com a Área do Cliente.');await load()}
  catch(error){toast(error.message||String(error),true);if(button){button.disabled=false;button.textContent='Salvar story'}}
}
function scheduleScan(){clearTimeout(scanTimer);scanTimer=setTimeout(()=>ensureButton(),50)}
function handleWindowClick(event){
  const storiesButton=event.target.closest?.('[data-pp-stories="1"]');
  if(storiesButton){event.preventDefault();event.stopImmediatePropagation();open(storiesButton);return}
  const navButton=event.target.closest?.('.app-shell .sidebar nav button,.app-shell aside nav button');
  if(navButton&&activeButton)close();
}
function handleDocumentClick(event){
  if(event.target.closest?.('[data-story-new]')){event.preventDefault();modal();return}
  if(event.target.closest?.('[data-story-modal-close]')){event.preventDefault();document.querySelector('.pp-stories-modal')?.remove();return}
  const row=event.target.closest?.('[data-story-id]');
  if(!row)return;
  const id=row.dataset.storyId;
  if(event.target.closest?.('[data-story-edit]')){event.preventDefault();modal(storyById(id));return}
  if(event.target.closest?.('[data-story-toggle]')){event.preventDefault();const story=storyById(id);api('toggle',{id,active:story?.active===false}).then(()=>{toast(story?.active===false?'Story ativado.':'Story pausado.');return load()}).catch(error=>toast(error.message||String(error),true));return}
  if(event.target.closest?.('[data-story-delete]')){event.preventDefault();if(!confirm('Excluir este story?'))return;api('delete',{id}).then(()=>{toast('Story excluído.');return load()}).catch(error=>toast(error.message||String(error),true))}
}
function init(){
  injectStyle();
  ensureButton();
  window.addEventListener('click',handleWindowClick,true);
  document.addEventListener('click',handleDocumentClick,true);
  document.addEventListener('submit',event=>{const form=event.target.closest?.('[data-story-form]');if(!form)return;event.preventDefault();saveForm(form)},true);
  window.addEventListener('resize',positionOverlay);
  window.addEventListener('scroll',positionOverlay,true);
  const root=document.getElementById('root');
  if(root){rootObserver=new MutationObserver(scheduleScan);rootObserver.observe(root,{childList:true,subtree:true})}
  setTimeout(scheduleScan,300);
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
