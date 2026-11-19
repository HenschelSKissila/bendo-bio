import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDateTime } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { Button, Card, Select, Spinner, Empty } from '../../components/ui'

interface Row { id: number; user_id: string | null; action: string; entity: string; entity_id: string | null; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string }

export default function Audit() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [users, setUsers] = useState<Record<string, string>>({})
  const [entity, setEntity] = useState('')
  const load = useCallback(async () => {
    let r = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(300)
    if (entity) r = r.eq('entity', entity)
    const [{ data }, { data: p }] = await Promise.all([r, supabase.from('profiles').select('id, full_name, email').neq('role', 'client')])
    setRows((data as Row[]) ?? []); setUsers(Object.fromEntries((p ?? []).map((x: { id: string; full_name: string | null; email: string | null }) => [x.id, x.full_name ?? x.email ?? x.id])))
  }, [entity])
  useEffect(() => { load() }, [load])
  const short = (v: Record<string, unknown> | null) => v ? Object.entries(v).filter(([k]) => !['updated_at', 'created_at'].includes(k)).slice(0, 6).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ') : ''
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-brand-900">Journal d'audit</h1>
        <Button variant="secondary" className="ml-auto" onClick={() => downloadCsv('audit', (rows ?? []).map(r => ({ date: r.created_at, utilisateur: r.user_id ? users[r.user_id] ?? r.user_id : 'système', action: r.action, objet: r.entity, id: r.entity_id, avant: r.old_value, apres: r.new_value })))}><Download className="h-4 w-4" />CSV</Button></div>
      <Select value={entity} onChange={e => setEntity(e.target.value)} className="!w-60">
        <option value="">Tous les objets</option>{['products', 'lots', 'orders', 'profiles', 'settings', 'delivery_zones', 'slots', 'slot_templates', 'payments', 'categories'].map(e => <option key={e}>{e}</option>)}
      </Select>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>Aucune entrée.</Empty> : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-gray-50 text-left uppercase text-gray-500"><tr><th className="p-2">Date</th><th>Utilisateur</th><th>Action</th><th>Objet</th><th>Avant</th><th>Après</th></tr></thead>
            <tbody className="divide-y">{rows.map(r => (
              <tr key={r.id} className="align-top"><td className="whitespace-nowrap p-2">{fmtDateTime(r.created_at)}</td><td>{r.user_id ? users[r.user_id] ?? 'client' : 'système'}</td><td>{r.action}</td><td>{r.entity}</td>
                <td className="max-w-xs break-words text-gray-500">{short(r.old_value)}</td><td className="max-w-xs break-words">{short(r.new_value)}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
