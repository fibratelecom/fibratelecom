const UPSTREAM='https://fibratelecom.vercel.app';

export async function onRequest({request,params}){
  const path=Array.isArray(params.path)?params.path.join('/'):(params.path||'');
  const incoming=new URL(request.url);
  const target=new URL(`/api/${path}`,UPSTREAM);
  target.search=incoming.search;

  const headers=new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-forwarded-host',incoming.host);
  headers.set('x-forwarded-proto','https');

  const init={method:request.method,headers,redirect:'manual'};
  if(request.method!=='GET'&&request.method!=='HEAD')init.body=request.body;

  return fetch(target.toString(),init);
}
