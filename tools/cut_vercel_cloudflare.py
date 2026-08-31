from pathlib import Path
import base64,gzip,json,re,subprocess

ROOT=Path('.')

def git_show(ref,path):
    return subprocess.check_output(['git','show',f'{ref}:{path}'],text=True)

subprocess.run(['git','fetch','origin','main'],check=True)

# --- MikroTik: porta a mesma implementacao para fetch nativo do Worker ---
mk=git_show('origin/main','lib/mikrotik-proxy.js')
mk=mk.replace("const https=require('node:https');\nconst dns=require('node:dns').promises;\nconst net=require('node:net');", "import { promises as dns } from 'node:dns';\nimport { isIP, isIPv4, isIPv6 } from 'node:net';\nimport { Buffer } from 'node:buffer';")
mk=mk.replace('net.isIPv4(ip)','isIPv4(ip)').replace('net.isIPv6(ip)','isIPv6(ip)').replace('net.isIP(host)','isIP(host)')
start=mk.index('function request(router,path,')
end=mk.index('\nasync function print(',start)
mk_request=r'''async function request(router,path,{method='GET',body}={}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),TIMEOUT);
  const host=router.host.includes(':')&&!router.host.startsWith('[')?`[${router.host}]`:router.host;
  const url=`https://${host}:${router.port}/rest/${path}`;
  const payload=body===undefined?undefined:JSON.stringify(body);
  const auth=Buffer.from(`${router.username}:${router.password}`).toString('base64');
  try{
    const response=await fetch(url,{method,cache:'no-store',redirect:'error',headers:{Authorization:`Basic ${auth}`,Accept:'application/json',...(payload!==undefined?{'Content-Type':'application/json'}:{})},body:payload,signal:ctl.signal});
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
}'''
mk=mk[:start]+mk_request+mk[end:]
mk=mk.replace('A Vercel não conseguiu alcançar o MikroTik.','A Cloudflare não conseguiu alcançar o MikroTik.')
start=mk.index('module.exports=async function handler(req,res){')
mk_handler=r'''function response(status,data){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','x-provedor-plus-edge':'cloudflare-mikrotik'}})}

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
'''
mk=mk[:start]+mk_handler
Path('worker-mikrotik-native.js').write_text(mk,encoding='utf-8')

