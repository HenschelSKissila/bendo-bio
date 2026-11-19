import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackagePlus, Printer, Download, ScanLine } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { num, UNIT_LABEL, fmtDay, fmtDateTime, daysUntil, MOVEMENT_LABEL, today } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import type { Lot, Product, Movement, Stock as StockT } from '../../lib/types'
import LotActionModal, { type LotAction } from '../../components/LotActions'
import { printLabels, type LabelData } from '../../components/QrLabel'
import { stockTone } from './Products'
import { Button, Card, Field, Input, Select, Textarea, ErrorBox, SuccessBox, Spinner, Badge, Empty } from '../../components/ui'

type Tab = 'lots' | 'reception' | 'inventory' | 'movements'
export const LOT_STATUS: Record<Lot['status'], [string, string]> = {
  active: ['En vente', 'bg-green-100 text-green-800'], blocked: ['Bloqué', 'bg-orange-100 text-orange-800'],
  expired: ['Échu', 'bg-red-100 text-red-800'], depleted: ['Épuisé', 'bg-gray-200 text-gray-600'],
}
export function expiryBadge(l: Lot) {
  const d = daysUntil(l.expiry_date)
  if (d === null) return <span className="text-xs text-gray-400">—</span>
  const cls = d < 0 ? 'bg-red-600 text-white' : d <= 1 ? 'bg-red-100 text-red-800' : d <= 3 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'
  return <Badge cls={cls}>{l.expiry_kind} {fmtDay(l.expiry_date)} · {d < 0 ? `échu (${-d} j)` : d === 0 ? "aujourd'hui" : `J-${d}`}</Badge>
}

