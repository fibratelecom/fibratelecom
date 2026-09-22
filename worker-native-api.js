import { neon } from '@neondatabase/serverless';
import { scrypt } from 'scrypt-js';

const COOKIE='pp_session';
const PROFILE_PREFIX='employee_access_v1_';
const STATE_KEY='web_state_v1017';
const ALL_PERMISSIONS=['dashboard','clients','plans','finance','billing','tickets','network'];
const utf8=new TextEncoder();

const text=value=>String(value??'').trim();
const num=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.trunc(n):null};
const nullableText=value=>{const v=text(value);return v||null};
const bool=(value,fallback=false)=>{if(value===undefined||value===null||value==='')return fallback;if(typeof value==='boolean')return value;if(typeof value==='number')return value!==0;const v=text(value).toLowerCase();if(['true','1','sim','yes','on'].includes(v))return true;if(['false','0','nao','não','no','off'].includes(v))return false;return fallback};
const normalizeRole=value=>{const role=text(value).toLowerCase();return ['admin','tecnico','atendente'].includes(role)?role:'atendente'};
function defaultPermissions(role){role=normalizeRole(role);if(role==='admin')return [...ALL_PERMISSIONS];if(role==='tecnico')return ['dashboard','clients','tickets','network'];return ['dashboard','clients','plans','finance','billing','tickets'];}
function normalizePermissions(value,role){if(normalizeRole(role)==='admin')return [...ALL_PERMISSIONS];const list=Array.isArray(value)?value:defaultPermissions(role);return [...new Set(list.map(v=>text(v)).filter(v=>ALL_PERMISSIONS.includes(v)))];}
function sqlFor(env){if(!env.DATABASE_URL)throw Object.assign(new Error('Conexão nativa com o Neon não configurada na Cloudflare.'),{statusCode:503});return neon(env.DATABASE_URL);}
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
  if(env?.PROVEDOR_DB)try{const result=await env.PROVEDOR_DB.prepare('SELECT id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at FROM pp_routers ORDER BY id ASC').all(),rows=Array.isArray(result?.results)?result.results:[];if(rows.length)return rows.map(safeRouterRow)}catch(error){console.error('Provedor Plus: leitura D1 dos MikroTik falhou; usando Neon.',error)}
  const rows=await sql`SELECT * FROM pp_routers ORDER BY id ASC`;
  if(env?.PROVEDOR_DB)for(const row of Array.isArray(rows)?rows:[])try{await mirrorRouterRowToD1(env,row)}catch(error){console.error(`Provedor Plus: não foi possível recompor o espelho D1 do MikroTik ${row?.id}.`,error)}
  return (Array.isArray(rows)?rows:[]).map(safeRouterRow);
}
async function readRouterById(env,sql,routerId){
  const id=num(routerId);if(!id)return null;
  if(env?.PROVEDOR_DB)try{const result=await env.PROVEDOR_DB.prepare('SELECT id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at FROM pp_routers WHERE id=? LIMIT 1').bind(id).all(),row=result?.results?.[0];if(row)return safeRouterRow(row)}catch(error){console.error(`Provedor Plus: leitura D1 do MikroTik ${id} falhou; usando Neon.`,error)}
  const rows=await sql`SELECT id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,created_at,updated_at FROM pp_routers WHERE id=${id} LIMIT 1`,row=Array.isArray(rows)?rows[0]:null;
  if(row&&env?.PROVEDOR_DB)try{await mirrorRouterRowToD1(env,row)}catch(error){console.error(`Provedor Plus: não foi possível recompor o espelho D1 do MikroTik ${id}.`,error)}
  return safeRouterRow(row);
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
async function getProfile(sql,id,role){const row=await getSetting(sql,profileKey(id)),value=row?.value&&typeof row.value==='object'?row.value:{};return {active:value?.active!==false,phone:text(value?.phone),permissions:normalizePermissions(value?.permissions,role)};}
async function saveProfile(sql,id,profile){return setSetting(sql,profileKey(id),profile);}
async function revokeSessions(sql,userId){await sql`DELETE FROM pp_sessions WHERE user_id=${Number(userId)}`;}
async function deleteProfile(sql,id){await deleteSetting(sql,profileKey(id));}

async function createSession(sql,userId){const token=randomToken(),tokenHash=await sha256Hex(token),expires=new Date(Date.now()+7*864e5).toISOString();await sql`INSERT INTO pp_sessions (user_id,token_hash,expires_at) VALUES (${Number(userId)},${tokenHash},${expires})`;return {token,expires_at:expires};}
async function currentSession(request,sql){const token=cookies(request)[COOKIE];if(!token)return null;const tokenHash=await sha256Hex(token);const sessions=await sql`SELECT id,user_id,expires_at FROM pp_sessions WHERE token_hash=${tokenHash} LIMIT 1`;const session=Array.isArray(sessions)?sessions[0]:null;if(!session)return null;if(new Date(session.expires_at).getTime()<=Date.now()){await sql`DELETE FROM pp_sessions WHERE id=${Number(session.id)}`;return null}const users=await sql`SELECT id,email,name,role FROM pp_users WHERE id=${Number(session.user_id)} LIMIT 1`;const user=Array.isArray(users)?users[0]:null;if(!user)return null;const access=await getProfile(sql,user.id,user.role);if(!access.active){await sql`DELETE FROM pp_sessions WHERE id=${Number(session.id)}`;return null}return {session,user:{...safeUser(user),active:true,permissions:access.permissions,phone:access.phone}};}
async function requireAuth(request,sql){const current=await currentSession(request,sql);if(!current)throw Object.assign(new Error('Sessão expirada, desativada ou não autenticada.'),{statusCode:401});return current;}
async function requireAdmin(request,sql){const current=await requireAuth(request,sql);if(current.user.role!=='admin')throw Object.assign(new Error('Somente o administrador pode realizar esta ação.'),{statusCode:403});return current;}
async function requirePermission(request,sql,permission){const current=await requireAuth(request,sql);if(current.user.role==='admin'||current.user.permissions.includes(String(permission)))return current;throw Object.assign(new Error('Seu usuário não possui permissão para esta área.'),{statusCode:403});}

export async function handleNativeAuth(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-auth'});
  const sql=sqlFor(env);
  try{
    const body=await bodyOf(request),action=text(body?.action),data=body?.data||{};
    if(action==='status'){
      const current=await currentSession(request,sql),users=await sql`SELECT id FROM pp_users LIMIT 1`;
      return apiJson({ok:true,data:{configured:Array.isArray(users)&&users.length>0,authenticated:Boolean(current),user:current?.user||null}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='setup'){
      const existing=await sql`SELECT id FROM pp_users LIMIT 1`;if(existing.length)throw Object.assign(new Error('O administrador inicial já foi configurado.'),{statusCode:409});
      const name=text(data.name),login=text(data.login).toLowerCase(),password=String(data.password||'');
      if(name.length<2)throw Object.assign(new Error('Informe o nome do administrador.'),{statusCode:400});if(login.length<3)throw Object.assign(new Error('Informe o usuário de acesso.'),{statusCode:400});if(password.length<8)throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres.'),{statusCode:400});
      const hash=await passwordHash(password),created=await sql`INSERT INTO pp_users (email,name,role,password_hash) VALUES (${login},${name},'admin',${hash}) RETURNING id,email,name,role,created_at`;const user=created[0];if(!user?.id)throw new Error('Não foi possível criar o administrador.');const session=await createSession(sql,user.id);
      return apiJson({ok:true,data:{authenticated:true,user:{...safeUser(user),active:true,permissions:[...ALL_PERMISSIONS]}}},200,{'Set-Cookie':cookieHeader(session.token),'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='login'){
      const login=text(data.login).toLowerCase(),password=String(data.password||''),rows=await sql`SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE email=${login} LIMIT 1`,user=rows[0];
      if(!user||!await passwordVerify(password,user.password_hash))throw Object.assign(new Error('Usuário ou senha inválidos.'),{statusCode:401});const access=await getProfile(sql,user.id,user.role);if(!access.active)throw Object.assign(new Error('Este acesso está desativado. Procure o administrador.'),{statusCode:403});const session=await createSession(sql,user.id);
      return apiJson({ok:true,data:{authenticated:true,user:{...safeUser(user),active:true,permissions:access.permissions,phone:access.phone}}},200,{'Set-Cookie':cookieHeader(session.token),'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='logout'){
      const token=cookies(request)[COOKIE];if(token){const hash=await sha256Hex(token);await sql`DELETE FROM pp_sessions WHERE token_hash=${hash}`;}
      return apiJson({ok:true,data:{authenticated:false}},200,{'Set-Cookie':clearCookieHeader(),'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.available'){
      await requireAuth(request,sql);const users=await sql`SELECT id,name,role,created_at FROM pp_users ORDER BY name ASC`,out=[];for(const user of users){const profile=await getProfile(sql,user.id,user.role);if(profile.active)out.push({...safeUser(user),permissions:profile.permissions})}return apiJson({ok:true,data:out},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.list'){
      await requireAdmin(request,sql);const users=await sql`SELECT id,email,name,role,created_at FROM pp_users ORDER BY name ASC`,out=[];for(const user of users){const profile=await getProfile(sql,user.id,user.role);out.push({...safeUser(user),...profile})}return apiJson({ok:true,data:out},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.save'){
      const current=await requireAdmin(request,sql),id=Number(data.id)||0,name=text(data.name),login=text(data.login||data.email).toLowerCase(),role=normalizeRole(data.role),password=String(data.password||''),phone=text(data.phone);
      if(name.length<2)throw Object.assign(new Error('Informe o nome do funcionário.'),{statusCode:400});if(login.length<3)throw Object.assign(new Error('Informe o usuário de acesso.'),{statusCode:400});if(!id&&password.length<8)throw Object.assign(new Error('A senha inicial deve ter pelo menos 8 caracteres.'),{statusCode:400});if(password&&password.length<8)throw Object.assign(new Error('A nova senha deve ter pelo menos 8 caracteres.'),{statusCode:400});if(id===Number(current.user.id)&&role!=='admin')throw Object.assign(new Error('O administrador atual não pode remover o próprio perfil de administrador.'),{statusCode:400});
      const active=id===Number(current.user.id)?true:data.active!==false,permissions=normalizePermissions(data.permissions,role);if(role!=='admin'&&!permissions.length)throw Object.assign(new Error('Selecione pelo menos uma permissão de acesso.'),{statusCode:400});
      let user;
      if(id){
        const found=await sql`SELECT id,email,name,role,password_hash,created_at FROM pp_users WHERE id=${id} LIMIT 1`;if(!found[0])throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});
        if(password){const hash=await passwordHash(password);const rows=await sql`UPDATE pp_users SET email=${login},name=${name},role=${role},password_hash=${hash} WHERE id=${id} RETURNING id,email,name,role,created_at`;user=rows[0];}
        else{const rows=await sql`UPDATE pp_users SET email=${login},name=${name},role=${role} WHERE id=${id} RETURNING id,email,name,role,created_at`;user=rows[0];}
      }else{
        const hash=await passwordHash(password),rows=await sql`INSERT INTO pp_users (email,name,role,password_hash) VALUES (${login},${name},${role},${hash}) RETURNING id,email,name,role,created_at`;user=rows[0];
      }
      if(!user?.id)throw Object.assign(new Error('Não foi possível salvar o funcionário.'),{statusCode:500});
      try{await saveProfile(sql,user.id,{active,phone,permissions,updated_at:new Date().toISOString()});}catch(error){if(!id){try{await sql`DELETE FROM pp_users WHERE id=${Number(user.id)}`}catch{}try{await deleteProfile(sql,user.id)}catch{}}throw error}
      if(id&&Number(id)!==Number(current.user.id))await revokeSessions(sql,id);
      return apiJson({ok:true,data:{...safeUser(user),active,phone,permissions}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.toggle'){
      const current=await requireAdmin(request,sql),id=Number(data.id)||0;if(!id)throw Object.assign(new Error('Funcionário inválido.'),{statusCode:400});if(id===Number(current.user.id))throw Object.assign(new Error('Você não pode desativar o próprio acesso.'),{statusCode:400});const rows=await sql`SELECT id,email,name,role,created_at FROM pp_users WHERE id=${id} LIMIT 1`,user=rows[0];if(!user)throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});const previous=await getProfile(sql,id,user.role),active=Boolean(data.active);await saveProfile(sql,id,{...previous,active,updated_at:new Date().toISOString()});if(!active)await revokeSessions(sql,id);return apiJson({ok:true,data:{...safeUser(user),...previous,active}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
    }
    if(action==='employees.delete'){
      const current=await requireAdmin(request,sql),id=Number(data.id)||0;if(!id)throw Object.assign(new Error('Funcionário inválido.'),{statusCode:400});if(id===Number(current.user.id))throw Object.assign(new Error('Você não pode excluir o próprio acesso.'),{statusCode:400});const rows=await sql`SELECT id FROM pp_users WHERE id=${id} LIMIT 1`;if(!rows[0])throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});await revokeSessions(sql,id);await sql`DELETE FROM pp_users WHERE id=${id}`;await deleteProfile(sql,id);return apiJson({ok:true,data:{deleted:true,id}},200,{'x-provedor-plus-edge':'cloudflare-native-auth'});
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
function nativePlanPayload(data={}){
  const id=num(data.id),name=text(data.name);
  if(!id||!name)return null;
  return {id,name,speedDown:Math.max(0,Math.round(Number(data.download_mbps??data.speed_down_mbps??data.download)||0)),speedUp:Math.max(0,Math.round(Number(data.upload_mbps??data.speed_up_mbps??data.upload)||0)),priceCents:Math.max(0,Math.round(Number(data.price_cents??data.value_cents)||0)),active:bool(data.active??data.enabled,true),description:text(data.description),updatedAt:new Date().toISOString()};
}
async function upsertNativePlan(sql,data,env=null){
  const plan=nativePlanPayload(data);if(!plan)throw Object.assign(new Error('Plano inválido para sincronização com o cadastro nativo.'),{statusCode:409});
  const conflict=await sql`SELECT id FROM pp_plans WHERE name=${plan.name} AND id<>${plan.id} LIMIT 1`;
  if(conflict[0]?.id)throw Object.assign(new Error(`O plano ${plan.name} já existe no banco com outro identificador. Revise o cadastro de planos antes de vincular clientes.`),{statusCode:409});
  const rows=await sql`INSERT INTO pp_plans (id,name,speed_down_mbps,speed_up_mbps,price_cents,active,description,updated_at) VALUES (${plan.id},${plan.name},${plan.speedDown},${plan.speedUp},${plan.priceCents},${plan.active},${plan.description},${plan.updatedAt}) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,speed_down_mbps=EXCLUDED.speed_down_mbps,speed_up_mbps=EXCLUDED.speed_up_mbps,price_cents=EXCLUDED.price_cents,active=EXCLUDED.active,description=EXCLUDED.description,updated_at=EXCLUDED.updated_at RETURNING *`,saved=rows[0]||null;
  if(saved&&env?.PROVEDOR_DB)try{await mirrorPlanRowToD1(env,saved)}catch(error){console.error(`Provedor Plus: não foi possível espelhar o plano ${plan.id} no D1.`,error)}
  return saved;
}
async function syncNativePlanCatalog(sql,state,env){for(const plan of Array.isArray(state?.plans)?state.plans:[]){if(num(plan?.id)&&text(plan?.name))await upsertNativePlan(sql,plan,env)}}
function safePlanRow(row){if(!row||typeof row!=='object')return row;return {...row,id:Number(row.id),speed_down_mbps:Math.max(0,Number(row.speed_down_mbps)||0),speed_up_mbps:Math.max(0,Number(row.speed_up_mbps)||0),price_cents:Math.max(0,Math.round(Number(row.price_cents)||0)),active:bool(row.active,true)}}
async function readPlanById(env,sql,planId){
  const id=num(planId);if(!id)return null;
  if(env?.PROVEDOR_DB)try{const result=await env.PROVEDOR_DB.prepare('SELECT id,name,speed_down_mbps,speed_up_mbps,price_cents,active,description,created_at,updated_at FROM pp_plans WHERE id=? LIMIT 1').bind(id).all(),row=result?.results?.[0];if(row)return safePlanRow(row)}catch(error){console.error(`Provedor Plus: leitura D1 do plano ${id} falhou; usando Neon.`,error)}
  const rows=await sql`SELECT * FROM pp_plans WHERE id=${id} LIMIT 1`,row=Array.isArray(rows)?rows[0]:null;
  if(row&&env?.PROVEDOR_DB)try{await mirrorPlanRowToD1(env,row)}catch(error){console.error(`Provedor Plus: não foi possível recompor o espelho D1 do plano ${id}.`,error)}
  return safePlanRow(row);
}
async function ensureNativePlanForClient(sql,planId,env){
  const id=num(planId);if(!id)return null;
  const nativePlan=await readPlanById(env,sql,id),row=await getSetting(sql,STATE_KEY),state=row?.value&&typeof row.value==='object'?row.value:{},plan=(Array.isArray(state?.plans)?state.plans:[]).find(item=>Number(item?.id)===Number(id));
  if(!plan)throw Object.assign(new Error('O plano selecionado não existe mais no cadastro de planos do Provedor Plus. Atualize o formulário e selecione um plano válido.'),{statusCode:409});
  if(nativePlan&&text(nativePlan.name)===text(plan.name))return nativePlan;
  return upsertNativePlan(sql,plan,env);
}
export async function handleNativeCloudState(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-state'});const sql=sqlFor(env);
  try{await requireAuth(request,sql);const body=await bodyOf(request),action=text(body?.action),data=body?.data||{};let result;
    if(action==='state.get'){const row=await getSetting(sql,STATE_KEY);result=row?{state:sanitize(row.value||{}),updated_at:row.updated_at||null}:{state:null,updated_at:null};}
    else if(action==='state.save'){
      if(!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});
      const previous=await getSetting(sql,STATE_KEY),expectedAt=text(data.baseUpdatedAt),actualAt=previous?.updated_at,expectedTime=Date.parse(expectedAt),actualTime=actualAt instanceof Date?actualAt.getTime():Date.parse(text(actualAt));
      if(expectedAt&&actualAt&&Number.isFinite(expectedTime)&&Number.isFinite(actualTime)&&expectedTime!==actualTime)throw Object.assign(new Error('O estado foi atualizado em outro acesso. Recarregando para mesclar as alterações.'),{statusCode:409});
      const merged=preservePortalState(data.state,previous?.value),clean=sanitize(merged);await syncNativePlanCatalog(sql,clean,env);const row=await setSetting(sql,STATE_KEY,clean);result={state:row?.value||clean,updated_at:row?.updated_at||new Date().toISOString()};
    }
    else if(action==='health'){const row=await getSetting(sql,STATE_KEY);result={online:true,hasState:Boolean(row?.value),updated_at:row?.updated_at||null};}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});return apiJson({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-native-state'});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-state'});}
}

function routerPayload(data={}){const id=num(data.id),out={name:text(data.name)||'MikroTik',host:text(data.host),port:num(data.port)||443,username:text(data.username),connection_method:'rest',allow_self_signed:bool(data.allow_self_signed,false),active:bool(data.active,true),last_status:text(data.last_status),last_sync:data.last_sync||null,updated_at:new Date().toISOString()};if(id)out.id=id;return out;}
function clientPayload(data={}){const id=num(data.id),routerId=num(data.router_id),pppoeUser=text(data.pppoe_username||data.pppoe_user),out={name:text(data.name),document:text(data.document),contract_number:text(data.contract_number),plan:text(data.plan||data.plan_name),plan_id:num(data.plan_id),due_day:num(data.due_day),status:text(data.status)||'Ativo',email:text(data.email),phone:text(data.phone),address:text(data.address||data.street),city:text(data.city),state:text(data.state),zip_code:text(data.zip_code||data.cep),pppoe_user:pppoeUser,auto_block:bool(data.auto_block,false),block_after_days:num(data.block_after_days)||7,notes:text(data.notes),router_id:routerId,connection_type:nullableText(data.connection_type),pppoe_username:nullableText(pppoeUser),mikrotik_profile:nullableText(data.mikrotik_profile),ip:nullableText(data.ip),mac_address:nullableText(data.mac_address),mikrotik_secret_id:nullableText(data.mikrotik_secret_id||data.secret_id),mikrotik_status:nullableText(data.mikrotik_status),mikrotik_last_sync:data.mikrotik_last_sync||data.last_mikrotik_sync||null,updated_at:new Date().toISOString()};if(id)out.id=id;if(text(data.pppoe_password))out.pppoe_password=text(data.pppoe_password);return out;}
function safeClientRow(row){if(!row||typeof row!=='object')return row;const out={...row};delete out.pppoe_password;delete out.pppoePassword;delete out.password;out.id=Number(out.id);out.auto_block=bool(out.auto_block,false);return out;}
async function readClientList(env,sql){
  if(env?.PROVEDOR_DB)try{const result=await env.PROVEDOR_DB.prepare(`SELECT id,name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,created_at,updated_at FROM pp_clients ORDER BY id ASC`).all(),rows=Array.isArray(result?.results)?result.results:[];if(rows.length)return rows.map(safeClientRow)}catch(error){console.error('Provedor Plus: leitura D1 dos clientes falhou; usando Neon.',error)}
  const rows=await sql`SELECT * FROM pp_clients ORDER BY id ASC`;
  if(env?.PROVEDOR_DB)for(const row of Array.isArray(rows)?rows:[])try{await mirrorClientRowToD1(env,row)}catch(error){console.error(`Provedor Plus: não foi possível recompor o espelho D1 do cliente ${row?.id}.`,error)}
  return (Array.isArray(rows)?rows:[]).map(safeClientRow);
}
async function saveRouter(sql,data,env){const p=routerPayload(data);if(!p.host||!p.username)throw Object.assign(new Error('Informe o endereço e o usuário do MikroTik.'),{statusCode:400});let rows=[];if(p.id)rows=await sql`UPDATE pp_routers SET name=${p.name},host=${p.host},port=${p.port},username=${p.username},connection_method=${p.connection_method},allow_self_signed=${p.allow_self_signed},active=${p.active},last_status=${p.last_status},last_sync=COALESCE(${p.last_sync},last_sync),updated_at=${p.updated_at} WHERE id=${p.id} RETURNING *`;if(!rows[0]&&p.id)rows=await sql`INSERT INTO pp_routers (id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,updated_at) VALUES (${p.id},${p.name},${p.host},${p.port},${p.username},${p.connection_method},${p.allow_self_signed},${p.active},${p.last_status},${p.last_sync},${p.updated_at}) RETURNING *`;if(!rows[0])rows=await sql`INSERT INTO pp_routers (name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,updated_at) VALUES (${p.name},${p.host},${p.port},${p.username},${p.connection_method},${p.allow_self_signed},${p.active},${p.last_status},${p.last_sync},${p.updated_at}) RETURNING *`;const saved=rows[0]||null;if(saved&&env?.PROVEDOR_DB)try{await mirrorRouterRowToD1(env,saved)}catch(error){console.error(`Provedor Plus: não foi possível espelhar o MikroTik ${saved.id} no D1.`,error)}return saved;}
async function findExistingClient(sql,p){if(p.contract_number){const rows=await sql`SELECT id FROM pp_clients WHERE contract_number=${p.contract_number} LIMIT 1`;if(rows[0]?.id)return num(rows[0].id)}if(p.document){const rows=await sql`SELECT id FROM pp_clients WHERE document=${p.document} LIMIT 1`;if(rows[0]?.id)return num(rows[0].id)}return null;}
async function saveClient(sql,data,env){const p=clientPayload(data);if(!p.name)throw Object.assign(new Error('Nome do cliente é obrigatório.'),{statusCode:400});if(p.plan_id){const linkedPlan=await ensureNativePlanForClient(sql,p.plan_id,env);if(!p.plan)p.plan=text(linkedPlan?.name)}if(!p.id)p.id=await findExistingClient(sql,p);let rows=[];
  if(p.id){
    if(p.pppoe_password)rows=await sql`UPDATE pp_clients SET name=${p.name},document=${p.document},contract_number=${p.contract_number},plan=${p.plan},plan_id=${p.plan_id},due_day=${p.due_day},status=${p.status},email=${p.email},phone=${p.phone},address=${p.address},city=${p.city},state=${p.state},zip_code=${p.zip_code},pppoe_user=${p.pppoe_user},pppoe_password=${p.pppoe_password},auto_block=${p.auto_block},block_after_days=${p.block_after_days},notes=${p.notes},router_id=${p.router_id},connection_type=${p.connection_type},pppoe_username=${p.pppoe_username},mikrotik_profile=${p.mikrotik_profile},ip=${p.ip},mac_address=${p.mac_address},mikrotik_secret_id=${p.mikrotik_secret_id},mikrotik_status=${p.mikrotik_status},mikrotik_last_sync=${p.mikrotik_last_sync},updated_at=${p.updated_at} WHERE id=${p.id} RETURNING *`;
    else rows=await sql`UPDATE pp_clients SET name=${p.name},document=${p.document},contract_number=${p.contract_number},plan=${p.plan},plan_id=${p.plan_id},due_day=${p.due_day},status=${p.status},email=${p.email},phone=${p.phone},address=${p.address},city=${p.city},state=${p.state},zip_code=${p.zip_code},pppoe_user=${p.pppoe_user},auto_block=${p.auto_block},block_after_days=${p.block_after_days},notes=${p.notes},router_id=${p.router_id},connection_type=${p.connection_type},pppoe_username=${p.pppoe_username},mikrotik_profile=${p.mikrotik_profile},ip=${p.ip},mac_address=${p.mac_address},mikrotik_secret_id=${p.mikrotik_secret_id},mikrotik_status=${p.mikrotik_status},mikrotik_last_sync=${p.mikrotik_last_sync},updated_at=${p.updated_at} WHERE id=${p.id} RETURNING *`;
    if(rows[0]){if(env?.PROVEDOR_DB)try{await mirrorClientRowToD1(env,rows[0])}catch(error){console.error(`Provedor Plus: não foi possível espelhar o cliente ${p.id} no D1.`,error)}return safeClientRow(rows[0]);}
  }
  if(p.pppoe_password)rows=await sql`INSERT INTO pp_clients (name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,pppoe_password,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,updated_at) VALUES (${p.name},${p.document},${p.contract_number},${p.plan},${p.plan_id},${p.due_day},${p.status},${p.email},${p.phone},${p.address},${p.city},${p.state},${p.zip_code},${p.pppoe_user},${p.pppoe_password},${p.auto_block},${p.block_after_days},${p.notes},${p.router_id},${p.connection_type},${p.pppoe_username},${p.mikrotik_profile},${p.ip},${p.mac_address},${p.mikrotik_secret_id},${p.mikrotik_status},${p.mikrotik_last_sync},${p.updated_at}) RETURNING *`;
  else rows=await sql`INSERT INTO pp_clients (name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,updated_at) VALUES (${p.name},${p.document},${p.contract_number},${p.plan},${p.plan_id},${p.due_day},${p.status},${p.email},${p.phone},${p.address},${p.city},${p.state},${p.zip_code},${p.pppoe_user},${p.auto_block},${p.block_after_days},${p.notes},${p.router_id},${p.connection_type},${p.pppoe_username},${p.mikrotik_profile},${p.ip},${p.mac_address},${p.mikrotik_secret_id},${p.mikrotik_status},${p.mikrotik_last_sync},${p.updated_at}) RETURNING *`;
  const saved=rows[0]||null;if(saved&&env?.PROVEDOR_DB)try{await mirrorClientRowToD1(env,saved)}catch(error){console.error(`Provedor Plus: não foi possível espelhar o cliente ${saved.id} no D1.`,error)}return safeClientRow(saved);
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
  if(env.DATABASE_URL){const legacy=await getSetting(sqlFor(env),key);if(legacy?.value&&typeof legacy.value==='object'){const updatedAt=legacy.updated_at instanceof Date?legacy.updated_at.toISOString():text(legacy.updated_at)||new Date().toISOString();await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,JSON.stringify(legacy.value),updatedAt).run();return {value:legacy.value,updated_at:updatedAt}}}
  return null;
}
async function trafficSave(env,key,value){if(!env?.PROVEDOR_DB)throw Object.assign(new Error('Banco D1 do tráfego não configurado.'),{statusCode:503});const updatedAt=new Date().toISOString();await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,JSON.stringify(value??null),updatedAt).run();return {value,updated_at:updatedAt}}
async function trafficRead(env,clientId,scope='primary'){const id=num(clientId);if(!id)throw Object.assign(new Error('Cliente inválido para consultar tráfego.'),{statusCode:400});const row=await trafficStored(env,trafficKey(id,scope)),all=row?.value&&typeof row.value==='object'?row.value:trafficEmpty(),x=trafficNormalized(all);return trafficView(x)}
async function trafficRecord(env,data={}){const clientId=num(data.clientId);if(!clientId)throw Object.assign(new Error('Cliente inválido para registrar tráfego.'),{statusCode:400});const month=currentMonth(data.month),key=trafficKey(clientId,data.scope),row=await trafficStored(env,key),all=row?.value&&typeof row.value==='object'?row.value:trafficEmpty(month),live=data.live&&typeof data.live==='object'?data.live:{},t=Date.now(),day=trafficDateKey();let x=trafficNormalized(all,month),downloadBps=Number(live.downloadBps)||0,uploadBps=Number(live.uploadBps)||0;if(live.online&&live.sessionId){const d=Math.max(0,Number(live.downloadBytes)||0),u=Math.max(0,Number(live.uploadBytes)||0),same=x.lastSession===String(live.sessionId),dd=same?Math.max(0,d-(Number(x.lastDownload)||0)):d,du=same?Math.max(0,u-(Number(x.lastUpload)||0)):u;if(!downloadBps&&same&&x.lastAt){const seconds=Math.max(.25,(t-Number(x.lastAt))/1000);downloadBps=Math.round(dd*8/seconds);uploadBps=Math.round(du*8/seconds)}x.download_bytes=(Number(x.download_bytes)||0)+dd;x.upload_bytes=(Number(x.upload_bytes)||0)+du;const daily=trafficDaily(x.daily);let item=daily.find(entry=>entry.day===day);if(!item){item={day,download_bytes:0,upload_bytes:0};daily.push(item)}item.download_bytes=(Number(item.download_bytes)||0)+dd;item.upload_bytes=(Number(item.upload_bytes)||0)+du;x.daily=trafficDaily(daily);x.lastSession=String(live.sessionId);x.lastDownload=d;x.lastUpload=u;x.lastAt=t}await trafficSave(env,key,x);return {...trafficView(x),downloadBps,uploadBps}}


function cashbackClient(state,clientId){return (Array.isArray(state?.clients)?state.clients:[]).find(item=>Number(item?.id)===Number(clientId))||null}
function cashbackBalanceCents(client){if(client?.cashback_balance_cents!==undefined&&client?.cashback_balance_cents!==null){const direct=Number(client.cashback_balance_cents);if(Number.isFinite(direct))return Math.max(0,Math.round(direct))}const amount=Number(client?.cashback_balance);return Number.isFinite(amount)?Math.max(0,Math.round(amount*100)):0}
function cashbackWallet(state,clientId){const client=cashbackClient(state,clientId);if(!client)throw Object.assign(new Error('Cliente não encontrado na carteira de cashback.'),{statusCode:404});const history=(Array.isArray(state.cashback_transactions)?state.cashback_transactions:[]).filter(item=>Number(item?.client_id)===Number(clientId)).sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||''))).slice(0,50);return {client:{id:client.id,name:text(client.name),contract_number:text(client.contract_number)},balance_cents:cashbackBalanceCents(client),balance:cashbackBalanceCents(client)/100,history}}
async function cashbackWalletGet(sql,data){const clientId=num(data.clientId||data.client_id);if(!clientId)throw Object.assign(new Error('Selecione um cliente.'),{statusCode:400});const row=await getSetting(sql,STATE_KEY),state=row?.value&&typeof row.value==='object'?row.value:{};return cashbackWallet(state,clientId)}
async function cashbackWalletAdjust(request,sql,data){
  const current=await requirePermission(request,sql,'finance'),clientId=num(data.clientId||data.client_id),operation=text(data.operation).toLowerCase(),amountCents=Math.round(Number(data.amount_cents)),reason=text(data.reason);
  if(!clientId)throw Object.assign(new Error('Selecione um cliente.'),{statusCode:400});if(!['add','remove'].includes(operation))throw Object.assign(new Error('Escolha adicionar ou remover cashback.'),{statusCode:400});if(!Number.isFinite(amountCents)||amountCents<=0)throw Object.assign(new Error('Informe um valor de cashback maior que zero.'),{statusCode:400});if(reason.length<3)throw Object.assign(new Error('Informe o motivo da movimentação.'),{statusCode:400});
  const row=await getSetting(sql,STATE_KEY),state=row?.value&&typeof row.value==='object'?{...row.value}:{},clients=Array.isArray(state.clients)?[...state.clients]:[],position=clients.findIndex(item=>Number(item?.id)===Number(clientId));if(position<0)throw Object.assign(new Error('Cliente não encontrado na carteira de cashback.'),{statusCode:404});
  const client={...clients[position]},before=cashbackBalanceCents(client),after=operation==='add'?before+amountCents:before-amountCents;if(after<0)throw Object.assign(new Error('O valor removido é maior que o saldo disponível.'),{statusCode:409});
  const createdAt=new Date().toISOString(),transaction={id:crypto.randomUUID(),client_id:clientId,type:operation==='add'?'credit':'debit',source:operation==='add'?'manual_add':'manual_remove',amount_cents:amountCents,balance_before_cents:before,balance_after_cents:after,reason,created_at:createdAt,created_by_id:Number(current.user.id),created_by_name:text(current.user.name)||text(current.user.email)||'Usuário do painel'};
  client.cashback_balance_cents=after;client.cashback_balance=after/100;client.cashback_updated_at=createdAt;clients[position]=client;state.clients=clients;state.cashback_transactions=[...(Array.isArray(state.cashback_transactions)?state.cashback_transactions:[]),transaction].slice(-5000);await setSetting(sql,STATE_KEY,sanitize(state));return cashbackWallet(state,clientId);
}

export async function handleNativeCloudData(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-data'});const sql=sqlFor(env);
  try{const body=await bodyOf(request),action=text(body?.action),data=body?.data||{};if(action.startsWith('routers.')||action==='traffic.record')await requirePermission(request,sql,'network');else if(action.startsWith('clients.'))await requirePermission(request,sql,'clients');else if(action.startsWith('cashback.'))await requirePermission(request,sql,'finance');else await requireAuth(request,sql);let result;
    if(action==='routers.list')result=await readRouterList(env,sql);
    else if(action==='routers.save')result=await saveRouter(sql,data,env);
    else if(action==='routers.delete'){const id=num(data.id);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});await sql`DELETE FROM pp_routers WHERE id=${id}`;if(env?.PROVEDOR_DB)try{await mirrorRouterToD1(env,id)}catch(error){console.error(`Provedor Plus: não foi possível remover o espelho D1 do MikroTik ${id}.`,error)}result={deleted:true,id};}
    else if(action==='routers.secret.get')result=await routerSecretGet(env,sql,data.id);
    else if(action==='routers.secret.save')result=await routerSecretSave(env,sql,data.id,data.password);
    else if(action==='routers.secret.delete')result=await routerSecretDelete(env,sql,data.id);
    else if(action==='clients.list')result=await readClientList(env,sql);
    else if(action==='clients.save')result=safeClientRow(await saveClient(sql,data,env));
    else if(action==='clients.delete'){const id=num(data.id);if(!id)throw Object.assign(new Error('Cliente inválido.'),{statusCode:400});await sql`DELETE FROM pp_clients WHERE id=${id}`;if(env?.PROVEDOR_DB)try{await mirrorClientToD1(env,id)}catch(error){console.error(`Provedor Plus: não foi possível remover o espelho D1 do cliente ${id}.`,error)}result={deleted:true,id};}
    else if(action==='cashback.wallet.get')result=await cashbackWalletGet(sql,data);
    else if(action==='cashback.wallet.adjust')result=await cashbackWalletAdjust(request,sql,data);
    else if(action==='traffic.record')result=await trafficRecord(env,data);
    else if(action==='health'){const rows=await sql`SELECT id FROM pp_routers LIMIT 1`;result={online:true,routers:Array.isArray(rows)};}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return apiJson({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-native-data'});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-data'});}
}
