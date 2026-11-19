import { useState } from 'react'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { enablePush, pushState } from '../lib/push'
import { Button, ErrorBox } from './ui'

/** Encart « Activer les notifications » (demande l'autorisation au navigateur). */
export default function PushPrompt({ guest, staff, courier, compact }: { guest?: { orderNumber: string; contact: string }; staff?: boolean; courier?: boolean; compact?: boolean }) {
  const [state, setState] = useState(pushState())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go() {
    setErr(null); setBusy(true)
    try { await enablePush(guest); setState('granted') } catch (e) { setErr((e as Error).message); setState(pushState()) } finally { setBusy(false) }
  }
  if (state === 'granted' && !guest) return compact ? null : (
    <p className="flex items-center gap-2 text-sm text-brand-700"><CheckCircle2 className="h-4 w-4" />Notifications activées sur cet appareil.</p>
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
