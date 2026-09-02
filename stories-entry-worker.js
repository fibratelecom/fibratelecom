import baseWorker from './negotiation-worker.js';
import {handleStoriesRequest,isStoriesPath} from './stories-worker.js';
import {handleStoryReactionsRequest,isStoryReactionsPath} from './story-reactions-worker.js';

export default {
  fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(isStoryReactionsPath(path))return handleStoryReactionsRequest(request,env);
    if(isStoriesPath(path))return handleStoriesRequest(request,env);
    return baseWorker.fetch(request,env,ctx);
  },
  scheduled(controller,env,ctx){return baseWorker.scheduled(controller,env,ctx)}
};
