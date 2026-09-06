const {requireAuth,requireAdmin,requirePermission}=require('../lib/cloud-auth');
const handler=require('../lib/cloud-data-handler');
const bankSecrets=require('../lib/bank-secret-store');
module.exports=async function(req,res){
  try{
    const action=String(req.body?.action||'').trim();
    if(action.startsWith('banks.mercadoPago.secret.')||action.startsWith('banks.mercadoPago.webhook.')){
      if(action==='banks.mercadoPago.secret.status'||action==='banks.mercadoPago.webhook.status'){
        await requireAuth(req);
        const data=await bankSecrets.status(req,'mercadoPago');
        return res.status(200).json({ok:true,data});
      }
      await requireAdmin(req);
      if(action==='banks.mercadoPago.secret.save'){
        const data=await bankSecrets.save(req,'mercadoPago',req.body?.data||{});
        return res.status(200).json({ok:true,data});
      }
      if(action==='banks.mercadoPago.secret.delete'){
        const data=await bankSecrets.remove(req,'mercadoPago');
        return res.status(200).json({ok:true,data});
      }
      if(action==='banks.mercadoPago.webhook.secret.save'){
        const data=await bankSecrets.saveWebhook(req,'mercadoPago',req.body?.data||{});
        return res.status(200).json({ok:true,data});
      }
      if(action==='banks.mercadoPago.webhook.secret.delete'){
        const data=await bankSecrets.removeWebhook(req,'mercadoPago');
        return res.status(200).json({ok:true,data});
      }
      return res.status(400).json({ok:false,error:'Ação de credencial bancária não reconhecida.'});
    }
    if(action.startsWith('routers.')||action==='traffic.record')await requirePermission(req,'network');
    else if(action.startsWith('clients.'))await requirePermission(req,'clients');
    else await requireAuth(req);
    return await handler(req,res);
  }
  catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
