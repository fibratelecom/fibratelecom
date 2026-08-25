const {requireAuth}=require('../lib/cloud-auth');
const {readIntegration,mergeIntegration,deleteIntegration,integrationSecret}=require('../lib/cloud-vault');

const text=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.trunc(n):0};

function routerProvider(id){id=num(id);if(!id)throw Object.assign(new Error('MikroTik inválido.'),{statusCode:400});return `mikrotik:${id}`}

async function publicBank(req){
  const [efiRow,mpRow]=await Promise.all([readIntegration(req,'efi'),readIntegration(req,'mercadopago')]);
  let efiSecret={},mpSecret={};
  if(efiRow?.secret_data)try{efiSecret=await integrationSecret(req,'efi',{optional:true})||{}}catch{}
  if(mpRow?.secret_data)try{mpSecret=await integrationSecret(req,'mercadopago',{optional:true})||{}}catch{}
  const ep=efiRow?.public_data||{},mp=mpRow?.public_data||{};
  return {
    efi:{
      enabled:Boolean(efiRow?.enabled),environment:efiRow?.environment==='production'?'production':'sandbox',
      clientId:String(ep.clientId||''),clientIdConfigured:Boolean(ep.clientId),clientSecretConfigured:Boolean(efiSecret.clientSecret),
      certificateConfigured:Boolean(efiSecret.certificateBase64),certificateName:String(ep.certificateName||''),certificatePasswordConfigured:Boolean(efiSecret.certificatePassword),
      pixKey:String(ep.pixKey||''),pixAutoReceiverAgency:String(ep.pixAutoReceiverAgency||''),pixAutoReceiverAccount:String(ep.pixAutoReceiverAccount||''),
      webhookUrl:String(ep.webhookUrl||''),webhookConfiguredAt:String(ep.webhookConfiguredAt||''),webhookStatus:String(ep.webhookStatus||''),
      pixAutomaticRecords:Array.isArray(ep.pixAutomaticRecords)?ep.pixAutomaticRecords:[],lastTestAt:String(ep.lastTestAt||''),lastTestStatus:String(ep.lastTestStatus||''),lastTestMessage:String(ep.lastTestMessage||'')
    },
    mercadoPago:{
      enabled:Boolean(mpRow?.enabled),environment:mpRow?.environment==='production'?'production':'sandbox',publicKey:String(mp.publicKey||''),
      accessTokenConfigured:Boolean(mpSecret.accessToken),lastTestAt:String(mp.lastTestAt||''),lastTestStatus:String(mp.lastTestStatus||''),lastTestMessage:String(mp.lastTestMessage||'')
    }
  };
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
  try{
    await requireAuth(req);
    const action=text(req.body?.action),data=req.body?.data||{};
    let result;
    if(action==='router.has'){
      const row=await readIntegration(req,routerProvider(data.id));result={configured:Boolean(row?.secret_data)};
    }else if(action==='router.set'){
      const password=String(data.password||'');if(!password)throw Object.assign(new Error('Informe a senha do MikroTik.'),{statusCode:400});
      await mergeIntegration(req,routerProvider(data.id),{enabled:true,environment:'production',publicData:{router_id:num(data.id)},secretData:{password}});result={configured:true};
    }else if(action==='router.delete')result=await deleteIntegration(req,routerProvider(data.id));
    else if(action==='bank.get')result=await publicBank(req);
    else if(action==='bank.efi.save'){
      const current=await readIntegration(req,'efi'),pub=current?.public_data||{};
      const publicData={...pub,clientId:text(data.clientId??pub.clientId),pixKey:text(data.pixKey??pub.pixKey),pixAutoReceiverAgency:text(data.pixAutoReceiverAgency??pub.pixAutoReceiverAgency),pixAutoReceiverAccount:text(data.pixAutoReceiverAccount??pub.pixAutoReceiverAccount),webhookUrl:text(data.webhookUrl??pub.webhookUrl)};
      const secretData={};if(text(data.clientSecret))secretData.clientSecret=String(data.clientSecret);if(text(data.certificatePassword))secretData.certificatePassword=String(data.certificatePassword);
      await mergeIntegration(req,'efi',{enabled:Boolean(data.enabled),environment:data.environment==='production'?'production':'sandbox',publicData,secretData});result=(await publicBank(req)).efi;
    }else if(action==='bank.mp.save'){
      const current=await readIntegration(req,'mercadopago'),pub=current?.public_data||{};
      const publicData={...pub,publicKey:text(data.publicKey??pub.publicKey)};const secretData={};if(text(data.accessToken))secretData.accessToken=String(data.accessToken);
      await mergeIntegration(req,'mercadopago',{enabled:Boolean(data.enabled),environment:data.environment==='production'?'production':'sandbox',publicData,secretData});result=(await publicBank(req)).mercadoPago;
    }else if(action==='bank.efi.certificate.set'){
      const certificateBase64=String(data.certificateBase64||'').replace(/\s+/g,'');if(!certificateBase64)throw Object.assign(new Error('Certificado Efí inválido.'),{statusCode:400});
      await mergeIntegration(req,'efi',{publicData:{certificateName:text(data.certificateName)||'Certificado Efí'},secretData:{certificateBase64}});result=(await publicBank(req)).efi;
    }else if(action==='bank.efi.certificate.remove'){
      const row=await readIntegration(req,'efi');if(row){const secret=await integrationSecret(req,'efi',{optional:true})||{};delete secret.certificateBase64;delete secret.certificatePassword;const pub={...(row.public_data||{}),certificateName:''};await mergeIntegration(req,'efi',{publicData:pub,secretData:secret,replaceSecret:true})}result=(await publicBank(req)).efi;
    }else if(action==='bank.meta'){
      const provider=data.provider==='mercadopago'?'mercadopago':'efi';const patch=data.patch&&typeof data.patch==='object'?data.patch:{};await mergeIntegration(req,provider,{publicData:patch});result=provider==='efi'?(await publicBank(req)).efi:(await publicBank(req)).mercadoPago;
    }else throw Object.assign(new Error('Ação segura não permitida.'),{statusCode:400});
    return res.status(200).json({ok:true,data:result});
  }catch(error){return res.status(Number(error?.statusCode)||500).json({ok:false,error:error instanceof Error?error.message:String(error),code:error?.code||undefined})}
};
