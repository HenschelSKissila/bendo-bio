import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { money, fmtDateTime, fmtTime, STATUS } from '../../lib/format'
import type { Order, Slot, OrderStatus } from '../../lib/types'
import { Card, Input, Select, StatusBadge, Spinner, Empty } from '../../components/ui'

type Row = Order & { slots: Pick<Slot, 'starts_at' | 'ends_at'> | null }
const GROUPS: Record<string, OrderStatus[]> = {
  active: ['pending_payment', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivery_failed'],
  done: ['delivered'], cancelled: ['cancelled', 'refunded', 'partially_refunded'],
}

export default function Orders() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [group, setGroup] = useState('active')
  const [status, setStatus] = useState('')
  const [ff, setFf] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const load = useCallback(async () => {
    let r = supabase.from('orders').select('*, slots(starts_at, ends_at)').order('created_at', { ascending: false }).limit(300)
    if (status) r = r.eq('status', status); else if (group !== 'all') r = r.in('status', GROUPS[group])
    if (ff) r = r.eq('fulfillment', ff)
    if (from) r = r.gte('created_at', from)
    if (q.trim()) {
      const s = q.trim().replace(/[,()*%\\]/g, ' ').slice(0, 60)
      r = r.or(`order_number.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,guest_email.ilike.%${s}%`)
    }
    const { data } = await r
    setRows((data as Row[]) ?? [])
  }, [group, status, ff, q, from])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useRealtime(['orders'], load)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Commandes</h1>
      <div className="flex gap-2 overflow-x-auto">
        {[['active', 'En cours'], ['done', 'Livrées'], ['cancelled', 'Annulées'], ['all', 'Toutes']].map(([k, l]) => (
          <button key={k} onClick={() => { setGroup(k); setStatus('') }} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${group === k && !status ? 'bg-brand-700 text-white' : 'border bg-white'}`}>{l}</button>
        ))}
      </div>
      <Card className="grid gap-2 !p-3 sm:grid-cols-4">
        <Input type="search" placeholder="N°, nom, téléphone, e-mail" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={status} onChange={e => setStatus(e.target.value)}><option value="">Tous statuts</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select value={ff} onChange={e => setFf(e.target.value)}><option value="">Livraison + retrait</option><option value="delivery">Livraison</option><option value="pickup">Retrait</option></Select>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Depuis le" />
      </Card>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>Aucune commande.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr>
              <th className="p-3">N°</th><th>Client</th><th>Mode</th><th>Créneau</th><th>Statut</th><th>Paiement</th><th className="pr-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y">
              {rows.map(o => (
                <tr key={o.id} className="hover:bg-brand-50/40">
                  <td className="p-3"><Link to={`/admin/commandes/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{o.order_number}</Link><div className="text-xs text-gray-500">{fmtDateTime(o.created_at)}</div></td>
                  <td>{o.guest_name ?? '—'}<div className="text-xs text-gray-500">{o.guest_phone}</div></td>
                  <td>{o.fulfillment === 'delivery' ? `🚚 ${o.address_postal_code ?? ''}` : '🏪 Retrait'}</td>
                  <td>{o.slots ? <>{new Date(o.slots.starts_at).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })}<div className="text-xs text-gray-500">{fmtTime(o.slots.starts_at)}–{fmtTime(o.slots.ends_at)}</div></> : '—'}</td>
                  <td><StatusBadge s={o.status} /></td>
                  <td className="text-xs">{o.payment_status === 'paid' ? '✅ Payé' : o.payment_status === 'failed' ? '❌ Échec' : '⏳ À encaisser'}</td>
                  <td className="pr-3 text-right font-semibold">{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