# --- Banco: descompacta o motor atual e troca somente a camada HTTPS por Worker/TLS ---
encoded=''.join(git_show('origin/main',f'packed/proxygz-{n}.txt').strip() for n in ('01','02','03'))
bank=gzip.decompress(base64.b64decode(encoded)).decode('utf-8')
bank=bank.replace("const https = require('https');\nconst crypto = require('crypto');", "import * as crypto from 'node:crypto';\nimport { Buffer } from 'node:buffer';\nimport { connect as tlsConnect } from 'node:tls';\nimport forge from 'node-forge';")
start=bank.index('function jsonRequest(');end=bank.index('\nfunction cert(',start)
bank_transport=r'''const pfxIdentityCache=new Map();
function pfxIdentity(pfx,passphrase=''){
  const raw=Buffer.isBuffer(pfx)?pfx:Buffer.from(pfx||[]),cacheKey=`${raw.length}:${raw.subarray(0,32).toString('base64')}:${String(passphrase)}`;
  if(pfxIdentityCache.has(cacheKey))return pfxIdentityCache.get(cacheKey);
  try{
    const der=forge.util.createBuffer(raw.toString('binary')),asn1=forge.asn1.fromDer(der),p12=forge.pkcs12.pkcs12FromAsn1(asn1,false,String(passphrase||''));
    const shrouded=p12.getBags({bagType:forge.pki.oids.pkcs8ShroudedKeyBag})[forge.pki.oids.pkcs8ShroudedKeyBag]||[],plain=p12.getBags({bagType:forge.pki.oids.keyBag})[forge.pki.oids.keyBag]||[],certBags=p12.getBags({bagType:forge.pki.oids.certBag})[forge.pki.oids.certBag]||[],keyBag=shrouded[0]||plain[0];
    if(!keyBag?.key||!certBags.length)throw new Error('Certificado ou chave privada não encontrados no P12/PFX.');
    const identity={key:forge.pki.privateKeyToPem(keyBag.key),cert:certBags.map(b=>forge.pki.certificateToPem(b.cert)).join('\n')};pfxIdentityCache.set(cacheKey,identity);return identity;
  }catch(error){throw new Error(`Efí Pix: não foi possível abrir o certificado P12/PFX${passphrase?' com a senha informada':''}. ${error?.message||error}`)}
}
function decodeChunked(buffer){const parts=[];let offset=0;while(offset<buffer.length){const eol=buffer.indexOf('\r\n',offset);if(eol<0)break;const size=parseInt(buffer.subarray(offset,eol).toString('ascii').split(';')[0].trim(),16);if(!Number.isFinite(size))throw new Error('Resposta mTLS inválida recebida da Efí.');offset=eol+2;if(size===0)break;if(offset+size>buffer.length)throw new Error('Resposta mTLS incompleta recebida da Efí.');parts.push(buffer.subarray(offset,offset+size));offset+=size+2}return Buffer.concat(parts)}
function parseTlsHttpResponse(buffer){const marker=buffer.indexOf('\r\n\r\n');if(marker<0)throw new Error('Resposta HTTPS inválida recebida da Efí.');const head=buffer.subarray(0,marker).toString('utf8'),lines=head.split('\r\n'),match=lines.shift()?.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/i),status=Number(match?.[1])||0,headers={};for(const line of lines){const p=line.indexOf(':');if(p>0)headers[line.slice(0,p).trim().toLowerCase()]=line.slice(p+1).trim()}let payload=buffer.subarray(marker+4);if(/chunked/i.test(headers['transfer-encoding']||''))payload=decodeChunked(payload);else if(headers['content-length'])payload=payload.subarray(0,Math.max(0,Number(headers['content-length'])||0));const raw=payload.toString('utf8');let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw.slice(0,800)}}return {status,data,headers}}
function mtlsJsonRequest(url,{method='GET',headers={},body,pfx,passphrase,timeout=25000}={}){return new Promise((resolve,reject)=>{const u=new URL(url),identity=pfxIdentity(pfx,passphrase),payload=body===undefined?null:Buffer.from(JSON.stringify(body),'utf8');let socket,done=false;const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);try{socket?.destroy()}catch{}fn(value)},timer=setTimeout(()=>finish(reject,new Error('A conexão mTLS com a Efí demorou demais.')),timeout);try{socket=tlsConnect({host:u.hostname,port:Number(u.port)||443,servername:u.hostname,key:identity.key,cert:identity.cert},()=>{const h={Host:u.hostname,Accept:'application/json','Accept-Encoding':'identity','User-Agent':'ProvedorPlus-Cloudflare/1.0',...headers,Connection:'close'};if(payload){h['Content-Type']='application/json';h['Content-Length']=String(payload.length)}const head=`${method} ${u.pathname}${u.search} HTTP/1.1\r\n${Object.entries(h).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`;socket.write(head);if(payload)socket.write(payload);socket.end()});const chunks=[];let size=0;socket.on('data',chunk=>{const b=Buffer.from(chunk);size+=b.length;if(size>4*1024*1024)return finish(reject,new Error('Resposta da Efí excedeu o limite de segurança.'));chunks.push(b)});socket.on('end',()=>{try{finish(resolve,parseTlsHttpResponse(Buffer.concat(chunks)))}catch(error){finish(reject,error)}});socket.on('error',error=>finish(reject,error))}catch(error){finish(reject,error)}})}
async function jsonRequest(url,{method='GET',headers={},body,pfx,passphrase,timeout=25000}={}){if(pfx)return mtlsJsonRequest(url,{method,headers,body,pfx,passphrase,timeout});const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);try{const response=await fetch(url,{method,cache:'no-store',redirect:'error',headers:{Accept:'application/json','Accept-Encoding':'identity',...headers,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:ctl.signal});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw.slice(0,800)}}return {status:response.status,data,headers:Object.fromEntries(response.headers.entries())}}catch(error){if(error?.name==='AbortError')throw new Error('A conexão com o banco demorou demais.');throw error}finally{clearTimeout(timer)}}'''
bank=bank[:start]+bank_transport+bank[end:]
start=bank.index('module.exports = async function handler(req,res){')
bank_handler=r'''function response(status,data){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','x-provedor-plus-edge':'cloudflare-bank-native'}})}
export async function handleBankProxy(request){if(request.method!=='POST')return response(405,{ok:false,error:'Método não permitido.'});try{let body={};try{body=await request.json()}catch{}const action=String(body.action||''),efi=body.efi||{},mp=body.mercadoPago||{};let data;if(action==='efi-test')data=await testEfi(efi);else if(action==='mp-test')data=await testMp(mp);else if(action==='efi-webhooks')data=await efiWebhooks(efi);else if(action==='efi-pix-auto-create')data=await createPixAuto(body.client,efi,body.startDate,body.endDate,body.amountCents);else if(action==='efi-pix-auto-refresh'){const current=await efiPixCall(efi,`/v2/rec/${encodeURIComponent(body.idRec)}`);data={idRec:body.idRec,status:String(current?.status||''),pixCopiaECola:String(current?.dadosQR?.pixCopiaECola||''),updatedAt:new Date().toISOString()}}else if(action==='issue'){const invoice=body.invoice,client=body.client;if(body.provider==='efi')data=invoice.billing_type==='Pix com vencimento'?await issueEfiPixDue(invoice,client,efi):invoice.billing_type==='Pix Automático'?await issuePixAuto(invoice,client,efi,body.pixAutoRecord):await issueEfi(invoice,client,efi);else if(body.provider==='mercadoPago')data=await issueMp(invoice,client,mp);else throw new Error('Banco emissor inválido.')}else if(action==='issue-carnet')data=await issueEfiCarnet(body.invoices,body.client,efi,body.description);else if(action==='sync')data=await syncInvoice(body.invoice,efi,mp);else if(action==='cancel')data=await cancelInvoice(body.invoice,efi,mp);else if(action==='settle')data=await settleInvoice(body.invoice,efi);else throw new Error('Operação bancária não reconhecida.');return response(200,{ok:true,data})}catch(e){return response(Number(e?.statusCode)||400,{ok:false,error:e instanceof Error?e.message:'Falha na integração bancária.'})}}
'''
bank=bank[:start]+bank_handler
Path('worker-bank-native.js').write_text(bank,encoding='utf-8')

