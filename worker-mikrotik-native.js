import { promises as dns } from 'node:dns';
import { isIP, isIPv4, isIPv6 } from 'node:net';
import { Buffer } from 'node:buffer';

const MAX_BODY=2*1024*1024;
const TIMEOUT=15000;

function json(res,status,data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}
function text(v){return String(v??'').trim()}
function rows(v){return Array.isArray(v)?v:[]}
function isUnsafeIp(ip){
  if(isIPv4(ip)){
    const p=ip.split('.').map(Number),a=p[0],b=p[1];
    return a===0||a===10||a===127||a>=224||
      (a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||
      (a===192&&b===168)||(a===192&&b===0)||(a===198&&(b===18||b===19))||
      (a===192&&b===0&&p[2]===2)||(a===198&&b===51&&p[2]===100)||(a===203&&b===0&&p[2]===113);
  }
  if(isIPv6(ip)){
    const v=ip.toLowerCase();
    return v==='::'||v==='::1'||v.startsWith('fc')||v.startsWith('fd')||/^fe[89ab]/.test(v)||v.startsWith('ff')||v.startsWith('2001:db8:');
  }
  return true;
}
async function assertPublicHost(host){
  host=text(host).replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/^\[|\]$/g,'');
  if(!host||host.length>253||/\s|@/.test(host))throw Error('Informe o domínio público do MikroTik ou o IP público.');
  if(host.toLowerCase()==='localhost'||host.endsWith('.local'))throw Error('A conexão pela nuvem exige endereço público HTTPS.');
  const literal=isIP(host)?[{address:host}]:await dns.lookup(host,{all:true,verbatim:true});
  if(!literal.length||literal.some(x=>isUnsafeIp(x.address)))throw Error('Esse endereço não é público. Use o DNS do MikroTik Cloud ou um domínio público apontando para o roteador.');
  return host;
}
async function normalizeRouter(r){
  const host=await assertPublicHost(r?.host);
  const port=Number(r?.port)||443;
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta HTTPS inválida.');
  const username=text(r?.username),password=String(r?.password||'');
  if(!username||!password)throw Error('Informe usuário e senha do MikroTik.');
  return {host,port,username,password,allowSelfSigned:Boolean(r?.allow_self_signed)};
}
async function request(router,path,{method='GET',body}={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),TIMEOUT);
  const host=router.host.includes(':')&&!router.host.startsWith('[')?`[${router.host}]`:router.host;
  const url=`https://${host}:${router.port}/rest/${path}`;
  const payload=body===undefined?undefined:JSON.stringify(body);
  const auth=Buffer.from(`${router.username}:${router.password}`).toString('base64');
  try{
    const response=await fetch(url,{method,cache:'no-store',redirect:'manual',headers:{Authorization:`Basic ${auth}`,Accept:'application/json',...(payload!==undefined?{'Content-Type':'application/json'}:{})},body:payload,signal:ctl.signal});
    if(response.status>=300&&response.status<400)throw Error(`MikroTik respondeu com redirecionamento HTTP inesperado (HTTP ${response.status}).`);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>MAX_BODY)throw Error('Resposta do MikroTik excedeu o limite de segurança.');
    let data=null;try{data=raw?JSON.parse(raw):null}catch{data=raw}
    if(!response.ok){const detail=data&&typeof data==='object'?(data.detail||data.message):raw;throw Error(`MikroTik recusou a solicitação: ${detail||`HTTP ${response.status}`}`)}
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw Error('O MikroTik não respondeu dentro de 15 segundos.');
    const msg=String(error?.message||error);
    if(/certificate|self[- ]signed|unable to verify|CERT_|TLS|SSL/i.test(msg)){
      if(router.allowSelfSigned)throw Error('Cloudflare não permite ignorar certificado HTTPS inválido. Instale um certificado público válido no MikroTik (Let’s Encrypt/MikroTik Cloud) e mantenha o acesso em HTTPS.');
      throw Error('O certificado HTTPS do MikroTik não foi aceito pela Cloudflare. Use um certificado público válido no MikroTik.');
    }
    if(/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(msg))throw Error('A Cloudflare não conseguiu alcançar o MikroTik. Confirme MikroTik Cloud/DDNS, porta HTTPS, www-ssl e certificado válido.');
    throw error;
  }finally{clearTimeout(timer)}
}
async function print(router,path,proplist=[],query=[],extra={}){
  const body={...extra};if(proplist.length)body['.proplist']=proplist;if(query.length)body['.query']=query;
  return rows(await request(router,`${path}/print`,{method:'POST',body}));
}
async function findSecret(router,username){return (await print(router,'ppp/secret',['.id','name','profile','remote-address','caller-id','service','disabled'],[`name=${username}`]))[0]||null}
async function disconnect(router,username){
  const active=await print(router,'ppp/active',['.id','name'],[`name=${username}`]);
  for(const x of active){const id=text(x['.id']);if(id)await request(router,`ppp/active/${encodeURIComponent(id)}`,{method:'DELETE'}).catch(()=>{})}
  return active.length;
}
function numberValue(...values){
  for(const value of values){
    if(value===undefined||value===null||value==='')continue;
    const n=Number(value);if(Number.isFinite(n)&&n>=0)return n;
  }
  return 0;
}
function boolValue(value){return ['true','yes','1','on'].includes(text(value).toLowerCase())}
function counterPair(value,row={}){
  const raw=text(value);
  if(raw.includes('/')){const [a='0',b='0']=raw.split('/');return [Math.max(0,Number(a)||0),Math.max(0,Number(b)||0)]}
  const download=numberValue(row?.['bytes-out'],row?.['tx-bytes'],row?.['tx-byte'],row?.['out-bytes']);
  const upload=numberValue(row?.['bytes-in'],row?.['rx-bytes'],row?.['rx-byte'],row?.['in-bytes']);
  return [download,upload];
}
function normalizeActiveRow(row={}){const [downloadBytes,uploadBytes]=counterPair(row?.bytes,row);return {...row,downloadBytes,uploadBytes,bytes:`${downloadBytes}/${uploadBytes}`}}
async function activeSessions(router,username=''){
  const props=['.id','name','service','caller-id','address','uptime','encoding','bytes','bytes-in','bytes-out','session-id','limit-bytes-in','limit-bytes-out'];
  const query=username?[`name=${username}`]:[];
  let list=[],completed=false,lastError=null;
  try{list=await print(router,'ppp/active',props,query,{stats:''});completed=true}catch(error){lastError=error}
  const missingStats=list.length&&list.every(row=>!text(row?.bytes)&&!Number.isFinite(Number(row?.['bytes-in']))&&!Number.isFinite(Number(row?.['bytes-out'])));
  if(!list.length||missingStats){
    try{
      const detailed=await print(router,'ppp/active',[],query,{stats:''});
      completed=true;
      if(detailed.length)list=detailed;
    }catch(error){lastError=error}
  }
  if(!list.length){
    try{
      const all=rows(await request(router,'ppp/active'));
      completed=true;
      list=username?all.filter(x=>text(x?.name)===username):all;
    }catch(error){lastError=error}
  }
  if(!completed)throw lastError||Error('Não foi possível consultar as sessões PPPoE ativas no MikroTik.');
  return list.map(normalizeActiveRow);
}
async function pppSecrets(router){
  let list=[];
  try{list=await print(router,'ppp/secret',['.id','name','service','profile','remote-address','caller-id','disabled'])}catch{}
  if(!list.length){try{list=rows(await request(router,'ppp/secret'))}catch{}}
  return list.filter(x=>text(x?.name)).map(x=>({id:text(x?.['.id']),name:text(x?.name),service:text(x?.service),profile:text(x?.profile),remoteAddress:text(x?.['remote-address']),callerId:text(x?.['caller-id']),disabled:boolValue(x?.disabled)}));
}
function routeInterface(route,interfaces){
  const immediate=text(route?.['immediate-gw']);
  if(immediate.includes('%'))return immediate.slice(immediate.lastIndexOf('%')+1);
  if(interfaces.some(i=>text(i?.name)===immediate))return immediate;
  const gateway=text(route?.gateway);
  if(gateway.includes('%'))return gateway.slice(gateway.lastIndexOf('%')+1);
  if(interfaces.some(i=>text(i?.name)===gateway))return gateway;
  return '';
}
function parseRate(value){
  if(value===undefined||value===null||value==='')return NaN;
  const direct=Number(value);if(Number.isFinite(direct))return Math.max(0,direct);
  const raw=text(value).toLowerCase().replace(',','.');
  const m=raw.match(/^([\d.]+)\s*(k|m|g)?bps$/i);if(!m)return NaN;
  const n=Number(m[1]),factor=!m[2]?1:m[2].toLowerCase()==='k'?1e3:m[2].toLowerCase()==='m'?1e6:1e9;
  return Number.isFinite(n)?Math.max(0,n*factor):NaN;
}
async function monitorInterfaceTraffic(router,interfaceRef){
  if(!text(interfaceRef))return {available:false,rxBps:null,txBps:null};
  try{
    const result=await request(router,'interface/monitor-traffic',{method:'POST',body:{numbers:text(interfaceRef),once:''}});
    const row=Array.isArray(result)?result[0]:result;
    const rx=parseRate(row?.['rx-bits-per-second']),tx=parseRate(row?.['tx-bits-per-second']);
    if(Number.isFinite(rx)&&Number.isFinite(tx))return {available:true,rxBps:rx,txBps:tx};
  }catch{}
  return {available:false,rxBps:null,txBps:null};
}
async function interfaceStats(router,{id='',name=''}={}){
  let list=[];
  try{list=await print(router,'interface',['.id','name','type','running','disabled','rx-byte','tx-byte','bytes'],[],{stats:''})}catch{}
  if(!list.length){try{list=rows(await request(router,'interface'))}catch{}}
  let row=id?list.find(x=>text(x?.['.id'])===text(id)):null;
  if(!row&&name)row=list.find(x=>text(x?.name)===text(name))||null;
  if(!row)return {available:false,id:text(id),name:text(name),rxBytes:0,txBytes:0};
  let rx=Number(row?.['rx-byte']),tx=Number(row?.['tx-byte']);
  if((!Number.isFinite(rx)||!Number.isFinite(tx))&&text(row?.bytes).includes('/')){
    const [a='0',b='0']=text(row.bytes).split('/');rx=Number(a);tx=Number(b);
  }
  return {available:Number.isFinite(rx)&&Number.isFinite(tx),id:text(row?.['.id']),name:text(row?.name),type:text(row?.type),running:boolValue(row?.running),rxBytes:Number.isFinite(rx)?Math.max(0,rx):0,txBytes:Number.isFinite(tx)?Math.max(0,tx):0};
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function readPppoeTraffic(router,{id='',name=''}={}){
  const first=await interfaceStats(router,{id,name});
  if(!first.id&&!first.name)return {available:false,rateAvailable:false,rxBytes:0,txBytes:0,rxBps:null,txBps:null};
  let rate=await monitorInterfaceTraffic(router,first.id||first.name);
  if(!rate.available&&first.name&&first.name!==(first.id||''))rate=await monitorInterfaceTraffic(router,first.name);
  if(rate.available)return {...first,rateAvailable:true,rxBps:rate.rxBps,txBps:rate.txBps};
  if(first.available){
    const sampleStarted=Date.now();
    await delay(450);
    const second=await interfaceStats(router,{id:first.id,name:first.name});
    if(second.available&&second.rxBytes>=first.rxBytes&&second.txBytes>=first.txBytes){
      const seconds=Math.max(.25,(Date.now()-sampleStarted)/1000);
      return {...second,rateAvailable:true,rxBps:Math.round((second.rxBytes-first.rxBytes)*8/seconds),txBps:Math.round((second.txBytes-first.txBytes)*8/seconds)};
    }
  }
  return {...first,rateAvailable:false,rxBps:null,txBps:null};
}
async function readWanTraffic(router){
  let interfaces=[];
  try{interfaces=await print(router,'interface',['.id','name','type','running','disabled','rx-byte','tx-byte'],[],{stats:''})}catch{}
  if(!interfaces.length){try{interfaces=rows(await request(router,'interface'))}catch(error){return {available:false,interface:'',rxBytes:0,txBytes:0,rxBps:null,txBps:null,rateAvailable:false,reason:error instanceof Error?error.message:String(error)}}}
  let routes=[];
  try{routes=await print(router,'ip/route',['.id','dst-address','gateway','immediate-gw','active','disabled','routing-table','distance'])}catch{}
  if(!routes.length){try{routes=rows(await request(router,'ip/route'))}catch{}}
  const defaults=routes.filter(r=>text(r?.['dst-address'])==='0.0.0.0/0'&&!boolValue(r?.disabled));
  const preferred=defaults.filter(r=>boolValue(r?.active)&&['','main'].includes(text(r?.['routing-table']).toLowerCase()));
  const activeDefaults=defaults.filter(r=>boolValue(r?.active));
  const candidates=preferred.length?preferred:activeDefaults.length?activeDefaults:defaults;
  let interfaceName='';for(const route of candidates){interfaceName=routeInterface(route,interfaces);if(interfaceName)break}
  if(!interfaceName)return {available:false,interface:'',rxBytes:0,txBytes:0,rxBps:null,txBps:null,rateAvailable:false,reason:'Não foi possível identificar a interface de saída pela rota padrão do MikroTik.'};
  let iface=interfaces.find(i=>text(i?.name)===interfaceName)||null;
  if(!iface){try{iface=(await print(router,'interface',['.id','name','type','running','disabled','rx-byte','tx-byte'],[`name=${interfaceName}`],{stats:''}))[0]||null}catch{}}
  if(!iface)return {available:false,interface:interfaceName,rxBytes:0,txBytes:0,rxBps:null,txBps:null,rateAvailable:false,reason:`A interface de saída ${interfaceName} não foi encontrada.`};
  const rx=Number(iface?.['rx-byte']),tx=Number(iface?.['tx-byte']),rate=await monitorInterfaceTraffic(router,text(iface?.['.id'])||interfaceName);
  if(!Number.isFinite(rx)||!Number.isFinite(tx)){
    if(rate.available)return {available:true,interface:interfaceName,interfaceType:text(iface?.type),running:boolValue(iface?.running),rxBytes:0,txBytes:0,rxBps:rate.rxBps,txBps:rate.txBps,rateAvailable:true};
    return {available:false,interface:interfaceName,rxBytes:0,txBytes:0,rxBps:null,txBps:null,rateAvailable:false,reason:`O RouterOS não retornou os contadores de tráfego da interface ${interfaceName}.`};
  }
  return {available:true,interface:interfaceName,interfaceType:text(iface?.type),running:boolValue(iface?.running),rxBytes:Math.max(0,rx),txBytes:Math.max(0,tx),rxBps:rate.rxBps,txBps:rate.txBps,rateAvailable:rate.available};
}
const dashboardWanCache=new Map();
function dashboardWanKey(router){return `${router.host}:${router.port}:${router.username}`}
async function readDashboardWanTraffic(router){
  const key=dashboardWanKey(router),cached=dashboardWanCache.get(key),now=Date.now();
  if(cached&&now-cached.at<60000&&text(cached.interface)){
    const rate=await monitorInterfaceTraffic(router,cached.interface);
    if(rate.available)return {available:true,interface:cached.interface,interfaceType:cached.interfaceType||'',running:true,rxBps:rate.rxBps,txBps:rate.txBps,rateAvailable:true,cachedInterface:true};
  }
  const full=await readWanTraffic(router);
  if(text(full?.interface))dashboardWanCache.set(key,{interface:text(full.interface),interfaceType:text(full.interfaceType),at:now});
  else dashboardWanCache.delete(key);
  return full;
}
async function dashboardMetrics(router){
  const [resourceResult,trafficResult]=await Promise.allSettled([request(router,'system/resource'),readDashboardWanTraffic(router)]);
  if(resourceResult.status==='rejected')throw resourceResult.reason;
  const wanTraffic=trafficResult.status==='fulfilled'?trafficResult.value:{available:false,interface:'',rxBps:null,txBps:null,rateAvailable:false,reason:String(trafficResult.reason?.message||trafficResult.reason||'Tráfego indisponível.')};
  return {connected:true,connectionMethod:'rest',resource:resourceResult.value,wanTraffic,lastSync:new Date().toISOString(),lightweight:true};
}
async function snapshot(router){
  const resource=await request(router,'system/resource');
  const [pppResult,secretsResult,trafficResult]=await Promise.allSettled([activeSessions(router),pppSecrets(router),readWanTraffic(router)]);
  const pppActive=pppResult.status==='fulfilled'?pppResult.value:[];
  const pppSecretList=secretsResult.status==='fulfilled'?secretsResult.value:[];
  const warning=pppResult.status==='rejected'?String(pppResult.reason?.message||pppResult.reason):null;
  const wanTraffic=trafficResult.status==='fulfilled'?trafficResult.value:{available:false,interface:'',rxBytes:0,txBytes:0,rxBps:null,txBps:null,rateAvailable:false,reason:String(trafficResult.reason?.message||trafficResult.reason||'Tráfego indisponível.')};
  return {connected:true,connectionMethod:'rest',resource,pppActive,pppSecrets:pppSecretList,wanTraffic,lastSync:new Date().toISOString(),warning};
}
async function profiles(router){
  const list=await print(router,'ppp/profile',['.id','name','local-address','remote-address']);
  return {profiles:list.map(x=>({id:text(x['.id']),name:text(x.name),local_address:text(x['local-address']),remote_address:text(x['remote-address'])})).filter(x=>x.name)};
}
async function savePppoe(router,data){
  const username=text(data?.pppoe_username),password=text(data?.pppoe_password),profile=text(data?.mikrotik_profile)||'default';
  if(!username)throw Error('Informe o usuário PPPoE do cliente.');
  const found=await findSecret(router,username);if(!found&&!password)throw Error('Informe a senha PPPoE para criar o acesso.');
  const payload={name:username,service:'pppoe',profile,disabled:data?.status==='Bloqueado'?'true':'false',comment:`Provedor Plus - ${text(data?.name)||username}`};
  if(password)payload.password=password;if(text(data?.ip))payload['remote-address']=text(data.ip);if(text(data?.mac_address))payload['caller-id']=text(data.mac_address).toUpperCase();
  if(found){const id=text(found['.id']);const updated=await request(router,`ppp/secret/${encodeURIComponent(id)}`,{method:'PATCH',body:payload});if(data?.status==='Bloqueado')await disconnect(router,username);return {action:'updated',secretId:text(updated?.['.id'])||id,username}}
  const created=await request(router,'ppp/secret',{method:'PUT',body:payload});if(data?.status==='Bloqueado')await disconnect(router,username);return {action:'created',secretId:text(created?.['.id']),username};
}
async function deletePppoe(router,data){
  const username=text(data?.pppoe_username);if(!username)throw Error('O cliente não possui usuário PPPoE.');
  const found=await findSecret(router,username);await disconnect(router,username);if(!found)return {action:'not_found',secretId:'',username};
  const id=text(found['.id']);await request(router,`ppp/secret/${encodeURIComponent(id)}`,{method:'DELETE'});return {action:'deleted',secretId:id,username};
}
function durationMs(value){
  const s=text(value).toLowerCase();if(!s)return NaN;
  if(/^\d+(?:\.\d+)?$/.test(s))return Number(s);
  let total=0,matched=false,m;const re=/(\d+(?:\.\d+)?)(ms|us|µs|s)/g;
  while((m=re.exec(s))){matched=true;const n=Number(m[1]);if(m[2]==='s')total+=n*1000;else if(m[2]==='ms')total+=n;else total+=n/1000}
  return matched?total:NaN;
}
async function pingQuality(router,address){
  const empty={qualityAvailable:false,latencyMs:0,packetLoss:null,quality:'Indisponível'};if(!text(address))return empty;
  try{
    const result=await request(router,'ping',{method:'POST',body:{address:text(address),count:'3',interval:'200ms'}}),list=rows(result);let loss=NaN,latency=NaN;
    const summary=list.find(x=>x&&typeof x==='object'&&(x['packet-loss']!=null||x['avg-rtt']!=null||x.avg!=null));
    if(summary){const parsedLoss=Number(String(summary['packet-loss']??'').replace('%',''));if(Number.isFinite(parsedLoss))loss=parsedLoss;latency=durationMs(summary['avg-rtt']??summary.avg)}
    const times=list.map(x=>durationMs(x?.time)).filter(Number.isFinite);if(!Number.isFinite(latency)&&times.length)latency=times.reduce((a,b)=>a+b,0)/times.length;
    if(!Number.isFinite(loss))loss=Math.max(0,Math.min(100,Math.round((1-Math.min(3,times.length)/3)*100)));if(!Number.isFinite(latency))return {...empty,packetLoss:loss};
    const quality=loss>=20||latency>150?'Ruim':loss>0||latency>80?'Atenção':'Boa';return {qualityAvailable:true,latencyMs:Math.round(latency),packetLoss:Math.round(loss),quality};
  }catch(error){return {...empty,qualityError:error instanceof Error?error.message:String(error)}}
}
function parseSingleVlan(value){
  const raw=text(value);if(!raw)return 0;
  const ids=[...new Set((raw.match(/\d+/g)||[]).map(Number).filter(n=>Number.isInteger(n)&&n>0&&n<=4094))];
  return ids.length===1?ids[0]:0;
}
function interfaceListHas(value,name){return text(value).split(',').map(x=>x.trim()).filter(Boolean).includes(name)}
async function pppoeMonitor(router,ref){
  if(!text(ref))return null;
  try{
    const result=await request(router,'interface/pppoe-server/monitor',{method:'POST',body:{numbers:text(ref),once:''}});
    return Array.isArray(result)?result[0]||null:result||null;
  }catch{return null}
}
async function pppoeTopology(router,username,callerId=''){
  let dynamic=null,host=null,servers=[],vlans=[],bridgeVlans=[];
  try{const list=await print(router,'interface/pppoe-server',['.id','name','user','service','caller-id','uptime','encoding','mtu','mru','local-address','remote-address','vlan-id','vid'],[`user=${username}`]);dynamic=list[0]||null;if(!dynamic){const all=await print(router,'interface/pppoe-server',['.id','name','user','service','caller-id','uptime','encoding','mtu','mru','local-address','remote-address','vlan-id','vid']);dynamic=all.find(x=>text(x?.user)===username)||null}}catch{}
  try{const all=rows(await request(router,'interface/pppoe-server'));const full=all.find(x=>text(x?.user)===username);if(full)dynamic={...full,...(dynamic||{})}}catch{}
  const monitor=dynamic?await pppoeMonitor(router,text(dynamic?.['.id'])||text(dynamic?.name)):null;
  const mac=text(callerId||dynamic?.['caller-id']).toUpperCase();
  if(mac){try{host=(await print(router,'interface/bridge/host',['mac-address','vid','on-interface','bridge'],[`mac-address=${mac}`]))[0]||null}catch{}if(!host){try{const all=await print(router,'interface/bridge/host',['mac-address','vid','on-interface','bridge']);host=all.find(x=>text(x?.['mac-address']).toUpperCase()===mac)||null}catch{}}}
  try{servers=await print(router,'interface/pppoe-server/server',['.id','service-name','interface','max-mtu','max-mru','pppoe-over-vlan-range','disabled'])}catch{}
  try{vlans=await print(router,'interface/vlan',['.id','name','interface','vlan-id'])}catch{}
  try{bridgeVlans=await print(router,'interface/bridge/vlan',['bridge','vlan-ids','tagged','untagged','current-tagged','current-untagged'])}catch{}
  const hostVid=numberValue(host?.vid)||0,dynamicVid=numberValue(dynamic?.['vlan-id'],dynamic?.vid,monitor?.['vlan-id'],monitor?.vid)||0,dynamicService=text(dynamic?.service||dynamic?.['service-name']);
  const monitoredInterface=text(monitor?.interface);
  let server=dynamicService?servers.find(x=>text(x?.['service-name'])===dynamicService&&(!monitoredInterface||text(x?.interface)===monitoredInterface)):null;
  if(!server&&dynamicService)server=servers.find(x=>text(x?.['service-name'])===dynamicService)||null;
  let vlan=hostVid?vlans.find(x=>Number(x?.['vlan-id'])===hostVid):dynamicVid?vlans.find(x=>Number(x?.['vlan-id'])===dynamicVid):null;
  if(!vlan&&monitoredInterface)vlan=vlans.find(x=>text(x?.name)===monitoredInterface)||null;
  if(!server&&vlan)server=servers.find(x=>text(x?.interface)===text(vlan?.name))||null;
  if(!server&&servers.length===1)server=servers[0];
  const serverInterface=text(server?.interface),hostPort=text(host?.['on-interface']);
  if(!vlan){for(const candidate of [serverInterface,hostPort].filter(Boolean)){vlan=vlans.find(x=>text(x?.name)===candidate)||null;if(vlan)break}}
  let vlanId=hostVid||dynamicVid||numberValue(vlan?.['vlan-id'])||0;
  if(!vlanId&&hostPort){
    const bridgeName=text(host?.bridge);
    const candidates=bridgeVlans.filter(row=>(!bridgeName||text(row?.bridge)===bridgeName)&&['tagged','untagged','current-tagged','current-untagged'].some(key=>interfaceListHas(row?.[key],hostPort)));
    const ids=[...new Set(candidates.map(row=>parseSingleVlan(row?.['vlan-ids'])).filter(Boolean))];
    if(ids.length===1)vlanId=ids[0];
  }
  if(!vlanId&&server)vlanId=parseSingleVlan(server?.['pppoe-over-vlan-range']);
  const accessPort=hostPort||text(vlan?.interface)||monitoredInterface||serverInterface;
  const mtu=numberValue(dynamic?.mtu,monitor?.mtu,server?.['max-mtu'])||0;
  return {pppoeInterfaceId:text(dynamic?.['.id']),pppoeInterface:text(dynamic?.name),accessPort,accessInterface:accessPort,serverInterface:monitoredInterface||serverInterface,vlan:vlanId||null,vlanId:vlanId||null,encoding:text(dynamic?.encoding||monitor?.encoding),mtu,mru:numberValue(dynamic?.mru,monitor?.mru,server?.['max-mru'])||0,serviceName:text(server?.['service-name']||dynamicService),bridge:text(host?.bridge)};
}
async function clientStatus(router,data){
  const username=text(data?.pppoe_username);if(!username)throw Error('Este cliente não possui usuário PPPoE.');
  const [active,secret]=await Promise.all([activeSessions(router,username),findSecret(router,username)]);
  const s=active[0]||null,ip=text(s?.address||secret?.['remote-address']||data?.ip),callerId=text(s?.['caller-id']||secret?.['caller-id']||data?.mac_address);
  const [quality,topology]=await Promise.all([s?pingQuality(router,ip):Promise.resolve({qualityAvailable:false,latencyMs:0,packetLoss:null,quality:'Sem conexão'}),s?pppoeTopology(router,username,callerId):Promise.resolve({pppoeInterfaceId:'',pppoeInterface:'',accessPort:'',accessInterface:'',serverInterface:'',vlan:null,vlanId:null,encoding:'',mtu:0,mru:0,serviceName:'',bridge:''})]);
  const iface=s?await readPppoeTraffic(router,{id:topology.pppoeInterfaceId,name:topology.pppoeInterface}):{available:false,rateAvailable:false,rxBytes:0,txBytes:0,rxBps:null,txBps:null};
  const sessionDownload=numberValue(s?.downloadBytes),sessionUpload=numberValue(s?.uploadBytes);
  const downloadBytes=Math.max(sessionDownload,iface.available?numberValue(iface.txBytes):0),uploadBytes=Math.max(sessionUpload,iface.available?numberValue(iface.rxBytes):0);
  const downloadBps=iface.rateAvailable?Math.max(0,Number(iface.txBps)||0):0,uploadBps=iface.rateAvailable?Math.max(0,Number(iface.rxBps)||0):0;
  return {online:Boolean(s),checkedAt:new Date().toISOString(),username,sessionId:text(s?.['session-id']||s?.['.id']),ip,callerId,uptime:text(s?.uptime),encoding:text(topology.encoding||s?.encoding),downloadBytes,uploadBytes,downloadBps,uploadBps,liveRatesAvailable:Boolean(iface.rateAvailable),profile:text(secret?.profile||data?.mikrotik_profile),mtu:numberValue(topology.mtu)||0,mru:numberValue(topology.mru)||0,vlan:topology.vlan??null,vlanId:topology.vlanId??null,pppoeInterfaceId:text(topology.pppoeInterfaceId),pppoeInterface:text(topology.pppoeInterface),accessPort:text(topology.accessPort),accessInterface:text(topology.accessInterface),serverInterface:text(topology.serverInterface),serviceName:text(topology.serviceName),bridge:text(topology.bridge),webAccess:null,...quality};
}
function isDisabled(value){return boolValue(value)}
async function verifyBlocked(router,username){const [secret,active]=await Promise.all([findSecret(router,username),activeSessions(router,username)]);if(!secret||!isDisabled(secret.disabled))throw Error('O MikroTik não confirmou o bloqueio do acesso PPPoE.');if(active.length)throw Error('O acesso foi marcado como bloqueado, mas a sessão PPPoE ainda está ativa.');return true}
async function verifyUnblocked(router,username){const secret=await findSecret(router,username);if(!secret)throw Error('Acesso PPPoE não encontrado no MikroTik.');if(isDisabled(secret.disabled))throw Error('O MikroTik não confirmou a liberação do acesso PPPoE.');return true}
async function blockClient(router,data){const username=text(data?.pppoe_username);if(!username)throw Error('Este cliente não possui usuário PPPoE.');let found=await findSecret(router,username);if(!found){await savePppoe(router,{...data,status:'Ativo'});found=await findSecret(router,username)}const id=text(found?.['.id']);if(!id)throw Error('Acesso PPPoE não encontrado no MikroTik.');await request(router,`ppp/secret/${encodeURIComponent(id)}`,{method:'PATCH',body:{disabled:'true',comment:`Provedor Plus - BLOQUEADO - INADIMPLÊNCIA - ${text(data?.name)||username}`}});await disconnect(router,username);await verifyBlocked(router,username);return {action:'blocked',secretId:id,username,verified:true}}
async function unblockClient(router,data){const username=text(data?.pppoe_username);if(!username)throw Error('Este cliente não possui usuário PPPoE.');const found=await findSecret(router,username);if(!found)throw Error('Acesso PPPoE não encontrado no MikroTik.');const id=text(found['.id']),profile=text(data?.mikrotik_profile)||text(found.profile)||'default';await request(router,`ppp/secret/${encodeURIComponent(id)}`,{method:'PATCH',body:{disabled:'false',profile,comment:`Provedor Plus - ${text(data?.name)||username}`}});await verifyUnblocked(router,username);return {action:'unblocked',secretId:id,username,profile,verified:true}}
async function remoteInfo(router){const resource=await request(router,'system/resource');let cloud={};try{const r=await request(router,'ip/cloud/print',{method:'POST',body:{'.proplist':['dns-name','ddns-enabled','status','public-address']}});cloud=Array.isArray(r)?r[0]||{}:r||{}}catch{}return {enabled:true,status:'REST HTTPS',dnsName:text(cloud['dns-name'])||router.host,apiPrepared:true,architecture:text(resource?.['architecture-name']),version:text(resource?.version),routerHost:router.host,mode:'cloud-rest',clientConfig:''}}

function response(status,data){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','x-provedor-plus-edge':'cloudflare-mikrotik'}})}

export async function handleMikrotikProxy(request){
  if(request.method!=='POST')return response(405,{ok:false,error:'Método não permitido.'});
  try{
    let body={};try{body=await request.json()}catch{}
    const action=text(body.action);const allowed=new Set(['router.test','router.sync','router.metrics','router.profiles','router.remote','pppoe.save','pppoe.delete','client.status','client.block','client.unblock']);
    if(!allowed.has(action))throw Error('Ação MikroTik inválida.');
    const router=await normalizeRouter(body.router||{});let data;
    if(action==='router.test'||action==='router.sync')data=await snapshot(router);
    else if(action==='router.metrics')data=await dashboardMetrics(router);
    else if(action==='router.profiles')data=await profiles(router);
    else if(action==='router.remote')data=await remoteInfo(router);
    else if(action==='pppoe.save')data=await savePppoe(router,body.data||{});
    else if(action==='pppoe.delete')data=await deletePppoe(router,body.data||{});
    else if(action==='client.status')data=await clientStatus(router,body.data||{});
    else if(action==='client.block')data=await blockClient(router,body.data||{});
    else if(action==='client.unblock')data=await unblockClient(router,body.data||{});
    return response(200,{ok:true,data});
  }catch(error){return response(Number(error?.statusCode)||400,{ok:false,error:error instanceof Error?error.message:String(error)})}
}
