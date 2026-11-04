// Plan B: no web push endpoint. The service worker only handles a push if one ever arrives (plan A parity).
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Grok Bot · now', {body: d.body || '', data: {url: d.url}, icon: 'icons/icon-192.png'}));
});
self.addEventListener('notificationclick', e => { e.notification.close(); if (e.notification.data && e.notification.data.url) e.waitUntil(clients.openWindow(e.notification.data.url)); });
