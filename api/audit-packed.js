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
function uniq(arr){return [...new Set(arr)].sort()}
function contexts(src,term,max=12){
  const out=[];let from=0;
  while(out.length<max){const i=src.indexOf(term,from);if(i<0)break;out.push(src.slice(Math.max(0,i-180),Math.min(src.length,i+term.length+260)).replace(/\s+/g,' '));from=i+term.length}
  return out;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const bridge=unpack('bridgegz',4);
    const app=unpack('appgz',33);
    const src=bridge+'\n'+app;
    const storage=[];
    for(const m of src.matchAll(/(?:localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*(["'`])([^"'`]+)\2/g))storage.push({op:m[1],key:m[3]});
    const dbs=uniq([...src.matchAll(/indexedDB\.open\(\s*(["'`])([^"'`]+)\1/g)].map(m=>m[2]));
    const terms=['localStorage','sessionStorage','indexedDB','plans','clients','invoices','finance','tickets','inventory','integrations','settings','users','audit','backup','reports','routers','mikrotik'];
    const termContexts={};for(const t of terms)termContexts[t]=contexts(src,t,8);
    const members=uniq([...src.matchAll(/(?:window\.)?provedor(?:\?\.)?\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]));
    const pairs=uniq([...src.matchAll(/(?:window\.)?provedor(?:\?\.)?\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)].map(m=>`${m[1]}.${m[2]}`));
    return res.status(200).json({ok:true,lengths:{bridge:bridge.length,app:app.length},storage,dbs,members,pairs,termContexts});
  }catch(e){return res.status(500).json({ok:false,error:e.message,stack:e.stack})}
};
