import { useCallback, useEffect, useState } from 'react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtDateTime } from '../../lib/format'
import type { Profile, Role } from '../../lib/types'
import { Button, Card, Input, Select, ErrorBox, SuccessBox, Spinner, Badge } from '../../components/ui'

export default function Users() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const load = useCallback(async () => { const { data } = await supabase.from('profiles').select('*').order('role').order('created_at'); setRows((data as Profile[]) ?? []) }, [])
  useEffect(() => { load() }, [load])
  async function update(p: Profile, role: Role, active: boolean) {
    setErr(null); setOk(null)
    try { await rpc('admin_set_user', { p_user: p.id, p_role: role, p_active: active }); setOk(`${p.full_name ?? p.email} : ${role}${active ? '' : ' (désactivé)'}`); load() } catch (e) { setErr(errMsg(e)) }
  }
  const list = (rows ?? []).filter(p => !q || `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase()))
  const staff = list.filter(p => p.role !== 'client')
  const pending = (rows ?? []).filter(p => p.requested_role)
  const LABEL: Record<string, string> = { courier: 'Livreur', employee: 'Gestionnaire' }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Utilisateurs & rôles</h1>
      <Card className="text-sm text-gray-700">
        <strong>Ajouter un gestionnaire ou un livreur :</strong> la personne crée son compte en choisissant « Gestionnaire » ou « Livreur » ; sa demande apparaît ci-dessous et vous la validez.
        Vous pouvez aussi changer le rôle de n'importe quel compte dans le tableau. Un compte par personne, jamais d'identifiant partagé ; en cas de départ, désactivez immédiatement le compte.
      </Card>
      <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
      {pending.length > 0 && (
        <Card className="space-y-2 border-orange-200 bg-orange-50">
          <h2 className="font-bold text-orange-900">Demandes d'accès en attente ({pending.length})</h2>
          {pending.map(p => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 text-sm">
              <div className="flex-1"><strong>{p.full_name}</strong> · {p.email} · {p.phone}<div className="text-xs text-gray-500">demande : <strong>{LABEL[p.requested_role!]}</strong> · inscrit le {fmtDateTime(p.created_at)}</div></div>
              <Button onClick={() => update(p, p.requested_role as Role, true)}>Valider comme {LABEL[p.requested_role!]}</Button>
              <Button variant="secondary" onClick={async () => { try { await rpc('reject_role_request', { p_user: p.id }); setOk('Demande refusée : le compte reste client.'); load() } catch (e) { setErr(errMsg(e)) } }}>Refuser</Button>
            </div>
          ))}
        </Card>
      )}
      <Input type="search" placeholder="Rechercher par nom ou e-mail" value={q} onChange={e => setQ(e.target.value)} />
      {!rows ? <Spinner /> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Utilisateur</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th></tr></thead>
            <tbody className="divide-y">
              {[...staff, ...list.filter(p => p.role === 'client')].map(p => (
                <tr key={p.id}>
                  <td className="p-3"><div className="font-semibold">{p.full_name} {p.id === me?.id && <Badge>vous</Badge>}</div><div className="text-xs text-gray-500">{p.email}</div></td>
                  <td><Select className="!w-40 !py-1.5" value={p.role} disabled={p.id === me?.id} onChange={e => update(p, e.target.value as Role, p.active)}>
                    <option value="client">Client</option><option value="courier">Livreur</option><option value="employee">Gestionnaire</option><option value="admin">Administrateur</option></Select></td>
                  <td><label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={p.active} disabled={p.id === me?.id} onChange={e => update(p, p.role, e.target.checked)} />{p.active ? 'Actif' : <span className="text-tomato">Désactivé</span>}</label></td>
                  <td className="text-xs">{fmtDateTime(p.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
