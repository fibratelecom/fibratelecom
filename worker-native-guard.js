import { neon } from '@neondatabase/serverless';

const COOKIE='pp_session';
const PROFILE_PREFIX='employee_access_v1_';
const text=value=>String(value??'').trim();

function sqlFor(env){
  if(!env?.DATABASE_URL)throw Object.assign(new Error('Conexão com o Neon não configurada na Cloudflare.'),{statusCode:503});
  return neon(env.DATABASE_URL);
}
function cookieValue(request,name){
  for(const part of String(request.headers.get('cookie')||'').split(';')){
    const i=part.indexOf('=');if(i<0)continue;
    if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());
  }
  return '';
}
async function sha256(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function apiJson(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}});
}
export async function requireNativeSession(request,env){
  const token=cookieValue(request,COOKIE);if(!token)throw Object.assign(new Error('Sessão expirada, desativada ou não autenticada.'),{statusCode:401});
  const sql=sqlFor(env),tokenHash=await sha256(token),sessions=await sql`SELECT id,user_id,expires_at FROM pp_sessions WHERE token_hash=${tokenHash} LIMIT 1`,session=sessions?.[0];
  if(!session||new Date(session.expires_at).getTime()<=Date.now())throw Object.assign(new Error('Sessão expirada, desativada ou não autenticada.'),{statusCode:401});
  const users=await sql`SELECT id,email,name,role FROM pp_users WHERE id=${Number(session.user_id)} LIMIT 1`,user=users?.[0];
  if(!user)throw Object.assign(new Error('Sessão expirada, desativada ou não autenticada.'),{statusCode:401});
  const settings=await sql`SELECT value FROM pp_settings WHERE key=${PROFILE_PREFIX+Number(user.id)} LIMIT 1`,profile=settings?.[0]?.value||{};
  if(profile?.active===false)throw Object.assign(new Error('Este acesso está desativado. Procure o administrador.'),{statusCode:403});
  return {session,user:{id:Number(user.id),email:text(user.email),name:text(user.name),role:text(user.role)}};
}
export async function databaseHealth(env){
  if(!env?.DATABASE_URL)return {configured:false,connected:false};
  try{const sql=sqlFor(env),rows=await sql`SELECT 1 AS ok`;return {configured:true,connected:Number(rows?.[0]?.ok)===1}}
  catch{return {configured:true,connected:false}}
}
