import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRealtime } from '../../lib/hooks'
import { fmtTime } from '../../lib/format'
import type { Slot, SlotTemplate, Zone, Order } from '../../lib/types'
import { Button, Card, Field, Input, Select, ErrorBox, SuccessBox, Spinner, Badge, Empty } from '../../components/ui'

const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export default function Slots() {
  const { isAdmin } = useAuth()
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [used, setUsed] = useState<Record<string, number>>({})
  const [zones, setZones] = useState<Zone[]>([])
  const [tpl, setTpl] = useState<SlotTemplate[]>([])
  const [closed, setClosed] = useState<{ day: string; reason: string | null }[]>([])
  const [newClosed, setNewClosed] = useState({ day: '', reason: '' })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const load = useCallback(async () => {
    const now = new Date().toISOString()
    const [s, o, z, t, c] = await Promise.all([
      supabase.from('slots').select('*').gte('ends_at', now).order('starts_at').limit(300),
      supabase.from('orders').select('slot_id, status, reserved_until').not('status', 'in', '(cancelled,refunded,delivery_failed)').gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()),
      supabase.from('delivery_zones').select('*').order('name'),
      supabase.from('slot_templates').select('*').order('weekday').order('start_time'),
      supabase.from('closed_days').select('*').gte('day', now.slice(0, 10)).order('day'),
    ])
    setSlots((s.data as Slot[]) ?? []); setZones((z.data as Zone[]) ?? []); setTpl((t.data as SlotTemplate[]) ?? []); setClosed(c.data ?? [])
    const u: Record<string, number> = {}
    for (const r of (o.data as Pick<Order, 'slot_id' | 'status' | 'reserved_until'>[]) ?? []) {
      if (!r.slot_id) continue
      if (r.status === 'pending_payment' && (!r.reserved_until || new Date(r.reserved_until) < new Date())) continue
      u[r.slot_id] = (u[r.slot_id] ?? 0) + 1
    }
    setUsed(u)
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime(['slots', 'orders'], load)
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }> | Promise<unknown>, msg?: string) => {
    setErr(null); setOk(null)
    try { const r = await fn() as { error?: { message: string } | null }; if (r?.error) throw new Error(r.error.message); if (msg) setOk(msg); load() } catch (e) { setErr(errMsg(e)) }
  }
  const byDay = (slots ?? []).reduce<Record<string, Slot[]>>((a, s) => {
    const d = new Date(s.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); (a[d] ||= []).push(s); return a
  }, {})
  const zoneName = (id: string | null) => id ? zones.find(z => z.id === id)?.name ?? '?' : 'Toutes zones'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-brand-900">Créneaux</h1>
        <Button className="ml-auto" variant="secondary" onClick={() => run(() => rpc('generate_slots', { p_days: 14 }).then(n => setOk(`${n} créneau(x) créé(s) à partir du modèle.`)))}>Générer 14 jours</Button>
      </div>
      <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {!slots ? <Spinner /> : slots.length === 0 ? <Empty>Aucun créneau à venir. Configurez le modèle hebdomadaire puis « Générer ».</Empty> :
            Object.entries(byDay).map(([d, ss]) => (
              <Card key={d} className="!p-3">
                <div className="mb-2 font-semibold capitalize">{d}</div>
                <ul className="space-y-1.5">
                  {ss.map(s => { const u = used[s.id] ?? 0; const pct = s.capacity ? Math.min(100, (u / s.capacity) * 100) : 100; return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-24 font-semibold tabular-nums">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
                      <Badge cls={s.type === 'delivery' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'}>{s.type === 'delivery' ? '🚚 Livraison' : '🏪 Retrait'}</Badge>
                      <span className="text-xs text-gray-500">{zoneName(s.zone_id)}</span>
                      <div className="flex min-w-[8rem] flex-1 items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${pct >= 100 ? 'bg-tomato' : pct >= 75 ? 'bg-carrot' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs tabular-nums">{u}/{s.capacity}</span>
                      </div>
                      <Input type="number" min={0} className="!w-16 !py-1" defaultValue={s.capacity} aria-label="Capacité"
                        onBlur={e => { const v = parseInt(e.target.value); if (v !== s.capacity && v >= 0) run(() => supabase.from('slots').update({ capacity: v }).eq('id', s.id)) }} />
                      <button className={`rounded-lg px-2 py-1 text-xs font-semibold ${s.status === 'open' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}
                        onClick={() => run(() => supabase.from('slots').update({ status: s.status === 'open' ? 'blocked' : 'open' }).eq('id', s.id))}>
                        {s.status === 'open' ? 'Bloquer' : 'Rouvrir'}</button>
                    </li>) })}
                </ul>
              </Card>
            ))}
        </div>
        <div className="space-y-4">
          <Card className="space-y-2">
            <h2 className="font-bold">Modèle hebdomadaire {!isAdmin && <span className="text-xs font-normal text-gray-500">(admin)</span>}</h2>
            <p className="text-xs text-gray-500">Les créneaux sont générés automatiquement 14 jours à l'avance à partir de ce modèle.</p>
            <ul className="divide-y text-sm">
              {tpl.map(t => (
                <li key={t.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-20">{DAYS[t.weekday]}</span><span className="tabular-nums">{t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span>
                  <span>{t.type === 'delivery' ? '🚚' : '🏪'}</span><span className="text-xs text-gray-500">cap. {t.capacity} · {zoneName(t.zone_id)}</span>
                  {isAdmin && <button className="ml-auto text-gray-400 hover:text-tomato" aria-label="Supprimer" onClick={() => confirm('Supprimer ce modèle ? (les créneaux déjà générés restent)') && run(() => supabase.from('slot_templates').delete().eq('id', t.id))}><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
            {isAdmin && <TemplateForm zones={zones} onSave={row => run(() => supabase.from('slot_templates').insert(row), 'Modèle ajouté. Cliquez « Générer 14 jours ».')} />}
          </Card>
          <Card className="space-y-2">
            <h2 className="font-bold">Jours fermés (fériés, congés)</h2>
            <ul className="text-sm">{closed.map(c => <li key={c.day} className="flex justify-between py-1"><span>{new Date(c.day + 'T00:00').toLocaleDateString('fr-FR')} — {c.reason}</span>
              <button className="text-xs text-tomato" onClick={() => run(() => supabase.from('closed_days').delete().eq('day', c.day))}>Retirer</button></li>)}</ul>
            <div className="flex gap-2">
              <Input type="date" value={newClosed.day} onChange={e => setNewClosed({ ...newClosed, day: e.target.value })} />
              <Input placeholder="Motif" value={newClosed.reason} onChange={e => setNewClosed({ ...newClosed, reason: e.target.value })} />
              <Button disabled={!newClosed.day} onClick={async () => {
                await run(async () => {
                  const r = await supabase.from('closed_days').insert(newClosed); if (r.error) return r
                  const start = new Date(newClosed.day + 'T00:00'); const end = new Date(start); end.setDate(end.getDate() + 1)
                  return supabase.from('slots').update({ status: 'blocked', note: 'Jour fermé' }).gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString())
                }, 'Jour fermé : créneaux bloqués. Vérifiez les commandes déjà prises ce jour-là.')
                setNewClosed({ day: '', reason: '' })
              }}><Plus className="h-4 w-4" /></Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function TemplateForm({ zones, onSave }: { zones: Zone[]; onSave: (r: Omit<SlotTemplate, 'id' | 'active'>) => void }) {
  const [f, setF] = useState({ weekday: 2, start_time: '09:00', end_time: '12:00', type: 'delivery' as SlotTemplate['type'], zone_id: '', capacity: 6 })
  return (
    <div className="grid grid-cols-2 gap-2 border-t pt-2">
      <Field label="Jour"><Select value={f.weekday} onChange={e => setF({ ...f, weekday: parseInt(e.target.value) })}>{DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select></Field>
      <Field label="Type"><Select value={f.type} onChange={e => setF({ ...f, type: e.target.value as SlotTemplate['type'] })}><option value="delivery">Livraison</option><option value="pickup">Retrait</option></Select></Field>
      <Field label="Début"><Input type="time" value={f.start_time} onChange={e => setF({ ...f, start_time: e.target.value })} /></Field>
      <Field label="Fin"><Input type="time" value={f.end_time} onChange={e => setF({ ...f, end_time: e.target.value })} /></Field>
      <Field label="Capacité (commandes)"><Input type="number" min={1} value={f.capacity} onChange={e => setF({ ...f, capacity: parseInt(e.target.value) })} /></Field>
      <Field label="Zone"><Select value={f.zone_id} onChange={e => setF({ ...f, zone_id: e.target.value })}><option value="">Toutes</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
      <Button className="col-span-2" variant="secondary" onClick={() => onSave({ ...f, zone_id: f.zone_id || null })}><Plus className="h-4 w-4" />Ajouter au modèle</Button>
    </div>
  )
}
