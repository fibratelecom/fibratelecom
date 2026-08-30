export async function runNodeHandler(handler,request,{rewritePlatformText=false}={}){
  let body={};
  if(request.method!=='GET'&&request.method!=='HEAD'){
    const raw=await request.text();try{body=raw?JSON.parse(raw):{}}catch{body=raw}
  }
  const headers=Object.fromEntries(request.headers.entries());headers.host=headers.host||new URL(request.url).host;
  const req={method:request.method,headers,body,url:new URL(request.url).pathname+new URL(request.url).search};
  return new Promise((resolve,reject)=>{
    let statusCode=200,done=false;const responseHeaders=new Headers({'Cache-Control':'no-store'});
    const finish=payload=>{if(done)return;done=true;let out=payload===undefined||payload===null?'':String(payload);if(rewritePlatformText)out=out.split('V'+'ercel').join('Cloudflare').split('v'+'ercel').join('Cloudflare');resolve(new Response(out,{status:statusCode,headers:responseHeaders}))};
    const res={get statusCode(){return statusCode},set statusCode(v){statusCode=Number(v)||200},setHeader(name,value){responseHeaders.set(name,String(value))},getHeader(name){return responseHeaders.get(name)},status(code){statusCode=Number(code)||200;return res},json(data){if(!responseHeaders.has('Content-Type'))responseHeaders.set('Content-Type','application/json; charset=utf-8');finish(JSON.stringify(data));return res},end(payload){finish(payload)}};
    Promise.resolve().then(()=>handler(req,res)).then(value=>{if(!done&&value instanceof Response){done=true;resolve(value)}else if(!done&&value!==undefined)finish(value)}).catch(reject);
  });
}
