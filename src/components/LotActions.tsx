import { useEffect, useState } from 'react'
import { rpc, errMsg } from '../lib/supabase'
import { num, UNIT_LABEL, fmtDay, fmtDateTime } from '../lib/format'
import type { Lot, Product, MovementType } from '../lib/types'
import { Button, Field, Input, Select, Textarea, Modal, ErrorBox } from './ui'

export type LotAction = 'adjust' | 'inventory' | 'block' | 'unblock' | 'edit' | 'trace'
const ADJ_TYPES: [MovementType, string][] = [['loss', 'Perte'], ['breakage', 'Casse'], ['destruction', 'Destruction (DLC dépassée…)'], ['donation', 'Don'], ['adjustment', 'Ajustement (+/−)'], ['correction', 'Correction (+/−)']]

interface TraceRow { order_number: string; status: string; customer: string; email: string; phone: string; quantity: number; ordered_at: string }

export default function LotActionModal({ lot, product, action, onClose, onDone }:
  { lot: Lot | null; product?: Product; action: LotAction | null; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<MovementType>('loss')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [info, setInfo] = useState({ supplier: '', expiry: '', kind: 'DLC', cost: '', notes: '' })
  const [trace, setTrace] = useState<TraceRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const unit = product ? UNIT_LABEL[product.unit] : ''
  useEffect(() => {
    if (!lot || !action) return
    if (action === 'trace') { setTrace(null); rpc<TraceRow[]>('lot_trace', { p_lot: lot.id }).then(setTrace).catch(e => setErr(errMsg(e))) }
    if (action === 'edit') setInfo({ supplier: lot.supplier ?? '', expiry: lot.expiry_date ?? '', kind: lot.expiry_kind ?? 'DLC', cost: lot.unit_cost?.toString() ?? '', notes: lot.notes ?? '' })
  }, [lot, action])
  if (!lot || !action) return null
  const go = async (fn: () => Promise<unknown>) => {
    setErr(null); setBusy(true)
    try { await fn(); onDone(); close() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const close = () => { setQty(''); setReason(''); setTrace(null); setErr(null); setInfo({ supplier: '', expiry: '', kind: 'DLC', cost: '', notes: '' }); onClose() }
  const title = { adjust: 'Sortie / ajustement', inventory: 'Inventaire du lot', block: 'Bloquer le lot', unblock: 'Débloquer le lot', edit: 'Modifier le lot', trace: 'Traçabilité / rappel' }[action]
  const signed = ['adjustment', 'correction'].includes(type)

  return (
    <Modal open onClose={close} title={`${title} — ${product?.name ?? ''} · lot ${lot.lot_number}`} wide={action === 'trace'}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Stock du lot : <strong>{num(lot.qty_remaining)} {unit}</strong>{lot.expiry_date && <> · {lot.expiry_kind} {fmtDay(lot.expiry_date)}</>}</p>
        {action === 'adjust' && <>
          <Field label="Type de mouvement" required><Select value={type} onChange={e => setType(e.target.value as MovementType)}>{ADJ_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label={signed ? `Quantité (+ entrée / − sortie) en ${unit}` : `Quantité sortie (${unit})`} required>
            <Input type="number" step="0.001" value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          </Field>
          <Field label="Motif" required><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : légumes abîmés au déballage" /></Field>
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" loading={busy} disabled={!qty || reason.trim().length < 3}
            onClick={() => go(() => rpc('adjust_lot', { p_lot: lot.id, p_delta: signed ? parseFloat(qty) : -Math.abs(parseFloat(qty)), p_type: type, p_reason: reason }))}>Enregistrer le mouvement</Button>
        </>}
        {action === 'inventory' && <>
          <Field label={`Quantité comptée (${unit})`} required><Input type="number" step="0.001" min="0" value={qty} onChange={e => setQty(e.target.value)} autoFocus /></Field>
          {qty !== '' && <p className="text-sm">Écart : <strong className={parseFloat(qty) - lot.qty_remaining < 0 ? 'text-tomato' : 'text-brand-700'}>{num(parseFloat(qty) - lot.qty_remaining)} {unit}</strong></p>}
          <Field label="Commentaire"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Inventaire hebdomadaire" /></Field>
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" loading={busy} disabled={qty === ''} onClick={() => go(() => rpc('inventory_count', { p_lot: lot.id, p_counted: parseFloat(qty), p_reason: reason || 'Inventaire' }))}>Valider l'écart</Button>
        </>}
        {(action === 'block' || action === 'unblock') && <>
          {action === 'block' && <p className="text-sm text-orange-800">Le lot ne sera plus proposé à la vente (rappel, doute qualité, contrôle…).</p>}
          <Field label="Motif" required><Textarea value={reason} onChange={e => setReason(e.target.value)} /></Field>
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" variant={action === 'block' ? 'warning' : 'primary'} loading={busy} disabled={reason.trim().length < 3}
            onClick={() => go(() => rpc('set_lot_status', { p_lot: lot.id, p_status: action === 'block' ? 'blocked' : 'active', p_reason: reason }))}>{action === 'block' ? 'Bloquer' : 'Remettre en vente'}</Button>
        </>}
        {action === 'edit' && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fournisseur"><Input value={info.supplier} onChange={e => setInfo({ ...info, supplier: e.target.value })} /></Field>
            <Field label="Coût unitaire"><Input type="number" step="0.01" value={info.cost} onChange={e => setInfo({ ...info, cost: e.target.value })} /></Field>
            <Field label="Date limite"><Input type="date" value={info.expiry} onChange={e => setInfo({ ...info, expiry: e.target.value })} /></Field>
            <Field label="Type"><Select value={info.kind} onChange={e => setInfo({ ...info, kind: e.target.value })}><option>DLC</option><option>DDM</option></Select></Field>
          </div>
          <Field label="Notes"><Textarea value={info.notes} onChange={e => setInfo({ ...info, notes: e.target.value })} /></Field>
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" loading={busy} onClick={() => go(() => rpc('update_lot_info', { p_lot: lot.id, p_supplier: info.supplier || null, p_expiry: info.expiry || null, p_expiry_kind: info.kind, p_unit_cost: info.cost ? parseFloat(info.cost) : null, p_notes: info.notes || null }))}>Enregistrer</Button>
        </>}
        {action === 'trace' && <>
          <p className="text-sm">Commandes ayant reçu des produits de ce lot (procédure de rappel : bloquez d'abord le lot, puis contactez ces clients).</p>
          <ErrorBox>{err}</ErrorBox>
          {trace && (trace.length === 0 ? <p className="text-sm text-gray-500">Aucune commande n'a reçu ce lot.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th>Commande</th><th>Client</th><th>Contact</th><th>Qté</th><th>Date</th></tr></thead>
              <tbody className="divide-y">{trace.map((t, i) => <tr key={i}><td className="font-mono">{t.order_number}</td><td>{t.customer}</td><td className="text-xs">{t.phone}<br />{t.email}</td><td>{num(t.quantity)}</td><td className="text-xs">{fmtDateTime(t.ordered_at)}</td></tr>)}</tbody></table>
          ))}
        </>}
      </div>
    </Modal>
  )
}
