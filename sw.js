self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text()||'You have a new Legacy Hub notification.'}}
  const title=data.title||'Legacy Hub';
  const options={body:data.body||'You have a new update.',icon:'./legacy-icon-192.png',badge:'./legacy-icon-192.png',tag:data.notificationId||undefined,renotify:true,data:{url:data.url||'./',notificationId:data.notificationId,type:data.type}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const c of clients){if('focus' in c){c.navigate?.(target);return c.focus()}}return self.clients.openWindow?self.clients.openWindow(target):undefined}));
});
