import { useCallback, useEffect, useState } from 'react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtDateTime } from '../../lib/format'
import type { Profile, Role } from '../../lib/types'
import { Button, Card, Input, Select, ErrorBox, SuccessBox, Spinner, Badge } from '../../components/ui'

const ROLE: Record<Role, { label: string; icon: string; cls: string }> = {
  client: { label: 'Client', icon: '🛒', cls: 'bg-gray-100 text-gray-700' },
  courier: { label: 'Livreur', icon: '🛵', cls: 'bg-orange-100 text-orange-800' },
  employee: { label: 'Gestionnaire', icon: '🧑‍🌾', cls: 'bg-blue-100 text-blue-800' },
  admin: { label: 'Administrateur', icon: '🛡️', cls: 'bg-brand-100 text-brand-800' },
}

export default function Users() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Role | 'pending'>('all')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => { const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }); setRows((data as Profile[]) ?? []) }, [])
  useEffect(() => { load() }, [load])

  async function update(p: Profile, role: Role, active: boolean) {
    setErr(null); setOk(null); setBusy(p.id)
    try {
      await rpc('admin_set_user', { p_user: p.id, p_role: role, p_active: active })
      setOk(`${p.full_name ?? p.email} est maintenant ${ROLE[role].label.toLowerCase()}${active ? '' : ' (compte désactivé)'}. La personne a été notifiée.`)
      await load()
    } catch (e) {
      const m = errMsg(e)
      setErr(/courier|enum|user_role/i.test(m)
        ? 'Le rôle « Livreur » n\'existe pas encore dans votre base : exécutez le script 008_livreurs.sql dans Supabase (SQL Editor), puis réessayez.'
        : m)
    } finally { setBusy(null) }
  }

  const all = rows ?? []
  const count = (r: Role) => all.filter(p => p.role === r).length
  const pending = all.filter(p => p.requested_role)
  const list = all.filter(p => (filter === 'all' || (filter === 'pending' ? !!p.requested_role : p.role === filter))
    && (!q || `${p.full_name} ${p.email} ${p.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const order: Role[] = ['admin', 'employee', 'courier', 'client']
  list.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Utilisateurs & rôles</h1>
      <Card className="text-sm text-gray-700">
        <strong>Nommer un livreur ou un gestionnaire :</strong> la personne crée d'abord son compte sur le site (elle peut choisir « Livreur » ou « Gestionnaire »
        à l'inscription, sinon elle est client). Ensuite, ici, touchez <strong>« 🛵 Nommer livreur »</strong> ou <strong>« Nommer gestionnaire »</strong> sur sa ligne,
        ou changez son rôle dans la liste. Un compte par personne ; en cas de départ, décochez « Actif ».
      </Card>
      <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>

      {pending.length > 0 && (
        <Card className="space-y-2 border-orange-200 bg-orange-50">
          <h2 className="font-bold text-orange-900">Demandes d'accès en attente ({pending.length})</h2>
          {pending.map(p => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm">
              <div className="min-w-[12rem] flex-1"><strong>{p.full_name}</strong> · {p.phone ?? '—'}<div className="text-xs text-gray-500">{p.email} · demande : <strong>{ROLE[p.requested_role as Role].icon} {ROLE[p.requested_role as Role].label}</strong> · inscrit le {fmtDateTime(p.created_at)}</div></div>
              <Button loading={busy === p.id} onClick={() => update(p, 'courier', true)}>🛵 Nommer livreur</Button>
              <Button variant="secondary" loading={busy === p.id} onClick={() => update(p, 'employee', true)}>Nommer gestionnaire</Button>
              <Button variant="ghost" onClick={async () => { try { await rpc('reject_role_request', { p_user: p.id }); setOk('Demande refusée : le compte reste client.'); load() } catch (e) { setErr(errMsg(e)) } }}>Refuser</Button>
            </div>
          ))}
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {([['all', 'Tous', all.length], ['pending', '⏳ En attente', pending.length], ['courier', '🛵 Livreurs', count('courier')],
          ['employee', '🧑‍🌾 Gestionnaires', count('employee')], ['admin', '🛡️ Admins', count('admin')], ['client', '🛒 Clients', count('client')]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${filter === k ? 'bg-brand-700 text-white' : 'border bg-white'}`}>{l} ({n})</button>
        ))}
      </div>
      <Input type="search" placeholder="Rechercher par nom, e-mail ou téléphone" value={q} onChange={e => setQ(e.target.value)} />

      {!rows ? <Spinner /> : (
        <Card className="divide-y !p-0">
          {list.length === 0 && <p className="p-4 text-sm text-gray-500">Aucun compte.</p>}
          {list.map(p => {
            const self = p.id === me?.id
            return (
              <div key={p.id} className={`flex flex-wrap items-center gap-3 p-3 ${p.active ? '' : 'opacity-60'}`}>
                <div className="min-w-[13rem] flex-1">
                  <div className="font-semibold">{p.full_name ?? '—'} {self && <Badge>vous</Badge>}</div>
                  <div className="text-xs text-gray-500">{p.email}{p.phone ? ` · ${p.phone}` : ''} · dernière connexion {fmtDateTime(p.last_login_at)}</div>
                </div>
                <Badge cls={ROLE[p.role].cls}>{ROLE[p.role].icon} {ROLE[p.role].label}</Badge>
                {!self && p.role !== 'courier' && <Button className="!py-1.5" loading={busy === p.id} onClick={() => update(p, 'courier', true)}>🛵 Nommer livreur</Button>}
                {!self && p.role !== 'employee' && p.role !== 'admin' && <Button className="!py-1.5" variant="secondary" loading={busy === p.id} onClick={() => update(p, 'employee', true)}>Nommer gestionnaire</Button>}
                <Select className="!w-40 !py-1.5" value={p.role} disabled={self || busy === p.id} aria-label="Rôle" onChange={e => update(p, e.target.value as Role, p.active)}>
                  <option value="client">🛒 Client</option><option value="courier">🛵 Livreur</option><option value="employee">🧑‍🌾 Gestionnaire</option><option value="admin">🛡️ Administrateur</option>
                </Select>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" className="accent-brand-700" checked={p.active} disabled={self} onChange={e => update(p, p.role, e.target.checked)} />Actif</label>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
