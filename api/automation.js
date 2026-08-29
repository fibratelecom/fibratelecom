const {runAutomation}=require('../lib/automation-handler');
const {requireAutomationScheduler}=require('../lib/github-actions-oidc');

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    await requireAutomationScheduler(req);
    return res.status(200).json({ok:true,data:await runAutomation(req)});
  }catch(error){
    return res.status(Number(error?.statusCode)||500).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
