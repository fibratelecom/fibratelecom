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
async function setSetting(sql,key,value){const updatedAt=new Date().toISOString(),raw=JSON.stringify(value??null);const rows=await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${key},${raw}::jsonb,${updatedAt}) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at RETURNING value,updated_at`;return Array.isArray(rows)?rows[0]||null:null;}
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
  const localInvoices=Array.isArray(state.invoices)?[...state.invoices]:[],remoteInvoices=Array.isArray(remote.invoices)?remote.invoices:[],index=new Map(localInvoices.map((item,i)=>[String(item?.id??''),i]));
  const bankFields=['bank_provider','bank_environment','bank_charge_id','bank_order_id','bank_payment_id','bank_external_reference','bank_status','bank_status_detail','bank_barcode','bank_digitable_line','bank_ticket_url','bank_pdf_url','bank_pix_code','bank_last_sync_at'];
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
    if(changed)localInvoices[position]=merged;
  }
  if(localInvoices.length)state.invoices=localInvoices;
  const maxInvoiceId=Math.max(Number(state?.seq?.invoices)||0,...localInvoices.map(item=>Number(item?.id)||0));if(maxInvoiceId)state.seq={...(state.seq||{}),invoices:maxInvoiceId};
  return state;
}
function sanitize(value,depth=0){if(depth>30)return null;if(Array.isArray(value))return value.slice(0,10000).map(v=>sanitize(v,depth+1));if(!value||typeof value!=='object')return value;const blocked=new Set(['password','router_password','mikrotik_password','clientSecret','client_secret','accessToken','access_token','certificatePassword','certificate_password','certificateBase64','certificate_base64','privateKey','private_key']);const out={};for(const [key,val] of Object.entries(value)){if(blocked.has(key))continue;out[key]=sanitize(val,depth+1)}return out;}
export async function handleNativeCloudState(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-state'});const sql=sqlFor(env);
  try{await requireAuth(request,sql);const body=await bodyOf(request),action=text(body?.action),data=body?.data||{};let result;
    if(action==='state.get'){const row=await getSetting(sql,STATE_KEY);result=row?{state:row.value||{},updated_at:row.updated_at||null}:{state:null,updated_at:null};}
    else if(action==='state.save'){if(!data.state||typeof data.state!=='object'||Array.isArray(data.state))throw Object.assign(new Error('Estado do gerenciador inválido.'),{statusCode:400});const previous=await getSetting(sql,STATE_KEY),merged=preservePortalState(data.state,previous?.value),clean=sanitize(merged),row=await setSetting(sql,STATE_KEY,clean);result={state:row?.value||clean,updated_at:row?.updated_at||new Date().toISOString()};}
    else if(action==='health'){const row=await getSetting(sql,STATE_KEY);result={online:true,hasState:Boolean(row?.value),updated_at:row?.updated_at||null};}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});return apiJson({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-native-state'});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-state'});}
}

function routerPayload(data={}){const id=num(data.id),out={name:text(data.name)||'MikroTik',host:text(data.host),port:num(data.port)||443,username:text(data.username),connection_method:'rest',allow_self_signed:bool(data.allow_self_signed,false),active:bool(data.active,true),last_status:text(data.last_status),last_sync:data.last_sync||null,updated_at:new Date().toISOString()};if(id)out.id=id;return out;}
function clientPayload(data={}){const id=num(data.id),routerId=num(data.router_id),pppoeUser=text(data.pppoe_username||data.pppoe_user),out={name:text(data.name),document:text(data.document),contract_number:text(data.contract_number),plan:text(data.plan||data.plan_name),plan_id:num(data.plan_id),due_day:num(data.due_day),status:text(data.status)||'Ativo',email:text(data.email),phone:text(data.phone),address:text(data.address||data.street),city:text(data.city),state:text(data.state),zip_code:text(data.zip_code||data.cep),pppoe_user:pppoeUser,auto_block:bool(data.auto_block,false),block_after_days:num(data.block_after_days)||7,notes:text(data.notes),router_id:routerId,connection_type:nullableText(data.connection_type),pppoe_username:nullableText(pppoeUser),mikrotik_profile:nullableText(data.mikrotik_profile),ip:nullableText(data.ip),mac_address:nullableText(data.mac_address),mikrotik_secret_id:nullableText(data.mikrotik_secret_id||data.secret_id),mikrotik_status:nullableText(data.mikrotik_status),mikrotik_last_sync:data.mikrotik_last_sync||data.last_mikrotik_sync||null,updated_at:new Date().toISOString()};if(id)out.id=id;if(text(data.pppoe_password))out.pppoe_password=text(data.pppoe_password);return out;}
async function saveRouter(sql,data){const p=routerPayload(data);if(!p.host||!p.username)throw Object.assign(new Error('Informe o endereço e o usuário do MikroTik.'),{statusCode:400});let rows=[];if(p.id)rows=await sql`UPDATE pp_routers SET name=${p.name},host=${p.host},port=${p.port},username=${p.username},connection_method=${p.connection_method},allow_self_signed=${p.allow_self_signed},active=${p.active},last_status=${p.last_status},last_sync=COALESCE(${p.last_sync},last_sync),updated_at=${p.updated_at} WHERE id=${p.id} RETURNING *`;if(rows[0])return rows[0];if(p.id){rows=await sql`INSERT INTO pp_routers (id,name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,updated_at) VALUES (${p.id},${p.name},${p.host},${p.port},${p.username},${p.connection_method},${p.allow_self_signed},${p.active},${p.last_status},${p.last_sync},${p.updated_at}) RETURNING *`;return rows[0]}rows=await sql`INSERT INTO pp_routers (name,host,port,username,connection_method,allow_self_signed,active,last_status,last_sync,updated_at) VALUES (${p.name},${p.host},${p.port},${p.username},${p.connection_method},${p.allow_self_signed},${p.active},${p.last_status},${p.last_sync},${p.updated_at}) RETURNING *`;return rows[0];}
async function findExistingClient(sql,p){if(p.contract_number){const rows=await sql`SELECT id FROM pp_clients WHERE contract_number=${p.contract_number} LIMIT 1`;if(rows[0]?.id)return num(rows[0].id)}if(p.document){const rows=await sql`SELECT id FROM pp_clients WHERE document=${p.document} LIMIT 1`;if(rows[0]?.id)return num(rows[0].id)}return null;}
async function saveClient(sql,data){const p=clientPayload(data);if(!p.name)throw Object.assign(new Error('Nome do cliente é obrigatório.'),{statusCode:400});if(!p.id)p.id=await findExistingClient(sql,p);let rows=[];
  if(p.id){
    if(p.pppoe_password)rows=await sql`UPDATE pp_clients SET name=${p.name},document=${p.document},contract_number=${p.contract_number},plan=${p.plan},plan_id=${p.plan_id},due_day=${p.due_day},status=${p.status},email=${p.email},phone=${p.phone},address=${p.address},city=${p.city},state=${p.state},zip_code=${p.zip_code},pppoe_user=${p.pppoe_user},pppoe_password=${p.pppoe_password},auto_block=${p.auto_block},block_after_days=${p.block_after_days},notes=${p.notes},router_id=${p.router_id},connection_type=${p.connection_type},pppoe_username=${p.pppoe_username},mikrotik_profile=${p.mikrotik_profile},ip=${p.ip},mac_address=${p.mac_address},mikrotik_secret_id=${p.mikrotik_secret_id},mikrotik_status=${p.mikrotik_status},mikrotik_last_sync=${p.mikrotik_last_sync},updated_at=${p.updated_at} WHERE id=${p.id} RETURNING *`;
    else rows=await sql`UPDATE pp_clients SET name=${p.name},document=${p.document},contract_number=${p.contract_number},plan=${p.plan},plan_id=${p.plan_id},due_day=${p.due_day},status=${p.status},email=${p.email},phone=${p.phone},address=${p.address},city=${p.city},state=${p.state},zip_code=${p.zip_code},pppoe_user=${p.pppoe_user},auto_block=${p.auto_block},block_after_days=${p.block_after_days},notes=${p.notes},router_id=${p.router_id},connection_type=${p.connection_type},pppoe_username=${p.pppoe_username},mikrotik_profile=${p.mikrotik_profile},ip=${p.ip},mac_address=${p.mac_address},mikrotik_secret_id=${p.mikrotik_secret_id},mikrotik_status=${p.mikrotik_status},mikrotik_last_sync=${p.mikrotik_last_sync},updated_at=${p.updated_at} WHERE id=${p.id} RETURNING *`;
    if(rows[0])return rows[0];
  }
  if(p.pppoe_password)rows=await sql`INSERT INTO pp_clients (name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,pppoe_password,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,updated_at) VALUES (${p.name},${p.document},${p.contract_number},${p.plan},${p.plan_id},${p.due_day},${p.status},${p.email},${p.phone},${p.address},${p.city},${p.state},${p.zip_code},${p.pppoe_user},${p.pppoe_password},${p.auto_block},${p.block_after_days},${p.notes},${p.router_id},${p.connection_type},${p.pppoe_username},${p.mikrotik_profile},${p.ip},${p.mac_address},${p.mikrotik_secret_id},${p.mikrotik_status},${p.mikrotik_last_sync},${p.updated_at}) RETURNING *`;
  else rows=await sql`INSERT INTO pp_clients (name,document,contract_number,plan,plan_id,due_day,status,email,phone,address,city,state,zip_code,pppoe_user,auto_block,block_after_days,notes,router_id,connection_type,pppoe_username,mikrotik_profile,ip,mac_address,mikrotik_secret_id,mikrotik_status,mikrotik_last_sync,updated_at) VALUES (${p.name},${p.document},${p.contract_number},${p.plan},${p.plan_id},${p.due_day},${p.status},${p.email},${p.phone},${p.address},${p.city},${p.state},${p.zip_code},${p.pppoe_user},${p.auto_block},${p.block_after_days},${p.notes},${p.router_id},${p.connection_type},${p.pppoe_username},${p.mikrotik_profile},${p.ip},${p.mac_address},${p.mikrotik_secret_id},${p.mikrotik_status},${p.mikrotik_last_sync},${p.updated_at}) RETURNING *`;return rows[0];}
async function secretContext(request,sql,routerId){const current=await currentSession(request,sql);if(!current?.user?.id)throw Object.assign(new Error('Sessão expirada ou não autenticada.'),{statusCode:401});const users=await sql`SELECT password_hash FROM pp_users WHERE id=${Number(current.user.id)} LIMIT 1`,passwordHash=text(users[0]?.password_hash);if(!passwordHash)throw Object.assign(new Error('Não foi possível proteger a credencial do MikroTik.'),{statusCode:500});const key=await sha256Bytes(`provedor-plus-router-secret-v1|${current.user.id}|${passwordHash}`);return {userId:Number(current.user.id),key,settingKey:`router_secret_v1_${Number(current.user.id)}_${Number(routerId)}`};}
async function encryptSecret(value,keyBytes){const iv=randomBytes(12),key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']),combined=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,utf8.encode(String(value))));const tag=combined.slice(combined.length-16),data=combined.slice(0,combined.length-16);return {v:1,iv:bytesToB64(iv),tag:bytesToB64(tag),data:bytesToB64(data)};}
async function decryptSecret(record,keyBytes){try{if(!record?.iv||!record?.tag||!record?.data)return '';const data=b64ToBytes(record.data),tag=b64ToBytes(record.tag),combined=new Uint8Array(data.length+tag.length);combined.set(data);combined.set(tag,data.length);const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(record.iv)},key,combined);return new TextDecoder().decode(plain)}catch{return ''}}
async function routerSecretGet(request,sql,routerId){const id=num(routerId);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});const ctx=await secretContext(request,sql,id),row=await getSetting(sql,ctx.settingKey),password=await decryptSecret(row?.value,ctx.key);return {configured:Boolean(password),password};}
async function routerSecretSave(request,sql,routerId,password){const id=num(routerId),value=String(password||'');if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});if(!value)throw Object.assign(new Error('Informe a senha do MikroTik.'),{statusCode:400});const ctx=await secretContext(request,sql,id);await setSetting(sql,ctx.settingKey,await encryptSecret(value,ctx.key));return {configured:true,id};}
async function routerSecretDelete(request,sql,routerId){const id=num(routerId);if(!id)return {deleted:false,id:null};const ctx=await secretContext(request,sql,id);await deleteSetting(sql,ctx.settingKey);return {deleted:true,id};}
function currentMonth(value=''){const month=text(value);return /^\d{4}-\d{2}$/.test(month)?month:new Date().toISOString().slice(0,7)}
function trafficEmpty(month=currentMonth()){return {month,download_bytes:0,upload_bytes:0,lastSession:'',lastDownload:0,lastUpload:0,lastAt:0,history:[]}}
async function trafficRecord(sql,data={}){const clientId=num(data.clientId);if(!clientId)throw Object.assign(new Error('Cliente inválido para registrar tráfego.'),{statusCode:400});const month=currentMonth(data.month),key=`client_traffic_v1_${clientId}`,row=await getSetting(sql,key),all=row?.value&&typeof row.value==='object'?row.value:trafficEmpty(month),live=data.live&&typeof data.live==='object'?data.live:{},t=Date.now();let x={...trafficEmpty(month),...all};if(x.month!==month){const history=x.month?[{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},...(Array.isArray(x.history)?x.history:[])].slice(0,12):(Array.isArray(x.history)?x.history:[]);x={...trafficEmpty(month),history}}let downloadBps=Number(live.downloadBps)||0,uploadBps=Number(live.uploadBps)||0;if(live.online&&live.sessionId){const d=Math.max(0,Number(live.downloadBytes)||0),u=Math.max(0,Number(live.uploadBytes)||0),same=x.lastSession===String(live.sessionId),dd=same?Math.max(0,d-(Number(x.lastDownload)||0)):d,du=same?Math.max(0,u-(Number(x.lastUpload)||0)):u;if(!downloadBps&&same&&x.lastAt){const seconds=Math.max(.25,(t-Number(x.lastAt))/1000);downloadBps=Math.round(dd*8/seconds);uploadBps=Math.round(du*8/seconds)}x.download_bytes=(Number(x.download_bytes)||0)+dd;x.upload_bytes=(Number(x.upload_bytes)||0)+du;x.lastSession=String(live.sessionId);x.lastDownload=d;x.lastUpload=u;x.lastAt=t}await setSetting(sql,key,x);return {current:{month:x.month,download_bytes:Number(x.download_bytes)||0,upload_bytes:Number(x.upload_bytes)||0},history:Array.isArray(x.history)?x.history:[],downloadBps,uploadBps};}

export async function handleNativeCloudData(request,env){
  if(request.method!=='POST')return apiJson({ok:false,error:'Método não permitido.'},405,{'x-provedor-plus-edge':'cloudflare-native-data'});const sql=sqlFor(env);
  try{const body=await bodyOf(request),action=text(body?.action),data=body?.data||{};if(action.startsWith('routers.')||action==='traffic.record')await requirePermission(request,sql,'network');else if(action.startsWith('clients.'))await requirePermission(request,sql,'clients');else await requireAuth(request,sql);let result;
    if(action==='routers.list')result=await sql`SELECT * FROM pp_routers ORDER BY id ASC`;
    else if(action==='routers.save')result=await saveRouter(sql,data);
    else if(action==='routers.delete'){const id=num(data.id);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});await sql`DELETE FROM pp_routers WHERE id=${id}`;result={deleted:true,id};}
    else if(action==='routers.secret.get')result=await routerSecretGet(request,sql,data.id);
    else if(action==='routers.secret.save')result=await routerSecretSave(request,sql,data.id,data.password);
    else if(action==='routers.secret.delete')result=await routerSecretDelete(request,sql,data.id);
    else if(action==='clients.list')result=await sql`SELECT * FROM pp_clients ORDER BY id ASC`;
    else if(action==='clients.save')result=await saveClient(sql,data);
    else if(action==='clients.delete'){const id=num(data.id);if(!id)throw Object.assign(new Error('Cliente inválido.'),{statusCode:400});await sql`DELETE FROM pp_clients WHERE id=${id}`;result={deleted:true,id};}
    else if(action==='traffic.record')result=await trafficRecord(sql,data);
    else if(action==='health'){const rows=await sql`SELECT id FROM pp_routers LIMIT 1`;result={online:true,routers:Array.isArray(rows)};}
    else throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
    return apiJson({ok:true,data:result},200,{'x-provedor-plus-edge':'cloudflare-native-data'});
  }catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500,{'x-provedor-plus-edge':'cloudflare-native-data'});}
}
