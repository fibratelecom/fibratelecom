import bankProxyHandler from './cf/bank-proxy.cjs';
import mikrotikProxyHandler from './cf/mikrotik-proxy.cjs';
import { handleNativeAuth,handleNativeCloudState,handleNativeCloudData } from './worker-native-api.js';
import { handleCustomerPortal } from './worker-customer-portal.js';
import { apiJson,requireNativeSession,databaseHealth } from './worker-native-guard.js';
import { runNodeHandler } from './worker-node-adapter.js';

async function protectedNode(request,env,handler,options={}){
  try{await requireNativeSession(request,env);return await runNodeHandler(handler,request,options)}
  catch(error){return apiJson({ok:false,error:error instanceof Error?error.message:String(error)},Number(error?.statusCode)||500)}
}

export default {
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/api/cloudflare-health'){
      const database=await databaseHealth(env);
      return apiJson({ok:database.connected,worker:'painel',databaseConfigured:database.configured,databaseConnected:database.connected,customerPortalMode:'cloudflare-native',adminApiMode:'cloudflare-native',bankApiMode:'cloudflare-native',mikrotikApiMode:'cloudflare-native',customerPortalFallback:false,externalApiFallback:false},database.connected?200:503,{'x-provedor-plus-edge':'cloudflare-health'});
    }
    if(path==='/api/customer-portal')return handleCustomerPortal(request,env);
    if(path==='/api/auth')return handleNativeAuth(request,env);
    if(path==='/api/cloud-state')return handleNativeCloudState(request,env);
    if(path==='/api/cloud-data')return handleNativeCloudData(request,env);
    if(path==='/api/bank-proxy')return protectedNode(request,env,bankProxyHandler);
    if(path==='/api/mikrotik-proxy'||path==='/api/mikrotik-proxy-v2')return protectedNode(request,env,mikrotikProxyHandler,{rewritePlatformText:true});
    if(path.startsWith('/api/'))return apiJson({ok:false,error:'Rota de API não encontrada no Worker Cloudflare.'},404,{'x-provedor-plus-edge':'cloudflare-native'});
    return env.ASSETS.fetch(request);
  }
};