export default function Stock() {
  const [tab, setTab] = useState<Tab>('lots')
  const [products, setProducts] = useState<Product[]>([])
  const [lots, setLots] = useState<Lot[] | null>(null)
  const [stock, setStock] = useState<Record<string, StockT>>({})
  const [showEmpty, setShowEmpty] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<{ lot: Lot; action: LotAction } | null>(null)
  const load = useCallback(async () => {
    const [p, l, s] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('lots').select('*').order('expiry_date', { ascending: true, nullsFirst: false }).limit(1000),
      supabase.rpc('product_stock'),
    ])
    setProducts((p.data as Product[]) ?? []); setLots((l.data as Lot[]) ?? [])
    setStock(Object.fromEntries(((s.data as StockT[]) ?? []).map(x => [x.product_id, x])))
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime(['lots', 'orders'], load)
  const pmap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products])
  const visible = (lots ?? []).filter(l => (showEmpty || l.status !== 'depleted')
    && (!q || `${pmap[l.product_id]?.name} ${l.lot_number} ${l.supplier ?? ''}`.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-brand-900">Stock & lots</h1>
        <Link to="/admin/scanner" className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white"><ScanLine className="h-4 w-4" />Scanner</Link>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {([['lots', 'Lots en stock'], ['reception', '+ Réception'], ['inventory', 'Inventaire'], ['movements', 'Mouvements']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-brand-700 text-white' : 'border bg-white'}`}>{l}</button>
        ))}
      </div>

      {tab === 'lots' && (!lots ? <Spinner /> : <>
        <Card className="flex flex-wrap items-center gap-2 !p-3">
          <Input type="search" placeholder="Produit, n° de lot, fournisseur" value={q} onChange={e => setQ(e.target.value)} className="!w-auto flex-1" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />Afficher les lots épuisés</label>
          <Button variant="secondary" onClick={() => printLabels(visible.filter(l => l.status === 'active').map(l => ({ id: l.id, product: pmap[l.product_id]?.name ?? '', lot: l.lot_number, expiry: l.expiry_date ? fmtDay(l.expiry_date) : null, kind: l.expiry_kind, received: fmtDay(l.received_at) })))}>
            <Printer className="h-4 w-4" />Étiquettes QR
          </Button>
          <Button variant="secondary" onClick={() => downloadCsv('stock-lots', visible.map(l => ({ produit: pmap[l.product_id]?.name, sku: pmap[l.product_id]?.sku, lot: l.lot_number, fournisseur: l.supplier, recu_le: l.received_at, qte_initiale: l.qty_initial, qte_restante: l.qty_remaining, unite: pmap[l.product_id]?.unit, date_limite: l.expiry_date, type: l.expiry_kind, jours_restants: daysUntil(l.expiry_date), statut: l.status, cout_unitaire: l.unit_cost })))}>
            <Download className="h-4 w-4" />CSV
          </Button>
        </Card>
        {visible.length === 0 ? <Empty>Aucun lot. Enregistrez une réception pour commencer.</Empty> : (
          <Card className="overflow-x-auto !p-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Produit</th><th>Lot</th><th>Restant</th><th>Date limite (FEFO)</th><th>Statut</th><th>Dispo produit</th><th className="pr-3">Actions</th></tr></thead>
              <tbody className="divide-y">
                {visible.map(l => { const p = pmap[l.product_id]; return (
                  <tr key={l.id}>
                    <td className="p-3 font-semibold">{p?.name}<div className="text-xs font-normal text-gray-500">{l.supplier ?? '—'} · reçu {fmtDay(l.received_at)}</div></td>
                    <td className="font-mono text-xs">{l.lot_number}</td>
                    <td className="tabular-nums">{num(l.qty_remaining)} / {num(l.qty_initial)} {p && UNIT_LABEL[p.unit]}</td>
                    <td>{expiryBadge(l)}</td>
                    <td><Badge cls={LOT_STATUS[l.status][1]}>{LOT_STATUS[l.status][0]}</Badge></td>
                    <td>{p && <Badge cls={stockTone(p, stock[p.id])}>{num(stock[p.id]?.available)}</Badge>}</td>
                    <td className="pr-3">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {l.qty_remaining > 0 && <button className="rounded-lg bg-red-50 px-2 py-1 font-semibold text-red-700" onClick={() => setSel({ lot: l, action: 'adjust' })}>Sortie</button>}
                        <button className="rounded-lg bg-gray-100 px-2 py-1 font-semibold" onClick={() => setSel({ lot: l, action: 'inventory' })}>Compter</button>
                        {l.status === 'active' && <button className="rounded-lg bg-orange-50 px-2 py-1 font-semibold text-orange-700" onClick={() => setSel({ lot: l, action: 'block' })}>Bloquer</button>}
                        {l.status === 'blocked' && <button className="rounded-lg bg-green-50 px-2 py-1 font-semibold text-green-700" onClick={() => setSel({ lot: l, action: 'unblock' })}>Débloquer</button>}
                        <button className="rounded-lg bg-gray-100 px-2 py-1" onClick={() => setSel({ lot: l, action: 'edit' })}>Modifier</button>
                        <button className="rounded-lg bg-gray-100 px-2 py-1" onClick={() => setSel({ lot: l, action: 'trace' })}>Traçabilité</button>
                        <button className="rounded-lg bg-gray-100 px-2 py-1" aria-label="Imprimer l'étiquette" onClick={() => printLabels([{ id: l.id, product: p?.name ?? '', lot: l.lot_number, expiry: l.expiry_date ? fmtDay(l.expiry_date) : null, kind: l.expiry_kind, received: fmtDay(l.received_at) }])}>QR</button>
                      </div>
                    </td>
                  </tr>) })}
              </tbody>
            </table>
          </Card>
        )}
      </>)}

      {tab === 'reception' && <Reception products={products} onDone={load} />}
      {tab === 'inventory' && <Inventory products={products} lots={lots ?? []} onDone={load} />}
      {tab === 'movements' && <Movements products={products} lots={lots ?? []} />}

      <LotActionModal lot={sel?.lot ?? null} action={sel?.action ?? null} product={sel ? pmap[sel.lot.product_id] : undefined} onClose={() => setSel(null)} onDone={load} />
    </div>
  )
}

