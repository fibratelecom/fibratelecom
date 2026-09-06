const {requireAuth}=require('../lib/cloud-auth');
const handler=require('../lib/bank-proxy-handler');
const bankSecrets=require('../lib/bank-secret-store');

module.exports=async function(req,res){
  try{
    await requireAuth(req);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    try{
      const secret=await bankSecrets.get(req,'mercadoPago');
      if(secret?.accessToken){
        req.body={...body,mercadoPago:{...(body.mercadoPago||{}),accessToken:String(secret.accessToken)}};
      }else req.body=body;
    }catch(error){
      const supplied=String(body?.mercadoPago?.accessToken||'').trim();
      if(!supplied)throw error;
      req.body=body;
    }
    return await handler(req,res);
  }
  catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
