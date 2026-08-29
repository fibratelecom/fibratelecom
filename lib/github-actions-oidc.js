const crypto=require('node:crypto');

const ISSUER='https://token.actions.githubusercontent.com';
const JWKS_URL='https://token.actions.githubusercontent.com/.well-known/jwks';
const AUDIENCE='provedor-plus-automation';
const REPOSITORY='fibratelecom/fibratelecom';
const WORKFLOW_REF='fibratelecom/fibratelecom/.github/workflows/provedor-plus-automation.yml@refs/heads/main';
const CLOCK_SKEW_SECONDS=60;

let jwksCache={expiresAt:0,keys:[]};

function decodeJsonPart(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return JSON.parse(Buffer.from(padded,'base64').toString('utf8'));
}

function decodeSignature(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return Buffer.from(padded,'base64');
}

function audienceMatches(value){
  return Array.isArray(value)?value.includes(AUDIENCE):String(value||'')===AUDIENCE;
}

async function githubJwks(){
  if(jwksCache.expiresAt>Date.now()&&jwksCache.keys.length)return jwksCache.keys;
  const response=await fetch(JWKS_URL,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw Object.assign(new Error(`Não foi possível validar o agendador do GitHub (HTTP ${response.status}).`),{statusCode:503});
  const body=await response.json();
  const keys=Array.isArray(body?.keys)?body.keys:[];
  if(!keys.length)throw Object.assign(new Error('As chaves de autenticação do GitHub estão indisponíveis.'),{statusCode:503});
  jwksCache={expiresAt:Date.now()+60*60*1000,keys};
  return keys;
}

async function verifyGithubActionsToken(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw Object.assign(new Error('Token do agendador inválido.'),{statusCode:401});
  let header,claims;
  try{header=decodeJsonPart(parts[0]);claims=decodeJsonPart(parts[1])}
  catch{throw Object.assign(new Error('Token do agendador inválido.'),{statusCode:401})}
  if(header?.alg!=='RS256'||!header?.kid)throw Object.assign(new Error('Assinatura do agendador inválida.'),{statusCode:401});
  const keys=await githubJwks(),jwk=keys.find(key=>key?.kid===header.kid&&key?.kty==='RSA');
  if(!jwk)throw Object.assign(new Error('Chave de assinatura do agendador não reconhecida.'),{statusCode:401});
  let valid=false;
  try{
    const publicKey=crypto.createPublicKey({key:jwk,format:'jwk'});
    valid=crypto.verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),publicKey,decodeSignature(parts[2]));
  }catch{}
  if(!valid)throw Object.assign(new Error('Assinatura do agendador inválida.'),{statusCode:401});

  const now=Math.floor(Date.now()/1000),exp=Number(claims?.exp)||0,nbf=Number(claims?.nbf)||0,iat=Number(claims?.iat)||0;
  if(claims?.iss!==ISSUER||!audienceMatches(claims?.aud))throw Object.assign(new Error('Origem do agendador não autorizada.'),{statusCode:401});
  if(!exp||exp<now-CLOCK_SKEW_SECONDS||nbf>now+CLOCK_SKEW_SECONDS||iat>now+CLOCK_SKEW_SECONDS)throw Object.assign(new Error('Token do agendador expirado ou fora da janela válida.'),{statusCode:401});
  if(claims?.repository!==REPOSITORY||claims?.repository_owner!=='fibratelecom')throw Object.assign(new Error('Repositório do agendador não autorizado.'),{statusCode:403});
  if(claims?.ref!=='refs/heads/main'||claims?.workflow_ref!==WORKFLOW_REF)throw Object.assign(new Error('Fluxo do agendador não autorizado.'),{statusCode:403});
  if(!['schedule','workflow_dispatch'].includes(String(claims?.event_name||'')))throw Object.assign(new Error('Evento do agendador não autorizado.'),{statusCode:403});
  return claims;
}

function bearerToken(req){
  const authorization=String(req?.headers?.authorization||'').trim();
  const match=authorization.match(/^Bearer\s+(.+)$/i);
  return match?match[1].trim():'';
}

async function requireAutomationScheduler(req){
  const token=bearerToken(req);
  if(!token)throw Object.assign(new Error('Automação não autorizada.'),{statusCode:401});
  return verifyGithubActionsToken(token);
}

module.exports={requireAutomationScheduler,verifyGithubActionsToken};
