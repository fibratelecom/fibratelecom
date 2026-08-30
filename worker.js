const UPSTREAM='https://fibratelecom.vercel.app';

function copyHeaders(headers){
  const next=new Headers(headers);
  next.delete('host');
  next.delete('content-length');
  next.delete('cf-connecting-ip');
  next.delete('cf-ipcountry');
  next.delete('cf-ray');
  next.delete('cf-visitor');
  return next;
}

async function proxyApi(request){
  const incoming=new URL(request.url);
  const target=new URL(incoming.pathname+incoming.search,UPSTREAM);
  const headers=copyHeaders(request.headers);
  headers.set('x-forwarded-host',incoming.host);
  headers.set('x-forwarded-proto','https');

  const init={
    method:request.method,
    headers,
    redirect:'manual'
  };
  if(request.method!=='GET'&&request.method!=='HEAD')init.body=request.body;

  const response=await fetch(target.toString(),init);
  const responseHeaders=new Headers(response.headers);
  const location=responseHeaders.get('location');
  if(location&&location.startsWith(UPSTREAM)){
    responseHeaders.set('location',location.replace(UPSTREAM,incoming.origin));
  }
  responseHeaders.set('x-provedor-plus-edge','cloudflare-migration-v1');

  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers:responseHeaders
  });
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return proxyApi(request);
    return env.ASSETS.fetch(request);
  }
};
