import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { fmtDateTime } from '../../lib/format'
import type { Alert } from '../../lib/types'
import { ALERT_CLS, ALERT_ICON } from './Today'
import { Button, Card, Input, ErrorBox, Spinner, Empty, Badge } from '../../components/ui'

const TYPE_LABEL: Record<string, string> = {
  low_stock: 'Stock bas', critical_stock: 'Stock critique', expiry_soon: 'Date limite proche', expired_lot: 'Lot échu',
  reservation_expired: 'Réservation expirée', payment_failed: 'Paiement refusé', slot_full: 'Créneau complet', order_late: 'Commande en retard', notification_failed: 'Échec notification',
}

export default function Alerts() {
  const [rows, setRows] = useState<Alert[] | null>(null)
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('alerts').select('*').eq('status', status).order('created_at', { ascending: false }).limit(300)
    const list = (data as Alert[]) ?? []
    const rank = { critical: 0, warning: 1, info: 2 }
    setRows(status === 'open' ? list.sort((a, b) => rank[a.level] - rank[b.level]) : list)
  }, [status])
  useEffect(() => { load() }, [load])
  useRealtime(['alerts'], load)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Alertes</h1>
      <div className="flex gap-2">{(['open', 'resolved'] as const).map(s => <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status === s ? 'bg-brand-700 text-white' : 'border bg-white'}`}>{s === 'open' ? 'Ouvertes' : 'Traitées'}</button>)}</div>
      <p className="text-sm text-gray-600">Une alerte n'est créée qu'une fois par situation ; elle se ferme automatiquement quand le stock repasse au-dessus du seuil ou quand le lot est épuisé/retiré.</p>
      <ErrorBox>{err}</ErrorBox>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>{status === 'open' ? 'Aucune alerte ouverte. Tout va bien 🌱' : 'Aucune alerte traitée.'}</Empty> : (
        <div className="space-y-2">
          {rows.map(a => (
            <Card key={a.id} className="!p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge cls={ALERT_CLS[a.level]}>{ALERT_ICON[a.level]} {TYPE_LABEL[a.type] ?? a.type}</Badge>
                <span className="text-xs text-gray-500">{fmtDateTime(a.created_at)}</span>
                {a.order_id && <Link to={`/admin/commandes/${a.order_id}`} className="text-xs text-brand-700 underline">Voir la commande</Link>}
                {a.lot_id && <Link to="/admin/stock" className="text-xs text-brand-700 underline">Voir le stock</Link>}
              </div>
              <div className="mt-1 text-sm">{a.message}</div>
              {a.status === 'open' ? (
                <div className="mt-2 flex gap-2">
                  <Input placeholder="Décision : vente prioritaire, promo, retrait, commande fournisseur…" value={notes[a.id] ?? ''} onChange={e => setNotes({ ...notes, [a.id]: e.target.value })} />
                  <Button variant="secondary" onClick={async () => { setErr(null); try { await rpc('resolve_alert', { p_alert: a.id, p_note: notes[a.id] ?? '' }); load() } catch (e) { setErr(errMsg(e)) } }}>Marquer traitée</Button>
                </div>
              ) : <div className="mt-1 text-xs text-gray-500">✔ {a.resolution_note} · {fmtDateTime(a.resolved_at)}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
