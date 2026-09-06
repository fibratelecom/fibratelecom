const crypto=require('crypto');
const {db,normalizeRole}=require('./cloud-auth');

const PROVIDERS=new Set(['mercadoPago']);

const text=value=>String(value??'').trim();

function providerName(value){
  const provider=text(value);
  if(!PROVIDERS.has(provider))throw Object.assign(new Error('Banco não suportado para credencial segura.'),{statusCode:400});
  return provider;
}

function serverRequest(req){
  const headers={...(req?.headers||{})};
  if(!text(headers['x-vercel-oidc-token'])&&text(process.env.VERCEL_OIDC_TOKEN))headers['x-vercel-oidc-token']=text(process.env.VERCEL_OIDC_TOKEN);
  return {...(req||{}),headers};
}

const secretDb=(req,path,options={})=>db(serverRequest(req),path,options);

async function settingsGet(req,key){
  const rows=await secretDb(req,`/pp_settings?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}

async function settingsSet(req,key,value){
  const payload={key,value,updated_at:new Date().toISOString()};
  const patched=await secretDb(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{
    method:'PATCH',
    headers:{'Content-Type':'application/json',Prefer:'return=representation'},
    body:JSON.stringify(payload)
  });
  let row=Array.isArray(patched)?patched[0]:null;
  if(!row){
    const inserted=await secretDb(req,'/pp_settings',{
      method:'POST',
      headers:{'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify(payload)
    });
    row=Array.isArray(inserted)?inserted[0]:inserted;
  }
  return row;
}

async function settingsDelete(req,key){
  await secretDb(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
}

async function encryptionContext(req,provider){
  provider=providerName(provider);
  const rows=await secretDb(req,'/pp_users?select=id,password_hash,role&order=id.asc&limit=50');
  const users=Array.isArray(rows)?rows:[];
  const owner=users.find(user=>normalizeRole(user?.role)==='admin'&&text(user?.password_hash))||users.find(user=>text(user?.password_hash));
  if(!owner?.id||!text(owner.password_hash))throw Object.assign(new Error('Não foi possível proteger a credencial bancária.'),{statusCode:500});
  const key=crypto.createHash('sha256').update(`provedor-plus-bank-secret-v1|${Number(owner.id)}|${text(owner.password_hash)}`).digest();
  return {provider,key,settingKey:`bank_secret_v1_${provider}`};
}

function encrypt(value,key){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value||{}),'utf8'),cipher.final()]);
  return {v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')};
}

function decrypt(record,key){
  try{
    if(!record?.iv||!record?.tag||!record?.data)return {};
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));
    decipher.setAuthTag(Buffer.from(record.tag,'base64'));
    const plain=Buffer.concat([decipher.update(Buffer.from(record.data,'base64')),decipher.final()]).toString('utf8');
    const parsed=JSON.parse(plain);
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch{return {}}
}

async function getWithContext(req,provider='mercadoPago'){
  const ctx=await encryptionContext(req,provider),row=await settingsGet(req,ctx.settingKey);
  return {ctx,secret:decrypt(row?.value,ctx.key)};
}

async function get(req,provider='mercadoPago'){
  return (await getWithContext(req,provider)).secret;
}

function secretStatus(secret={}){
  const accessTokenConfigured=Boolean(text(secret.accessToken)),webhookSecretConfigured=Boolean(text(secret.webhookSecret));
  return {configured:accessTokenConfigured,accessTokenConfigured,webhookSecretConfigured};
}

async function status(req,provider='mercadoPago'){
  return secretStatus(await get(req,provider));
}

async function save(req,provider='mercadoPago',data={}){
  const {ctx,secret:current}=await getWithContext(req,provider),accessToken=text(data?.accessToken)||text(current?.accessToken);
  if(!accessToken)throw Object.assign(new Error('Mercado Pago: informe o Access Token.'),{statusCode:400});
  const next={...current,accessToken};
  if(Object.prototype.hasOwnProperty.call(data||{},'webhookSecret')){
    const webhookSecret=text(data?.webhookSecret);
    if(webhookSecret)next.webhookSecret=webhookSecret;else delete next.webhookSecret;
  }
  await settingsSet(req,ctx.settingKey,encrypt(next,ctx.key));
  return secretStatus(next);
}

async function saveWebhook(req,provider='mercadoPago',data={}){
  const webhookSecret=text(data?.webhookSecret||data?.secret);
  if(!webhookSecret)throw Object.assign(new Error('Mercado Pago: informe a chave secreta do Webhook.'),{statusCode:400});
  const {ctx,secret:current}=await getWithContext(req,provider),next={...current,webhookSecret};
  await settingsSet(req,ctx.settingKey,encrypt(next,ctx.key));
  return secretStatus(next);
}

async function removeWebhook(req,provider='mercadoPago'){
  const {ctx,secret:current}=await getWithContext(req,provider),next={...current};
  delete next.webhookSecret;
  if(!text(next.accessToken)){await settingsDelete(req,ctx.settingKey);return {configured:false,accessTokenConfigured:false,webhookSecretConfigured:false,deleted:true}}
  await settingsSet(req,ctx.settingKey,encrypt(next,ctx.key));
  return {...secretStatus(next),deleted:true};
}

async function remove(req,provider='mercadoPago'){
  const ctx=await encryptionContext(req,provider);
  await settingsDelete(req,ctx.settingKey);
  return {configured:false,accessTokenConfigured:false,webhookSecretConfigured:false,deleted:true};
}

module.exports={get,status,save,saveWebhook,removeWebhook,remove};
