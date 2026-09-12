import {neon} from '@neondatabase/serverless';

const STATUS_PATH='/api/service-status';
const HISTORY_WINDOW_HOURS=24;
const HISTORY_BUCKET_MS=5*60*1000;
const SOURCE_TIMEOUT_MS=6500;
const SOURCE_BATCH_SIZE=6;
let serviceStatusSchemaReady=false;

const SOURCES=[
  {id:'discord',name:'Discord',category:'Comunicação',kind:'statuspage',endpoint:'https://discordstatus.com/api/v2/summary.json',page:'https://discordstatus.com/'},
  {id:'epic',name:'Epic Games / Fortnite',category:'Jogos',kind:'statuspage',endpoint:'https://status.epicgames.com/api/v2/summary.json',page:'https://status.epicgames.com/'},
  {id:'roblox',name:'Roblox',category:'Jogos',kind:'statuspage',endpoint:'https://status.roblox.com/api/v2/summary.json',page:'https://status.roblox.com/'},
  {id:'mercado-pago',name:'Mercado Pago',category:'Pagamentos',kind:'statuspage',endpoint:'https://status.mercadopago.com/api/v2/summary.json',page:'https://status.mercadopago.com/'},
  {id:'cloudflare',name:'Cloudflare',category:'Infraestrutura',kind:'statuspage',endpoint:'https://www.cloudflarestatus.com/api/v2/summary.json',page:'https://www.cloudflarestatus.com/'},
  {id:'github',name:'GitHub',category:'Infraestrutura',kind:'statuspage',endpoint:'https://www.githubstatus.com/api/v2/summary.json',page:'https://www.githubstatus.com/'},
  {id:'pagbank',name:'PagBank',category:'Pagamentos',kind:'statuspage',endpoint:'https://status.pagbank.com.br/api/v2/summary.json',page:'https://status.pagbank.com.br/'},
  {id:'google-cloud',name:'Google Cloud',category:'Infraestrutura',kind:'google',endpoint:'https://status.cloud.google.com/incidents.json',page:'https://status.cloud.google.com/'},
  {id:'playstation',name:'PlayStation Network',category:'Jogos',kind:'html',endpoint:'https://status.playstation.com/pt-br/',page:'https://status.playstation.com/pt-br/'},
  {id:'whatsapp',name:'WhatsApp Business',category:'Meta',kind:'html',endpoint:'https://metastatus.com/whatsapp-business-api',page:'https://metastatus.com/whatsapp-business-api'},
  {id:'instagram',name:'Instagram / Meta API',category:'Meta',kind:'html',endpoint:'https://metastatus.com/graph-api',page:'https://metastatus.com/graph-api'},
  {id:'facebook',name:'Facebook / Meta API',category:'Meta',kind:'html',endpoint:'https://metastatus.com/graph-api',page:'https://metastatus.com/graph-api'},
  {id:'riot',name:'Riot Games · LoL / VALORANT',category:'Jogos',kind:'html',endpoint:'https://status.riotgames.com/?locale=pt_BR&product=all&region=br',page:'https://status.riotgames.com/?locale=pt_BR&product=all&region=br'},
  {id:'xbox',name:'Xbox Network',category:'Jogos',kind:'html',endpoint:'https://support.xbox.com/pt-BR/xbox-live-status',page:'https://support.xbox.com/pt-BR/xbox-live-status'},
  {id:'claro',name:'Claro',category:'Telecom',kind:'probe',endpoint:'https://www.claro.com.br/',page:'https://www.claro.com.br/'},
  {id:'vivo',name:'Vivo',category:'Telecom',kind:'probe',endpoint:'https://vivo.com.br/',page:'https://vivo.com.br/'},
  {id:'tim',name:'TIM',category:'Telecom',kind:'probe',endpoint:'https://www.tim.com.br/',page:'https://www.tim.com.br/'},
  {id:'caixa',name:'Caixa Econômica Federal',category:'Bancos',kind:'probe',endpoint:'https://www.caixa.gov.br/',page:'https://www.caixa.gov.br/'},
  {id:'google',name:'Google',category:'Serviços web',kind:'probe',endpoint:'https://www.google.com/',page:'https://www.google.com/'},
  {id:'youtube',name:'YouTube',category:'Streaming',kind:'probe',endpoint:'https://www.youtube.com/',page:'https://www.youtube.com/'},
  {id:'pix',name:'Pix',category:'Pagamentos',kind:'probe',endpoint:'https://www.bcb.gov.br/estabilidadefinanceira/indice-disponibilidade-spi',page:'https://www.bcb.gov.br/estabilidadefinanceira/indice-disponibilidade-spi'},
  {id:'sefaz',name:'Sefaz',category:'Governo',kind:'probe',endpoint:'https://www.nfe.fazenda.gov.br/portal/disponibilidade.aspx?versao=0.00',page:'https://www.nfe.fazenda.gov.br/portal/disponibilidade.aspx?versao=0.00'},
  {id:'gemini',name:'Google Gemini',category:'IA',kind:'probe',endpoint:'https://gemini.google.com/',page:'https://gemini.google.com/'},
  {id:'bradesco',name:'Bradesco',category:'Bancos',kind:'probe',endpoint:'https://banco.bradesco/',page:'https://banco.bradesco/'},
  {id:'nubank',name:'Nubank',category:'Bancos',kind:'probe',endpoint:'https://nubank.com.br/',page:'https://nubank.com.br/'},
  {id:'openai',name:'OpenAI',category:'IA',kind:'statuspage',endpoint:'https://status.openai.com/api/v2/summary.json',page:'https://status.openai.com/'},
  {id:'disney-plus',name:'Disney+',category:'Streaming',kind:'probe',endpoint:'https://www.disneyplus.com/pt-br',page:'https://www.disneyplus.com/pt-br'},
  {id:'steam',name:'Steam',category:'Jogos',kind:'probe',endpoint:'https://store.steampowered.com/',page:'https://store.steampowered.com/'},
  {id:'unitv',name:'UniTV',category:'Streaming',kind:'probe',endpoint:'https://www.unitv.net.br/',page:'https://www.unitv.net.br/'},
  {id:'netflix',name:'Netflix',category:'Streaming',kind:'probe',endpoint:'https://www.netflix.com/br/',page:'https://www.netflix.com/br/'},
  {id:'banco-inter',name:'Banco Inter',category:'Bancos',kind:'probe',endpoint:'https://inter.co/',page:'https://inter.co/'},
  {id:'gov-br',name:'GOV.BR',category:'Governo',kind:'probe',endpoint:'https://www.gov.br/',page:'https://www.gov.br/'},
  {id:'mercado-livre',name:'Mercado Livre',category:'Marketplace',kind:'probe',endpoint:'https://www.mercadolivre.com.br/',page:'https://www.mercadolivre.com.br/'},
  {id:'x-twitter',name:'X (Twitter)',category:'Redes sociais',kind:'probe',endpoint:'https://x.com/',page:'https://x.com/'},
  {id:'globoplay',name:'Globoplay',category:'Streaming',kind:'probe',endpoint:'https://globoplay.globo.com/',page:'https://globoplay.globo.com/'},
  {id:'banco-do-brasil',name:'Banco do Brasil',category:'Bancos',kind:'probe',endpoint:'https://www.bb.com.br/',page:'https://www.bb.com.br/'},
  {id:'c6-bank',name:'C6 Bank',category:'Bancos',kind:'probe',endpoint:'https://www.c6bank.com.br/',page:'https://www.c6bank.com.br/'},
];

