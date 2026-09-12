const refreshButton=document.querySelector('#refresh-status');
const grid=document.querySelector('#services-grid');
const summary=document.querySelector('#status-summary');
const checkedAt=document.querySelector('#checked-at');
const HISTORY_MS=24*60*60*1000;

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function statusMeta(kind){const map={operational:['Normal','ok'],degraded:['Instabilidade','warn'],outage:['Fora do ar','down'],maintenance:['Manutenção','maint'],error:['Sem resposta','unknown'],loading:['Consultando…','loading']};return map[kind]||['Sem confirmação','unknown'];}
function statusLevel(kind){return {operational:0,degraded:1,maintenance:2,outage:3,error:2.6}[kind]??2.6;}
function pointClass(kind){return ['operational','degraded','maintenance','outage'].includes(kind)?kind:'error';}
function formatTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d);}
function formatDateTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'medium'}).format(d);}

function chartStats(history){
  const valid=history.filter(item=>item.status!=='error'),normal=valid.filter(item=>item.status==='operational').length,attention=valid.filter(item=>item.status!=='operational').length;
  let transitions=0,wasAttention=false;
  for(const item of valid){const active=item.status!=='operational';if(active&&!wasAttention)transitions++;wasAttention=active;}
  return {availability:valid.length?normal/valid.length*100:null,attention,transitions,samples:history.length};
}

function chartHtml(history=[]){
  const now=Date.now(),from=now-HISTORY_MS,points=history.filter(item=>{const at=new Date(item.checkedAt).getTime();return Number.isFinite(at)&&at>=from;});
  const stats=chartStats(points),width=300,height=76,padX=8,padY=9,usableW=width-padX*2,usableH=height-padY*2;
  const toPoint=(item,index)=>{const at=new Date(item.checkedAt).getTime(),x=points.length>1?padX+Math.max(0,Math.min(1,(at-from)/HISTORY_MS))*usableW:width/2,y=padY+(statusLevel(item.status)/3)*usableH;return {x,y,status:item.status,index}};
  const plotted=points.map(toPoint),polyline=plotted.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),dots=plotted.map(p=>`<circle class="chart-dot ${pointClass(p.status)}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6"></circle>`).join('');
  const graph=points.length?`<svg class="status-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Histórico de status das últimas 24 horas"><line x1="${padX}" y1="${padY}" x2="${width-padX}" y2="${padY}" class="chart-guide"></line><line x1="${padX}" y1="${height-padY}" x2="${width-padX}" y2="${height-padY}" class="chart-guide"></line>${points.length>1?`<polyline points="${polyline}" class="chart-line"></polyline>`:''}${dots}</svg>`:`<div class="chart-empty">O histórico começará após a primeira coleta do Provedor Plus.</div>`;
  const availability=stats.availability==null?'—':`${stats.availability.toFixed(stats.availability>=99?1:0)}%`;
  return `<div class="service-chart"><div class="chart-head"><span>Últimas 24 horas</span><strong>${availability} normal</strong></div>${graph}<div class="chart-foot"><span>24h atrás</span><span>${stats.transitions} ocorrência(s) · ${stats.samples} amostra(s)</span><span>Agora</span></div></div>`;
}

function card(source,result={},history=[]){
  const kind=result.status||'loading',[label,cls]=statusMeta(kind),detail=result.detail||'Aguardando a primeira coleta do Provedor Plus.',components=Array.isArray(result.components)&&result.components.length?`<small class="components">${esc(result.components.join(' · '))}</small>`:'',responseMs=Number(result.responseMs)>0?` · ${Math.round(Number(result.responseMs))} ms`:'';
  return `<article class="service-card" data-service="${esc(source.id)}"><div class="service-top"><div><span class="service-category">${esc(source.category)}</span><h2>${esc(source.name)}</h2></div><span class="service-status ${cls}"><i></i>${esc(label)}</span></div><p>${esc(detail)}</p>${components}${chartHtml(history)}<div class="service-actions"><a href="${esc(source.page)}" target="_blank" rel="noopener noreferrer">Abrir fonte</a><span>${result.checkedAt?`Verificado ${esc(formatTime(result.checkedAt))}${esc(responseMs)}`:''}</span></div></article>`;
}

function renderPayload(data){
  const sources=Array.isArray(data?.sources)?data.sources:[],current=new Map((Array.isArray(data?.current)?data.current:[]).map(item=>[item.id,item])),histories=new Map();
  for(const item of Array.isArray(data?.history)?data.history:[]){if(!histories.has(item.id))histories.set(item.id,[]);histories.get(item.id).push(item);}
  grid.innerHTML=sources.length?sources.map(source=>card(source,current.get(source.id)||{},histories.get(source.id)||[])).join(''):'<article class="service-card"><h2>Nenhum serviço disponível</h2><p>O monitoramento ainda não retornou a lista de serviços.</p></article>';
  const values=[...current.values()],automatic=values.filter(item=>item.status!=='error'),affected=automatic.filter(item=>['degraded','outage','maintenance'].includes(item.status)),errors=values.filter(item=>item.status==='error');
  summary.innerHTML=`<article><span>Monitorados automaticamente</span><strong>${automatic.length}</strong></article><article><span>Com atenção agora</span><strong>${affected.length}</strong></article><article><span>Sem resposta agora</span><strong>${errors.length}</strong></article>`;
  checkedAt.textContent=`Última atualização: ${formatDateTime(data?.generatedAt||new Date())}`;
}

async function loadStatus(force=false){
  if(refreshButton.disabled)return;
  refreshButton.disabled=true;refreshButton.textContent=force?'Atualizando…':'Consultando…';
  try{
    const response=await fetch(`/api/service-status${force?'?refresh=1':''}`,{method:'GET',credentials:'same-origin',cache:'no-store'});
    let body={};try{body=await response.json()}catch{}
    if(response.status===401){location.replace('/');return}
    if(!response.ok||body?.ok!==true)throw new Error(body?.error||`HTTP ${response.status}`);
    renderPayload(body.data||{});
  }catch(error){
    checkedAt.textContent=`Falha ao atualizar: ${error instanceof Error?error.message:String(error)}`;
  }finally{refreshButton.disabled=false;refreshButton.textContent='Atualizar agora';}
}

grid.innerHTML='<article class="service-card loading-card"><span class="loader"></span><strong>Carregando monitoramento…</strong><p>Buscando o status e o histórico das últimas 24 horas.</p></article>';
refreshButton.addEventListener('click',()=>loadStatus(true));
await loadStatus(false);
setInterval(()=>loadStatus(false),60000);
