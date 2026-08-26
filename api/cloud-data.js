const {requireAuth,requirePermission}=require('../lib/cloud-auth');
const handler=require('../lib/cloud-data-handler');
module.exports=async function(req,res){
  try{
    const action=String(req.body?.action||'').trim();
    if(action.startsWith('routers.')||action==='traffic.record')await requirePermission(req,'network');
    else if(action.startsWith('clients.'))await requirePermission(req,'clients');
    else await requireAuth(req);
    return await handler(req,res);
  }
  catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
