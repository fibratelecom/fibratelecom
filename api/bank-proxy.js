const {requireAuth}=require('../lib/cloud-auth');
const {readIntegration,integrationSecret}=require('../lib/cloud-vault');
const handler=require('../lib/bank-proxy-handler');

async function runtimeConfig(req,provider){
  const row=await readIntegration(req,provider);if(!row)return null;
  const secret=await integrationSecret(req,provider,{optional:true})||{},pub=row.public_data||{};
  if(provider==='efi')return {
    enabled:Boolean(row.enabled),environment:row.environment==='production'?'production':'sandbox',
    clientId:String(pub.clientId||''),clientSecret:String(secret.clientSecret||''),certificatePassword:String(secret.certificatePassword||''),certificateBase64:String(secret.certificateBase64||''),
    pixKey:String(pub.pixKey||''),pixAutoReceiverAgency:String(pub.pixAutoReceiverAgency||''),pixAutoReceiverAccount:String(pub.pixAutoReceiverAccount||''),webhookUrl:String(pub.webhookUrl||'')
  };
  return {enabled:Boolean(row.enabled),environment:row.environment==='production'?'production':'sandbox',publicKey:String(pub.publicKey||''),accessToken:String(secret.accessToken||'')};
}

module.exports=async function(req,res){
  try{
    await requireAuth(req);
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const [efi,mp]=await Promise.all([runtimeConfig(req,'efi'),runtimeConfig(req,'mercadopago')]);
    req.body={...body,efi:efi?{...(body.efi||{}),...efi}:(body.efi||{}),mercadoPago:mp?{...(body.mercadoPago||{}),...mp}:(body.mercadoPago||{})};
    return await handler(req,res);
  }catch(error){return res.status(Number(error?.statusCode)||401).json({ok:false,error:error instanceof Error?error.message:String(error)})}
};
