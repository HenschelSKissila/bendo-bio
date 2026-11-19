import { useCallback, useEffect, useState } from 'react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtDateTime } from '../../lib/format'
import type { Profile, Role } from '../../lib/types'
import { Card, Input, Select, ErrorBox, SuccessBox, Spinner, Badge } from '../../components/ui'

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
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Utilisateurs & rôles</h1>
      <Card className="text-sm text-gray-700">
        <strong>Ajouter un employé :</strong> l'employé crée son compte personnel (lien « Créer un compte » / « Accès personnel »), puis vous lui attribuez ici le rôle <em>Employé</em>.
        Un compte par personne, jamais d'identifiant partagé. En cas de départ, désactivez immédiatement le compte.
      </Card>
      <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
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
                    <option value="client">Client</option><option value="employee">Employé</option><option value="admin">Administrateur</option></Select></td>
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
