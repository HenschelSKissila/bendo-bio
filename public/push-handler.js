/* BENDO BIO — réception des notifications push (service worker de la PWA).
   Affichée même si l'application est en arrière-plan ou fermée ; le téléphone sonne et vibre
   selon ses réglages de notification (comme Gmail / WhatsApp). */
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (e) { d = { body: event.data && event.data.text() } }
  const urgent = !!d.urgent
  event.waitUntil(self.registration.showNotification(d.title || 'BENDO BIO', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/favicon.png',
    image: d.image || undefined,
    tag: d.tag || undefined,
    renotify: true,                      // sonne à nouveau même si la notification remplace la précédente
    silent: false,                       // son du téléphone
    requireInteraction: urgent,          // urgente : reste affichée jusqu'à ce qu'on la touche
    vibrate: urgent ? [300, 120, 300, 120, 500] : [200, 100, 200],
    timestamp: Date.now(),
    data: { url: d.url || '/' },
    actions: [{ action: 'open', title: 'Ouvrir' }],
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return }
    }
    await self.clients.openWindow(url)
  })())
})

/* Abonnement expiré ou renouvelé par le navigateur : on se réabonne avec la même clé et on prévient
   l'application, qui enregistrera le nouvel abonnement à la prochaine ouverture. */
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey
  if (!key) return
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    .then(() => self.clients.matchAll({ includeUncontrolled: true }))
    .then((cs) => cs.forEach((c) => c.postMessage({ type: 'BENDO_PUSH_RESUBSCRIBED' })))
    .catch(() => {}))
})
