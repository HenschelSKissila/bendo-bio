import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Printer, Phone } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { money, fmtDateTime, fmtSlot, fmtTime, STATUS, PAYMENT_LABEL, UNIT_LABEL, num } from '../../lib/format'
import type { Order, OrderItem, Slot, OrderStatus } from '../../lib/types'
import { Button, Card, Field, Input, Textarea, Select, Modal, ErrorBox, StatusBadge, Spinner, Badge } from '../../components/ui'

interface Hist { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }
interface Alloc { order_item_id: string; quantity: number; lots: { lot_number: string; expiry_date: string | null } }

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; variant?: 'primary' | 'warning' | 'danger' | 'secondary' }[]>> = {
  confirmed: [{ to: 'preparing', label: 'Commencer la préparation' }],
  preparing: [{ to: 'ready', label: 'Marquer prête' }, { to: 'out_for_delivery', label: 'Partie en livraison' }],
  ready: [{ to: 'delivered', label: 'Remise au client' }, { to: 'out_for_delivery', label: 'Partie en livraison' }],
  out_for_delivery: [{ to: 'delivered', label: 'Livrée' }, { to: 'delivery_failed', label: 'Échec de livraison', variant: 'warning' }],
  delivery_failed: [{ to: 'out_for_delivery', label: 'Nouvelle tentative' }, { to: 'ready', label: 'Retour au point de retrait', variant: 'secondary' }],
  delivered: [{ to: 'partially_refunded', label: 'Remboursement partiel', variant: 'secondary' }, { to: 'refunded', label: 'Rembourser', variant: 'secondary' }],
  cancelled: [{ to: 'refunded', label: 'Enregistrer le remboursement', variant: 'secondary' }],
}
const CANCELLABLE: OrderStatus[] = ['pending_payment', 'confirmed', 'preparing', 'ready', 'delivery_failed']

