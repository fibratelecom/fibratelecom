const {requireAuth}=require('../lib/cloud-auth');
const handler=require('../lib/mikrotik-proxy-v2-handler');
module.exports=async function(req,res){
  try{
    const current=await requireAuth(req),action=String(req.body?.action||'').trim(),permissions=new Set(current.user.permissions||[]),admin=current.user.role==='admin';
    const statusOnly=action==='client.status';
    const allowed=admin||(statusOnly?(permissions.has('network')||permissions.has('clients')||permissions.has('tickets')):permissions.has('network'));
    if(!allowed)throw Object.assign(new Error('Seu usuário não possui permissão para esta operação de rede.'),{statusCode:403});
    return await handler(req,res)
  }
  catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
