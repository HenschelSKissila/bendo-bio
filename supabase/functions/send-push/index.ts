// BENDO BIO — Envoi des notifications push sur les téléphones (Supabase Edge Function « send-push »)
// Appelée automatiquement par la base à chaque notification (trigger notifications_push, script 007).
// Secrets à définir dans Supabase > Edge Functions > Secrets :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WEBHOOK_SECRET
// (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.)
// Réglage de la fonction : « Verify JWT » DÉSACTIVÉ (l'appel est authentifié par PUSH_WEBHOOK_SECRET).
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.46.1'

interface Rec { id: number; event: string; channel: 'app' | 'dashboard'; user_id: string | null; order_id: string | null; subject: string | null; body: string | null }
interface Sub { id: number; endpoint: string; p256dh: string; auth: string }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST uniquement', { status: 405 })
  if (req.headers.get('x-bendo-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) return new Response('Non autorisé', { status: 401 })

  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return new Response('Clés VAPID manquantes', { status: 500 })
  webpush.setVapidDetails('mailto:bendobio@gmail.com', pub, priv)

  const { record } = await req.json() as { record: Rec }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Destinataires : le client (compte ou invité abonné à sa commande) ou toute l'équipe
  let subs: Sub[] = []
  let url = '/compte'
  if (record.channel === 'dashboard') {
    const { data: staff } = await db.from('profiles').select('id').in('role', ['employee', 'admin']).eq('active', true)
    const ids = (staff ?? []).map((s: { id: string }) => s.id)
    if (ids.length) subs = ((await db.from('push_subscriptions').select('*').in('user_id', ids)).data ?? []) as Sub[]
    url = record.order_id ? `/admin/commandes/${record.order_id}` : '/admin/alertes'
  } else if (record.user_id) {
    // destinataire précis (client inscrit, livreur, compte validé…) : uniquement ses appareils
    subs = ((await db.from('push_subscriptions').select('*').eq('user_id', record.user_id)).data ?? []) as Sub[]
    url = record.event.startsWith('courier_') ? '/livreur' : record.event === 'role_changed' ? '/compte' : '/notifications'
  } else if (record.order_id) {
    // client invité : appareils abonnés à sa commande
    subs = ((await db.from('push_subscriptions').select('*').eq('order_id', record.order_id).is('user_id', null)).data ?? []) as Sub[]
    const { data: o } = await db.from('orders').select('order_number').eq('id', record.order_id).maybeSingle()
    url = `/suivi?n=${o?.order_number ?? ''}`
  }
  // urgente = reste affichée jusqu'à ouverture (nouvelle livraison pour un livreur, commande/message pour l'équipe, code de livraison)
  const urgent = record.event.startsWith('courier_') || ['new_order', 'customer_message', 'status_out_for_delivery', 'nearby', 'role_request'].includes(record.event)
    || (record.channel === 'dashboard' && /critique|Échec|bloqué/i.test(`${record.subject} ${record.body}`))
  const payload = JSON.stringify({ title: record.subject ?? 'BENDO BIO', body: record.body ?? '', url, tag: `${record.order_id ?? record.event}-${record.id}`, urgent })
  let sent = 0, removed = 0
  const seen = new Set<string>()
  for (const s of subs) {
    if (seen.has(s.endpoint)) continue
    seen.add(s.endpoint)
    try {
      // urgency « high » : réveille le téléphone même en économie d'énergie (comme une messagerie) ; conservée 24 h si le téléphone est éteint
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) { await db.from('push_subscriptions').delete().eq('id', s.id); removed++ } // téléphone désabonné
      else console.error('push échoué', code, String(e))
    }
  }
  return Response.json({ sent, removed })
})
