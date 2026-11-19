import { useEffect, useState } from 'react'
import { Navigate, Link, useSearchParams } from 'react-router-dom'
import { supabase, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money, fmtDateTime } from '../../lib/format'
import type { Order } from '../../lib/types'
import { Button, Card, Field, Input, Select, Textarea, ErrorBox, SuccessBox, StatusBadge, Spinner, Empty } from '../../components/ui'

export default function Account() {
  const { session, profile, loading, signOut, refreshProfile, isStaff } = useAuth()
  const [sp] = useSearchParams()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [f, setF] = useState({ full_name: '', phone: '', marketing_consent: false })
  const [pwd, setPwd] = useState('')
  const [req, setReq] = useState({ kind: 'access', message: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    supabase.from('orders').select('*').eq('customer_id', session.user.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setOrders((data as Order[]) ?? []))
  }, [session])
  useEffect(() => { if (profile) setF({ full_name: profile.full_name ?? '', phone: profile.phone ?? '', marketing_consent: profile.marketing_consent }) }, [profile])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/connexion" />
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setErr(null); setMsg(null)
    try { const { error } = await fn(); if (error) throw new Error(error.message); setMsg(ok) } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-brand-900">Bonjour {profile?.full_name ?? ''}</h1>
        <div className="flex gap-2">
          {isStaff && <Link to="/admin" className="rounded-xl bg-brand-800 px-4 py-2 text-sm font-semibold text-white">Espace gestion</Link>}
          <Button variant="secondary" onClick={signOut}>Se déconnecter</Button>
        </div>
      </div>
      <SuccessBox>{msg}</SuccessBox><ErrorBox>{err}</ErrorBox>
      {sp.get('reset') && (
        <Card className="space-y-2">
          <h2 className="font-bold">Nouveau mot de passe</h2>
          <Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="8 caractères minimum" />
          <Button disabled={pwd.length < 8} onClick={() => act(() => supabase.auth.updateUser({ password: pwd }), 'Mot de passe modifié.')}>Enregistrer</Button>
        </Card>
      )}
      <Card>
        <h2 className="mb-3 font-bold">Mes commandes</h2>
        {orders === null ? <Spinner /> : orders.length === 0 ? <Empty>Aucune commande pour le moment.</Empty> : (
          <ul className="divide-y">
            {orders.map(o => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-mono font-semibold">{o.order_number}</span>
                <span className="text-gray-500">{fmtDateTime(o.created_at)}</span>
                <StatusBadge s={o.status} />
                <span className="font-semibold">{money(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-bold">Mes informations</h2>
          <Field label="Nom"><Input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Téléphone"><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.marketing_consent} onChange={e => setF({ ...f, marketing_consent: e.target.checked })} className="accent-brand-700" /> Recevoir les offres (newsletter)</label>
          <Button onClick={() => act(async () => { const r = await supabase.from('profiles').update(f).eq('id', session.user.id); await refreshProfile(); return r }, 'Informations enregistrées.')}>Enregistrer</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-bold">Mes données personnelles</h2>
          <p className="text-sm text-gray-600">Vous pouvez demander l'accès, la rectification, l'opposition ou l'effacement de vos données. Les pièces devant légalement être conservées (factures) le restent.</p>
          <Select value={req.kind} onChange={e => setReq({ ...req, kind: e.target.value })}>
            <option value="access">Accès à mes données</option><option value="rectification">Rectification</option>
            <option value="opposition">Opposition</option><option value="erasure">Effacement</option>
          </Select>
          <Textarea placeholder="Précisions (facultatif)" value={req.message} onChange={e => setReq({ ...req, message: e.target.value })} />
          <Button variant="secondary" onClick={() => act(() => supabase.from('data_requests').insert({ user_id: session.user.id, email: session.user.email, kind: req.kind, message: req.message }), 'Demande enregistrée. Nous vous répondrons dans les délais légaux.')}>Envoyer la demande</Button>
        </Card>
      </div>
    </div>
  )
}
