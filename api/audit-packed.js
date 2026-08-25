const fs=require('fs');
const path=require('path');
const zlib=require('zlib');

function unpack(prefix,count){
  let b64='';
  for(let i=1;i<=count;i++){
    const file=path.join(process.cwd(),'packed',`${prefix}-${String(i).padStart(2,'0')}.txt`);
    b64+=fs.readFileSync(file,'utf8').replace(/\s+/g,'');
  }
  return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}
function contexts(src,term,max=20,before=240,after=620){
  const out=[];let from=0;
  while(out.length<max){const i=src.indexOf(term,from);if(i<0)break;out.push(src.slice(Math.max(0,i-before),Math.min(src.length,i+term.length+after)).replace(/\s+/g,' '));from=i+term.length}
  return out;
}
function firstConst(src,name){
  const re=new RegExp('const\\s+'+name+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']');
  const m=src.match(re);return m?m[1]:null;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const bridge=unpack('bridgegz',4);
    const app=unpack('appgz',33);
    const src=bridge+'\n'+app;
    const terms=['function localApi','const KEY','plans:{','clients:{','invoices:{','tickets:{','stock:{','settings:{','banks:{','backup:{','reports:{','routers:{','dashboard:{','app:{'];
    const found={};for(const t of terms)found[t]=contexts(src,t,t==='function localApi'?2:10);
    return res.status(200).json({ok:true,key:firstConst(src,'KEY'),secureDb:firstConst(src,'SECURE_DB'),found});
  }catch(e){return res.status(500).json({ok:false,error:e.message,stack:e.stack})}
};
