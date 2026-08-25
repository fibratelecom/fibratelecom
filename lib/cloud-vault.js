const crypto=require('crypto');
const {db,cookies}=require('./cloud-auth');

const VAULT_COOKIE='pp_vault';
const MAX_AGE=60*60*24*7;

function appendCookie(res,value){
  const current=res.getHeader?.('Set-Cookie');
  if(!current)res.setHeader('Set-Cookie',value);
  else if(Array.isArray(current))res.setHeader('Set-Cookie',[...current,value]);
  else res.setHeader('Set-Cookie',[String(current),value]);
}

function deriveVaultKey(password,user){
  const [kind,salt]=String(user?.password_hash||'').split('$');
  if(kind!=='scrypt'||!salt||!user?.id)throw new Error('Não foi possível preparar o cofre seguro do usuário.');
  return crypto.scryptSync(String(password),`pp-vault-v1:${user.id}:${salt}`,32);
}

function setVaultCookie(res,key,maxAge=MAX_AGE){
  const raw=Buffer.from(key).toString('base64url');
  appendCookie(res,`${VAULT_COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
}

function clearVaultCookie(res){
  appendCookie(res,`${VAULT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

function requestVaultKey(req,{optional=false}={}){
  const raw=cookies(req)[VAULT_COOKIE];
  if(!raw){
    if(optional)return null;
    throw Object.assign(new Error('Cofre seguro indisponível. Saia e entre novamente para revalidar sua sessão.'),{statusCode:401,code:'VAULT_REQUIRED'});
  }
  try{
    const key=Buffer.from(raw,'base64url');
    if(key.length!==32)throw new Error('invalid');
    return key;
  }catch{
    if(optional)return null;
    throw Object.assign(new Error('Cofre seguro inválido. Saia e entre novamente.'),{statusCode:401,code:'VAULT_INVALID'});
  }
}

function hasVaultCookie(req){return Boolean(requestVaultKey(req,{optional:true}))}

function encryptJson(key,value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value??{}),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptJson(key,value){
  const raw=String(value||'');
  if(!raw)return {};
  const [version,ivRaw,tagRaw,dataRaw]=raw.split('.');
  if(version!=='v1'||!ivRaw||!tagRaw||!dataRaw)throw new Error('Credencial segura possui formato inválido.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ivRaw,'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw,'base64url'));
  const plain=Buffer.concat([decipher.update(Buffer.from(dataRaw,'base64url')),decipher.final()]);
  return JSON.parse(plain.toString('utf8')||'{}');
}

async function readIntegration(req,provider){
  const rows=await db(req,`/pp_integrations?provider=eq.${encodeURIComponent(provider)}&select=id,provider,enabled,environment,public_data,secret_data,updated_at&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}

async function upsertIntegration(req,provider,{enabled=true,environment='production',publicData={},secretData={}}={}){
  const key=requestVaultKey(req);
  const existing=await readIntegration(req,provider);
  const payload={
    provider:String(provider),
    enabled:Boolean(enabled),
    environment:String(environment||'production'),
    public_data:publicData&&typeof publicData==='object'?publicData:{},
    secret_data:encryptJson(key,secretData&&typeof secretData==='object'?secretData:{}),
    updated_at:new Date().toISOString()
  };
  if(existing?.id){
    const rows=await db(req,`/pp_integrations?id=eq.${Number(existing.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
    return Array.isArray(rows)?rows[0]||payload:rows||payload;
  }
  const rows=await db(req,'/pp_integrations',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  return Array.isArray(rows)?rows[0]||payload:rows||payload;
}

async function deleteIntegration(req,provider){
  await db(req,`/pp_integrations?provider=eq.${encodeURIComponent(provider)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  return {deleted:true,provider};
}

async function integrationSecret(req,provider,{optional=false}={}){
  const row=await readIntegration(req,provider);
  if(!row){if(optional)return null;throw Object.assign(new Error('Credencial não configurada.'),{statusCode:404})}
  const key=requestVaultKey(req);
  return decryptJson(key,row.secret_data);
}

async function mergeIntegration(req,provider,changes={}){
  const existing=await readIntegration(req,provider);
  let currentSecret={};
  if(existing?.secret_data){
    try{currentSecret=decryptJson(requestVaultKey(req),existing.secret_data)}catch(error){throw error}
  }
  const publicData={...(existing?.public_data||{}),...(changes.publicData||{})};
  const secretData=changes.replaceSecret?(changes.secretData||{}):{...currentSecret,...(changes.secretData||{})};
  return upsertIntegration(req,provider,{
    enabled:changes.enabled===undefined?(existing?.enabled??true):Boolean(changes.enabled),
    environment:changes.environment===undefined?(existing?.environment||'production'):changes.environment,
    publicData,secretData
  });
}

module.exports={
  VAULT_COOKIE,deriveVaultKey,setVaultCookie,clearVaultCookie,requestVaultKey,hasVaultCookie,
  encryptJson,decryptJson,readIntegration,upsertIntegration,mergeIntegration,deleteIntegration,integrationSecret
};
