import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { money, num, today, MOVEMENT_LABEL, daysUntil } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import type { Order, OrderItem, Lot, Product, Movement, Stock } from '../../lib/types'
import { Button, Card, Input, Stat, ErrorBox, Spinner } from '../../components/ui'

interface Stats { revenue: number; orders: number; avg_basket: number; cancelled: number; delivered: number; failed_deliveries: number; stockouts: number
  top_products: { name: string; qty: number; revenue: number }[]; losses: { type: string; qty: number; value: number }[]; daily: { day: string; orders: number; revenue: number }[] }

export default function Reports() {
  const d30 = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10)
  const [from, setFrom] = useState(d30)
  const [to, setTo] = useState(today())
  const [s, setS] = useState<Stats | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { setS(null); rpc<Stats>('dashboard_stats', { p_from: from, p_to: to }).then(setS).catch(e => setErr(errMsg(e))) }, [from, to])
  const range = () => ({ gte: `${from}T00:00:00`, lte: `${to}T23:59:59` })
  const exp = async (name: string, fn: () => Promise<Record<string, unknown>[]>) => {
    setBusy(name); setErr(null)
    try { downloadCsv(name, await fn()) } catch (e) { setErr(errMsg(e)) } finally { setBusy(null) }
  }
  const maxRev = Math.max(1, ...(s?.daily ?? []).map(d => Number(d.revenue)))

  const exports: [string, string, () => Promise<Record<string, unknown>[]>][] = [
    ['commandes', 'Commandes', async () => {
      const { data } = await supabase.from('orders').select('*').gte('created_at', range().gte).lte('created_at', range().lte).order('created_at')
      return ((data as Order[]) ?? []).map(o => ({ numero: o.order_number, date: o.created_at, statut: o.status, mode: o.fulfillment, client: o.guest_name, telephone: o.guest_phone, email: o.guest_email, code_postal: o.address_postal_code, paiement: o.payment_method, statut_paiement: o.payment_status, sous_total: o.subtotal, livraison: o.delivery_fee, tva: o.tax_total, total: o.total, devise: o.currency }))
    }],
    ['lignes-commande', 'Lignes de commande', async () => {
      const { data: os } = await supabase.from('orders').select('id, order_number, created_at, status').gte('created_at', range().gte).lte('created_at', range().lte)
      const map = Object.fromEntries(((os as Order[]) ?? []).map(o => [o.id, o]))
      const ids = Object.keys(map); if (!ids.length) return []
      const { data } = await supabase.from('order_items').select('*').in('order_id', ids.slice(0, 900))
      return ((data as OrderItem[]) ?? []).map(i => ({ commande: map[i.order_id]?.order_number, date: map[i.order_id]?.created_at, statut: map[i.order_id]?.status, sku: i.product_sku, produit: i.product_name, quantite: i.quantity, poids_reel: i.actual_weight, unite: i.unit, prix_unitaire: i.unit_price, tva: i.tax_rate, total_ligne: i.line_total, indisponible: i.unavailable }))
    }],
    ['stock', 'Stock actuel', async () => {
      const [{ data: p }, { data: st }] = await Promise.all([supabase.from('products').select('*').order('name'), supabase.rpc('product_stock')])
      const sm = Object.fromEntries(((st as Stock[]) ?? []).map(x => [x.product_id, x]))
      return ((p as Product[]) ?? []).map(x => ({ sku: x.sku, produit: x.name, unite: x.unit, physique: sm[x.id]?.physical, reserve: sm[x.id]?.reserved, disponible: sm[x.id]?.available, seuil_bas: x.low_threshold, seuil_critique: x.critical_threshold, prix: x.price, statut: x.status }))
    }],
    ['lots-echeance', 'Lots proches de l\'échéance (≤ 7 j)', async () => {
      const lim = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
      const [{ data }, { data: p }] = await Promise.all([supabase.from('lots').select('*').lte('expiry_date', lim).gt('qty_remaining', 0).order('expiry_date'), supabase.from('products').select('id, name, sku')])
      const pm = Object.fromEntries(((p as Product[]) ?? []).map(x => [x.id, x]))
      return ((data as Lot[]) ?? []).map(l => ({ produit: pm[l.product_id]?.name, sku: pm[l.product_id]?.sku, lot: l.lot_number, date_limite: l.expiry_date, type: l.expiry_kind, jours_restants: daysUntil(l.expiry_date), quantite: l.qty_remaining, statut: l.status, fournisseur: l.supplier }))
    }],
    ['mouvements', 'Mouvements de stock', async () => {
      const [{ data }, { data: p }] = await Promise.all([supabase.from('stock_movements').select('*').gte('created_at', range().gte).lte('created_at', range().lte).order('id'), supabase.from('products').select('id, name')])
      const pm = Object.fromEntries(((p as Product[]) ?? []).map(x => [x.id, x.name]))
      return ((data as Movement[]) ?? []).map(m => ({ date: m.created_at, produit: pm[m.product_id], type: MOVEMENT_LABEL[m.type], quantite: m.quantity, motif: m.reason, commande: m.order_id, utilisateur: m.user_id }))
    }],
    ['ventes-par-jour', 'Ventes par jour', async () => (s?.daily ?? []).map(d => ({ jour: d.day, commandes: d.orders, chiffre_affaires: d.revenue }))],
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Rapports</h1>
      <Card className="flex flex-wrap items-end gap-2 !p-3">
        <label className="text-sm">Du <Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-sm">au <Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      </Card>
      <ErrorBox>{err}</ErrorBox>
      {!s ? <Spinner /> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Chiffre d'affaires" value={money(s.revenue)} /><Stat label="Commandes" value={s.orders} />
          <Stat label="Panier moyen" value={money(s.avg_basket)} /><Stat label="Annulées" value={s.cancelled} tone={s.cancelled ? 'warn' : 'gray'} />
          <Stat label="Livrées" value={s.delivered} /><Stat label="Échecs livraison" value={s.failed_deliveries} tone={s.failed_deliveries ? 'danger' : 'gray'} />
          <Stat label="Produits en rupture" value={s.stockouts} tone={s.stockouts ? 'danger' : 'gray'} />
          <Stat label="Pertes (valeur)" value={money(s.losses.reduce((a, l) => a + Number(l.value), 0))} tone="warn" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-bold">Chiffre d'affaires par jour</h2>
            {s.daily.length === 0 ? <p className="text-sm text-gray-500">Aucune vente sur la période.</p> : (
              <div className="flex h-40 items-end gap-1" role="img" aria-label="Histogramme du chiffre d'affaires par jour">
                {s.daily.map(d => <div key={d.day} className="group relative flex-1 rounded-t bg-brand-500 hover:bg-brand-700" style={{ height: `${(Number(d.revenue) / maxRev) * 100}%` }}
                  title={`${new Date(d.day).toLocaleDateString('fr-FR')} : ${money(d.revenue)} (${d.orders} cmd)`} />)}
              </div>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Produits les plus vendus</h2>
            <table className="w-full text-sm"><tbody className="divide-y">
              {s.top_products.map(t => <tr key={t.name}><td className="py-1.5">{t.name}</td><td className="text-right tabular-nums">{num(t.qty)}</td><td className="text-right font-semibold">{money(t.revenue)}</td></tr>)}
            </tbody></table>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Pertes & sorties hors vente</h2>
            {s.losses.length === 0 ? <p className="text-sm text-gray-500">Aucune perte enregistrée 👍</p> : (
              <table className="w-full text-sm"><tbody className="divide-y">
                {s.losses.map(l => <tr key={l.type}><td className="py-1.5">{MOVEMENT_LABEL[l.type as keyof typeof MOVEMENT_LABEL] ?? l.type}</td><td className="text-right">{num(l.qty)}</td><td className="text-right font-semibold">{money(l.value)}</td></tr>)}
              </tbody></table>
            )}
            <p className="mt-2 text-xs text-gray-500">Valeur calculée sur le coût d'achat saisi à la réception.</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Exports CSV (datés)</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {exports.map(([k, l, fn]) => (
                <Button key={k} variant="secondary" loading={busy === k} onClick={() => exp(k, fn)}><Download className="h-4 w-4" />{l}</Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Séparateur « ; », compatible Excel. Les exports respectent les droits de votre rôle.</p>
          </Card>
        </div>
      </>}
    </div>
  )
}