const safeText=value=>String(value??'').trim();
const statusPublicSource=source=>({id:source.id,name:source.name,category:source.category,page:source.page});
const normalizeHtml=raw=>String(raw||'')
  .replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;|&#34;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/<[^>]+>/g,' ')
  .replace(/\\u0026/gi,'&')
  .replace(/\\u003c/gi,'<')
  .replace(/\\u003e/gi,'>')
  .replace(/\\n|\\r|\\t/g,' ')
  .replace(/\s+/g,' ')
  .trim();
const normalized=value=>normalizeHtml(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function responseJson(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','x-provedor-plus-edge':'service-status'}});
}

async function fetchTimed(url,{json=false,probe=false}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),SOURCE_TIMEOUT_MS),started=Date.now();
  try{
    const response=await fetch(url,{method:'GET',redirect:'follow',signal:controller.signal,headers:{'Accept':json?'application/json,text/plain;q=0.8,*/*;q=0.5':'text/html,text/plain;q=0.9,*/*;q=0.5','User-Agent':'Mozilla/5.0 ProvedorPlus-ServiceStatus/1.1'}});
    const responseMs=Date.now()-started,status=response.status,restricted=status===401||status===403||status===429;
    if(probe)return {reachable:status<500,status,responseMs,restricted};
    if(restricted)return {data:null,status,responseMs,restricted:true};
    if(!response.ok)throw new Error(`HTTP ${status}`);
    if(json){
      const raw=await response.text();let data;
      try{data=JSON.parse(raw)}catch{throw new Error('JSON inválido')}
      return {data,status,responseMs,restricted:false};
    }
    return {data:await response.text(),status,responseMs,restricted:false};
  }finally{clearTimeout(timer)}
}

function restrictedResult(source,responseMs){
  return {status:'reachable',detail:`${source.name} respondeu à verificação, mas a fonte restringe leitura automatizada. A disponibilidade pública foi confirmada.`,components:['Disponibilidade pública'],responseMs};
}

