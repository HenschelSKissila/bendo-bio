// Test : notifications push reçues application FERMÉE (Chromium complet + site local sur le port 4173).
// Lancer : npx vite preview --port 4173 puis node supabase/tests/push_app_fermee.cjs
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chromium' }); const ctx = await b.newContext()
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:4173' })
  await ctx.route('**/*supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  // 1. le client ouvre l'application une première fois (installation du service worker)
  const app = await ctx.newPage(); await app.goto('http://localhost:4173/'); await app.waitForTimeout(3000)
  const cdp = await ctx.newCDPSession(app); const regs = []
  cdp.on('ServiceWorker.workerRegistrationUpdated', e => regs.push(...e.registrations))
  await cdp.send('ServiceWorker.enable'); await app.waitForTimeout(800)
  const reg = regs.find(r => r.scopeURL.startsWith('http://localhost:4173'))
  console.log('service worker installé :', !!reg)
  // 2. l'application est FERMÉE (on garde seulement un onglet vide sur un autre site)
  const other = await ctx.newPage(); await other.goto('about:blank'); await app.close()
  const cdp2 = await ctx.newCDPSession(other); await cdp2.send('ServiceWorker.enable')
  // 3. trois notifications arrivent par le réseau push (comme envoyées par Google/Apple)
  const send = d => cdp2.send('ServiceWorker.deliverPushMessage', { origin: 'http://localhost:4173', registrationId: reg.registrationId, data: JSON.stringify(d) })
  await send({ title: '🔔 Commande BB-261119-7EE213 prête', body: 'Vous pouvez venir la récupérer à Ngoyo centrale.', url: '/livreur', tag: 'a-1', urgent: true })
  await send({ title: 'Commande BB-261119-7EE213 : en cours de livraison', body: '🔐 Votre CODE DE LIVRAISON : 8MRCB3…', url: '/notifications', tag: 'b-2', urgent: true })
  await send({ title: '📣 Promo poulets', body: 'Poulets bicyclette -10 %', url: '/messages?onglet=promos', tag: 'c-3', urgent: false })
  await other.waitForTimeout(1500)
  // 4. on lit ce que le téléphone affiche
  const view = await ctx.newPage(); await view.goto('http://localhost:4173/'); await view.waitForTimeout(1500)
  const shown = await view.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ titre: n.title, corps: n.body.slice(0, 50), urgente_reste_affichee: n.requireInteraction, silencieuse: n.silent, vibration: n.vibrate?.join('-'), ouvre: n.data?.url })))
  console.log('notifications affichées alors que l\'application était fermée :', shown.length); console.table(shown)
  await b.close()
})()
