import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { rpc, errMsg } from '../../lib/supabase'
import { money, fmtSlot, fmtDateTime, UNIT_LABEL } from '../../lib/format'
import type { OrderStatus, Unit } from '../../lib/types'
import { Button, Card, Field, Input, ErrorBox, StatusBadge } from '../../components/ui'
import OrderTimeline, { type HistEntry } from '../../components/OrderTimeline'
import PushPrompt from '../../components/PushPrompt'
import DeliveryCodeBox from '../../components/DeliveryCodeBox'

interface Tracked {
  order_number: string; status: OrderStatus; fulfillment: string; total: number; created_at: string
  slot_start: string; slot_end: string; payment_status: string
  delivered_at: string | null; received_by: string | null; history: HistEntry[] | null
  items: { name: string; quantity: number; unit: Unit; line_total: number; unavailable: boolean }[]
}
const STEPS: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']

export default function Track() {
  const [sp] = useSearchParams()
  const [n, setN] = useState(sp.get('n') ?? '')
  const [c, setC] = useState('')
  const [o, setO] = useState<Tracked | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const r = await rpc<Tracked | null>('track_order', { p_number: n, p_contact: c })
      if (!r) setErr('Aucune commande trouvée avec ces informations.'); setO(r)
      setCode(r?.status === 'out_for_delivery' ? await rpc<string | null>('track_delivery_code', { p_number: n, p_contact: c }) : null)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const steps = STEPS.filter(s => o?.fulfillment === 'delivery' || s !== 'out_for_delivery')
  const idx = o ? steps.indexOf(o.status) : -1
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Suivre une commande</h1>
      <Card>
        <form onSubmit={go} className="space-y-3">
          <Field label="Numéro de commande" required><Input value={n} onChange={e => setN(e.target.value)} placeholder="BB-261119-XXXXXX" /></Field>
          <Field label="Téléphone ou e-mail utilisé pour la commande" required><Input value={c} onChange={e => setC(e.target.value)} /></Field>
          <ErrorBox>{err}</ErrorBox>
          <Button type="submit" loading={busy} disabled={!n || c.length < 4}>Rechercher</Button>
        </form>
      </Card>
      {o && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><span className="font-mono font-bold">{o.order_number}</span><StatusBadge s={o.status} /></div>
          {code && <DeliveryCodeBox code={code} />}
          <p className="text-sm text-gray-600">Passée le {fmtDateTime(o.created_at)} · Créneau : <strong>{fmtSlot({ starts_at: o.slot_start, ends_at: o.slot_end })}</strong></p>
          {idx >= 0 && (
            <ol className="flex gap-1">
              {steps.map((s, i) => <li key={s} className={`h-2 flex-1 rounded-full ${i <= idx ? 'bg-brand-600' : 'bg-gray-200'}`} title={s} />)}
            </ol>
          )}
          <ul className="divide-y text-sm">
            {o.items?.map((it, i) => (
              <li key={i} className={`flex justify-between py-1.5 ${it.unavailable ? 'text-gray-400 line-through' : ''}`}>
                <span>{it.name} × {Number(it.quantity).toLocaleString('fr-FR')} {UNIT_LABEL[it.unit]}</span><span>{money(it.line_total)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span>{money(o.total)}</span></div>
          <div className="text-sm">{o.payment_status === 'paid' ? '✅ Paiement reçu' : '⏳ Paiement à la remise'}</div>
          <OrderTimeline history={o.history ?? []} deliveredAt={o.delivered_at} receivedBy={o.received_by} />
          {!['delivered', 'cancelled', 'refunded'].includes(o.status) && <PushPrompt guest={{ orderNumber: o.order_number, contact: c }} />}
        </Card>
      )}
    </div>
  )
}
