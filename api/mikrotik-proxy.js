const {requireAuth}=require('../lib/cloud-auth');
const handler=require('../lib/mikrotik-proxy');
module.exports=async function(req,res){
  try{await requireAuth(req);return await handler(req,res)}
  catch(error){res.statusCode=Number(error?.statusCode)||401;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)}))}
};