export function Reception({ products, onDone, presetProduct }: { products: Product[]; onDone: () => void; presetProduct?: string }) {
  const empty = { product: presetProduct ?? '', qty: '', lot: '', expiry: '', kind: 'DLC', supplier: '', cost: '', received: today(), notes: '' }
  const [f, setF] = useState(empty)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastLabel, setLastLabel] = useState<LabelData | null>(null)
  const p = products.find(x => x.id === f.product)
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setOk(null); setLastLabel(null); setBusy(true)
    try {
      const id = await rpc<string>('receive_stock', { p_product: f.product, p_qty: parseFloat(f.qty), p_lot_number: f.lot || null, p_expiry: f.expiry || null,
        p_expiry_kind: f.kind, p_supplier: f.supplier || null, p_unit_cost: f.cost ? parseFloat(f.cost) : null, p_received: f.received || null, p_notes: f.notes || null })
      const { data: lot } = await supabase.from('lots').select('*').eq('id', id).single()
      setOk(`Réception enregistrée : ${f.qty} ${p ? UNIT_LABEL[p.unit] : ''} de ${p?.name} (lot ${(lot as Lot)?.lot_number}). Stock et alertes mis à jour.`)
      if (lot) setLastLabel({ id, product: p?.name ?? '', lot: (lot as Lot).lot_number, expiry: f.expiry ? fmtDay(f.expiry) : null, kind: f.kind, qty: `${f.qty} ${p ? UNIT_LABEL[p.unit] : ''}`, received: fmtDay(f.received) })
      setF({ ...empty, supplier: f.supplier, received: f.received }); onDone()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><PackagePlus className="h-5 w-5" />Entrée de stock (nouveau lot)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Produit" required><Select required value={f.product} onChange={e => setF({ ...f, product: e.target.value })}><option value="">— choisir —</option>{products.map(x => <option key={x.id} value={x.id}>{x.name}{x.packaging ? ` (${x.packaging})` : ''}</option>)}</Select></Field>
          <Field label={`Quantité reçue${p ? ` (${UNIT_LABEL[p.unit]})` : ''}`} required><Input required type="number" step="0.001" min="0.001" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></Field>
          <Field label="Date de réception"><Input type="date" value={f.received} onChange={e => setF({ ...f, received: e.target.value })} /></Field>
          <Field label="Date limite" hint="Pour les produits frais : DLC. Laisser vide si non applicable."><Input type="date" value={f.expiry} onChange={e => setF({ ...f, expiry: e.target.value })} /></Field>
          <Field label="Type de date"><Select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="DLC">DLC (à consommer jusqu'au)</option><option value="DDM">DDM (de préférence avant)</option></Select></Field>
          <Field label="N° de lot" hint="Vide = généré automatiquement"><Input value={f.lot} onChange={e => setF({ ...f, lot: e.target.value })} /></Field>
          <Field label="Fournisseur"><Input value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} /></Field>
          <Field label="Coût unitaire (achat)"><Input type="number" step="0.01" min="0" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></Field>
          <Field label="Notes (température, état…)"><Textarea rows={1} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
        {lastLabel && <Button type="button" variant="secondary" onClick={() => printLabels([lastLabel])}><Printer className="h-4 w-4" />Imprimer l'étiquette QR de ce lot</Button>}
        <Button type="submit" loading={busy}>Valider l'entrée</Button>
      </form>
    </Card>
  )
}

