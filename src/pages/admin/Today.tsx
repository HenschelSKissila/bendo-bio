import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ClipboardList, Truck, Euro, Clock } from 'lucide-react'
import { supabase, rpc } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { money, fmtTime, today } from '../../lib/format'
import type { Order, Slot, Alert } from '../../lib/types'
import { Card, Stat, StatusBadge, Spinner, Empty, Badge } from '../../components/ui'

type OrderRow = Order & { slots: Pick<Slot, 'starts_at' | 'ends_at'> | null }
export const ALERT_CLS = { info: 'bg-blue-100 text-blue-800', warning: 'bg-orange-100 text-orange-800', critical: 'bg-red-100 text-red-800' }
export const ALERT_ICON = { info: 'ℹ️', warning: '⚠️', critical: '⛔' }

export default function Today() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<{ revenue: number; orders: number; avg_basket: number; cancelled: number } | null>(null)
  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 2)
    const [o, a, s] = await Promise.all([
      supabase.from('orders').select('*, slots(starts_at, ends_at)')
        .in('status', ['pending_payment', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivery_failed'])
        .order('created_at', { ascending: true }).limit(200),
      supabase.from('alerts').select('*').eq('status', 'open').order('level', { ascending: false }).order('created_at', { ascending: false }).limit(30),
      rpc<{ revenue: number; orders: number; avg_basket: number; cancelled: number }>('dashboard_stats', { p_from: today(), p_to: today() }).catch(() => null),
    ])
    setOrders((o.data as OrderRow[]) ?? []); setAlerts((a.data as Alert[]) ?? []); setStats(s)
    void end
  }, [])
  useEffect(() => { rpc('run_maintenance').catch(() => {}).finally(load) }, [load])
  useRealtime(['orders', 'alerts'], load)

  if (!orders) return <Spinner />
  const now = new Date()
  const isToday = (d?: string) => d && new Date(d).toDateString() === now.toDateString()
  const toPrepare = orders.filter(o => ['confirmed', 'preparing'].includes(o.status))
  const todaySlots = orders.filter(o => isToday(o.slots?.starts_at)).sort((a, b) => (a.slots?.starts_at ?? '').localeCompare(b.slots?.starts_at ?? ''))
  const late = orders.filter(o => o.slots && new Date(o.slots.ends_at) < now && o.status !== 'delivery_failed')

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-900">Aujourd'hui <span className="text-base font-normal text-gray-500">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="À préparer" value={toPrepare.length} icon={<ClipboardList className="h-4 w-4" />} />
        <Stat label="Créneaux du jour" value={todaySlots.length} icon={<Truck className="h-4 w-4" />} />
        <Stat label="En retard" value={late.length} tone={late.length ? 'danger' : 'gray'} icon={<Clock className="h-4 w-4" />} />
        <Stat label="CA du jour" value={money(stats?.revenue ?? 0)} icon={<Euro className="h-4 w-4" />} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-2 font-bold">Livraisons & retraits du jour</h2>
            {todaySlots.length === 0 ? <Empty>Aucun créneau aujourd'hui.</Empty> : <OrderList list={todaySlots} />}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Commandes à préparer</h2>
            {toPrepare.length === 0 ? <Empty>Rien à préparer 🎉</Empty> : <OrderList list={toPrepare.sort((a, b) => (a.slots?.starts_at ?? '').localeCompare(b.slots?.starts_at ?? ''))} />}
          </Card>
          {late.length > 0 && <Card className="border-red-200"><h2 className="mb-2 font-bold text-tomato">En retard</h2><OrderList list={late} /></Card>}
        </div>
        <Card className="h-fit">
          <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 text-carrot" />Alertes</h2><Link to="/admin/alertes" className="text-sm text-brand-700">Tout voir</Link></div>
          {alerts.length === 0 ? <Empty>Aucune alerte ouverte.</Empty> : (
            <ul className="space-y-2">
              {alerts.map(a => (
                <li key={a.id} className="rounded-xl border border-gray-100 p-2 text-sm">
                  <Badge cls={ALERT_CLS[a.level]}>{ALERT_ICON[a.level]} {a.level === 'critical' ? 'Critique' : a.level === 'warning' ? 'Attention' : 'Info'}</Badge>
                  <div className="mt-1">{a.message}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function OrderList({ list }: { list: OrderRow[] }) {
  return (
    <ul className="divide-y">
      {list.map(o => (
        <li key={o.id}>
          <Link to={`/admin/commandes/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-gray-50">
            <span className="w-24 font-semibold tabular-nums">{o.slots ? `${fmtTime(o.slots.starts_at)}–${fmtTime(o.slots.ends_at)}` : '—'}</span>
            <span className="font-mono text-xs">{o.order_number}</span>
            <span className="flex-1 truncate">{o.guest_name ?? 'Client'} · {o.fulfillment === 'delivery' ? `🚚 ${o.address_city ?? ''}` : '🏪 Retrait'}</span>
            <StatusBadge s={o.status} /><span className="font-semibold">{money(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