function statusPageKind(indicator){
  const value=safeText(indicator).toLowerCase();
  if(!value||value==='none')return 'operational';
  if(value==='maintenance')return 'maintenance';
  if(value==='minor')return 'degraded';
  if(value==='major'||value==='critical')return 'outage';
  return 'degraded';
}

async function checkStatusPage(source){
  const response=await fetchTimed(source.endpoint,{json:true});
  if(response.restricted)return restrictedResult(source,response.responseMs);
  const data=response.data||{},indicator=data?.status?.indicator||'none',kind=statusPageKind(indicator),active=(data?.incidents||[]).find(item=>!/resolved|completed/i.test(safeText(item?.status))),affected=(data?.components||[]).filter(item=>item&&item.group!==true&&item.status&&item.status!=='operational').slice(0,4).map(item=>item.name).filter(Boolean);
  return {status:active&&kind==='operational'?'degraded':kind,detail:safeText(active?.name)||safeText(data?.status?.description)||(kind==='operational'?'Todos os sistemas operacionais.':'A fonte oficial reportou alteração no serviço.'),components:affected,responseMs:response.responseMs};
}

async function checkGoogle(source){
  const response=await fetchTimed(source.endpoint,{json:true});
  if(response.restricted)return restrictedResult(source,response.responseMs);
  const data=response.data,active=Array.isArray(data)?data.filter(item=>!item?.end):[];
  if(!active.length)return {status:'operational',detail:'Nenhum incidente ativo amplo no Google Cloud.',components:[],responseMs:response.responseMs};
  const latest=active[0],update=Array.isArray(latest?.updates)?latest.updates[0]:null,rawStatus=safeText(update?.status).toUpperCase(),components=Array.isArray(latest?.affected_products)?latest.affected_products.slice(0,4).map(item=>item?.title||item?.id||item).filter(Boolean):[];
  return {status:rawStatus.includes('OUTAGE')?'outage':'degraded',detail:safeText(latest?.external_desc)||safeText(latest?.most_recent_update?.text)||'O Google Cloud possui incidente ativo.',components,responseMs:response.responseMs};
}

async function checkHtml(source){
  const response=await fetchTimed(source.endpoint);
  if(response.restricted)return restrictedResult(source,response.responseMs);
  const page=normalized(response.data);
  if(/major outage|service outage|high disruptions|fora do ar|servico indisponivel|indisponibilidade geral/.test(page))return {status:'outage',detail:`A fonte pública de ${source.name} informa indisponibilidade.`,components:[],responseMs:response.responseMs};
  if(/scheduled maintenance|maintenance in progress|manutencao programada|manutencao em andamento/.test(page))return {status:'maintenance',detail:`A fonte pública de ${source.name} informa manutenção.`,components:[],responseMs:response.responseMs};
  if(/partial outage|degraded performance|some disruptions|partial disruptions|minor disruptions/.test(page))return {status:'degraded',detail:`A fonte pública de ${source.name} informa instabilidade.`,components:[],responseMs:response.responseMs};
  return {status:'operational',detail:`A fonte pública de ${source.name} está respondendo sem incidente amplo identificado.`,components:[],responseMs:response.responseMs};
}

async function checkProbe(source){
  const result=await fetchTimed(source.endpoint,{probe:true});
  if(result.reachable){
    const detail=result.restricted?`${source.name} está acessível; o site restringiu a leitura automatizada, sem impedir a verificação de disponibilidade.`:`O endpoint público de ${source.name} está respondendo normalmente.`;
    return {status:result.restricted?'reachable':'operational',detail,components:[source.name],responseMs:result.responseMs};
  }
  return {status:'degraded',detail:`O endpoint público de ${source.name} respondeu com falha temporária.`,components:[source.name],responseMs:result.responseMs};
}

async function checkSource(source){
  const started=Date.now();
  try{
    let result;
    if(source.kind==='statuspage')result=await checkStatusPage(source);
    else if(source.kind==='google')result=await checkGoogle(source);
    else if(source.kind==='html')result=await checkHtml(source);
    else if(source.kind==='probe')result=await checkProbe(source);
    else throw new Error('Fonte sem verificador');
    return {...statusPublicSource(source),...result,checkedAt:new Date().toISOString()};
  }catch{
    return {...statusPublicSource(source),status:'error',detail:'Não foi possível confirmar o estado nesta coleta. O último resultado válido será mantido quando existir.',components:[],responseMs:Date.now()-started,checkedAt:new Date().toISOString()};
  }
}

async function ensureServiceStatusTable(sql){
  if(serviceStatusSchemaReady)return;
  await sql`CREATE TABLE IF NOT EXISTS pp_service_status_history (
    service_id TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT NULL,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    response_ms INTEGER NULL,
    checked_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (service_id,checked_at)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS pp_service_status_history_checked_idx ON pp_service_status_history (checked_at DESC)`;
  serviceStatusSchemaReady=true;
}

