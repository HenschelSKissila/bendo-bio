import { useState } from 'react'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { enablePush, pushState, sendTestNotification } from '../lib/push'
import { useAuth } from '../lib/auth'
import { Button, ErrorBox } from './ui'

/** Encart « Activer les notifications » (demande l'autorisation au navigateur). */
export default function PushPrompt({ guest, staff, courier, compact }: { guest?: { orderNumber: string; contact: string }; staff?: boolean; courier?: boolean; compact?: boolean }) {
  const [state, setState] = useState(pushState())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [tested, setTested] = useState<string | null>(null)
  const { session } = useAuth()
  async function test() {
    setErr(null); setTested(null)
    try { await sendTestNotification(); setTested('Notification de test envoyée : elle doit apparaître et sonner dans quelques secondes, même si vous fermez l\'application maintenant.') }
    catch (e) { setErr((e as Error).message) }
  }
  async function go() {
    setErr(null); setBusy(true)
    try { await enablePush(guest); setState('granted'); setDone(true) } catch (e) { setErr((e as Error).message); setState(pushState()) } finally { setBusy(false) }
  }
  if (done && guest) return <p className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800"><CheckCircle2 className="h-4 w-4" />Notifications activées : vous serez prévenu(e) de chaque étape de cette commande.</p>
  if (state === 'granted' && !guest) return (
    <div className={`space-y-2 rounded-2xl border border-green-200 bg-green-50 text-sm ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-5 w-5 flex-none text-brand-700" /><span className="flex-1 font-semibold text-green-900">Notifications activées sur cet appareil</span>
        {session && <Button variant="secondary" className="!py-1.5" onClick={test}>🔔 Tester</Button>}
      </div>
      {tested && <p className="text-green-900">{tested}</p>}
      <details className="text-gray-700"><summary className="cursor-pointer text-xs font-semibold text-brand-700">Pas de son ? Réglages du téléphone</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          <li>Android : Paramètres › Notifications › Chrome (ou BENDO BIO) › autoriser le <strong>son</strong> et l'affichage <strong>« pop-up »</strong>.</li>
          <li>Désactivez le mode « Ne pas déranger » et l'économiseur de batterie pour BENDO BIO / Chrome.</li>
          <li>iPhone : ajoutez d'abord le site à l'écran d'accueil, puis Réglages › Notifications › BENDO BIO › Sons.</li>
        </ul>
      </details>
      <ErrorBox>{err}</ErrorBox>
    </div>
  )
  const text = courier
    ? 'Soyez prévenu(e) sur ce téléphone de chaque nouvelle livraison disponible et quand une commande est prête à récupérer, même application fermée.'
    : staff
    ? 'Recevez sur ce téléphone les nouvelles commandes et les alertes de stock, même application fermée.'
    : 'Recevez sur votre téléphone chaque étape de votre commande : préparation, départ, livreur dans votre quartier, livraison, paiement reçu.'
  return (
    <div className={`rounded-2xl border border-brand-200 bg-brand-50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-6 w-6 flex-none text-brand-700" />
        <div className="flex-1 space-y-2">
          <div className="font-semibold text-brand-900">Activer les notifications BENDO BIO</div>
          <p className="text-sm text-gray-700">{text}</p>
          {state === 'denied' ? <p className="text-sm text-tomato">Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (🔒 à côté de l'adresse), puis rechargez la page.</p>
            : <Button onClick={go} loading={busy}>{state === 'granted' ? 'Suivre cette commande sur ce téléphone' : 'Autoriser les notifications'}</Button>}
          <ErrorBox>{err}</ErrorBox>
        </div>
      </div>
    </div>
  )
}
