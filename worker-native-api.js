import { neon } from '@neondatabase/serverless';
import { scrypt } from 'scrypt-js';

const COOKIE='pp_session';
const PROFILE_PREFIX='employee_access_v1_';
const PROFILE_D1_CUTOVER_AT=Date.parse('2026-09-23T00:24:01Z');
const AUTH_D1_MARKER='panel_auth_d1_v1';
const STATE_KEY='web_state_v1017';
const TICKETS_D1_KEY='support_tickets_v1';
const AUDIT_D1_KEY='admin_audit_v1';
const ALL_PERMISSIONS=['dashboard','clients','plans','finance','billing','tickets','network'];
const utf8=new TextEncoder();
const SQL_ENV=new WeakMap();
let authD1Ready=false,authD1InitPromise=null;

const text=value=>String(value??'').trim();
const num=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.trunc(n):null};
const nullableText=value=>{const v=text(value);return v||null};
const bool=(value,fallback=false)=>{if(value===undefined||value===null||value==='')return fallback;if(typeof value==='boolean')return value;if(typeof value==='number')return value!==0;const v=text(value).toLowerCase();if(['true','1','sim','yes','on'].includes(v))return true;if(['false','0','nao','não','no','off'].includes(v))return false;return fallback};
const normalizeRole=value=>{const role=text(value).toLowerCase();return ['admin','tecnico','atendente'].includes(role)?role:'atendente'};
function defaultPermissions(role){role=normalizeRole(role);if(role==='admin')return [...ALL_PERMISSIONS];if(role==='tecnico')return ['dashboard','clients','tickets','network'];return ['dashboard','clients','plans','finance','billing','tickets'];}
function normalizePermissions(value,role){if(normalizeRole(role)==='admin')return [...ALL_PERMISSIONS];const list=Array.isArray(value)?value:defaultPermissions(role);return [...new Set(list.map(v=>text(v)).filter(v=>ALL_PERMISSIONS.includes(v)))];}
function sqlFor(env){if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão nativa com o Neon não configurada na Cloudflare.'),{statusCode:503});const sql=neon(env.DATABASE_URL);SQL_ENV.set(sql,env);return sql;}
function authSqlFor(env){const sql=()=>{throw Object.assign(new Error('Acesso legado Neon da autenticação desativado.'),{statusCode:503})};SQL_ENV.set(sql,env);return sql;}
function d1Bool(value){return value===null||value===undefined?null:(bool(value)?1:0)}
async function mirrorClientRowToD1(env,row){
  if(!env?.PROVEDOR_DB||!row?.id)return false;
  const db=env.PROVEDOR_DB;
  await db.prepare(`INSERT INTO pp_clients (
    id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,
    pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,
    mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,document=excluded.document,contract_number=excluded.contract_number,plan=excluded.plan,
    plan_id=excluded.plan_id,due_day=excluded.due_day,status=excluded.status,email=excluded.email,phone=excluded.phone,
    address=excluded.address,city=excluded.city,state=excluded.state,zip_code=excluded.zip_code,pppoe_user=excluded.pppoe_user,
    auto_block=excluded.auto_block,block_after_days=excluded.block_after_days,notes=excluded.notes,router_id=excluded.router_id,
    connection_type=excluded.connection_type,pppoe_username=excluded.pppoe_username,mikrotik_profile=excluded.mikrotik_profile,
    ip=excluded.ip,mac_address=excluded.mac_address,mikrotik_secret_id=excluded.mikrotik_secret_id,
    mikrotik_status=excluded.mikrotik_status,mikrotik_last_sync=excluded.mikrotik_last_sync,
    created_at=COALESCE(pp_clients.created_at,excluded.created_at),updated_at=excluded.updated_at`).bind(
      Number(row.id),text(row.name),nullableText(row.document),nullableText(row.contract_number),nullableText(row.plan),num(row.plan_id),num(row.due_day),nullableText(row.status),nullableText(row.email),nullableText(row.phone),nullableText(row.address),nullableText(row.city),nullableText(row.state),nullableText(row.zip_code),nullableText(row.pppoe_user),d1Bool(row.auto_block),num(row.block_after_days),nullableText(row.notes),num(row.router_id),nullableText(row.connection_type),nullableText(row.pppoe_username),nullableText(row.mikrotik_profile),nullableText(row.ip),nullableText(row.mac_address),nullableText(row.mikrotik_secret_id),nullableText(row.mikrotik_status),row.mikrotik_last_sync||null,row.created_at||null,row.updated_at||new Date().toISOString()
    ).run();
  return true;
}
async function mirrorPlanRowToD1(env,row){
  if(!env?.PROVEDOR_DB||!row?.id)return false;
  await env.PROVEDOR_DB.prepare(`INSERT INTO pp_plans (id,name,speed_down_mbps,speed_up_mbps,price_cents,active,description,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,speed_down_mbps=excluded.speed_down_mbps,
    speed_up_mbps=excluded.speed_up_mbps,price_cents=excluded.price_cents,active=excluded.active,
    description=excluded.description,created_at=COALESCE(pp_plans.created_at,excluded.created_at),updated_at=excluded.updated_at`).bind(
      Number(row.id),text(row.name),Math.max(0,Number(row.speed_down_mbps)||0),Math.max(0,Number(row.speed_up_mbps)||0),Math.max(0,Math.round(Number(row.price_cents)||0)),d1Bool(row.active),nullableText(row.description),row.created_at||null,row.updated_at||new Date().toISOString()
    ).run();
  return true;
}
async function mirrorRouterRowToD1(env,row){
  if(!env?.PROVEDOR_DB||!row?.id)return false;
  await env.PROVEDOR_DB.prepare(`INSERT INTO pp_routers (id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,host=excluded.host,port=excluded.port,username=excluded.username,
    connection_method=excluded.connection_method,allow_self_signed=excluded.allow_self_signed,active=excluded.active,
    last_status=excluded.last_status,last_sync=excluded.last_sync,
    created_at=COALESCE(pp_routers.created_at,excluded.created_at),updated_at=excluded.updated_at`).bind(
      Number(row.id),text(row.name),text(row.host),Math.max(1,Number(row.port)||443),text(row.username),text(row.connection_method)||'rest',d1Bool(row.allow_self_signed),d1Bool(row.active),nullableText(row.last_status),row.last_sync||null,row.created_at||null,row.updated_at||new Date().toISOString()
    ).run();
  return true;
}
function safeRouterRow(row){if(!row||typeof row!=='object')return row;return {...row,id:Number(row.id),port:Math.max(1,Number(row.port)||443),allow_self_signed:bool(row.allow_self_signed,false),active:bool(row.active,true)}}
async function readRouterList(env,sql){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos MikroTik não configurado.'),{statusCode:503});
  try{
    const result=await env.PROVEDOR_DB.prepare('SELECT id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at FROM pp_routers ORDER BY id ASC').all(),rows=Array.isArray(result?.results)?result.results:[];
    return rows.map(safeRouterRow);
  }catch(error){console.error('Provedor Plus: leitura D1 dos MikroTik falhou.',error);throw error}
}
async function readRouterById(env,sql,routerId){
  const id=num(routerId);if(!id)return null;
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos MikroTik não configurado.'),{statusCode:503});
  try{
    const result=await env.PROVEDOR_DB.prepare('SELECT id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at FROM pp_routers WHERE id=? LIMIT 1').bind(id).all(),row=result?.results?.[0]||null;
    return safeRouterRow(row);
  }catch(error){console.error(`Provedor Plus: leitura D1 do MikroTik ${id} falhou.`,error);throw error}
}
export async function mirrorClientToD1(env,clientId){
  const id=num(clientId);if(!id||!env?.PROVEDOR_DB)return false;
  const rows=await sqlFor(env)`SELECT * FROM pp_clients WHERE id=${id} LIMIT 1`,row=Array.isArray(rows)?rows[0]:null;
  if(!row){await env.PROVEDOR_DB.prepare('DELETE FROM pp_clients WHERE id = ?').bind(id).run();return false}
  return mirrorClientRowToD1(env,row);
}
export async function mirrorPlanToD1(env,planId){
  const id=num(planId);if(!id||!env?.PROVEDOR_DB)return false;
  const rows=await sqlFor(env)`SELECT * FROM pp_plans WHERE id=${id} LIMIT 1`,row=Array.isArray(rows)?rows[0]:null;
  if(!row){await env.PROVEDOR_DB.prepare('DELETE FROM pp_plans WHERE id = ?').bind(id).run();return false}
  return mirrorPlanRowToD1(env,row);
}
export async function mirrorRouterToD1(env,routerId){
  const id=num(routerId);if(!id||!env?.PROVEDOR_DB)return false;
  const rows=await sqlFor(env)`SELECT * FROM pp_routers WHERE id=${id} LIMIT 1`,row=Array.isArray(rows)?rows[0]:null;
  if(!row){await env.PROVEDOR_DB.prepare('DELETE FROM pp_routers WHERE id = ?').bind(id).run();return false}
  return mirrorRouterRowToD1(env,row);
}
function apiJson(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0',...headers}});}
async function bodyOf(request){try{return await request.json()}catch{return {}}}
function cookies(request){const out={};for(const part of text(request.headers.get('cookie')).split(';')){const i=part.indexOf('=');if(i<0)continue;out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}return out;}
function cookieHeader(token,maxAge=60*60*24*7){return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
function clearCookieHeader(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
function bytesToHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function hexToBytes(hex){const raw=text(hex);if(raw.length%2)return new Uint8Array();const out=new Uint8Array(raw.length/2);for(let i=0;i<out.length;i++){const n=parseInt(raw.slice(i*2,i*2+2),16);if(!Number.isFinite(n))return new Uint8Array();out[i]=n}return out;}
function bytesToB64(bytes){let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(out);}
function b64ToBytes(value){const bin=atob(text(value));const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function randomBytes(size){const out=new Uint8Array(size);crypto.getRandomValues(out);return out;}
function randomToken(){return bytesToB64(randomBytes(32)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sha256Bytes(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(String(value??''))));}
async function sha256Hex(value){return bytesToHex(await sha256Bytes(value));}
async function passwordHash(password){const salt=randomBytes(16),derived=await scrypt(utf8.encode(String(password)),salt,16384,8,1,64);return `scrypt$${bytesToHex(salt)}$${bytesToHex(derived)}`;}
async function passwordVerify(password,stored){try{const [kind,saltHex,expectedHex]=text(stored).split('$');if(kind!=='scrypt'||!saltHex||!expectedHex)return false;const expected=hexToBytes(expectedHex),salt=hexToBytes(saltHex);if(!expected.length||!salt.length)return false;const got=await scrypt(utf8.encode(String(password)),salt,16384,8,1,expected.length);if(got.length!==expected.length)return false;let diff=0;for(let i=0;i<got.length;i++)diff|=got[i]^expected[i];return diff===0}catch{return false}}
const profileKey=id=>`${PROFILE_PREFIX}${Number(id)}`;
const safeUser=user=>user?{id:Number(user.id),email:text(user.email),name:text(user.name),role:normalizeRole(user.role),created_at:user.created_at||null}:null;

async function getSetting(sql,key){const rows=await sql`SELECT value,updated_at FROM pp_settings WHERE key=${key} LIMIT 1`;return Array.isArray(rows)?rows[0]||null:null;}
export function finalizePaidNegotiations(state){
  if(!state||typeof state!=='object'||Array.isArray(state))return state;
  const invoices=Array.isArray(state.invoices)?state.invoices:[],agreements=Array.isArray(state.negotiations)?state.negotiations:[];
  for(const agreement of agreements){
    const id=text(agreement?.id);if(!id)continue;
    const current=text(agreement?.status).toLowerCase();if(current.includes('cancel')||current.includes('falh'))continue;
    const wanted=new Set((Array.isArray(agreement?.new_invoice_ids)?agreement.new_invoice_ids:[]).map(String));
    const related=invoices.filter(invoice=>wanted.size?wanted.has(String(invoice?.id)):text(invoice?.negotiation_id)===id&&!text(invoice?.status).toLowerCase().includes('renegociado'));
    if(!related.length)continue;
    const allPaid=related.every(invoice=>{const status=text(invoice?.status).toLowerCase();return ['pago','paga','paid','baixado','recebido','recebida','quitado','quitada'].some(value=>status.includes(value))});
    if(!allPaid)continue;
    const paidTimes=related.map(invoice=>new Date(text(invoice?.paid_at)).getTime()).filter(Number.isFinite),completedAt=paidTimes.length?new Date(Math.max(...paidTimes)).toISOString():new Date().toISOString();
    if(!current.includes('conclu')&&!current.includes('quitad'))agreement.status='Concluído';
    if(!text(agreement?.completed_at))agreement.completed_at=completedAt;
    agreement.updated_at=completedAt;
  }
  return state;
}
async function setSetting(sql,key,value){if(key===STATE_KEY)value=finalizePaidNegotiations(value);const updatedAt=new Date().toISOString(),raw=JSON.stringify(value??null);const rows=await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${key},${raw}::jsonb,${updatedAt}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at RETURNING value,updated_at`;return Array.isArray(rows)?rows[0]||null:null;}
async function deleteSetting(sql,key){await sql`DELETE FROM pp_settings WHERE key=${key}`;}
function stateObject(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}return {}}
async function getStateD1(env,sql=null){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 do estado administrativo não configurado.'),{statusCode:503});
  const result=await env.PROVEDOR_DB.prepare('SELECT value,updated_at FROM pp_settings WHERE key=? LIMIT 1').bind(STATE_KEY).all(),row=result?.results?.[0];
  if(row)return {value:stateObject(row.value),updated_at:row.updated_at||null};
  if(sql)try{const legacy=await getSetting(sql,STATE_KEY);if(legacy){const seeded=await setStateD1(env,legacy.value,legacy.updated_at instanceof Date?legacy.updated_at.toISOString():text(legacy.updated_at));return seeded}}catch(error){console.error('Provedor Plus: cópia Neon do estado não pôde recompor o D1.',error)}
  return null;
}
async function setStateD1(env,value,updatedAt=new Date().toISOString()){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 do estado administrativo não configurado.'),{statusCode:503});const next=finalizePaidNegotiations(value),at=text(updatedAt)||new Date().toISOString();
  await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(STATE_KEY,JSON.stringify(next??{}),at).run();return {value:next,updated_at:at};
}
function profileValue(row){let value=row?.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{value={}}return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function normalizeProfile(value,role){return {active:value?.active!==false,phone:text(value?.phone),permissions:normalizePermissions(value?.permissions,role)}}
async function mirrorProfileToD1(env,id,profile){
  if(!env?.PROVEDOR_DB||!Number(id))return false;
  const updatedAt=text(profile?.updated_at)||new Date().toISOString(),safe={active:profile?.active!==false,phone:text(profile?.phone),permissions:Array.isArray(profile?.permissions)?profile.permissions.map(item=>text(item)).filter(item=>ALL_PERMISSIONS.includes(item)):[],updated_at:updatedAt};
  await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(profileKey(id),JSON.stringify(safe),updatedAt).run();
  return true;
}
async function getProfile(sql,id,role){const row=await getSetting(sql,profileKey(id)),value=profileValue(row);return normalizeProfile(value,role);}
async function getProfileD1(env,sql,id,role){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos perfis de funcionário não configurado.'),{statusCode:503});
  const result=await env.PROVEDOR_DB.prepare('SELECT value,updated_at FROM pp_settings WHERE key=? LIMIT 1').bind(profileKey(id)).all(),row=result?.results?.[0];
  return row?normalizeProfile(profileValue(row),role):normalizeProfile({},role);
}
async function saveProfile(sql,id,profile,env=null){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos perfis de funcionário não configurado.'),{statusCode:503});
  const updatedAt=text(profile?.updated_at)||new Date().toISOString(),next={...profile,updated_at:updatedAt};
  await mirrorProfileToD1(env,id,next);return {value:next,updated_at:updatedAt};
}
async function initializeAuthD1(env,sql){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 de autenticação não configurado.'),{statusCode:503});const db=env.PROVEDOR_DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'admin',password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS pp_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES pp_users(id) ON DELETE CASCADE)`),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS pp_users_email_d1_idx ON pp_users(email)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS pp_sessions_token_d1_idx ON pp_sessions(token_hash)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_sessions_user_d1_idx ON pp_sessions(user_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS pp_sessions_expires_d1_idx ON pp_sessions(expires_at)')
  ]);
  const markerResult=await db.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(AUTH_D1_MARKER).all();if(markerResult?.results?.[0])return db;
  const now=new Date().toISOString(),users=await db.prepare('SELECT COUNT(*) AS total FROM pp_users').all(),sessions=await db.prepare('SELECT COUNT(*) AS total FROM pp_sessions WHERE expires_at>?').bind(now).all();
  await db.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(AUTH_D1_MARKER,JSON.stringify({seededAt:now,source:'d1',users:Number(users?.results?.[0]?.total)||0,sessions:Number(sessions?.results?.[0]?.total)||0}),now).run();
  return db;
}
async function ensureAuthD1(env,sql){
  if(authD1Ready)return env.PROVEDOR_DB;
  if(!authD1InitPromise)authD1InitPromise=initializeAuthD1(env,sql);
  try{const db=await authD1InitPromise;authD1Ready=true;return db}catch(error){authD1InitPromise=null;throw error}
}
async function revokeSessions(sql,userId){const env=SQL_ENV.get(sql),db=await ensureAuthD1(env,sql);await db.prepare('DELETE FROM pp_sessions WHERE user_id=?').bind(Number(userId)).run();}
async function deleteProfile(sql,id,env=null){if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos perfis de funcionário não configurado.'),{statusCode:503});await env.PROVEDOR_DB.prepare('DELETE FROM pp_settings WHERE key=?').bind(profileKey(id)).run();}

async function createSession(sql,userId){const env=SQL_ENV.get(sql),db=await ensureAuthD1(env,sql),token=randomToken(),tokenHash=await sha256Hex(token),expires=new Date(Date.now()+7*864e5).toISOString();await db.prepare('INSERT INTO pp_sessions (user_id,token_hash,expires_at) VALUES (?,?,?)').bind(Number(userId),tokenHash,expires).run();return {token,expires_at:expires};}
async function currentSession(request,sql){const token=cookies(request)[COOKIE];if(!token)return null;const env=SQL_ENV.get(sql),db=await ensureAuthD1(env,sql),tokenHash=await sha256Hex(token),result=await db.prepare('SELECT id,user_id,expires_at FROM pp_sessions WHERE token_hash=? LIMIT 1').bind(tokenHash).all(),session=result?.results?.[0];if(!session)return null;if(new Date(session.expires_at).getTime()<=Date.now()){await db.prepare('DELETE FROM pp_sessions WHERE token_hash=?').bind(tokenHash).run();return null}const users=await db.prepare('SELECT id,email,name,role,created_at FROM pp_users WHERE id=? LIMIT 1').bind(Number(session.user_id)).all(),user=users?.results?.[0];if(!user)return null;const access=await getProfileD1(env,sql,user.id,user.role);if(!access.active){await db.prepare('DELETE FROM pp_sessions WHERE token_hash=?').bind(tokenHash).run();return null}return {session,user:{...safeUser(user),active:true,permissions:access.permissions,phone:access.phone}};}
async function requireAuth(request,sql){const current=await currentSession(request,sql);if(!current)throw Object.assign(new Error('Sessão expirada, desativada ou não autenticada.'),{statusCode:401});return current;}
async function requireAdmin(request,sql){const current=await requireAuth(request,sql);if(current.user.role!=='admin')throw Object.assign(new Error('Somente o administrador pode realizar esta ação.'),{statusCode:403});return current;}
async function requirePermission(request,sql,permission){const current=await requireAuth(request,sql);if(current.user.role==='admin'||current.user.permissions.includes(String(permission)))return current;throw Object.assign(new Error('Seu usuário não possui permissão para esta área.'),{statusCode:403});}

export async function handleNativeAuth(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-auth'});
  const sql=authSqlFor(env);
  try{
    const db=await ensureAuthD1(env,sql),body=await bodyOf(request),action=text(body?.action),data=body?.data||{};
    if(action==='status'){
      const current=await currentSession(request,sql),users=await db.prepare('SELECT id FROM pp_users LIMIT 1').all();
      return apiJson({ok:true,data:{configured:Boolean(users?.results?.length),authenticated:Boolean(current),user:current?.user||null}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='setup'){
      const existing=await db.prepare('SELECT id FROM pp_users LIMIT 1').all();if(existing?.results?.length)throw Object.assign(new Error('O administrador inicial já foi configurado.'),{statusCode:409});
      const name=text(data.name),login=text(data.login).toLowerCase(),password=String(data.password||'');
      if(name.length<2)throw Object.assign(new Error('Informe o nome do administrador.'),{statusCode:400});if(login.length<3)throw Object.assign(new Error('Informe o usuário de acesso.'),{statusCode:400});if(password.length<8)throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres.'),{statusCode:400});
      const hash=await passwordHash(password),createdAt=new Date().toISOString(),insert=await db.prepare("INSERT INTO pp_users (email,name,role,password_hash,created_at) VALUES (?,?,?,?,?)").bind(login,name,'admin',hash,createdAt).run(),id=Number(insert?.meta?.last_row_id)||0;if(!id)throw new Error('Não foi possível criar o administrador.');const rows=await db.prepare('SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE id=? LIMIT 1').bind(id).all(),user=rows?.results?.[0];const session=await createSession(sql,user.id);
      return apiJson({ok:true,data:{authenticated:true,user:{...safeUser(user),active:true,permissions:[...ALL_PERMISSIONS]}}},200,{'Set-Cookie':cookieHeader(session.token),'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='login'){
      const login=text(data.login).toLowerCase(),password=String(data.password||''),rows=await db.prepare('SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE email=? LIMIT 1').bind(login).all(),user=rows?.results?.[0];
      if(!user||!await passwordVerify(password,user.password_hash))throw Object.assign(new Error('Usuário ou senha inválidos.'),{statusCode:401});const access=await getProfileD1(env,sql,user.id,user.role);if(!access.active)throw Object.assign(new Error('Este acesso está desativado. Procure o administrador.'),{statusCode:403});const session=await createSession(sql,user.id);
      return apiJson({ok:true,data:{authenticated:true,user:{...safeUser(user),active:true,permissions:access.permissions,phone:access.phone}}},200,{'Set-Cookie':cookieHeader(session.token),'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='logout'){
      const token=cookies(request)[COOKIE];if(token){const hash=await sha256Hex(token);await db.prepare('DELETE FROM pp_sessions WHERE token_hash=?').bind(hash).run()}
      return apiJson({ok:true,data:{authenticated:false}},200,{'Set-Cookie':clearCookieHeader(),'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.available'){
      await requireAuth(request,sql);const result=await db.prepare('SELECT id,name,role,created_at FROM pp_users ORDER BY name ASC').all(),users=result?.results||[],out=[];for(const user of users){const profile=await getProfileD1(env,sql,user.id,user.role);if(profile.active)out.push({...safeUser(user),permissions:profile.permissions})}return apiJson({ok:true,data:out},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.list'){
      await requireAdmin(request,sql);const result=await db.prepare('SELECT id,email,name,role,created_at FROM pp_users ORDER BY name ASC').all(),users=result?.results||[],out=[];for(const user of users){const profile=await getProfileD1(env,sql,user.id,user.role);out.push({...safeUser(user),...profile})}return apiJson({ok:true,data:out},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.save'){
      const current=await requireAdmin(request,sql),id=Number(data.id)||0,name=text(data.name),login=text(data.login||data.email).toLowerCase(),role=normalizeRole(data.role),password=String(data.password||''),phone=text(data.phone);
      if(name.length<2)throw Object.assign(new Error('Informe o nome do funcionário.'),{statusCode:400});if(login.length<3)throw Object.assign(new Error('Informe o usuário de acesso.'),{statusCode:400});if(!id&&password.length<8)throw Object.assign(new Error('A senha inicial deve ter pelo menos 8 caracteres.'),{statusCode:400});if(password&&password.length<8)throw Object.assign(new Error('A nova senha deve ter pelo menos 8 caracteres.'),{statusCode:400});if(id===Number(current.user.id)&&role!=='admin')throw Object.assign(new Error('O administrador atual não pode remover o próprio perfil de administrador.'),{statusCode:400});
      const active=id===Number(current.user.id)?true:data.active!==false,permissions=normalizePermissions(data.permissions,role);if(role!=='admin'&&!permissions.length)throw Object.assign(new Error('Selecione pelo menos uma permissão de acesso.'),{statusCode:400});
      let user;
      if(id){
        const foundResult=await db.prepare('SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE id=? LIMIT 1').bind(id).all(),found=foundResult?.results?.[0];if(!found)throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});
        if(password){const hash=await passwordHash(password);await db.prepare('UPDATE pp_users SET email=?,name=?,role=?,password_hash=? WHERE id=?').bind(login,name,role,hash,id).run();}
        else await db.prepare('UPDATE pp_users SET email=?,name=?,role=? WHERE id=?').bind(login,name,role,id).run();
        const saved=await db.prepare('SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE id=? LIMIT 1').bind(id).all();user=saved?.results?.[0];
      }else{
        const hash=await passwordHash(password),createdAt=new Date().toISOString(),insert=await db.prepare('INSERT INTO pp_users (email,name,role,password_hash,created_at) VALUES (?,?,?,?,?)').bind(login,name,role,hash,createdAt).run(),newId=Number(insert?.meta?.last_row_id)||0;if(newId){const saved=await db.prepare('SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE id=? LIMIT 1').bind(newId).all();user=saved?.results?.[0]}
      }
      if(!user?.id)throw Object.assign(new Error('Não foi possível salvar o funcionário.'),{statusCode:500});
      try{await saveProfile(sql,user.id,{active,phone,permissions,updated_at:new Date().toISOString()},env);}catch(error){if(!id){try{await db.prepare('DELETE FROM pp_users WHERE id=?').bind(Number(user.id)).run()}catch{}try{await deleteProfile(sql,user.id,env)}catch{}}throw error}
      if(id&&Number(id)!==Number(current.user.id))await revokeSessions(sql,id);
      return apiJson({ok:true,data:{...safeUser(user),active,phone,permissions}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.toggle'){
      const current=await requireAdmin(request,sql),id=Number(data.id)||0;if(!id)throw Object.assign(new Error('Funcionário inválido.'),{statusCode:400});if(id===Number(current.user.id))throw Object.assign(new Error('Você não pode desativar o próprio acesso.'),{statusCode:400});const found=await db.prepare('SELECT id,email,name,role,created_at FROM pp_users WHERE id=? LIMIT 1').bind(id).all(),user=found?.results?.[0];if(!user)throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});const previous=await getProfileD1(env,sql,id,user.role),active=Boolean(data.active);await saveProfile(sql,id,{...previous,active,updated_at:new Date().toISOString()},env);if(!active)await revokeSessions(sql,id);return apiJson({ok:true,data:{...safeUser(user),...previous,active}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.delete'){
      const current=await requireAdmin(request,sql),id=Number(data.id)||0;if(!id)throw Object.assign(new Error('Funcionário inválido.'),{statusCode:400});if(id===Number(current.user.id))throw Object.assign(new Error('Você não pode excluir o próprio acesso.'),{statusCode:400});const found=await db.prepare('SELECT id FROM pp_users WHERE id=? LIMIT 1').bind(id).all();if(!found?.results?.[0])throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});await revokeSessions(sql,id);await db.prepare('DELETE FROM pp_users WHERE id=?').bind(id).run();await deleteProfile(sql,id,env);return apiJson({ok:true,data:{deleted:true,id}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-auth'});}
}


function preservePortalState(incoming,existing){
  const state=incoming&&typeof incoming==='object'&&!Array.isArray(incoming)?{...incoming}:{},remote=existing&&typeof existing==='object'&&!Array.isArray(existing)?existing:{};
  const localNegotiations=Array.isArray(state.negotiations)?[...state.negotiations]:[],remoteNegotiations=Array.isArray(remote.negotiations)?remote.negotiations:[],known=new Set(localNegotiations.map(item=>String(item?.id||'')).filter(Boolean));
  for(const item of remoteNegotiations){const id=String(item?.id||'');if(id&&!known.has(id)){localNegotiations.push(item);known.add(id)}}
  if(localNegotiations.length)state.negotiations=localNegotiations;
  const localTransactions=Array.isArray(state.cashback_transactions)?[...state.cashback_transactions]:[],remoteTransactions=Array.isArray(remote.cashback_transactions)?remote.cashback_transactions:[],knownTransactions=new Set(localTransactions.map(item=>String(item?.id||'')).filter(Boolean));
  for(const item of remoteTransactions){const id=String(item?.id||'');if(id&&!knownTransactions.has(id)){localTransactions.push(item);knownTransactions.add(id)}}
  if(localTransactions.length)state.cashback_transactions=localTransactions;
  const localClients=Array.isArray(state.clients)?[...state.clients]:[],remoteClients=Array.isArray(remote.clients)?remote.clients:[],clientIndex=new Map(localClients.map((item,i)=>[String(item?.id??''),i]));
  for(const remoteClient of remoteClients){
    const position=clientIndex.get(String(remoteClient?.id??''));if(position===undefined)continue;
    const localClient=localClients[position];if(!localClient||typeof localClient!=='object')continue;
    if(remoteClient.cashback_balance_cents!==undefined||remoteClient.cashback_balance!==undefined)localClients[position]={...localClient,cashback_balance_cents:Math.max(0,Math.round(Number(remoteClient.cashback_balance_cents??Number(remoteClient.cashback_balance)*100)||0)),cashback_balance:Math.max(0,Number(remoteClient.cashback_balance_cents??Number(remoteClient.cashback_balance)*100)||0)/100,cashback_updated_at:remoteClient.cashback_updated_at||localClient.cashback_updated_at||null};
  }
  if(localClients.length)state.clients=localClients;
  const localInvoices=Array.isArray(state.invoices)?[...state.invoices]:[],remoteInvoices=Array.isArray(remote.invoices)?remote.invoices:[],index=new Map(localInvoices.map((item,i)=>[String(item?.id??''),i]));
  const bankFields=['bank_provider','bank_environment','bank_charge_id','bank_order_id','bank_payment_id','bank_external_reference','bank_status','bank_status_detail','bank_barcode','bank_digitable_line','bank_ticket_url','bank_pdf_url','bank_pix_code','bank_last_sync_at'];
  const cashbackFields=['cashback_credited_at','cashback_credit_cents','cashback_transaction_id','cashback_mode','cashback_rate','cashback_discount_applied_cents','cashback_discount_transaction_id','cashback_discount_applied_at','cashback_discount_status','cashback_discount_used_at','cashback_discount_refunded_at','cashback_original_cents','cashback_pix_amount_cents'];
  const missing=value=>value===undefined||value===null||(typeof value==='string'&&!value.trim());
  for(const remoteInvoice of remoteInvoices){
    const key=String(remoteInvoice?.id??''),position=index.get(key);
    if(remoteInvoice?.negotiation_id){
      if(position===undefined){index.set(key,localInvoices.length);localInvoices.push(remoteInvoice);continue}
      const localInvoice=localInvoices[position];
      if(!localInvoice?.negotiation_id||String(localInvoice.negotiation_id)!==String(remoteInvoice.negotiation_id))localInvoices[position]=remoteInvoice;
      continue;
    }
    if(position===undefined)continue;
    const localInvoice=localInvoices[position];
    if(!localInvoice||typeof localInvoice!=='object')continue;
    let merged=localInvoice,changed=false;
    for(const field of bankFields){
      if(missing(localInvoice[field])&&!missing(remoteInvoice?.[field])){
        if(!changed){merged={...localInvoice};changed=true}
        merged[field]=remoteInvoice[field];
      }
    }
    for(const field of cashbackFields){
      if(Object.prototype.hasOwnProperty.call(remoteInvoice||{},field)&&localInvoice[field]!==remoteInvoice[field]){
        if(!changed){merged={...localInvoice};changed=true}
        merged[field]=remoteInvoice[field];
      }
    }
    if(remoteInvoice?.cashback_discount_status==='used')for(const field of ['status','payment_method','paid_by','paid_at','payment_origin']){
      if(Object.prototype.hasOwnProperty.call(remoteInvoice,field)&&localInvoice[field]!==remoteInvoice[field]){
        if(!changed){merged={...localInvoice};changed=true}
        merged[field]=remoteInvoice[field];
      }
    }
    if(changed)localInvoices[position]=merged;
  }
  if(localInvoices.length)state.invoices=localInvoices;
  const maxInvoiceId=Math.max(Number(state?.seq?.invoices)||0,...localInvoices.map(item=>Number(item?.id)||0));if(maxInvoiceId)state.seq={...(state.seq||{}),invoices:maxInvoiceId};
  return state;
}
function sanitize(value,depth=0){if(depth>30)return null;if(Array.isArray(value))return value.slice(0,10000).map(v=>sanitize(v,depth+1));if(!value||typeof value!=='object')return value;const blocked=new Set(['password','router_password','mikrotik_password','pppoe_password','pppoePassword','clientSecret','client_secret','accessToken','access_token','certificatePassword','certificate_password','certificateBase64','certificate_base64','privateKey','private_key']);const out={};for(const [key,val] of Object.entries(value)){if(blocked.has(key))continue;out[key]=sanitize(val,depth+1)}return out;}
async function saveTicketsD1(env,tickets){
  if(!env?.PROVEDOR_DB)return false;
  const safe=Array.isArray(tickets)?sanitize(tickets):[],updatedAt=new Date().toISOString();
  await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(TICKETS_D1_KEY,JSON.stringify(safe),updatedAt).run();
  return true;
}
async function readTicketsD1(env,legacyTickets=[]){
  const fallback=Array.isArray(legacyTickets)?sanitize(legacyTickets):[];
  if(!env?.PROVEDOR_DB)return {tickets:fallback,active:false};
  try{
    const result=await env.PROVEDOR_DB.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(TICKETS_D1_KEY).all(),row=result?.results?.[0];
    if(row){let value=row.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{value=[]}return {tickets:Array.isArray(value)?sanitize(value):[],active:true}}
    await saveTicketsD1(env,fallback);return {tickets:fallback,active:true};
  }catch(error){console.error('Provedor Plus: leitura D1 dos chamados falhou; usando a cópia legado do Neon.',error);return {tickets:fallback,active:false}}
}
async function saveAuditD1(env,audit){
  if(!env?.PROVEDOR_DB)return false;
  const safe=Array.isArray(audit)?sanitize(audit).slice(0,1500):[],updatedAt=new Date().toISOString();
  await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(AUDIT_D1_KEY,JSON.stringify(safe),updatedAt).run();
  return true;
}
async function readAuditD1(env,legacyAudit=[]){
  const fallback=Array.isArray(legacyAudit)?sanitize(legacyAudit).slice(0,1500):[];
  if(!env?.PROVEDOR_DB)return {audit:fallback,active:false};
  try{
    const result=await env.PROVEDOR_DB.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(AUDIT_D1_KEY).all(),row=result?.results?.[0];
    if(row){let value=row.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{value=[]}return {audit:Array.isArray(value)?sanitize(value).slice(0,1500):[],active:true}}
    await saveAuditD1(env,fallback);return {audit:fallback,active:true};
  }catch(error){console.error('Provedor Plus: leitura D1 da auditoria falhou; usando a cópia legado do Neon.',error);return {audit:fallback,active:false}}
}
function nativePlanPayload(data={}){
  const id=num(data.id),name=text(data.name);
  if(!id||!name)return null;
  return {id,name,speedDown:Math.max(0,Math.round(Number(data.download_mbps??data.speed_down_mbps??data.download)||0)),speedUp:Math.max(0,Math.round(Number(data.upload_mbps??data.speed_up_mbps??data.upload)||0)),priceCents:Math.max(0,Math.round(Number(data.price_cents??data.value_cents)||0)),active:bool(data.active??data.enabled,true),description:text(data.description),updatedAt:new Date().toISOString()};
}
async function upsertNativePlan(sql,data,env=null){
  const plan=nativePlanPayload(data);if(!plan)throw Object.assign(new Error('Plano inválido para sincronização com o cadastro nativo.'),{statusCode:409});
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos planos não configurado.'),{statusCode:503});
  const conflict=await env.PROVEDOR_DB.prepare('SELECT id FROM pp_plans WHERE name=? AND id<>? LIMIT 1').bind(plan.name,plan.id).all();
  if(conflict?.results?.[0]?.id)throw Object.assign(new Error(`O plano ${plan.name} já existe no banco com outro identificador. Revise o cadastro de planos antes de vincular clientes.`),{statusCode:409});
  await mirrorPlanRowToD1(env,{id:plan.id,name:plan.name,speed_down_mbps:plan.speedDown,speed_up_mbps:plan.speedUp,price_cents:plan.priceCents,active:plan.active,description:plan.description,updated_at:plan.updatedAt});
  return readPlanById(env,sql,plan.id);
}
async function syncNativePlanCatalog(sql,state,env){
  for(const item of Array.isArray(state?.plans)?state.plans:[]){if(!nativePlanPayload(item))continue;await upsertNativePlan(sql,item,env)}
}
function safePlanRow(row){if(!row||typeof row!=='object')return row;return {...row,id:Number(row.id),speed_down_mbps:Math.max(0,Number(row.speed_down_mbps)||0),speed_up_mbps:Math.max(0,Number(row.speed_up_mbps)||0),price_cents:Math.max(0,Math.round(Number(row.price_cents)||0)),active:bool(row.active,true)}}
async function readPlanById(env,sql,planId){
  const id=num(planId);if(!id)return null;
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos planos não configurado.'),{statusCode:503});
  try{
    const result=await env.PROVEDOR_DB.prepare('SELECT id,name,speed_down_mbps,speed_up_mbps,price_cents,active,description,created_at,updated_at FROM pp_plans WHERE id=? LIMIT 1').bind(id).all(),row=result?.results?.[0]||null;
    return safePlanRow(row);
  }catch(error){console.error(`Provedor Plus: leitura D1 do plano ${id} falhou.`,error);throw error}
}
async function ensureNativePlanForClient(sql,planId,env){
  const id=num(planId);if(!id)return null;
  const nativePlan=await readPlanById(env,sql,id),row=await getStateD1(env),state=row?.value&&typeof row.value==='object'?row.value:{},plan=(Array.isArray(state?.plans)?state.plans:[]).find(item=>Number(item?.id)===Number(id));
  if(!plan)throw Object.assign(new Error('O plano selecionado não existe mais no cadastro de planos do Provedor Plus. Atualize o formulário e selecione um plano válido.'),{statusCode:409});
  if(nativePlan&&text(nativePlan.name)===text(plan.name))return nativePlan;
  return upsertNativePlan(sql,plan,env);
}
export async function handleNativeCloudState(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-state'});const sql=authSqlFor(env);
  try{await requireAuth(request,sql);const body=await bodyOf(request),action=text(body?.action),data=body?.data||{},recoverySql=env?.DATABASE_URL?sql:null;let result;
    if(action==='state.get'){
      const row=await getStateD1(env,recoverySql);
      if(!row)result={state:null,updated_at:null};
      else{
        const clean=sanitize(row.value||{}),ticketStore=await readTicketsD1(env,clean.tickets),legacyAudit=Array.isArray(clean.audit)?clean.audit:Array.isArray(clean.audit_log)?clean.audit_log:Array.isArray(clean.history)?clean.history:Array.isArray(clean.logs)?clean.logs:[],auditStore=await readAuditD1(env,legacyAudit);
        if(ticketStore.active)clean.tickets=ticketStore.tickets;if(auditStore.active)clean.audit=auditStore.audit;
        result={state:clean,updated_at:row.updated_at||null};
      }
    }
    else if(action==='state.save'){
      if(!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});
      const previous=await getStateD1(env,recoverySql),expectedAt=text(data.baseUpdatedAt),actualAt=previous?.updated_at,expectedTime=Date.parse(expectedAt),actualTime=Date.parse(text(actualAt));
      if(expectedAt&&actualAt&&Number.isFinite(expectedTime)&&Number.isFinite(actualTime)&&expectedTime!==actualTime)throw Object.assign(new Error('O estado foi atualizado em outro acesso. Recarregando para mesclar as alterações.'),{statusCode:409});
      const merged=preservePortalState(data.state,previous?.value),clean=sanitize(merged);await syncNativePlanCatalog(sql,clean,env);
      let ticketsOnD1=false;if(Array.isArray(clean.tickets)&&env?.PROVEDOR_DB)ticketsOnD1=await saveTicketsD1(env,clean.tickets);
      let auditOnD1=false;if(Array.isArray(clean.audit)&&env?.PROVEDOR_DB)auditOnD1=await saveAuditD1(env,clean.audit);
      let d1State={...clean};if(ticketsOnD1)delete d1State.tickets;if(auditOnD1)delete d1State.audit;const row=await setStateD1(env,d1State),savedState=row?.value||d1State;
      if(recoverySql)try{await setSetting(recoverySql,STATE_KEY,clean)}catch(error){console.error('Provedor Plus: cópia de recuperação do estado no Neon falhou; D1 permanece confirmado.',error)}
      let resultState=savedState;if(ticketsOnD1)resultState={...resultState,tickets:clean.tickets};if(auditOnD1)resultState={...resultState,audit:clean.audit};
      result={state:resultState,updated_at:row?.updated_at||new Date().toISOString()};
    }
    else if(action==='health'){const row=await getStateD1(env,recoverySql);result={online:true,hasState:Boolean(row?.value),updated_at:row?.updated_at||null};}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});return apiJson({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-native-state'});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-state'});}
}

function routerPayload(data={}){const id=num(data.id),out={name:text(data.name)||'MikroTik',host:text(data.host),port:num(data.port)||443,username:text(data.username),connection_method:'rest',allow_self_signed:bool(data.allow_self_signed,false),active:bool(data.active,true),last_status:text(data.last_status),last_sync:data.last_sync||null,updated_at:new Date().toISOString()};if(id)out.id=id;return out;}
function clientPayload(data={}){const id=num(data.id),routerId=num(data.router_id),pppoeUser=text(data.pppoe_username||data.pppoe_user),out={name:text(data.name),document:text(data.document),contract_number:text(data.contract_number),plan:text(data.plan||data.plan_name),plan_id:num(data.plan_id),due_day:num(data.due_day),status:text(data.status)||'Ativo',email:text(data.email),phone:text(data.phone),address:text(data.address||data.street),city:text(data.city),state:text(data.state),zip_code:text(data.zip_code||data.cep),pppoe_user:pppoeUser,auto_block:bool(data.auto_block,false),block_after_days:num(data.block_after_days)||7,notes:text(data.notes),router_id:routerId,connection_type:nullableText(data.connection_type),pppoe_username:nullableText(pppoeUser),mikrotik_profile:nullableText(data.mikrotik_profile),ip:nullableText(data.ip),mac_address:nullableText(data.mac_address),mikrotik_secret_id:nullableText(data.mikrotik_secret_id||data.secret_id),mikrotik_status:nullableText(data.mikrotik_status),mikrotik_last_sync:data.mikrotik_last_sync||data.last_mikrotik_sync||null,updated_at:new Date().toISOString()};if(id)out.id=id;if(text(data.pppoe_password))out.pppoe_password=text(data.pppoe_password);return out;}
function safeClientRow(row){if(!row||typeof row!=='object')return row;const out={...row};delete out.pppoe_password;delete out.pppoePassword;delete out.password;out.id=Number(out.id);out.auto_block=bool(out.auto_block,false);return out;}
async function readClientList(env,sql){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos clientes não configurado.'),{statusCode:503});
  try{
    const result=await env.PROVEDOR_DB.prepare(`SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,created_at,updated_at FROM pp_clients ORDER BY id ASC`).all(),rows=Array.isArray(result?.results)?result.results:[];
    return rows.map(safeClientRow);
  }catch(error){console.error('Provedor Plus: leitura D1 dos clientes falhou.',error);throw error}
}
async function saveRouter(sql,data,env){
  const p=routerPayload(data);if(!p.host||!p.username)throw Object.assign(new Error('Informe o endereço e o usuário do MikroTik.'),{statusCode:400});
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos MikroTik não configurado.'),{statusCode:503});
  const db=env.PROVEDOR_DB,createdAt=p.updated_at;let id=p.id;
  if(id){
    const existing=await db.prepare('SELECT id FROM pp_routers WHERE id=? LIMIT 1').bind(id).all();
    if(existing?.results?.[0])await db.prepare('UPDATE pp_routers SET name=?,host=?,port=?,username=?,connection_method=?,allow_self_signed=?,active=?,last_status=?,last_sync=COALESCE(?,last_sync),updated_at=? WHERE id=?').bind(p.name,p.host,p.port,p.username,p.connection_method,d1Bool(p.allow_self_signed),d1Bool(p.active),nullableText(p.last_status),p.last_sync||null,p.updated_at,id).run();
    else await db.prepare('INSERT INTO pp_routers (id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,p.name,p.host,p.port,p.username,p.connection_method,d1Bool(p.allow_self_signed),d1Bool(p.active),nullableText(p.last_status),p.last_sync||null,createdAt,p.updated_at).run();
  }else{
    const inserted=await db.prepare('INSERT INTO pp_routers (name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(p.name,p.host,p.port,p.username,p.connection_method,d1Bool(p.allow_self_signed),d1Bool(p.active),nullableText(p.last_status),p.last_sync||null,createdAt,p.updated_at).run();
    id=Number(inserted?.meta?.last_row_id)||0;
  }
  if(!id)throw Object.assign(new Error('Não foi possível salvar o MikroTik no D1.'),{statusCode:500});
  const saved=await db.prepare('SELECT id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at FROM pp_routers WHERE id=? LIMIT 1').bind(id).all();
  return safeRouterRow(saved?.results?.[0]||null);
}
async function findExistingClient(env,p){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos clientes não configurado.'),{statusCode:503});
  if(p.contract_number){const result=await env.PROVEDOR_DB.prepare('SELECT id FROM pp_clients WHERE contract_number=? LIMIT 1').bind(p.contract_number).all();if(result?.results?.[0]?.id)return num(result.results[0].id)}
  if(p.document){const result=await env.PROVEDOR_DB.prepare('SELECT id FROM pp_clients WHERE document=? LIMIT 1').bind(p.document).all();if(result?.results?.[0]?.id)return num(result.results[0].id)}
  return null;
}
async function saveClient(sql,data,env){
  const p=clientPayload(data);if(!p.name)throw Object.assign(new Error('Nome do cliente é obrigatório.'),{statusCode:400});if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos clientes não configurado.'),{statusCode:503});
  if(p.plan_id){const linkedPlan=await ensureNativePlanForClient(sql,p.plan_id,env);if(!p.plan)p.plan=text(linkedPlan?.name)}
  const db=env.PROVEDOR_DB;let id=p.id;if(!id)id=await findExistingClient(env,p);
  if(id){
    const existing=await db.prepare('SELECT id FROM pp_clients WHERE id=? LIMIT 1').bind(id).all();
    if(existing?.results?.[0]){
      await mirrorClientRowToD1(env,{...p,id,created_at:null,updated_at:p.updated_at});
      const saved=await db.prepare('SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,created_at,updated_at FROM pp_clients WHERE id=? LIMIT 1').bind(id).all();
      return safeClientRow(saved?.results?.[0]||null);
    }
  }
  const createdAt=p.updated_at,inserted=await db.prepare(`INSERT INTO pp_clients (
    name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,
    auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,
    mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    p.name,nullableText(p.document),nullableText(p.contract_number),nullableText(p.plan),num(p.plan_id),num(p.due_day),nullableText(p.status),nullableText(p.email),nullableText(p.phone),nullableText(p.address),nullableText(p.city),nullableText(p.state),nullableText(p.zip_code),nullableText(p.pppoe_user),d1Bool(p.auto_block),num(p.block_after_days),nullableText(p.notes),num(p.router_id),nullableText(p.connection_type),nullableText(p.pppoe_username),nullableText(p.mikrotik_profile),nullableText(p.ip),nullableText(p.mac_address),nullableText(p.mikrotik_secret_id),nullableText(p.mikrotik_status),p.mikrotik_last_sync||null,createdAt,p.updated_at
  ).run(),newId=Number(inserted?.meta?.last_row_id)||0;
  if(!newId)throw Object.assign(new Error('Não foi possível salvar o cliente no D1.'),{statusCode:500});
  const saved=await db.prepare('SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,created_at,updated_at FROM pp_clients WHERE id=? LIMIT 1').bind(newId).all();
  return safeClientRow(saved?.results?.[0]||null);
}
async function encryptSecret(value,keyBytes){const iv=randomBytes(12),key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']),combined=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,utf8.encode(String(value))));const tag=combined.slice(combined.length-16),data=combined.slice(0,combined.length-16);return {v:1,iv:bytesToB64(iv),tag:bytesToB64(tag),data:bytesToB64(data)};}
async function decryptSecret(record,keyBytes){try{if(!record?.iv||!record?.tag||!record?.data)return '';const data=b64ToBytes(record.data),tag=b64ToBytes(record.tag),combined=new Uint8Array(data.length+tag.length);combined.set(data);combined.set(tag,data.length);const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(record.iv)},key,combined);return new TextDecoder().decode(plain)}catch{return ''}}
const routerSecretV2SettingKey=routerId=>`router_secret_v2_${Number(routerId)}`;
async function routerSharedSecretKey(env){const secret=text(env?.BANK_SECRET_KEY)||text(env?.PORTAL_SESSION_SECRET)||text(env?.DATABASE_URL);if(!secret)throw Object.assign(new Error('Chave de proteção das credenciais do MikroTik não configurada.'),{statusCode:503});return sha256Bytes(`provedor-plus-router-secret-v2|${secret}`)}
async function legacyRouterSecret(sql,routerId){
  const id=num(routerId);if(!id)return '';
  const users=await sql`SELECT id,password_hash,role FROM pp_users ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END,id ASC`;
  for(const user of Array.isArray(users)?users:[]){
    const userId=Number(user?.id)||0,passwordHash=text(user?.password_hash);if(!userId||!passwordHash)continue;
    const row=await getSetting(sql,`router_secret_v1_${userId}_${id}`),record=row?.value;if(!record||typeof record!=='object')continue;
    const key=await sha256Bytes(`provedor-plus-router-secret-v1|${userId}|${passwordHash}`),password=await decryptSecret(record,key);if(password)return password;
  }
  return '';
}
async function sharedRouterSecret(env,sql,routerId,{migrateLegacy=true}={}){
  const id=num(routerId);if(!id)return '';
  const key=await routerSharedSecretKey(env),row=await getSetting(sql,routerSecretV2SettingKey(id)),stored=await decryptSecret(row?.value,key);if(stored)return stored;
  if(!migrateLegacy)return '';
  const legacy=await legacyRouterSecret(sql,id);if(!legacy)return '';
  await setSetting(sql,routerSecretV2SettingKey(id),await encryptSecret(legacy,key));return legacy;
}
async function deleteLegacyRouterSecrets(sql,routerId){
  const id=num(routerId);if(!id)return;
  const users=await sql`SELECT id FROM pp_users ORDER BY id ASC`;
  for(const user of Array.isArray(users)?users:[]){const userId=Number(user?.id)||0;if(userId)await deleteSetting(sql,`router_secret_v1_${userId}_${id}`)}
}
async function routerSecretGet(env,sql,routerId){const id=num(routerId);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});const password=await sharedRouterSecret(env,sql,id);return {configured:Boolean(password),password};}
async function routerSecretSave(env,sql,routerId,password){const id=num(routerId),value=String(password||'');if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});if(!value)throw Object.assign(new Error('Informe a senha do MikroTik.'),{statusCode:400});const key=await routerSharedSecretKey(env);await setSetting(sql,routerSecretV2SettingKey(id),await encryptSecret(value,key));return {configured:true,id};}
async function routerSecretDelete(env,sql,routerId){const id=num(routerId);if(!id)return {deleted:false,id:null};await deleteSetting(sql,routerSecretV2SettingKey(id));await deleteLegacyRouterSecrets(sql,id);return {deleted:true,id};}
export async function resolveRouterForService(env,routerId){
  const sql=sqlFor(env),id=num(routerId);
  if(!id)throw Object.assign(new Error('MikroTik do cliente não está configurado.'),{statusCode:409});
  const router=await readRouterById(env,sql,id);
  if(!router)throw Object.assign(new Error('MikroTik vinculado ao cliente não foi encontrado.'),{statusCode:404});
  if(router.active===false)throw Object.assign(new Error('O MikroTik vinculado ao cliente está desativado.'),{statusCode:409});
  const password=await sharedRouterSecret(env,sql,id);
  if(password)return {id:Number(router.id),name:text(router.name)||'MikroTik',host:text(router.host),port:num(router.port)||443,username:text(router.username),password,allow_self_signed:bool(router.allow_self_signed,false)};
  throw Object.assign(new Error('A credencial segura deste MikroTik não está disponível para o diagnóstico do cliente.'),{statusCode:409});
}
export async function recordTrafficForService(env,clientId,live,scope='primary'){return trafficRecord(env,{clientId,live,scope});}
export async function readTrafficForService(env,clientId,scope='primary'){return trafficRead(env,clientId,scope);}
function trafficDateKey(date=new Date()){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};for(const part of parts)map[part.type]=part.value;return `${map.year}-${map.month}-${map.day}`}
function currentMonth(value=''){const month=text(value);return /^\d{4}-\d{2}$/.test(month)?month:trafficDateKey().slice(0,7)}
function trafficScope(value='primary'){const raw=text(value)||'primary';return raw==='primary'?'primary':(raw.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||'primary')}
function trafficKey(clientId,scope='primary'){const normalized=trafficScope(scope);return normalized==='primary'?`client_traffic_v1_${clientId}`:`client_traffic_v1_${clientId}_${normalized}`}
function trafficDaily(value=[]){return (Array.isArray(value)?value:[]).map(item=>({day:text(item?.day).slice(0,10),download_bytes:Math.max(0,Number(item?.download_bytes)||0),upload_bytes:Math.max(0,Number(item?.upload_bytes)||0)})).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.day)).sort((a,b)=>a.day.localeCompare(b.day)).slice(-62)}
function trafficEmpty(month=currentMonth()){return {month,download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0,history:[],daily:[]}}
function trafficNormalized(value={},month=currentMonth()){let x={...trafficEmpty(month),...(value&&typeof value==='object'?value:{})};x.history=Array.isArray(x.history)?x.history:[];x.daily=trafficDaily(x.daily);if(x.month!==month){const history=x.month?[{month:x.month,download_bytes:Math.max(0,Number(x.download_bytes)||0),upload_bytes:Math.max(0,Number(x.upload_bytes)||0)},...x.history].filter((item,index,all)=>item?.month&&all.findIndex(other=>other?.month===item.month)===index).slice(0,12):x.history.slice(0,12);x={...trafficEmpty(month),history,daily:x.daily}}return x}
function trafficView(x={}){const daily=trafficDaily(x.daily),todayKey=trafficDateKey(),today=daily.find(item=>item.day===todayKey)||{day:todayKey,download_bytes:0,upload_bytes:0};return {current:{month:currentMonth(x.month),download_bytes:Math.max(0,Number(x.download_bytes)||0),upload_bytes:Math.max(0,Number(x.upload_bytes)||0)},today:{...today,total_bytes:(Number(today.download_bytes)||0)+(Number(today.upload_bytes)||0)},daily:daily.map(item=>({...item,total_bytes:(Number(item.download_bytes)||0)+(Number(item.upload_bytes)||0)})),history:(Array.isArray(x.history)?x.history:[]).slice(0,12).map(item=>({month:text(item?.month),download_bytes:Math.max(0,Number(item?.download_bytes)||0),upload_bytes:Math.max(0,Number(item?.upload_bytes)||0),total_bytes:Math.max(0,Number(item?.download_bytes)||0)+Math.max(0,Number(item?.upload_bytes)||0)}))}}
async function trafficStored(env,key){
  if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 do tráfego não configurado.'),{statusCode:503});
  const result=await env.PROVEDOR_DB.prepare('SELECT value,updated_at FROM pp_settings WHERE key=? LIMIT 1').bind(key).all(),row=result?.results?.[0];
  if(row){let value=row.value;if(typeof value==='string')try{value=JSON.parse(value)}catch{value={}}return {value:value&&typeof value==='object'?value:{},updated_at:row.updated_at||null}}
  return null;
}
async function trafficSave(env,key,value){if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 do tráfego não configurado.'),{statusCode:503});const updatedAt=new Date().toISOString();await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,JSON.stringify(value??null),updatedAt).run();return {value,updated_at:updatedAt}}
async function trafficRead(env,clientId,scope='primary'){const id=num(clientId);if(!id)throw Object.assign(new Error('Cliente inválido para consultar tráfego.'),{statusCode:400});const row=await trafficStored(env,trafficKey(id,scope)),all=row?.value&&typeof row.value==='object'?row.value:trafficEmpty(),x=trafficNormalized(all);return trafficView(x)}
async function trafficRecord(env,data={}){const clientId=num(data.clientId);if(!clientId)throw Object.assign(new Error('Cliente inválido para registrar tráfego.'),{statusCode:400});const month=currentMonth(data.month),key=trafficKey(clientId,data.scope),row=await trafficStored(env,key),all=row?.value&&typeof row.value==='object'?row.value:trafficEmpty(month),live=data.live&&typeof data.live==='object'?data.live:{},t=Date.now(),day=trafficDateKey();let x=trafficNormalized(all,month),downloadBps=Number(live.downloadBps)||0,uploadBps=Number(live.uploadBps)||0;if(live.online&&live.sessionId){const d=Math.max(0,Number(live.downloadBytes)||0),u=Math.max(0,Number(live.uploadBytes)||0),same=x.lastSession===String(live.sessionId),dd=same?Math.max(0,d-(Number(x.lastDownload)||0)):d,du=same?Math.max(0,u-(Number(x.lastUpload)||0)):u;if(!downloadBps&&same&&x.lastAt){const seconds=Math.max(.25,(t-Number(x.lastAt))/1000);downloadBps=Math.round(dd*8/seconds);uploadBps=Math.round(du*8/seconds)}x.download_bytes=(Number(x.download_bytes)||0)+dd;x.upload_bytes=(Number(x.upload_bytes)||0)+du;const daily=trafficDaily(x.daily);let item=daily.find(entry=>entry.day===day);if(!item){item={day,download_bytes:0,upload_bytes:0};daily.push(item)}item.download_bytes=(Number(item.download_bytes)||0)+dd;item.upload_bytes=(Number(item.upload_bytes)||0)+du;x.daily=trafficDaily(daily);x.lastSession=String(live.sessionId);x.lastDownload=d;x.lastUpload=u;x.lastAt=t}await trafficSave(env,key,x);return {...trafficView(x),downloadBps,uploadBps}}


function cashbackClient(state,clientId){return (Array.isArray(state?.clients)?state.clients:[]).find(item=>Number(item?.id)===Number(clientId))||null}
function cashbackBalanceCents(client){if(client?.cashback_balance_cents!==undefined&&client?.cashback_balance_cents!==null){const direct=Number(client.cashback_balance_cents);if(Number.isFinite(direct))return Math.max(0,Math.round(direct))}const amount=Number(client?.cashback_balance);return Number.isFinite(amount)?Math.max(0,Math.round(amount*100)):0}
function cashbackWallet(state,clientId){const client=cashbackClient(state,clientId);if(!client)throw Object.assign(new Error('Cliente não encontrado na carteira de cashback.'),{statusCode:404});const history=(Array.isArray(state.cashback_transactions)?state.cashback_transactions:[]).filter(item=>Number(item?.client_id)===Number(clientId)).sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||''))).slice(0,50);return {client:{id:client.id,name:text(client.name),contract_number:text(client.contract_number)},balance_cents:cashbackBalanceCents(client),balance:cashbackBalanceCents(client)/100,history}}
async function cashbackWalletGet(env,data){const clientId=num(data.clientId||data.client_id);if(!clientId)throw Object.assign(new Error('Selecione um cliente.'),{statusCode:400});const row=await getStateD1(env),state=row?.value&&typeof row.value==='object'?row.value:{};return cashbackWallet(state,clientId)}
async function cashbackWalletAdjust(request,sql,env,data){
  const current=await requirePermission(request,sql,'finance'),clientId=num(data.clientId||data.client_id),operation=text(data.operation).toLowerCase(),amountCents=Math.round(Number(data.amount_cents)),reason=text(data.reason);
  if(!clientId)throw Object.assign(new Error('Selecione um cliente.'),{statusCode:400});if(!['add','remove'].includes(operation))throw Object.assign(new Error('Escolha adicionar ou remover cashback.'),{statusCode:400});if(!Number.isFinite(amountCents)||amountCents<=0)throw Object.assign(new Error('Informe um valor de cashback maior que zero.'),{statusCode:400});if(reason.length<3)throw Object.assign(new Error('Informe o motivo da movimentação.'),{statusCode:400});
  const row=await getStateD1(env),state=row?.value&&typeof row.value==='object'?{...row.value}:{},clients=Array.isArray(state.clients)?[...state.clients]:[],position=clients.findIndex(item=>Number(item?.id)===Number(clientId));if(position<0)throw Object.assign(new Error('Cliente não encontrado na carteira de cashback.'),{statusCode:404});
  const client={...clients[position]},before=cashbackBalanceCents(client),after=operation==='add'?before+amountCents:before-amountCents;if(after<0)throw Object.assign(new Error('O valor removido é maior que o saldo disponível.'),{statusCode:409});
  const createdAt=new Date().toISOString(),transaction={id:crypto.randomUUID(),client_id:clientId,type:operation==='add'?'credit':'debit',source:operation==='add'?'manual_add':'manual_remove',amount_cents:amountCents,balance_before_cents:before,balance_after_cents:after,reason,created_at:createdAt,created_by_id:Number(current.user.id),created_by_name:text(current.user.name)||text(current.user.email)||'Usuário do painel'};
  client.cashback_balance_cents=after;client.cashback_balance=after/100;client.cashback_updated_at=createdAt;clients[position]=client;state.clients=clients;state.cashback_transactions=[...(Array.isArray(state.cashback_transactions)?state.cashback_transactions:[]),transaction].slice(-5000);await setStateD1(env,sanitize(state));return cashbackWallet(state,clientId);
}

export async function handleNativeCloudData(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-data'});
  try{const body=await bodyOf(request),action=text(body?.action),data=body?.data||{},sql=(action.startsWith('cashback.')||action.startsWith('clients.'))?authSqlFor(env):sqlFor(env);if(action.startsWith('routers.')||action==='traffic.record')await requirePermission(request,sql,'network');else if(action.startsWith('clients.'))await requirePermission(request,sql,'clients');else if(action.startsWith('cashback.'))await requirePermission(request,sql,'finance');else await requireAuth(request,sql);let result;
    if(action==='routers.list')result=await readRouterList(env,sql);
    else if(action==='routers.save')result=await saveRouter(sql,data,env);
    else if(action==='routers.delete'){const id=num(data.id);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos MikroTik não configurado.'),{statusCode:503});await env.PROVEDOR_DB.prepare('DELETE FROM pp_routers WHERE id=?').bind(id).run();result={deleted:true,id};}
    else if(action==='routers.secret.get')result=await routerSecretGet(env,sql,data.id);
    else if(action==='routers.secret.save')result=await routerSecretSave(env,sql,data.id,data.password);
    else if(action==='routers.secret.delete')result=await routerSecretDelete(env,sql,data.id);
    else if(action==='clients.list')result=await readClientList(env,sql);
    else if(action==='clients.save')result=safeClientRow(await saveClient(sql,data,env));
    else if(action==='clients.delete'){const id=num(data.id);if(!id)throw Object.assign(new Error('Cliente inválido.'),{statusCode:400});if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 dos clientes não configurado.'),{statusCode:503});await env.PROVEDOR_DB.prepare('DELETE FROM pp_clients WHERE id=?').bind(id).run();result={deleted:true,id};}
    else if(action==='cashback.wallet.get')result=await cashbackWalletGet(env,data);
    else if(action==='cashback.wallet.adjust')result=await cashbackWalletAdjust(request,sql,env,data);
    else if(action==='traffic.record')result=await trafficRecord(env,data);
    else if(action==='health'){const rows=await sql`SELECT id FROM pp_routers LIMIT 1`;result={online:true,routers:Array.isArray(rows)};}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return apiJson({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-native-data'});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-data'});}
}
