import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money, fmtDateTime } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import type { Profile, Order } from '../../lib/types'
import { Button, Card, Input, Modal, Textarea, ErrorBox, Spinner, Empty, Badge, StatusBadge } from '../../components/ui'
import { useStaffBadges } from '../../lib/staffBadges'

interface Cust { key: string; name: string; email: string | null; phone: string | null; profile?: Profile; orders: Order[] }
interface DataReq { id: string; email: string; kind: string; message: string | null; status: string; created_at: string; user_id: string | null }

export default function Customers() {
  const { isAdmin } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [reqs, setReqs] = useState<DataReq[]>([])
  const { b } = useStaffBadges()
  // horodatage de la visite précédente, figé à l'arrivée sur la page
  const [since, setSince] = useState<string | undefined>(undefined)
  useEffect(() => { if (b && since === undefined) setSince(b.since.customers) }, [b, since])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Cust | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    const [p, o, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client').order('created_at', { ascending: false }).limit(1000),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('data_requests').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setProfiles((p.data as Profile[]) ?? []); setOrders((o.data as Order[]) ?? []); setReqs((r.data as DataReq[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const customers = useMemo(() => {
    const m = new Map<string, Cust>()
    for (const p of profiles) m.set(p.id, { key: p.id, name: p.full_name ?? '—', email: p.email, phone: p.phone, profile: p, orders: [] })
    for (const o of orders ?? []) {
      const k = o.customer_id ?? `guest:${(o.guest_phone ?? o.guest_email ?? o.id).replace(/\s/g, '')}`
      if (!m.has(k)) m.set(k, { key: k, name: o.guest_name ?? 'Invité', email: o.guest_email, phone: o.guest_phone, orders: [] })
      m.get(k)!.orders.push(o)
    }
    const s = q.toLowerCase().trim()
    return [...m.values()].filter(c => !s || `${c.name} ${c.email ?? ''} ${c.phone ?? ''} ${c.orders.map(o => o.order_number).join(' ')}`.toLowerCase().includes(s))
  }, [profiles, orders, q])

  return (
    <div className="space-y-4">
      <div className="flex items-center"><h1 className="text-2xl font-bold text-brand-900">Clients</h1>
        {isAdmin && <Button variant="secondary" className="ml-auto" onClick={() => downloadCsv('clients', customers.map(c => ({ nom: c.name, email: c.email, telephone: c.phone, compte: c.profile ? 'oui' : 'invité', commandes: c.orders.length, total: c.orders.filter(o => !['cancelled', 'refunded'].includes(o.status)).reduce((s, o) => s + Number(o.total), 0), newsletter: c.profile?.marketing_consent ?? false })))}><Download className="h-4 w-4" />CSV</Button>}
      </div>
      <Input type="search" placeholder="Nom, e-mail, téléphone ou n° de commande" value={q} onChange={e => setQ(e.target.value)} />
      {!orders ? <Spinner /> : customers.length === 0 ? <Empty>Aucun client.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Client</th><th>Contact</th><th>Commandes</th><th>Total</th><th>Dernière</th></tr></thead>
            <tbody className="divide-y">
              {customers.map(c => (
                <tr key={c.key} className="cursor-pointer hover:bg-brand-50/40" onClick={() => { setSel(c); setNote(c.profile?.internal_notes ?? '') }}>
                  <td className="p-3 font-semibold">{c.name} {since && c.profile && c.profile.created_at > since && <Badge cls="bg-tomato text-white">Nouveau</Badge>} {!c.profile && <Badge>invité</Badge>}{c.profile?.active === false && <Badge cls="bg-red-100 text-red-700">désactivé</Badge>}</td>
                  <td className="text-xs">{c.phone}<br />{c.email}</td>
                  <td>{c.orders.length}</td>
                  <td>{money(c.orders.filter(o => !['cancelled', 'refunded'].includes(o.status)).reduce((s, o) => s + Number(o.total), 0))}</td>
                  <td className="text-xs">{c.orders[0] ? fmtDateTime(c.orders[0].created_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {isAdmin && (
        <Card>
          <h2 className="mb-2 font-bold">Demandes RGPD / données personnelles</h2>
          {reqs.length === 0 ? <p className="text-sm text-gray-500">Aucune demande.</p> : (
            <ul className="divide-y text-sm">
              {reqs.map(r => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge cls={r.status === 'done' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}>{r.status}</Badge>
                  <span className="font-semibold">{{ access: 'Accès', rectification: 'Rectification', erasure: 'Effacement', opposition: 'Opposition' }[r.kind]}</span>
                  <span>{r.email}</span><span className="text-xs text-gray-500">{fmtDateTime(r.created_at)}</span>
                  {r.message && <span className="w-full text-xs text-gray-600">« {r.message} »</span>}
                  {r.status !== 'done' && (r.kind === 'erasure'
                    ? <Button variant="danger" className="!py-1" onClick={async () => { if (!confirm('Anonymiser ce client ? (adresses supprimées, commandes conservées pour les obligations légales)')) return; try { await rpc('process_erasure', { p_request: r.id }); load() } catch (e) { setErr(errMsg(e)) } }}>Anonymiser</Button>
                    : <Button variant="secondary" className="!py-1" onClick={async () => { await supabase.from('data_requests').update({ status: 'done', handled_at: new Date().toISOString() }).eq('id', r.id); load() }}>Marquer traitée</Button>)}
                </li>
              ))}
            </ul>
          )}
          <ErrorBox>{err}</ErrorBox>
        </Card>
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.name ?? ''} wide>
        {sel && <div className="space-y-3 text-sm">
          <div>{sel.phone && <a href={`tel:${sel.phone}`} className="text-brand-700">{sel.phone}</a>} {sel.email && <>· {sel.email}</>}</div>
          {sel.profile && <div className="text-xs text-gray-500">Compte créé le {fmtDateTime(sel.profile.created_at)} · newsletter : {sel.profile.marketing_consent ? 'oui' : 'non'}</div>}
          {sel.profile && isAdmin && <div className="space-y-2">
            <Textarea placeholder="Notes opérationnelles (non sensibles) : préférences, accès…" value={note} onChange={e => setNote(e.target.value)} />
            <Button variant="secondary" onClick={async () => { const r = await supabase.from('profiles').update({ internal_notes: note }).eq('id', sel.profile!.id); if (r.error) setErr(r.error.message); else load() }}>Enregistrer la note</Button>
          </div>}
          <ul className="divide-y">
            {sel.orders.map(o => <li key={o.id} className="flex flex-wrap items-center gap-2 py-1.5"><Link to={`/admin/commandes/${o.id}`} className="font-mono text-brand-700 underline">{o.order_number}</Link><span className="text-xs">{fmtDateTime(o.created_at)}</span><StatusBadge s={o.status} /><span className="ml-auto font-semibold">{money(o.total)}</span></li>)}
          </ul>
          <ErrorBox>{err}</ErrorBox>
        </div>}
      </Modal>
    </div>
  )
}
