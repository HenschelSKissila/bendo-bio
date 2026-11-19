import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Database, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { supabase, rpc, errMsg, SUPABASE_URL, SUPABASE_KEY } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useConnection, useSettings } from '../../lib/hooks'
import { fmtDateTime } from '../../lib/format'
import type { Settings as S } from '../../lib/types'
import { Button, Card, Field, Input, Textarea, ErrorBox, SuccessBox, Badge } from '../../components/ui'
import PushPrompt from '../../components/PushPrompt'

const TABLES = ['settings', 'profiles', 'categories', 'products', 'lots', 'stock_movements', 'delivery_zones', 'slots', 'orders', 'order_items', 'alerts', 'notifications', 'audit_log']

interface Health {
  server_time: string; postgres_version: string; schema_version: string; pg_cron_installed: boolean; realtime_tables: string[]
  counts: Record<string, number>; notifications: { pending: number; failed: number; sent: number }
  last_job: { ran_at: string; details: Record<string, number> } | null; rls_disabled_tables: string[]; timezone_setting: string
}
interface Notif { id: number; event: string; recipient: string | null; channel: string; status: string; attempts: number; subject: string | null; last_error: string | null; created_at: string }

export default function Settings() {
  const { isAdmin, session, profile } = useAuth()
  const { reload } = useSettings()
  const conn = useConnection()
  const [s, setS] = useState<S | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [push, setPush] = useState<{ configured: boolean; pg_net: boolean; devices: number; staff_devices: number } | null>(null)
  const [tables, setTables] = useState<Record<string, { ok: boolean; ms: number; err?: string }>>({})
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const diagnose = useCallback(async () => {
    setBusy(true); setErr(null)
    await conn.check()
    try { setHealth(await rpc<Health>('system_health')) } catch (e) { setErr(errMsg(e)); setHealth(null) }
    rpc<typeof push>('push_health').then(setPush).catch(() => setPush(null))
    const res: typeof tables = {}
    await Promise.all(TABLES.map(async t => {
      const t0 = performance.now()
      const { error } = await supabase.from(t).select('*', { count: 'exact', head: true })
      res[t] = { ok: !error, ms: Math.round(performance.now() - t0), err: error?.message }
    }))
    setTables(res)
    const { data } = await supabase.from('notifications').select('*').order('id', { ascending: false }).limit(30)
    setNotifs((data as Notif[]) ?? [])
    setBusy(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => setS(data as S))
    diagnose()
  }, [diagnose])

  async function save() {
    if (!s) return
    setErr(null); setOk(null)
    const { id, ...rest } = s; void id
    const { error } = await supabase.from('settings').update(rest).eq('id', 1)
    if (error) setErr(errMsg(error)); else { setOk('Paramètres enregistrés.'); reload() }
  }
  const set = (k: keyof S, v: unknown) => setS(x => ({ ...x!, [k]: v }))
  const Row = ({ label, ok: good, value }: { label: string; ok: boolean | null; value: React.ReactNode }) => (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      {good === null ? <AlertTriangle className="h-4 w-4 text-carrot" /> : good ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : <XCircle className="h-4 w-4 text-tomato" />}
      <span className="w-48 flex-none text-gray-600">{label}</span><span className="min-w-0 break-all font-medium">{value}</span>
    </div>
  )
  const rtExpected = ['orders', 'alerts', 'lots', 'stock_movements', 'notifications', 'slots', 'products']

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-900">Paramètres</h1>

      {/* ---------- Diagnostic base de données ---------- */}
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Database className="h-5 w-5 text-brand-700" />Connexion à la base de données (Supabase)</h2>
          <Button variant="secondary" className="ml-auto" loading={busy} onClick={diagnose}><RefreshCw className="h-4 w-4" />Tester maintenant</Button>
        </div>
        <div className="divide-y">
          <Row label="URL du projet" ok={true} value={SUPABASE_URL} />
          <Row label="Clé publique" ok={true} value={`${SUPABASE_KEY.slice(0, 18)}…`} />
          <Row label="Liaison API (ping)" ok={conn.state === 'online' ? true : conn.state === 'checking' ? null : false}
            value={{ online: `Connectée — ${conn.latency} ms`, offline: 'Injoignable (réseau, URL ou clé ?)', not_initialized: 'Joignable mais scripts SQL non exécutés', checking: 'Vérification…' }[conn.state]} />
          <Row label="Temps réel (websocket)" ok={conn.realtime === 'SUBSCRIBED' ? true : conn.realtime === 'connecting' ? null : false} value={conn.realtime === 'SUBSCRIBED' ? 'Abonné — mises à jour instantanées' : conn.realtime} />
          <Row label="Session" ok={!!session} value={`${session?.user.email} · rôle ${profile?.role}`} />
          {health && <>
            <Row label="Heure serveur" ok={true} value={`${fmtDateTime(health.server_time)} (fuseau activité : ${health.timezone_setting})`} />
            <Row label="PostgreSQL / schéma" ok={true} value={`${health.postgres_version} · schéma BENDO v${health.schema_version}`} />
            <Row label="Sécurité RLS" ok={health.rls_disabled_tables.length === 0} value={health.rls_disabled_tables.length ? `RLS désactivé sur : ${health.rls_disabled_tables.join(', ')}` : 'Activée sur toutes les tables'} />
            <Row label="Tables temps réel" ok={rtExpected.every(t => health.realtime_tables.includes(t))} value={health.realtime_tables.join(', ') || 'aucune'} />
            <Row label="Tâches automatiques" ok={health.pg_cron_installed ? true : null} value={health.pg_cron_installed ? 'pg_cron actif (toutes les 5 min / 1 h)' : 'pg_cron absent : tâches lancées à l\'ouverture du tableau de bord'} />
            <Row label="Dernière exécution" ok={!!health.last_job} value={health.last_job ? `${fmtDateTime(health.last_job.ran_at)} — ${Object.entries(health.last_job.details).map(([k, v]) => `${k}: ${v}`).join(', ')}` : 'jamais'} />
            <Row label="Notifications push" ok={push ? (push.configured && push.pg_net ? true : null) : false}
              value={!push ? 'Script 007 non exécuté' : !push.pg_net ? 'Extension pg_net absente' : !push.configured ? 'Envoi non configuré (voir README, étape « notifications push »)'
                : `Actif — ${push.devices} appareil(s) abonné(s), dont ${push.staff_devices} de l'équipe`} />
            <Row label="Notifications" ok={health.notifications.failed === 0} value={`${health.notifications.pending} en attente · ${health.notifications.sent} envoyées · ${health.notifications.failed} en échec`} />
            <Row label="Volumes" ok={true} value={Object.entries(health.counts).map(([k, v]) => `${k} ${v}`).join(' · ')} />
          </>}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {TABLES.map(t => tables[t] && <Badge key={t} cls={tables[t].ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{tables[t].ok ? '✓' : '✗'} {t} {tables[t].ms} ms</Badge>)}
        </div>
        <ErrorBox>{err}</ErrorBox>
        <PushPrompt staff compact />
        {isAdmin && <Button variant="secondary" onClick={async () => { try { const r = await rpc('run_maintenance', { p_force: true }); setOk(`Maintenance exécutée : ${JSON.stringify(r)}`); diagnose() } catch (e) { setErr(errMsg(e)) } }}>Lancer les tâches automatiques maintenant</Button>}
      </Card>

      {/* ---------- Paramètres de l'activité ---------- */}
      {s && <Card className="space-y-3">
        <h2 className="text-lg font-bold">Activité {!isAdmin && <span className="text-xs font-normal text-gray-500">(lecture seule — administrateur)</span>}</h2>
        <fieldset disabled={!isAdmin} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nom de la boutique"><Input value={s.shop_name} onChange={e => set('shop_name', e.target.value)} /></Field>
            <Field label="Devise (code ISO)" hint="EUR, XAF, XOF, CDF…"><Input value={s.currency} onChange={e => set('currency', e.target.value.toUpperCase())} maxLength={3} /></Field>
            <Field label="Fuseau horaire" hint="ex. Europe/Paris, Africa/Douala"><Input value={s.timezone} onChange={e => set('timezone', e.target.value)} /></Field>
            <Field label="Réservation panier (min)" hint="Paiement en ligne"><Input type="number" value={s.reservation_minutes} onChange={e => set('reservation_minutes', parseInt(e.target.value))} /></Field>
            <Field label="Délai de préparation min. (h)"><Input type="number" value={s.min_prep_hours} onChange={e => set('min_prep_hours', parseInt(e.target.value))} /></Field>
            <Field label="Heure limite commande du jour"><Input type="time" value={s.same_day_cutoff?.slice(0, 5)} onChange={e => set('same_day_cutoff', e.target.value)} /></Field>
            <Field label="Alerte DLC par défaut (jours)"><Input type="number" value={s.default_expiry_alert_days} onChange={e => set('default_expiry_alert_days', parseInt(e.target.value))} /></Field>
            <Field label="E-mail de contact"><Input value={s.contact_email ?? ''} onChange={e => set('contact_email', e.target.value)} /></Field>
            <Field label="Téléphone de contact"><Input value={s.contact_phone ?? ''} onChange={e => set('contact_phone', e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={s.allow_guest_checkout} onChange={e => set('allow_guest_checkout', e.target.checked)} />Commande sans compte (invité)</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-brand-700" checked={s.allow_pickup} onChange={e => set('allow_pickup', e.target.checked)} />Retrait sur place</label>
          </div>
          <Field label="Adresse du point de retrait"><Input value={s.pickup_address ?? ''} onChange={e => set('pickup_address', e.target.value)} /></Field>
          <Field label="Informations de livraison (accueil)"><Textarea value={s.delivery_info ?? ''} onChange={e => set('delivery_info', e.target.value)} /></Field>
          <Field label="Mentions légales"><Textarea rows={4} value={s.legal_notice ?? ''} onChange={e => set('legal_notice', e.target.value)} /></Field>
          <Field label="Conditions générales de vente"><Textarea rows={4} value={s.terms ?? ''} onChange={e => set('terms', e.target.value)} /></Field>
          <Field label="Politique de confidentialité"><Textarea rows={4} value={s.privacy_policy ?? ''} onChange={e => set('privacy_policy', e.target.value)} /></Field>
        </fieldset>
        <SuccessBox>{ok}</SuccessBox>
        {isAdmin && <Button onClick={save}>Enregistrer les paramètres</Button>}
      </Card>}

      {/* ---------- File des notifications ---------- */}
      <Card>
        <h2 className="mb-2 text-lg font-bold">Notifications récentes</h2>
        <p className="mb-2 text-xs text-gray-500">Les notifications sont mises en file d'attente dans la base. L'envoi réel des e-mails/SMS nécessite de brancher un prestataire (voir README — fonction <code>send-notifications</code>).</p>
        <ul className="divide-y text-xs">
          {notifs.map(n => (
            <li key={n.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <Badge cls={n.status === 'sent' ? 'bg-green-100 text-green-800' : n.status === 'failed' ? 'bg-red-100 text-red-800' : n.status === 'skipped' ? 'bg-gray-100' : 'bg-amber-100 text-amber-800'}>{n.status}</Badge>
              <span className="font-semibold">{n.event}</span><span>{n.channel} → {n.recipient ?? '—'}</span><span className="text-gray-500">{fmtDateTime(n.created_at)}</span>
              {n.last_error && <span className="text-tomato">{n.last_error}</span>}
              {isAdmin && n.status === 'failed' && <button className="text-brand-700 underline" onClick={async () => { await supabase.from('notifications').update({ status: 'pending' }).eq('id', n.id); diagnose() }}>Réessayer</button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
