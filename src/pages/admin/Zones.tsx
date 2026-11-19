import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase, errMsg } from '../../lib/supabase'
import { money } from '../../lib/format'
import type { Zone } from '../../lib/types'
import { Button, Card, Field, Input, Modal, ErrorBox, Spinner, Badge } from '../../components/ui'

export default function Zones() {
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [edit, setEdit] = useState<(Partial<Zone> & { codes?: string }) | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => { const { data } = await supabase.from('delivery_zones').select('*').order('name'); setZones((data as Zone[]) ?? []) }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    if (!edit) return
    setErr(null)
    try {
      const payload = { name: edit.name, fee: Number(edit.fee ?? 0), min_order: Number(edit.min_order ?? 0), free_above: edit.free_above ? Number(edit.free_above) : null,
        active: edit.active ?? true, postal_codes: (edit.codes ?? '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean) }
      if (!payload.name) throw new Error('Nom obligatoire')
      const r = edit.id ? await supabase.from('delivery_zones').update(payload).eq('id', edit.id) : await supabase.from('delivery_zones').insert(payload)
      if (r.error) throw new Error(r.error.message)
      setEdit(null); load()
    } catch (e) { setErr(errMsg(e)) }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center"><h1 className="text-2xl font-bold text-brand-900">Zones de livraison</h1>
        <Button className="ml-auto" onClick={() => setEdit({ codes: '', fee: 0, min_order: 0, active: true })}><Plus className="h-4 w-4" />Nouvelle zone</Button></div>
      <p className="text-sm text-gray-600">Une adresse est desservie si son code postal (ou code de quartier) figure dans une zone active. Les frais et le minimum de commande s'appliquent automatiquement.</p>
      {!zones ? <Spinner /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {zones.map(z => (
            <Card key={z.id} className="cursor-pointer hover:border-brand-300" >
              <button className="w-full text-left" onClick={() => setEdit({ ...z, codes: z.postal_codes.join(', ') })}>
                <div className="flex items-center justify-between"><span className="font-bold">{z.name}</span><Badge cls={z.active ? 'bg-green-100 text-green-800' : 'bg-gray-200'}>{z.active ? 'Active' : 'Inactive'}</Badge></div>
                <div className="mt-1 text-sm">Frais {money(z.fee)} · minimum {money(z.min_order)}{z.free_above ? ` · offerte dès ${money(z.free_above)}` : ''}</div>
                <div className="mt-1 text-xs text-gray-500">{z.postal_codes.join(', ') || 'Aucun code'}</div>
              </button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier la zone' : 'Nouvelle zone'}>
        {edit && <div className="space-y-3">
          <Field label="Nom" required><Input value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Codes postaux / quartiers" hint="Séparés par des virgules ou espaces"><Input value={edit.codes} onChange={e => setEdit({ ...edit, codes: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Frais"><Input type="number" step="0.01" value={edit.fee ?? 0} onChange={e => setEdit({ ...edit, fee: parseFloat(e.target.value) })} /></Field>
            <Field label="Minimum"><Input type="number" step="0.01" value={edit.min_order ?? 0} onChange={e => setEdit({ ...edit, min_order: parseFloat(e.target.value) })} /></Field>
            <Field label="Offerte dès"><Input type="number" step="0.01" value={edit.free_above ?? ''} onChange={e => setEdit({ ...edit, free_above: e.target.value ? parseFloat(e.target.value) : null })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-700" checked={edit.active ?? true} onChange={e => setEdit({ ...edit, active: e.target.checked })} />Zone active</label>
          <ErrorBox>{err}</ErrorBox>
          <Button className="w-full" onClick={save}>Enregistrer</Button>
        </div>}
      </Modal>
    </div>
  )
}
