const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    const token=String(req.headers['x-vercel-oidc-token']||'');
    if(!token)return res.status(503).json({ok:false,error:'OIDC indisponível.'});
    const response=await fetch(`${DATA_API}/pp_settings?key=eq.web_state_v1017&select=value,updated_at&limit=1`,{headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});
    const rows=await response.json();
    if(!response.ok)throw new Error(rows?.message||rows?.error||`HTTP ${response.status}`);
    const row=Array.isArray(rows)?rows[0]:null;
    const settings=row?.value?.settings||{};
    return res.status(200).json({ok:true,key:'web_state_v1017',auto_block:settings.auto_block??null,auto_block_days:settings.auto_block_days??null,updated_at:row?.updated_at||null});
  }catch(error){return res.status(500).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