function Inventory({ products, lots, onDone }: { products: Product[]; lots: Lot[]; onDone: () => void }) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const active = lots.filter(l => l.status !== 'depleted')
  const pmap = Object.fromEntries(products.map(p => [p.id, p]))
  const changed = Object.entries(counts).filter(([id, v]) => v !== '' && parseFloat(v) !== Number(active.find(l => l.id === id)?.qty_remaining))
  async function validate() {
    setErr(null); setOk(null); setBusy(true)
    try {
      for (const [id, v] of changed) await rpc('inventory_count', { p_lot: id, p_counted: parseFloat(v), p_reason: `Inventaire du ${new Date().toLocaleDateString('fr-FR')}` })
      setOk(`${changed.length} écart(s) enregistré(s).`); setCounts({}); onDone()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">Feuille d'inventaire</h2>
      <p className="text-sm text-gray-600">Saisissez la quantité réellement comptée pour chaque lot. Seuls les écarts sont enregistrés (mouvement « Inventaire » tracé).</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Produit / lot</th><th>Théorique</th><th>Compté</th><th>Écart</th></tr></thead>
          <tbody className="divide-y">
            {active.map(l => { const v = counts[l.id] ?? ''; const d = v === '' ? null : parseFloat(v) - Number(l.qty_remaining); return (
              <tr key={l.id}>
                <td className="py-2">{pmap[l.product_id]?.name}<div className="font-mono text-xs text-gray-500">{l.lot_number}</div></td>
                <td className="tabular-nums">{num(l.qty_remaining)} {pmap[l.product_id] && UNIT_LABEL[pmap[l.product_id].unit]}</td>
                <td><Input type="number" step="0.001" min="0" className="!w-28" value={v} onChange={e => setCounts({ ...counts, [l.id]: e.target.value })} /></td>
                <td className={`font-semibold tabular-nums ${d && d < 0 ? 'text-tomato' : 'text-brand-700'}`}>{d === null || d === 0 ? '' : num(d)}</td>
              </tr>) })}
          </tbody>
        </table>
      </div>
      <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
      <Button loading={busy} disabled={!changed.length} onClick={validate}>Valider {changed.length} écart(s)</Button>
    </Card>
  )
}

function Movements({ products, lots }: { products: Product[]; lots: Lot[] }) {
  const [rows, setRows] = useState<Movement[] | null>(null)
  const [prod, setProd] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const load = useCallback(async () => {
    let r = supabase.from('stock_movements').select('*').order('id', { ascending: false }).limit(500)
    if (prod) r = r.eq('product_id', prod); if (type) r = r.eq('type', type); if (from) r = r.gte('created_at', from)
    const { data } = await r; setRows((data as Movement[]) ?? [])
  }, [prod, type, from])
  useEffect(() => { load() }, [load])
  useRealtime(['stock_movements'], load)
  const pmap = Object.fromEntries(products.map(p => [p.id, p]))
  const lmap = Object.fromEntries(lots.map(l => [l.id, l]))
  const exportRows = () => (rows ?? []).map(m => ({ date: m.created_at, produit: pmap[m.product_id]?.name, lot: m.lot_id ? lmap[m.lot_id]?.lot_number : '', type: MOVEMENT_LABEL[m.type], quantite: m.quantity, motif: m.reason, commande: m.order_id, utilisateur: m.user_id }))
  return (
    <div className="space-y-3">
      <Card className="grid gap-2 !p-3 sm:grid-cols-4">
        <Select value={prod} onChange={e => setProd(e.target.value)}><option value="">Tous produits</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={type} onChange={e => setType(e.target.value)}><option value="">Tous types</option>{Object.entries(MOVEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Depuis" />
        <Button variant="secondary" onClick={() => downloadCsv('mouvements', exportRows())}><Download className="h-4 w-4" />CSV</Button>
      </Card>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>Aucun mouvement.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Date</th><th>Produit</th><th>Lot</th><th>Type</th><th>Quantité</th><th>Motif</th></tr></thead>
            <tbody className="divide-y">
              {rows.map(m => (
                <tr key={m.id}>
                  <td className="p-3 text-xs">{fmtDateTime(m.created_at)}</td>
                  <td>{pmap[m.product_id]?.name}</td>
                  <td className="font-mono text-xs">{m.lot_id ? lmap[m.lot_id]?.lot_number : '—'}</td>
                  <td>{MOVEMENT_LABEL[m.type]}</td>
                  <td className={`font-semibold tabular-nums ${m.quantity < 0 ? 'text-tomato' : 'text-brand-700'}`}>{m.quantity > 0 ? '+' : ''}{num(m.quantity)}</td>
                  <td className="text-xs text-gray-600">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-gray-500">Le journal des mouvements est immuable : il ne peut être ni modifié ni supprimé.</p>
    </div>
  )
}
