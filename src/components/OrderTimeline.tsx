import { CheckCircle2, MapPin, Package, Truck, Wallet, MessageSquare, XCircle, Clock } from 'lucide-react'
import { STATUS, fmtDateTime } from '../lib/format'
import type { OrderStatus } from '../lib/types'

export interface HistEntry { from_status?: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }

function iconFor(h: HistEntry) {
  const n = h.note ?? ''
  if (/quartier/i.test(n)) return MapPin
  if (/Paiement/i.test(n)) return Wallet
  if (/Message/i.test(n)) return MessageSquare
  if (h.from_status === h.to_status) return Clock
  return { delivered: CheckCircle2, out_for_delivery: Truck, preparing: Package, ready: Package, cancelled: XCircle, delivery_failed: XCircle }[h.to_status as string] ?? CheckCircle2
}
function titleFor(h: HistEntry) {
  const n = h.note ?? ''
  if (h.from_status && h.from_status === h.to_status) {
    if (/Livreur dans votre quartier/i.test(n)) return 'Livreur dans votre quartier'
    if (/^Paiement reçu/i.test(n)) return 'Paiement reçu'
    if (/^Message envoyé/i.test(n)) return 'Message de BENDO BIO'
    return 'Mise à jour'
  }
  return STATUS[h.to_status]?.label ?? h.to_status
}

/** Chronologie de la commande vue par le client (date et heure de chaque étape). */
export default function OrderTimeline({ history, receivedBy, deliveredAt }: { history: HistEntry[]; receivedBy?: string | null; deliveredAt?: string | null }) {
  if (!history?.length) return null
  return (
    <div className="space-y-3">
      {deliveredAt && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          ✅ <strong>Livrée le {new Date(deliveredAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à {new Date(deliveredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</strong>
          {receivedBy && <> — remise à : <strong>{receivedBy}</strong></>}
        </div>
      )}
      <ol className="relative space-y-3 border-l-2 border-brand-200 pl-5">
        {history.map((h, i) => { const I = iconFor(h); const note = (h.note ?? '').replace(/^(Livreur dans votre quartier|Message envoyé au client)( — )?/, ''); return (
          <li key={i} className="relative">
            <span className="absolute -left-[1.85rem] top-0 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ring-brand-300"><I className="h-3.5 w-3.5 text-brand-700" /></span>
            <div className="text-sm font-semibold text-gray-900">{titleFor(h)}</div>
            <div className="text-xs text-gray-500">{fmtDateTime(h.created_at)}</div>
            {note && <div className="text-sm text-gray-700">{note}</div>}
          </li>) })}
      </ol>
    </div>
  )
}