export default function OrderDetail() {
  const { id } = useParams()
  const [o, setO] = useState<Order | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [hist, setHist] = useState<Hist[]>([])
  const [alloc, setAlloc] = useState<Alloc[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<null | { to: OrderStatus; label: string }>(null)
  const [note, setNote] = useState('')
  const [restock, setRestock] = useState<'yes' | 'no' | ''>('')
  const [missing, setMissing] = useState<OrderItem | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const [internal, setInternal] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('orders').select('*').eq('id', id).maybeSingle()
    const ord = data as Order | null; setO(ord); setInternal(ord?.internal_note ?? '')
    if (!ord) return
    const [it, h, s] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', ord.id).order('product_name'),
      supabase.from('order_status_history').select('*').eq('order_id', ord.id).order('created_at', { ascending: false }),
      ord.slot_id ? supabase.from('slots').select('*').eq('id', ord.slot_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const its = (it.data as OrderItem[]) ?? []
    setItems(its); setHist((h.data as Hist[]) ?? []); setSlot((s.data as Slot) ?? null)
    if (its.length) {
      const { data: al } = await supabase.from('order_item_lots').select('order_item_id, quantity, lots(lot_number, expiry_date)').in('order_item_id', its.map(i => i.id))
      setAlloc((al as unknown as Alloc[]) ?? [])
    }
  }, [id])
  useEffect(() => { load() }, [load])
  useRealtime(['orders'], load)

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null); setBusy(true)
    try { await fn(); await load(); return true } catch (e) { setErr(errMsg(e)); return false } finally { setBusy(false) }
  }
  if (!o) return <Spinner />
  const editable = ['confirmed', 'preparing', 'pending_payment'].includes(o.status)
  const allPicked = items.filter(i => !i.unavailable).every(i => i.picked)
  const needsReason = (s: OrderStatus) => ['cancelled', 'delivery_failed', 'refunded', 'partially_refunded'].includes(s)

  async function confirmModal() {
    if (!modal) return
    const ok = await run(() => rpc('set_order_status', {
      p_order: o!.id, p_status: modal.to, p_note: note || null,
      p_restock: modal.to === 'cancelled' && o!.status !== 'confirmed' && o!.stock_committed ? restock === 'yes' : null,
    }))
    if (ok) { setModal(null); setNote(''); setRestock('') }
  }
  function openStatus(to: OrderStatus, label: string) {
    if (needsReason(to) || to === 'delivered') { setModal({ to, label }); return }
    run(() => rpc('set_order_status', { p_order: o!.id, p_status: to }))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/admin/commandes" className="inline-flex items-center gap-1 text-sm text-brand-700"><ArrowLeft className="h-4 w-4" />Commandes</Link>
        <h1 className="font-mono text-xl font-bold">{o.order_number}</h1><StatusBadge s={o.status} />
        <Button variant="secondary" className="ml-auto" onClick={() => window.print()}><Printer className="h-4 w-4" />Bon de préparation</Button>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {/* Actions */}
      <Card className="flex flex-wrap gap-2 print:hidden">
        {(NEXT[o.status] ?? []).filter(a => !(a.to === 'out_for_delivery' && o.fulfillment === 'pickup')).map(a => (
          <Button key={a.to} variant={a.variant} loading={busy} onClick={() => openStatus(a.to, a.label)}
            disabled={a.to === 'ready' && !allPicked}>{a.label}</Button>
        ))}
        {o.payment_status !== 'paid' && !['cancelled', 'refunded'].includes(o.status) && (
          <Button variant="secondary" loading={busy} onClick={() => confirm(`Confirmer l'encaissement de ${money(o.total)} ?`) && run(() => rpc('confirm_payment', { p_order: o.id }))}>
            💶 {o.status === 'pending_payment' ? 'Confirmer le paiement' : 'Paiement encaissé'}
          </Button>
        )}
        {o.status === 'pending_payment' && <Button variant="warning" onClick={() => setModal({ to: 'cancelled', label: 'Paiement refusé' })}>Paiement refusé</Button>}
        {['confirmed', 'preparing', 'ready', 'delivery_failed'].includes(o.status) && <Button variant="secondary" onClick={async () => {
          const { data } = await supabase.from('slots').select('*').eq('type', o.fulfillment).eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(60)
          setSlots(((data as Slot[]) ?? []).filter(s => !s.zone_id || s.zone_id === o.zone_id)); setMoveOpen(true)
        }}>Déplacer le créneau</Button>}
        {CANCELLABLE.includes(o.status) && <Button variant="danger" onClick={() => setModal({ to: 'cancelled', label: 'Annuler la commande' })}>Annuler</Button>}
        {o.status === 'preparing' && !allPicked && <span className="self-center text-xs text-gray-500">Cochez tous les articles pour marquer prête.</span>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="mb-2 font-bold">Articles {editable && <span className="text-xs font-normal text-gray-500">— cochez au fur et à mesure de la préparation</span>}</h2>
          <ul className="divide-y">
            {items.map(it => {
              const lots = alloc.filter(a => a.order_item_id === it.id)
              const variable = it.unit === 'kg' || it.unit === 'g'
              return (
                <li key={it.id} className={`flex flex-wrap items-center gap-3 py-3 ${it.unavailable ? 'opacity-50' : ''}`}>
                  <input type="checkbox" className="h-6 w-6 accent-brand-700 print:hidden" checked={it.picked} disabled={!editable || it.unavailable || busy}
                    aria-label={`Préparé : ${it.product_name}`} onChange={e => run(() => rpc('update_order_item', { p_item: it.id, p_picked: e.target.checked }))} />
                  <span className="hidden h-5 w-5 border border-black print:inline-block" />
                  <div className="min-w-[10rem] flex-1">
                    <div className={`font-semibold ${it.unavailable ? 'line-through' : ''}`}>{it.product_name}</div>
                    <div className="text-xs text-gray-500">{it.product_sku} · {money(it.unit_price)} / {UNIT_LABEL[it.unit]}
                      {lots.length > 0 && <> · Lots : {lots.map(l => `${l.lots?.lot_number} (${num(l.quantity)})`).join(', ')}</>}</div>
                    {it.unavailable && <Badge cls="bg-red-100 text-red-700">Indisponible — retiré</Badge>}
                  </div>
                  <div className="text-right text-sm"><div className="font-bold">{num(it.quantity)} {UNIT_LABEL[it.unit]}</div>
                    {it.actual_weight != null && <div className="text-xs text-brand-700">Pesé : {num(it.actual_weight)} {UNIT_LABEL[it.unit]}</div>}</div>
                  {editable && variable && !it.unavailable && (
                    <Input type="number" step="0.001" placeholder="Poids réel" className="!w-28 print:hidden" defaultValue={it.actual_weight ?? ''}
                      onBlur={e => { const v = parseFloat(e.target.value); if (v > 0 && v !== it.actual_weight) run(() => rpc('update_order_item', { p_item: it.id, p_actual_weight: v })) }} />
                  )}
                  <div className="w-20 text-right font-semibold">{money(it.unavailable ? 0 : it.line_total)}</div>
                  {editable && (
                    <button className="text-xs text-tomato underline print:hidden" onClick={() => { setMissing(it); setNote('') }}>
                      {it.unavailable ? 'Rétablir' : 'Manquant'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between"><span>Sous-total</span><span>{money(o.subtotal)}</span></div>
            <div className="flex justify-between"><span>Livraison</span><span>{money(o.delivery_fee)}</span></div>
            <div className="flex justify-between text-xs text-gray-500"><span>dont TVA</span><span>{money(o.tax_total)}</span></div>
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(o.total)}</span></div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-1 text-sm">
            <h2 className="mb-1 font-bold">Client</h2>
            <div className="font-semibold">{o.guest_name ?? '—'}</div>
            {o.guest_phone && <a href={`tel:${o.guest_phone}`} className="flex items-center gap-1 text-brand-700"><Phone className="h-4 w-4" />{o.guest_phone}</a>}
            {o.guest_email && <div className="text-gray-600">{o.guest_email}</div>}
            {!o.customer_id && <Badge>Commande invité</Badge>}
          </Card>
          <Card className="space-y-1 text-sm">
            <h2 className="mb-1 font-bold">{o.fulfillment === 'delivery' ? '🚚 Livraison' : '🏪 Retrait'}</h2>
            <div><strong>{fmtSlot(slot)}</strong></div>
            {o.fulfillment === 'delivery' && <>
              <div>{o.address_street}, {o.address_postal_code} {o.address_city}</div>
              {o.address_instructions && <div className="rounded-lg bg-amber-50 p-2 text-amber-900">📝 {o.address_instructions}</div>}
              <a className="text-brand-700 underline print:hidden" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address_street} ${o.address_postal_code} ${o.address_city}`)}`}>Ouvrir l'itinéraire</a>
            </>}
            {o.departed_at && <div className="text-xs text-gray-500">Départ : {fmtDateTime(o.departed_at)}</div>}
            {o.delivered_at && <div className="text-xs text-gray-500">Remise : {fmtDateTime(o.delivered_at)}</div>}
            {o.failure_reason && <div className="text-xs text-tomato">Échec : {o.failure_reason}</div>}
            {o.cancel_reason && <div className="text-xs text-tomato">Annulation : {o.cancel_reason}</div>}
          </Card>
          <Card className="space-y-1 text-sm">
            <h2 className="mb-1 font-bold">Paiement</h2>
            <div>{PAYMENT_LABEL[o.payment_method]}</div>
            <div>{o.payment_status === 'paid' ? '✅ Payé' : o.payment_status === 'failed' ? '❌ Échec' : o.payment_status === 'pending' ? '⏳ À encaisser' : o.payment_status}</div>
            {o.reserved_until && o.status === 'pending_payment' && <div className="text-xs text-orange-700">Stock réservé jusqu'à {fmtTime(o.reserved_until)}</div>}
          </Card>
          {o.customer_note && <Card className="text-sm"><h2 className="mb-1 font-bold">Message du client</h2>{o.customer_note}</Card>}
          <Card className="space-y-2 print:hidden">
            <h2 className="font-bold">Note interne</h2>
            <Textarea value={internal} onChange={e => setInternal(e.target.value)} rows={2} />
            <Button variant="secondary" onClick={() => run(() => rpc('update_order_meta', { p_order: o.id, p_internal_note: internal, p_assigned_to: o.assigned_to }))}>Enregistrer</Button>
          </Card>
          <Card className="print:hidden">
            <h2 className="mb-2 font-bold">Historique</h2>
            <ol className="space-y-2 text-xs">
              {hist.map(h => (
                <li key={h.id} className="border-l-2 border-brand-200 pl-2">
                  <div className="font-semibold">{STATUS[h.to_status]?.label}</div>
                  <div className="text-gray-500">{fmtDateTime(h.created_at)}</div>
                  {h.note && <div>{h.note}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.label ?? ''}>
        <div className="space-y-3">
          {modal?.to === 'delivered' && <p className="text-sm">Confirmez la remise de la commande au client{o.payment_status !== 'paid' ? ` et pensez à encaisser ${money(o.total)}` : ''}.</p>}
          <Field label={needsReason(modal?.to ?? 'confirmed') ? 'Motif' : 'Commentaire'} required={needsReason(modal?.to ?? 'confirmed')}>
            <Textarea value={note} onChange={e => setNote(e.target.value)} />
          </Field>
          {modal?.to === 'cancelled' && o.stock_committed && o.status !== 'confirmed' && (
            <Field label="Les produits sont-ils encore vendables ?" required>
              <Select value={restock} onChange={e => setRestock(e.target.value as 'yes' | 'no')}>
                <option value="">— choisir —</option><option value="yes">Oui : remettre en stock</option><option value="no">Non : ne pas réintégrer (perte à saisir dans Stock)</option>
              </Select>
            </Field>
          )}
          {modal?.to === 'cancelled' && o.status === 'confirmed' && <p className="text-xs text-gray-600">La commande n'est pas encore préparée : le stock sera automatiquement réintégré.</p>}
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" loading={busy} onClick={() => modal?.label === 'Paiement refusé'
            ? run(() => rpc('fail_payment', { p_order: o.id, p_reason: note })).then(ok => ok && setModal(null))
            : confirmModal()}
            disabled={(needsReason(modal?.to ?? 'confirmed') && note.trim().length < 3) || (modal?.to === 'cancelled' && o.stock_committed && o.status !== 'confirmed' && !restock)}>
            Valider
          </Button>
        </div>
      </Modal>

      <Modal open={!!missing} onClose={() => setMissing(null)} title={missing?.unavailable ? 'Rétablir l\'article' : 'Article manquant'}>
        <div className="space-y-3">
          <p className="text-sm">{missing?.product_name} — la ligne est {missing?.unavailable ? 'rétablie' : 'retirée du total et le stock alloué est remis dans les lots'}. Le client est notifié.</p>
          <Field label="Motif / solution proposée au client" required><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ex. : rupture, client contacté, remboursement de la ligne" /></Field>
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" disabled={note.trim().length < 3} loading={busy}
            onClick={() => run(() => rpc('update_order_item', { p_item: missing!.id, p_unavailable: !missing!.unavailable, p_note: note })).then(ok => ok && setMissing(null))}>Valider</Button>
        </div>
      </Modal>

      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} title="Déplacer le créneau">
        <div className="space-y-2">
          <Field label="Message au client (facultatif)"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {slots.map(s => (
              <button key={s.id} disabled={busy || s.id === o.slot_id} className="w-full rounded-xl border p-2 text-left text-sm hover:bg-brand-50 disabled:opacity-40"
                onClick={() => run(() => rpc('move_order_slot', { p_order: o.id, p_slot: s.id, p_note: note || null })).then(ok => ok && setMoveOpen(false))}>
                {fmtSlot(s)}
              </button>
            ))}
          </div>
          <ErrorBox>{err}</ErrorBox>
        </div>
      </Modal>
    </div>
  )
}
