const vm=require('node:vm');

module.exports=async function handler(req,res){
  const base='https://raw.githubusercontent.com/fibratelecom/fibratelecom/fix/cloud-clients-online-status';
  const files=['bootstrap.js','cloud-client-store-v2.js','cloud-adapter.js','cloud-client-status-fix.js','ui-runtime-fixes.js','lib/cloud-data-handler.js'];
  const results=[];
  try{
    for(const file of files){
      const response=await fetch(`${base}/${file}`,{cache:'no-store'});
      if(!response.ok)throw new Error(`Falha ao baixar ${file}: HTTP ${response.status}`);
      const code=await response.text();
      new vm.Script(code,{filename:file});
      results.push({file,ok:true});
    }
    return res.status(200).json({ok:true,results});
  }catch(error){
    return res.status(500).json({ok:false,error:error instanceof Error?error.message:String(error),results});
  }
};