async function saveResults(sql,results){
  if(!results.length)return;
  const bucket=new Date(Math.floor(Date.now()/HISTORY_BUCKET_MS)*HISTORY_BUCKET_MS).toISOString();
  const payload=JSON.stringify(results.map(result=>({
    service_id:result.id,
    status:result.status,
    detail:safeText(result.detail).slice(0,800),
    components:Array.isArray(result.components)?result.components:[],
    response_ms:Math.max(0,Math.round(Number(result.responseMs)||0)),
  })));
  await sql`INSERT INTO pp_service_status_history (service_id,status,detail,components,response_ms,checked_at)
    SELECT row.service_id,row.status,row.detail,row.components,row.response_ms,${bucket}::timestamptz
    FROM jsonb_to_recordset(${payload}::jsonb) AS row(service_id text,status text,detail text,components jsonb,response_ms integer)
    ON CONFLICT (service_id,checked_at) DO UPDATE
    SET status=EXCLUDED.status,detail=EXCLUDED.detail,components=EXCLUDED.components,response_ms=EXCLUDED.response_ms`;
}

export async function pollServiceStatuses(env,sqlArg=null,sources=SOURCES){
  if(!env?.DATABASE_URL)return [];
  const sql=sqlArg||neon(env.DATABASE_URL),settled=await Promise.all(sources.map(checkSource));
  await saveResults(sql,settled);
  return settled;
}

async function requirePanelSession(request,env,ctx,baseWorker){
  const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
  const probe=new Request(new URL('/api/auth',request.url),{method:'POST',headers,body:JSON.stringify({action:'status'})});
  const response=await baseWorker.fetch(probe,env,ctx);let body={};try{body=await response.json()}catch{}
  if(!response.ok||!body?.ok||body?.data?.authenticated!==true)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});
  return body?.data?.user||{};
}

async function readStatusPayload(sql){
  await ensureServiceStatusTable(sql);
  const rows=await sql`SELECT service_id,status,detail,components,response_ms,checked_at
    FROM pp_service_status_history
    WHERE checked_at>=now()-interval '24 hours'
    ORDER BY checked_at ASC`;
  const latestAny=new Map(),latestValid=new Map();
  for(const row of rows||[]){
    const id=safeText(row.service_id);
    latestAny.set(id,row);
    if(safeText(row.status)!=='error')latestValid.set(id,row);
  }
  return {
    sources:SOURCES.map(statusPublicSource),
    current:SOURCES.map(source=>{
      const row=latestValid.get(source.id)||latestAny.get(source.id);
      if(!row)return {id:source.id,status:'error',detail:'Ainda não foi possível concluir a primeira coleta deste serviço.',components:[],responseMs:0,checkedAt:null};
      return {id:source.id,status:safeText(row.status)||'error',detail:safeText(row.detail),components:Array.isArray(row.components)?row.components:[],responseMs:Number(row.response_ms)||0,checkedAt:row.checked_at};
    }),
    history:(rows||[]).filter(row=>safeText(row.status)!=='error').map(row=>({id:safeText(row.service_id),status:safeText(row.status),responseMs:Number(row.response_ms)||0,checkedAt:row.checked_at})),
  };
}

export async function handleServiceStatus(request,env,ctx,baseWorker){
  if(new URL(request.url).pathname!==STATUS_PATH)return null;
  if(request.method!=='GET')return responseJson({ok:false,error:'Método não permitido.'},405);
  try{
    await requirePanelSession(request,env,ctx,baseWorker);
    if(!env?.DATABASE_URL)throw Object.assign(new Error('Conexão com o Provedor Plus não configurada.'),{statusCode:503});
    const sql=neon(env.DATABASE_URL),url=new URL(request.url),batchCount=Math.ceil(SOURCES.length/SOURCE_BATCH_SIZE),batchParam=url.searchParams.get('batch');
    if(batchParam!==null){
      const parsed=Math.floor(Number(batchParam)),batch=Number.isFinite(parsed)?Math.max(0,Math.min(batchCount-1,parsed)):0,start=batch*SOURCE_BATCH_SIZE,sources=SOURCES.slice(start,start+SOURCE_BATCH_SIZE);
      const results=await pollServiceStatuses(env,sql,sources);
      return responseJson({ok:true,data:{batch,batchCount,collected:results.length}});
    }
    const data=await readStatusPayload(sql);
    return responseJson({ok:true,data:{...data,generatedAt:new Date().toISOString(),historyHours:HISTORY_WINDOW_HOURS,batchCount}});
  }catch(error){
    return responseJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500);
  }
}
