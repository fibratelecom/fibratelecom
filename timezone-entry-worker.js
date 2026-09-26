import './timezone-runtime.js';

let workerPromise;
function worker(){
  if(!workerPromise)workerPromise=import('./notification-center-entry-worker.js').then(module=>module.default);
  return workerPromise;
}

export default {
  async fetch(request,env,ctx){
    const target=await worker();
    if(typeof target==='function')return target(request,env,ctx);
    return target.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    const target=await worker();
    if(typeof target?.scheduled==='function')return target.scheduled(controller,env,ctx);
  }
};
