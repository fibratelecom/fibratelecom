const {runAutomation}=require('../lib/automation-handler');

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método não permitido.'});
  const secret=String(process.env.CRON_SECRET||'').trim();
  const authorization=String(req.headers?.authorization||'').trim();
  if(!secret||authorization!==`Bearer ${secret}`)return res.status(401).json({ok:false,error:'Automação não autorizada.'});
  try{return res.status(200).json({ok:true,data:await runAutomation(req)})}
  catch(error){return res.status(Number(error?.statusCode)||500).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
