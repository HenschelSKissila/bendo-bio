import { supabase, friendlyError } from './supabase'

// Clé publique VAPID (publique par nature). La clé privée est uniquement dans les secrets Supabase.
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BILaXkHTkdaQQbRsa1H2U3xm0BxCmP7XXpJ2siwwfW59duvLmfzPGnxi-uXAX40cwVLphNk9fXw9j2QB4WWKDa8'

export type PushState = 'unsupported' | 'ios_needs_install' | 'denied' | 'default' | 'granted'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export function pushState(): PushState {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return isIos() && !isStandalone() ? 'ios_needs_install' : 'unsupported'
  }
  return Notification.permission as PushState
}

function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/** Abonnement de ce téléphone avec NOTRE clé (un ancien abonnement fait avec une autre clé est remplacé). */
async function currentSubscription(reg: ServiceWorkerRegistration, create: boolean) {
  let sub = await reg.pushManager.getSubscription()
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  if (sub) {
    const k = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
    if (k && (k.length !== key.length || k.some((v, i) => v !== key[i]))) { await sub.unsubscribe().catch(() => {}); sub = null }
  }
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  return sub
}

/**
 * Demande l'autorisation d'envoyer des notifications sur ce téléphone puis l'enregistre.
 * À appeler depuis un clic (exigence des navigateurs).
 * Client invité : fournir le n° de commande et le téléphone utilisés à la commande.
 */
export async function enablePush(guest?: { orderNumber: string; contact: string }): Promise<void> {
  const st = pushState()
  if (st === 'ios_needs_install') throw new Error('Sur iPhone : touchez « Partager » puis « Sur l\'écran d\'accueil », ouvrez BENDO BIO depuis l\'icône, puis activez les notifications.')
  if (st === 'unsupported') throw new Error('Ce navigateur ne permet pas les notifications. Utilisez Chrome (Android) ou installez l\'application.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications refusées. Autorisez-les dans les réglages du navigateur (icône 🔒 à côté de l\'adresse).')
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, ko) => setTimeout(() => ko(new Error('Application pas encore prête : rechargez la page puis réessayez.')), 10000))])
  const sub = (await currentSubscription(reg, true))!
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_order_number: guest?.orderNumber ?? null, p_contact: guest?.contact ?? null, p_user_agent: navigator.userAgent,
  })
  if (error) throw new Error(friendlyError(error.message))
}

/** Rattache l'abonnement de ce téléphone au compte connecté ; le recrée s'il a expiré (permission déjà donnée). */
export async function relinkPush() {
  try {
    if (pushState() !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const sub = await currentSubscription(reg, true)
    if (!sub) return
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    await supabase.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent })
  } catch (e) { console.warn('[BENDO] abonnement push non enregistré :', e) }
}

/** Envoie une notification de test à ses propres appareils (passe par le serveur, comme une vraie). */
export async function sendTestNotification() {
  const { error } = await supabase.rpc('send_test_notification')
  if (error) throw new Error(friendlyError(error.message))
}

// le service worker a renouvelé l'abonnement : on l'enregistre de nouveau
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'BENDO_PUSH_RESUBSCRIBED') relinkPush() })
}

/** Déconnexion : cet appareil ne reçoit plus les notifications du compte. */
export async function unlinkPush() {
  try {
    if (!('serviceWorker' in navigator)) return
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>(r => setTimeout(() => r(null), 1500))])
    const sub = await reg?.pushManager?.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch { /* silencieux */ }
}

/** Affiche une notification système immédiatement (application ouverte en arrière-plan). */
export async function showLocal(title: string, body: string, url: string) {
  try {
    if (pushState() !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/favicon.png', data: { url } })
  } catch { /* ignore */ }
}
