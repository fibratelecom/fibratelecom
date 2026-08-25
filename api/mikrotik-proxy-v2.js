const {requireAuth}=require('../lib/cloud-auth');
const {integrationSecret}=require('../lib/cloud-vault');
const handler=require('../lib/mikrotik-proxy-v2-handler');

module.exports=async function(req,res){
  try{
    await requireAuth(req);
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const router=body.router&&typeof body.router==='object'?body.router:null;
    if(router?.id&&!String(router.password||'')){
      const secret=await integrationSecret(req,`mikrotik:${Number(router.id)}`,{optional:true});
      if(secret?.password)req.body={...body,router:{...router,password:String(secret.password)}};
    }
    return await handler(req,res);
  }catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
