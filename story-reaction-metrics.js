(()=>{
'use strict';
if(window.__PP_STORY_REACTION_METRICS_INSTALLED__)return;
window.__PP_STORY_REACTION_METRICS_INSTALLED__=true;

const API='/api/story-reactions';
const ORDER=['❤️','😂','😮','😢','🙏','👏'];
let busy=false,lastLoad=0,metrics={};
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

function injectStyle(){if($('#pp-story-reaction-metrics-style'))return;const style=document.createElement('style');style.id='pp-story-reaction-metrics-style';style.textContent=`.pp-story-reactions-metric{margin-top:7px;padding-top:7px;border-top:1px solid #edf1f0;color:#526862;font-size:9px;line-height:1.5}.pp-story-reactions-metric strong{display:block;color:#294b43;font-size:9px}.pp-story-reactions-metric span{display:block;margin-top:2px;letter-spacing:.02em}`;document.head.appendChild(style)}
async function api(){const response=await fetch(API,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list',data:{}})});let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok)throw new Error(body.error||'Falha ao carregar reações.');return body.data||{}}
function visible(){const layer=$('.pp-stories-layer.pp-stories-visible');if(!layer)return false;const rect=layer.getBoundingClientRect();return rect.width>0&&rect.height>0}
function metricText(metric={}){const total=Number(metric.total)||0,counts=metric.counts||{},parts=ORDER.filter(emoji=>Number(counts[emoji])>0).map(emoji=>`${emoji} ${Number(counts[emoji])}`);return {title:`${total} ${total===1?'reação':'reações'}`,detail:parts.join(' · ')||'Nenhuma reação ainda'}}
function render(){injectStyle();$$('.pp-story-row[data-story-id]').forEach(row=>{const id=String(row.dataset.storyId||''),meta=$$('.pp-story-meta',row).at(-1);if(!id||!meta)return;let node=$('.pp-story-reactions-metric',meta);if(!node){node=document.createElement('div');node.className='pp-story-reactions-metric';meta.appendChild(node)}const copy=metricText(metrics[id]);const next=`<strong>${copy.title}</strong><span>${copy.detail}</span>`;if(node.innerHTML!==next)node.innerHTML=next})}
async function load(force=false){if(busy||!visible())return;if(!force&&Date.now()-lastLoad<15000){render();return}busy=true;try{const data=await api();metrics=data.reactions&&typeof data.reactions==='object'?data.reactions:{};lastLoad=Date.now();render()}catch{}finally{busy=false}}
function tick(){if(!visible())return;load(false)}

document.addEventListener('click',event=>{if(event.target?.closest?.('[data-pp-stories="1"]'))setTimeout(()=>load(true),180)},true);
setInterval(tick,2000);
window.addEventListener('focus',()=>load(true));
})();
