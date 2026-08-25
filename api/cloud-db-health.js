const DATA_API='https://ep-silent-block-a65ngav0.apirest.us-west-2.aws.neon.tech/neondb/rest/v1';

async function call(path, token, options={}){
  const headers={Accept:'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})};
  const response=await fetch(`${DATA_API}${path}`,{...options,headers});
  let body='';
  try{body=await response.text()}catch{}
  return {status:response.status,ok:response.ok,body:body.slice(0,500)};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    const oidcToken=String(req.headers['x-vercel-oidc-token']||'');
    if(!oidcToken)return res.status(503).json({ok:false,error:'OIDC da Vercel indisponível.'});
    const read=await call('/pp_routers?select=id&limit=1',oidcToken);
    const writeProbe=await call('/pp_routers',oidcToken,{
      method:'POST',
      headers:{'Content-Type':'application/json',Prefer:'return=minimal'},
      body:'{}'
    });
    return res.status(200).json({
      oidcAvailable:true,
      readStatus:read.status,
      readBody:read.body,
      writeProbeStatus:writeProbe.status,
      writeProbeBody:writeProbe.body
    });
  }catch(error){
    return res.status(500).json({ok:false,error:error instanceof Error?error.message:String(error)});
  }
};
