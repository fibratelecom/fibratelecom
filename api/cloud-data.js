const {requireAuth}=require('../lib/cloud-auth');
const handler=require('../lib/cloud-data-handler');
module.exports=async function(req,res){
  try{await requireAuth(req);return await handler(req,res)}
  catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
