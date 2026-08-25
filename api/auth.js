const {db,passwordHash,passwordVerify,createSession,currentSession,clearSessionCookie,cookies,sha256,COOKIE}=require('../lib/cloud-auth');
const text=v=>String(v??'').trim();

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
      return res.status(200).json({ok:true,data:{authenticated:true,user:{id:user.id,email:user.email,name:user.name,role:user.role}}});
    }
    if(action==='login'){
      const login=text(data.login).toLowerCase(),password=String(data.password||'');
      const rows=await db(req,`/pp_users?email=eq.${encodeURIComponent(login)}&select=id,email,name,role,password_hash&limit=1`);
      const user=Array.isArray(rows)?rows[0]:null;
      if(!user||!passwordVerify(password,user.password_hash))throw Object.assign(new Error('Usuário ou senha inválidos.'),{statusCode:401});
      await createSession(req,res,user.id);
      return res.status(200).json({ok:true,data:{authenticated:true,user:{id:user.id,email:user.email,name:user.name,role:user.role}}});
    }
    if(action==='logout'){
      const token=cookies(req)[COOKIE];
      if(token)await db(req,`/pp_sessions?token_hash=eq.${encodeURIComponent(sha256(token))}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}).catch(()=>{});
      clearSessionCookie(res);
      return res.status(200).json({ok:true,data:{authenticated:false}});
    }
    throw Object.assign(new Error('Ação não permitida.'),{statusCode:400});
  }catch(error){return res.status(Number(error?.statusCode)||500).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
