const crypto=require('crypto');
const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';
const COOKIE='pp_session';
const PROFILE_PREFIX='employee_access_v1_';
const ALL_PERMISSIONS=['dashboard','clients','plans','finance','billing','tickets','network'];

async function db(req,path,options={}){
  const oidc=String(req.headers['x-vercel-oidc-token']||'');
  if(!oidc)throw Object.assign(new Error('Autenticação do servidor indisponível.'),{statusCode:503});
  const headers={Accept:'application/json',Authorization:`Bearer ${oidc}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers});
  let raw='';try{raw=await response.text()}catch{}
  let body=null;if(raw){try{body=JSON.parse(raw)}catch{body=raw}}
  if(!response.ok){const message=body?.message||body?.error||`Falha de autenticação (HTTP ${response.status}).`;throw Object.assign(new Error(message),{statusCode:response.status})}
  return body;
}

const sha256=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
const randomToken=()=>crypto.randomBytes(32).toString('base64url');
const normalizeRole=value=>{const role=String(value||'').trim().toLowerCase();return ['admin','tecnico','atendente'].includes(role)?role:'atendente'};
function defaultPermissions(role){
  role=normalizeRole(role);
  if(role==='admin')return [...ALL_PERMISSIONS];
  if(role==='tecnico')return ['dashboard','clients','tickets','network'];
  return ['dashboard','clients','plans','finance','billing','tickets'];
}
function normalizePermissions(value,role){
  if(normalizeRole(role)==='admin')return [...ALL_PERMISSIONS];
  const list=Array.isArray(value)?value:defaultPermissions(role);
  return [...new Set(list.map(v=>String(v||'').trim()).filter(v=>ALL_PERMISSIONS.includes(v)))];
}
function passwordHash(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function passwordVerify(password,stored){
  try{
    const [kind,salt,hex]=String(stored||'').split('$');
    if(kind!=='scrypt'||!salt||!hex)return false;
    const got=crypto.scryptSync(String(password),salt,64);
    const expected=Buffer.from(hex,'hex');
    return got.length===expected.length&&crypto.timingSafeEqual(got,expected);
  }catch{return false}
}
function cookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i<0)continue;out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}
  return out;
}
function setSessionCookie(res,token,maxAge=60*60*24*7){res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`)}
function clearSessionCookie(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)}

async function createSession(req,res,userId){
  const token=randomToken(),tokenHash=sha256(token),expires=new Date(Date.now()+7*864e5).toISOString();
  await db(req,'/pp_sessions',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({user_id:Number(userId),token_hash:tokenHash,expires_at:expires})});
  setSessionCookie(res,token);
  return {expires_at:expires};
}

async function getUserAccess(req,user){
  if(!user?.id)return {active:false,permissions:[]};
  const role=normalizeRole(user.role),key=`${PROFILE_PREFIX}${Number(user.id)}`;
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  const value=Array.isArray(rows)?rows[0]?.value:null;
  return {
    active:value?.active!==false,
    permissions:normalizePermissions(value?.permissions,role),
    phone:String(value?.phone||'').trim(),
  };
}

async function currentSession(req){
  const token=cookies(req)[COOKIE];if(!token)return null;
  const tokenHash=sha256(token);
  const sessions=await db(req,`/pp_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,user_id,expires_at&limit=1`);
  const session=Array.isArray(sessions)?sessions[0]:null;
  if(!session)return null;
  if(new Date(session.expires_at).getTime()<=Date.now()){
    await db(req,`/pp_sessions?id=eq.${Number(session.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});
    return null;
  }
  const users=await db(req,`/pp_users?id=eq.${Number(session.user_id)}&select=id,email,name,role&limit=1`);
  const user=Array.isArray(users)?users[0]:null;
  if(!user)return null;
  const access=await getUserAccess(req,user);
  if(!access.active){await db(req,`/pp_sessions?id=eq.${Number(session.id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});return null}
  return {session,user:{...user,role:normalizeRole(user.role),active:true,permissions:access.permissions,phone:access.phone}};
}

async function requireAuth(req){
  const current=await currentSession(req);
  if(!current)throw Object.assign(new Error('Sessão expirada, desativada ou não autenticada.'),{statusCode:401});
  return current;
}
async function requireAdmin(req){
  const current=await requireAuth(req);
  if(current.user.role!=='admin')throw Object.assign(new Error('Somente o administrador pode realizar esta ação.'),{statusCode:403});
  return current;
}
async function requirePermission(req,permission){
  const current=await requireAuth(req);
  if(current.user.role==='admin'||current.user.permissions.includes(String(permission)))return current;
  throw Object.assign(new Error('Seu usuário não possui permissão para esta área.'),{statusCode:403});
}

module.exports={db,passwordHash,passwordVerify,createSession,currentSession,requireAuth,requireAdmin,requirePermission,getUserAccess,defaultPermissions,normalizePermissions,normalizeRole,ALL_PERMISSIONS,PROFILE_PREFIX,clearSessionCookie,cookies,sha256,COOKIE};
