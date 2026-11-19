import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, CheckCircle2, Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { enablePush, pushState, sendTestNotification, type PushState } from '../lib/push'
import { Button, Card } from './ui'

type DeviceState = PushState | 'checking' | 'granted_not_saved'

/** Carte « Notifications » de Mon compte / espace livreur : état réel de CE téléphone + bouton d'activation. */
export default function NotificationSettings({ courier }: { courier?: boolean }) {
  const { session } = useAuth()
  const [st, setSt] = useState<DeviceState>('checking')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    const s = pushState()
    if (s !== 'granted') { setSt(s); return }
    try {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>(r => setTimeout(() => r(null), 4000))])
      const sub = await reg?.pushManager.getSubscription()
      if (!sub || !session) { setSt('granted_not_saved'); return }
      const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('endpoint', sub.endpoint)
      setSt(count ? 'granted' : 'granted_not_saved')
    } catch { setSt('granted_not_saved') }
  }, [session])
  useEffect(() => { check() }, [check])

  async function activate() {
    setErr(null); setMsg(null); setBusy(true)
    try { await enablePush(); setMsg('Notifications activées sur ce téléphone ✓'); await check() }
    catch (e) { setErr((e as Error).message); await check() }
    finally { setBusy(false) }
  }

  const ok = st === 'granted'
  const what = courier
    ? 'nouvelles livraisons disponibles, commande prête à récupérer, livraison annulée'
    : 'étapes de vos commandes, code de livraison, messages de BENDO BIO, promotions'
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${ok ? 'bg-green-100 text-green-700' : st === 'denied' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
          {ok ? <Bell className="h-5 w-5" /> : st === 'denied' ? <BellOff className="h-5 w-5" /> : st === 'ios_needs_install' ? <Smartphone className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Notifications sur ce téléphone</h2>
          <p className="text-sm text-gray-600">
            {st === 'checking' ? 'Vérification…'
              : ok ? <>Activées ✓ — vous êtes prévenu(e) même téléphone verrouillé : {what}.</>
              : st === 'denied' ? 'Bloquées par le téléphone. Ouvrez les réglages du navigateur (🔒 à côté de l\'adresse, ou Paramètres › Notifications › Chrome) et autorisez BENDO BIO, puis revenez ici.'
              : st === 'ios_needs_install' ? 'Sur iPhone : touchez « Partager » puis « Sur l\'écran d\'accueil », ouvrez BENDO BIO depuis la nouvelle icône, puis revenez ici.'
              : st === 'unsupported' ? 'Ce navigateur ne gère pas les notifications. Utilisez Chrome (Android) ou installez l\'application (iPhone).'
              : <>Non activées. Activez-les pour être prévenu(e) : {what}.</>}
          </p>
        </div>
      </div>
      {!ok && st !== 'checking' && st !== 'unsupported' && st !== 'ios_needs_install' && (
        <Button className="w-full" loading={busy} onClick={activate}><Bell className="h-4 w-4" />{st === 'granted_not_saved' ? 'Réactiver les notifications' : 'Activer les notifications'}</Button>
      )}
      {ok && session && (
        <button className="text-xs text-brand-700 underline" onClick={async () => {
          setErr(null); setMsg(null)
          try { await sendTestNotification(); setMsg('Test envoyé : verrouillez le téléphone, il doit sonner dans quelques secondes.') } catch (e) { setErr((e as Error).message) }
        }}>Vérifier avec une notification d'essai</button>
      )}
      {msg && <p className="flex items-center gap-1 text-sm font-medium text-green-700"><CheckCircle2 className="h-4 w-4" />{msg}</p>}
      {err && <p role="alert" className="text-sm text-tomato">{err}</p>}
    </Card>
  )
}
