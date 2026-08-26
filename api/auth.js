const {db,passwordHash,passwordVerify,createSession,currentSession,requireAuth,requireAdmin,getUserAccess,defaultPermissions,normalizePermissions,normalizeRole,ALL_PERMISSIONS,PROFILE_PREFIX,clearSessionCookie,cookies,sha256,COOKIE}=require('../lib/cloud-auth');
const text=v=>String(v??'').trim();
const profileKey=id=>`${PROFILE_PREFIX}${Number(id)}`;
const safeUser=user=>user?{id:Number(user.id),email:text(user.email),name:text(user.name),role:normalizeRole(user.role),created_at:user.created_at||null}:null;

async function getProfile(req,id,role){
  const rows=await db(req,`/pp_settings?key=eq.${encodeURIComponent(profileKey(id))}&select=value&limit=1`),value=Array.isArray(rows)?rows[0]?.value:null;
  return {active:value?.active!==false,phone:text(value?.phone),permissions:normalizePermissions(value?.permissions,role)};
}
async function saveProfile(req,id,profile){
  const key=profileKey(id),payload={key,value:profile,updated_at:new Date().toISOString()};
  const patched=await db(req,`/pp_settings?key=eq.${encodeURIComponent(key)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  if(Array.isArray(patched)&&patched.length)return patched[0];
  const inserted=await db(req,'/pp_settings',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  return Array.isArray(inserted)?inserted[0]:inserted;
}
async function revokeSessions(req,userId){await db(req,`/pp_sessions?user_id=eq.${Number(userId)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{})}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    const action=text(req.body?.action),data=req.body?.data||{};
    if(action==='status'){
      const current=await currentSession(req);
      const users=await db(req,'/pp_users?select=id&limit=1');
      return res.status(200).json({ok:true,data:{configured:Array.isArray(users)&&users.length>0,authenticated:Boolean(current),user:current?.user||null}});
    }
    if(action==='setup'){
      const existing=await db(req,'/pp_users?select=id&limit=1');
      if(Array.isArray(existing)&&existing.length)throw Object.assign(new Error('O administrador inicial já foi configurado.'),{statusCode:409});
      const name=text(data.name),login=text(data.login).toLowerCase(),password=String(data.password||'');
      if(name.length<2)throw Object.assign(new Error('Informe o nome do administrador.'),{statusCode:400});
      if(login.length<3)throw Object.assign(new Error('Informe o usuário de acesso.'),{statusCode:400});
      if(password.length<8)throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres.'),{statusCode:400});
      const created=await db(req,'/pp_users',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({email:login,name,role:'admin',password_hash:passwordHash(password)})});
      const user=Array.isArray(created)?created[0]:created;
      if(!user?.id)throw new Error('Não foi possível criar o administrador.');
      await createSession(req,res,user.id);
      return res.status(200).json({ok:true,data:{authenticated:true,user:{...safeUser(user),active:true,permissions:[...ALL_PERMISSIONS]}}});
    }
    if(action==='login'){
      const login=text(data.login).toLowerCase(),password=String(data.password||'');
      const rows=await db(req,`/pp_users?email=eq.${encodeURIComponent(login)}&select=id,email,name,role,password_hash&limit=1`);
      const user=Array.isArray(rows)?rows[0]:null;
      if(!user||!passwordVerify(password,user.password_hash))throw Object.assign(new Error('Usuário ou senha inválidos.'),{statusCode:401});
      const access=await getUserAccess(req,user);
      if(!access.active)throw Object.assign(new Error('Este acesso está desativado. Procure o administrador.'),{statusCode:403});
      await createSession(req,res,user.id);
      return res.status(200).json({ok:true,data:{authenticated:true,user:{...safeUser(user),active:true,permissions:access.permissions,phone:access.phone}}});
    }
    if(action==='logout'){
      const token=cookies(req)[COOKIE];
      if(token)await db(req,`/pp_sessions?token_hash=eq.${encodeURIComponent(sha256(token))}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});
      clearSessionCookie(res);
      return res.status(200).json({ok:true,data:{authenticated:false}});
    }
    if(action==='employees.available'){
      await requireAuth(req);
      const users=await db(req,'/pp_users?select=id,name,role&order=name.asc');
      const out=[];
      for(const user of Array.isArray(users)?users:[]){const profile=await getProfile(req,user.id,user.role);if(profile.active)out.push({...safeUser(user),permissions:profile.permissions})}
      return res.status(200).json({ok:true,data:out});
    }
    if(action==='employees.list'){
      await requireAdmin(req);
      const users=await db(req,'/pp_users?select=id,email,name,role,created_at&order=name.asc');
      const out=[];
      for(const user of Array.isArray(users)?users:[]){const profile=await getProfile(req,user.id,user.role);out.push({...safeUser(user),...profile})}
      return res.status(200).json({ok:true,data:out});
    }
    if(action==='employees.save'){
      const current=await requireAdmin(req),id=Number(data.id)||0,name=text(data.name),login=text(data.login||data.email).toLowerCase(),role=normalizeRole(data.role),password=String(data.password||'');
      if(name.length<2)throw Object.assign(new Error('Informe o nome do funcionário.'),{statusCode:400});
      if(login.length<3)throw Object.assign(new Error('Informe o usuário de acesso.'),{statusCode:400});
      if(!id&&password.length<8)throw Object.assign(new Error('A senha inicial deve ter pelo menos 8 caracteres.'),{statusCode:400});
      if(id===Number(current.user.id)&&role!=='admin')throw Object.assign(new Error('O administrador atual não pode remover o próprio perfil de administrador.'),{statusCode:400});
      const payload={email:login,name,role};if(password)payload.password_hash=passwordHash(password);
      let user;
      if(id){
        const updated=await db(req,`/pp_users?id=eq.${id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});user=Array.isArray(updated)?updated[0]:updated;
      }else{
        const created=await db(req,'/pp_users',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});user=Array.isArray(created)?created[0]:created;
      }
      if(!user?.id)throw Object.assign(new Error('Não foi possível salvar o funcionário.'),{statusCode:500});
      const active=data.active!==false,permissions=normalizePermissions(data.permissions,user.role),phone=text(data.phone);
      if(user.role!=='admin'&&!permissions.length)throw Object.assign(new Error('Selecione pelo menos uma permissão de acesso.'),{statusCode:400});
      await saveProfile(req,user.id,{active,phone,permissions,updated_at:new Date().toISOString()});
      if(id&&Number(id)!==Number(current.user.id))await revokeSessions(req,id);
      return res.status(200).json({ok:true,data:{...safeUser(user),active,phone,permissions}});
    }
    if(action==='employees.toggle'){
      const current=await requireAdmin(req),id=Number(data.id)||0;
      if(!id)throw Object.assign(new Error('Funcionário inválido.'),{statusCode:400});
      if(id===Number(current.user.id))throw Object.assign(new Error('Você não pode desativar o próprio acesso.'),{statusCode:400});
      const rows=await db(req,`/pp_users?id=eq.${id}&select=id,email,name,role,created_at&limit=1`),user=Array.isArray(rows)?rows[0]:null;
      if(!user)throw Object.assign(new Error('Funcionário não encontrado.'),{statusCode:404});
      const previous=await getProfile(req,id,user.role),active=Boolean(data.active);
      await saveProfile(req,id,{...previous,active,updated_at:new Date().toISOString()});
      if(!active)await revokeSessions(req,id);
      return res.status(200).json({ok:true,data:{...safeUser(user),...previous,active}});
    }
    if(action==='employees.delete'){
      const current=await requireAdmin(req),id=Number(data.id)||0;
      if(!id)throw Object.assign(new Error('Funcionário inválido.'),{statusCode:400});
      if(id===Number(current.user.id))throw Object.assign(new Error('Você não pode excluir o próprio acesso.'),{statusCode:400});
      await revokeSessions(req,id);
      await db(req,`/pp_settings?key=eq.${encodeURIComponent(profileKey(id))}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});
      await db(req,`/pp_users?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return res.status(200).json({ok:true,data:{deleted:true,id}});
    }
    throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
  }catch(error){return res.status(Number(error?.statusCode)||500).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