# --- Worker: troca proxy remoto por handlers locais ---
w=Path('worker.js').read_text(encoding='utf-8')
anchor="import { handleNativeAuth,handleNativeCloudState,handleNativeCloudData } from './worker-native-api.js';"
imports=anchor+"\nimport { handleBankProxy } from './worker-bank-native.js';\nimport { handleMikrotikProxy } from './worker-mikrotik-native.js';"
w=w.replace(anchor,imports,1)
w=w.replace("\nconst SPECIALIZED_UPSTREAM='https://fibratelecom.vercel.app';",'')
w=w.replace("\nconst SPECIALIZED_PROXY_PATHS=new Set(['/api/bank-proxy','/api/mikrotik-proxy','/api/mikrotik-proxy-v2']);",'')
proxy_start=w.index('async function proxySpecializedApi(request,env){')
proxy_end=w.index('\nasync function ',proxy_start+20)
proxy_native=r'''async function handleSpecializedNative(request,env){
  const path=new URL(request.url).pathname;
  if(request.method!=='POST')return json({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-integration'});
  try{
    if(path==='/api/bank-proxy')await requirePanelPermission(request,env,'billing');
    else await requirePanelPermission(request,env,'network');
  }catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||401,{'x-provedor-plus-edge':'cloudflare-native-integration'})}
  if(path==='/api/bank-proxy')return handleBankProxy(request);
  return handleMikrotikProxy(request);
}
'''
w=w[:proxy_start]+proxy_native+w[proxy_end:]
service_start=w.index('async function bankProxyAsService(env,sql,payload){')
service_end=w.index('\nasync function ',service_start+25)
service_native=r'''async function bankProxyAsService(env,sql,payload){
  const response=await handleBankProxy(new Request('https://painel.fibramais.workers.dev/api/bank-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
  let body={};try{body=await response.json()}catch{}
  if(!response.ok||!body.ok)throw Object.assign(new Error(body?.error||`Falha na integração bancária Cloudflare (HTTP ${response.status}).`),{statusCode:response.status>=400&&response.status<500?409:502});
  return body.data||{};
}
'''
w=w[:service_start]+service_native+w[service_end:]
route="if(SPECIALIZED_PROXY_PATHS.has(url.pathname))return proxySpecializedApi(request,env);"
new_route="if(url.pathname==='/api/bank-proxy'||url.pathname==='/api/mikrotik-proxy'||url.pathname==='/api/mikrotik-proxy-v2')return handleSpecializedNative(request,env);"
if route not in w: raise SystemExit('Rota especializada antiga nao encontrada')
w=w.replace(route,new_route,1)
for forbidden in ('SPECIALIZED_UPSTREAM','fibratelecom.vercel.app','proxySpecializedApi','SPECIALIZED_PROXY_PATHS'):
    if forbidden in w: raise SystemExit(f'Referencia Vercel ainda presente no worker: {forbidden}')
Path('worker.js').write_text(w,encoding='utf-8')

# Dependencia apenas para abrir P12/PFX da Efi no Worker
pkg=json.loads(Path('package.json').read_text(encoding='utf-8'));pkg.setdefault('dependencies',{})['node-forge']='^1.3.1';Path('package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Bloqueio total de Git deploy na Vercel nesta branch
Path('vercel.json').write_text(json.dumps({'$schema':'https://openapi.vercel.sh/vercel.json','git':{'deploymentEnabled':False},'github':{'enabled':False}},indent=2)+'\n',encoding='utf-8')
