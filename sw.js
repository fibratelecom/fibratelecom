const CACHE_VERSION='provedor-plus-pwa-20261006-payments1';

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('provedor-plus-pwa-')&&key!==CACHE_VERSION).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',()=>{});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json?.()||{}}catch{try{data={body:event.data?.text?.()||''}}catch{}}
  const title=String(data?.title||'Provedor Plus');
  const url=String(data?.data?.url||'/central');
  event.waitUntil(self.registration.showNotification(title,{
    body:String(data?.body||''),
    icon:data?.icon||'/app-icon-192.png?v=20261006-payments1',
    badge:data?.badge||'/app-icon-192.png?v=20261006-payments1',
    tag:String(data?.tag||'provedor-plus'),
    lang:data?.lang||'pt-BR',
    data:{url},
    vibrate:[120,60,120],
    renotify:true
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(String(event.notification?.data?.url||'/central'),self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    const current=windows.find(client=>client.url.startsWith(self.location.origin));
    if(current){try{await current.navigate(target)}catch{}return current.focus()}
    return self.clients.openWindow(target);
  }));
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
