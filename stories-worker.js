import {neon} from '@neondatabase/serverless';
import {handleNativeAuth} from './worker-native-api.js';

const STORE_KEY='customer_stories_v1';
const ADMIN_PATH='/api/stories';
const CUSTOMER_PATH='/api/customer-stories';
const CUSTOMER_ORIGINS=new Set(['https://cliente.fibramais.workers.dev','https://client.fibramais.workers.dev']);
const utf8=new TextEncoder();
const text=value=>String(value??'').trim();
const normalize=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}})}
function customerCors(request){const origin=text(request.headers.get('origin')),headers={'Vary':'Origin','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'};if(CUSTOMER_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;return headers}
function parseStore(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}return {}}
function emptyStore(){return {version:1,stories:[]}}
async function readStore(env){if(!env.DATABASE_URL)throw Object.assign(new Error('Banco de dados não configurado.'),{statusCode:503});const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${STORE_KEY} LIMIT 1`,parsed=parseStore(rows?.[0]?.value);return {sql,store:{...emptyStore(),...parsed,stories:Array.isArray(parsed?.stories)?parsed.stories:[]}}}
async function writeStore(sql,store){const at=new Date().toISOString(),raw=JSON.stringify({...store,version:1});await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${STORE_KEY},${raw}::jsonb,${at}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;return at}

async function requireAdmin(request,env){const headers=new Headers(request.headers);headers.set('Content-Type','application/json');const authRequest=new Request(request.url,{method:'POST',headers,body:JSON.stringify({action:'status'})}),response=await handleNativeAuth(authRequest,env);let body={};try{body=await response.json()}catch{}if(!response.ok||!body.ok||body?.data?.authenticated!==true)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});const user=body.data.user||{};if(normalize(user?.role)!=='admin')throw Object.assign(new Error('Somente o administrador pode gerenciar publicidades.'),{statusCode:403});return user}
function b64urlBytes(value){let raw=text(value).replace(/-/g,'+').replace(/_/g,'/');while(raw.length%4)raw+='=';const bin=atob(raw),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
async function portalKey(env){const secret=text(env.PORTAL_SESSION_SECRET)||text(env.DATABASE_URL);if(!secret)throw Object.assign(new Error('Sessão segura da Área do Cliente não configurada.'),{statusCode:503});return crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify'])}
async function verifySession(token,env){const parts=text(token).split('.');if(parts.length!==2)throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'),{statusCode:401});try{const key=await portalKey(env),ok=await crypto.subtle.verify('HMAC',key,b64urlBytes(parts[1]),utf8.encode(parts[0]));if(!ok)throw new Error('assinatura');const payload=JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0]))),clientId=Number(payload?.clientId)||0,exp=Number(payload?.exp)||0;if(!clientId||exp<=Date.now())throw new Error('expirada');return {clientId}}catch{throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'),{statusCode:401})}}
async function customer(sql,id){const rows=await sql`SELECT id,name,status,plan_id,plan,city,state FROM pp_clients WHERE id=${Number(id)} LIMIT 1`;return rows?.[0]||null}

function safeHttps(value){const url=text(value);if(!url)return '';try{const parsed=new URL(url);return parsed.protocol==='https:'?parsed.toString():''}catch{return''}}
function isoOrEmpty(value){const raw=text(value);if(!raw)return '';const date=new Date(raw);return Number.isNaN(date.getTime())?'':date.toISOString()}
function clampInt(value,min,max,fallback=0){const n=Math.round(Number(value));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
function uniqueIds(value){return [...new Set((Array.isArray(value)?value:[]).map(Number).filter(Number.isFinite))].slice(-10000)}
function normalizeStory(input={},existing={}){
  const now=new Date().toISOString(),mediaType=text(input.mediaType||existing.mediaType)==='video'?'video':'image',mediaUrl=safeHttps(input.mediaUrl===undefined?existing.mediaUrl:input.mediaUrl),actionUrl=safeHttps(input.actionUrl===undefined?existing.actionUrl:input.actionUrl),audience=['all','active','blocked'].includes(text(input.audience||existing.audience))?text(input.audience||existing.audience):'all';
  if(!text(input.title===undefined?existing.title:input.title))throw Object.assign(new Error('Informe o título do story.'),{statusCode:400});
  if(!mediaUrl)throw Object.assign(new Error('Informe uma URL HTTPS válida para a imagem ou vídeo.'),{statusCode:400});
  const startAt=isoOrEmpty(input.startAt===undefined?existing.startAt:input.startAt),endAt=isoOrEmpty(input.endAt===undefined?existing.endAt:input.endAt);if(startAt&&endAt&&new Date(endAt)<=new Date(startAt))throw Object.assign(new Error('A data final precisa ser posterior à data inicial.'),{statusCode:400});
  return {
    id:text(existing.id)||text(input.id)||crypto.randomUUID(),
    title:text(input.title===undefined?existing.title:input.title).slice(0,80),
    message:text(input.message===undefined?existing.message:input.message).slice(0,400),
    mediaType,mediaUrl,
    actionLabel:text(input.actionLabel===undefined?existing.actionLabel:input.actionLabel).slice(0,40),
    actionUrl,
    active:input.active===undefined?(existing.active!==false):Boolean(input.active),
    startAt,endAt,audience,
    planId:Math.max(0,Number(input.planId===undefined?existing.planId:input.planId)||0)||null,
    city:text(input.city===undefined?existing.city:input.city).slice(0,80),
    order:clampInt(input.order===undefined?existing.order:input.order,0,9999,0),
    views:Math.max(0,Number(existing.views)||0),clicks:Math.max(0,Number(existing.clicks)||0),
    viewerIds:uniqueIds(existing.viewerIds),clickerIds:uniqueIds(existing.clickerIds),
    createdAt:text(existing.createdAt)||now,updatedAt:now
  };
}
function adminStory(story){return {...story,viewerIds:undefined,clickerIds:undefined,uniqueViews:uniqueIds(story.viewerIds).length,uniqueClicks:uniqueIds(story.clickerIds).length}}
function publicStory(story){return {id:text(story.id),title:text(story.title),message:text(story.message),mediaType:story.mediaType==='video'?'video':'image',mediaUrl:text(story.mediaUrl),actionLabel:text(story.actionLabel),actionUrl:text(story.actionUrl),order:Number(story.order)||0}}
function isBlockedStatus(value){const status=normalize(value);return ['bloqueado','suspenso','atrasado','inadimplente'].some(term=>status.includes(term))}
function isActiveStatus(value){const status=normalize(value);return !['cancelado','inativo','bloqueado','suspenso'].some(term=>status.includes(term))}
function visibleTo(story,client,now=Date.now()){
  if(story?.active===false)return false;
  const start=story?.startAt?new Date(story.startAt).getTime():0,end=story?.endAt?new Date(story.endAt).getTime():0;if(start&&now<start)return false;if(end&&now>end)return false;
  if(story?.audience==='active'&&!isActiveStatus(client?.status))return false;if(story?.audience==='blocked'&&!isBlockedStatus(client?.status))return false;
  if(Number(story?.planId)>0&&Number(story.planId)!==Number(client?.plan_id))return false;
  if(text(story?.city)&&normalize(story.city)!==normalize(client?.city))return false;
  return true;
}
function sortedVisible(store,client){return (Array.isArray(store?.stories)?store.stories:[]).filter(story=>visibleTo(story,client)).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')))}

async function handleAdmin(request,env){if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405);try{const user=await requireAdmin(request,env);let body={};try{body=await request.json()}catch{}const action=text(body?.action),data=body?.data||{},ctx=await readStore(env),stories=ctx.store.stories;
  if(action==='list')return json({ok:true,data:{stories:stories.map(adminStory),summary:{total:stories.length,active:stories.filter(item=>item.active!==false).length,views:stories.reduce((sum,item)=>sum+(Number(item.views)||0),0),uniqueViews:stories.reduce((sum,item)=>sum+uniqueIds(item.viewerIds).length,0),clicks:stories.reduce((sum,item)=>sum+(Number(item.clicks)||0),0)}}});
  if(action==='save'){const id=text(data.id),index=id?stories.findIndex(item=>text(item.id)===id):-1,existing=index>=0?stories[index]:{},story=normalizeStory(data,existing);story.updatedBy=text(user?.name)||'Administrador';if(index>=0)stories[index]=story;else stories.push(story);await writeStore(ctx.sql,ctx.store);return json({ok:true,data:{story:adminStory(story)}})}
  if(action==='delete'){const id=text(data.id),index=stories.findIndex(item=>text(item.id)===id);if(index<0)throw Object.assign(new Error('Story não encontrado.'),{statusCode:404});stories.splice(index,1);await writeStore(ctx.sql,ctx.store);return json({ok:true,data:{deleted:true,id}})}
  if(action==='toggle'){const id=text(data.id),story=stories.find(item=>text(item.id)===id);if(!story)throw Object.assign(new Error('Story não encontrado.'),{statusCode:404});story.active=data.active===undefined?!story.active:Boolean(data.active);story.updatedAt=new Date().toISOString();story.updatedBy=text(user?.name)||'Administrador';await writeStore(ctx.sql,ctx.store);return json({ok:true,data:{story:adminStory(story)}})}
  throw Object.assign(new Error('Ação de publicidade não permitida.'),{statusCode:400});
}catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500)}}

async function recordMetric(ctx,storyId,clientId,type){const story=ctx.store.stories.find(item=>text(item.id)===text(storyId));if(!story)return;const ids=type==='click'?uniqueIds(story.clickerIds):uniqueIds(story.viewerIds),already=ids.includes(Number(clientId));if(!already)ids.push(Number(clientId));if(type==='click'){story.clicks=Math.max(0,Number(story.clicks)||0)+1;story.clickerIds=ids.slice(-10000)}else{story.views=Math.max(0,Number(story.views)||0)+1;story.viewerIds=ids.slice(-10000)}story.updatedAt=text(story.updatedAt)||new Date().toISOString();await writeStore(ctx.sql,ctx.store)}
async function handleCustomer(request,env){const cors=customerCors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,cors);try{const origin=text(request.headers.get('origin'));if(!CUSTOMER_ORIGINS.has(origin))throw Object.assign(new Error('Origem não autorizada.'),{statusCode:403});let body={};try{body=await request.json()}catch{}const action=text(body?.action)||'list',data=body?.data||{},session=await verifySession(data.session,env),ctx=await readStore(env),client=await customer(ctx.sql,session.clientId);if(!client)throw Object.assign(new Error('Cliente não encontrado.'),{statusCode:404});const visible=sortedVisible(ctx.store,client);
  if(action==='list')return json({ok:true,data:{stories:visible.map(publicStory)}},200,cors);
  const story=visible.find(item=>text(item.id)===text(data.id));if(!story)throw Object.assign(new Error('Publicidade não disponível.'),{statusCode:404});if(action==='view'){await recordMetric(ctx,story.id,client.id,'view');return json({ok:true,data:{recorded:true}},200,cors)}if(action==='click'){await recordMetric(ctx,story.id,client.id,'click');return json({ok:true,data:{recorded:true}},200,cors)}throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
}catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,cors)}}

export function isStoriesPath(path){return path===ADMIN_PATH||path===CUSTOMER_PATH}
export function handleStoriesRequest(request,env){const path=new URL(request.url).pathname;return path===CUSTOMER_PATH?handleCustomer(request,env):handleAdmin(request,env)}
