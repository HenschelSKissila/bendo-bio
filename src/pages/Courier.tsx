import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Bike, MapPin, Phone, Package, CheckCircle2, Wallet, Clock, Navigation, LogOut, Store } from 'lucide-react'
import { supabase, rpc, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useNotifications } from '../lib/notifications'
import { money, fmtDateTime, fmtTime, UNIT_LABEL } from '../lib/format'
import type { OrderStatus, Unit } from '../lib/types'
import PushPrompt from '../components/PushPrompt'
import ConnectionDot from '../components/ConnectionDot'
import ThemeToggle from '../components/ThemeToggle'
import { Button, Card, Field, Input, Select, Textarea, Modal, ErrorBox, Spinner, Empty, StatusBadge } from '../components/ui'

interface Avail { id: string; order_number: string; status: OrderStatus; area: string | null; city: string | null; slot_start: string | null; slot_end: string | null
  delivery_fee: number; subtotal: number; total: number; payment_status: string; items: number }
interface Mine extends Omit<Avail, 'items'> { street: string | null; instructions: string | null; customer: string | null; phone: string | null
  payment_method: string; customer_note: string | null; departed_at: string | null; items: { name: string; qty: number; unit: Unit }[] | null }
interface Hist { id: string; order_number: string; status: OrderStatus; area: string | null; delivered_at: string | null; received_by: string | null; delivery_fee: number; total: number; payment_status: string; failure_reason: string | null }
interface Board { available: Avail[]; mine: Mine[]; history: Hist[]; stats: { delivered: number; fees: number; this_month: number } }

const slotTxt = (a: string | null, b: string | null) => a ? `${new Date(a).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(a)}–${b ? fmtTime(b) : ''}` : 'Sans créneau'

export default function Courier() {
  const { session, profile, loading, signOut, isStaff } = useAuth()
  const { list: notifs, toast, dismissToast } = useNotifications()
  const [b, setB] = useState<Board | null>(null)
  const [tab, setTab] = useState<'avail' | 'mine' | 'hist'>('mine')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deliver, setDeliver] = useState<Mine | null>(null)
  const [fail, setFail] = useState<Mine | null>(null)
  const [cash, setCash] = useState<null | { o: Mine; method: string; amount: string; ref: string }>(null)
  const [recv, setRecv] = useState({ rel: 'self', name: '' })
  const [code, setCode] = useState('')
  const [codeMsg, setCodeMsg] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const ch = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isCourier = profile?.role === 'courier' && profile.active

  const load = useCallback(async () => {
    try { const r = await rpc<Board>('courier_board'); setB(r); setErr(null) } catch (e) { setErr(errMsg(e)) }
  }, [])
  // rafraîchissement : à chaque notification, quand un autre livreur prend/rend une livraison, et toutes les 30 s
  useEffect(() => {
    if (!isCourier && !isStaff) return
    load()
    const c = supabase.channel('courier-board', { config: { broadcast: { self: false } } }).on('broadcast', { event: 'refresh' }, () => load()).subscribe()
    ch.current = c
    const t = setInterval(load, 30000)
    return () => { clearInterval(t); supabase.removeChannel(c) }
  }, [isCourier, isStaff, load])
  useEffect(() => { if (notifs.length) load() }, [notifs.length, load])
  useEffect(() => { if (b && tab === 'mine' && b.mine.length === 0 && b.available.length > 0) setTab('avail') }, [b]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/connexion?next=/livreur" />
  if (!isCourier && !isStaff) return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-6 text-center shadow">
      <Bike className="mx-auto h-10 w-10 text-brand-700" />
      <h1 className="mt-2 text-lg font-bold">Espace livreur</h1>
      <p className="mt-2 text-sm text-gray-600">{profile?.requested_role === 'courier' ? 'Votre demande d\'accès livreur est en attente de validation par l\'administrateur. Vous serez notifié(e).' : 'Cet espace est réservé aux livreurs validés par BENDO BIO.'}</p>
      <Link to="/" className="mt-4 inline-block text-brand-700 underline">Retour à la boutique</Link>
    </div>
  )

  const act = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key); setErr(null)
    try { await fn(); after?.(); await load(); ch.current?.send({ type: 'broadcast', event: 'refresh', payload: {} }) }
    catch (e) { setErr(errMsg(e)); await load() } finally { setBusy(null) }
  }
  const receivedBy = (o: Mine) => recv.rel === 'self' ? `${o.customer ?? 'Le client'} (en personne)` : `${recv.name.trim()} (${recv.rel})`
  const toCollect = (o: { payment_status: string; total: number }) => o.payment_status === 'paid' ? 'Déjà payé' : money(o.total)

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
          <img src="/logo.png" className="h-9 w-9" alt="" /><div className="flex-1"><div className="font-display text-brand-700">Bendo Bio</div><div className="text-[11px] text-gray-500">Espace livreur · {profile?.full_name}</div></div>
          <ConnectionDot compact />
          <ThemeToggle className="!p-1" />
          {isStaff && <Link to="/admin" className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800">Gestion</Link>}
          <Link to="/" aria-label="Boutique"><Store className="h-5 w-5 text-brand-700" /></Link>
          <button aria-label="Déconnexion" onClick={signOut}><LogOut className="h-5 w-5 text-gray-600" /></button>
        </div>
        <div className="mx-auto flex max-w-2xl gap-1 px-3 pb-2">
          {([['avail', 'À prendre', b?.available.length], ['mine', 'Mes livraisons', b?.mine.length], ['hist', 'Historique', b?.history.length]] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {l}{n ? <span className={`ml-1 rounded-full px-1.5 text-xs ${tab === k ? 'bg-white text-brand-800' : 'bg-tomato text-white'}`}>{n}</span> : null}
            </button>
          ))}
        </div>
      </header>

      {toast && (
        <button onClick={() => { dismissToast(); load() }} className="fixed inset-x-3 top-24 z-50 mx-auto block max-w-md rounded-2xl border-2 border-carrot bg-white p-4 text-left shadow-2xl">
          <div className="font-bold text-brand-900">{toast.subject}</div>{toast.body && <div className="text-sm text-gray-700">{toast.body}</div>}
        </button>
      )}
      <main className="mx-auto max-w-2xl space-y-3 p-3">
        <PushPrompt compact courier />
        <ErrorBox>{err}</ErrorBox>
        {b && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="!p-2"><div className="text-xs text-gray-500">Ce mois</div><div className="text-xl font-bold text-brand-800">{b.stats.this_month}</div></Card>
            <Card className="!p-2"><div className="text-xs text-gray-500">Livrées</div><div className="text-xl font-bold text-brand-800">{b.stats.delivered}</div></Card>
            <Card className="!p-2"><div className="text-xs text-gray-500">Frais livrés</div><div className="text-base font-bold text-brand-800">{money(b.stats.fees)}</div></Card>
          </div>
        )}
        {!b ? <Spinner /> : tab === 'avail' ? (
          b.available.length === 0 ? <Empty>Aucune livraison disponible pour le moment. Vous serez notifié(e) dès qu'une nouvelle arrive.</Empty> :
          b.available.map(o => (
            <Card key={o.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div><div className="flex items-center gap-1 text-lg font-bold text-brand-900"><MapPin className="h-5 w-5 text-tomato" />{o.area ?? '—'}</div>
                  <div className="text-sm text-gray-600"><Clock className="mr-1 inline h-4 w-4" />{slotTxt(o.slot_start, o.slot_end)}</div></div>
                <StatusBadge s={o.status} />
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-2 text-center text-sm">
                <div><div className="text-xs text-gray-500">Frais livraison</div><div className="font-bold text-brand-800">{money(o.delivery_fee)}</div></div>
                <div><div className="text-xs text-gray-500">Marchandise</div><div className="font-bold">{money(o.subtotal)}</div></div>
                <div><div className="text-xs text-gray-500">À encaisser</div><div className="font-bold">{toCollect(o)}</div></div>
              </div>
              <div className="text-xs text-gray-500">{o.order_number} · {o.items} article(s) · adresse et téléphone visibles après prise en charge</div>
              <Button className="w-full" loading={busy === o.id} onClick={() => act(o.id, () => rpc('courier_claim', { p_order: o.id }), () => setTab('mine'))}>
                <Bike className="h-4 w-4" />Je prends cette livraison
              </Button>
            </Card>
          ))
        ) : tab === 'mine' ? (
          b.mine.length === 0 ? <Empty>Aucune livraison en cours. Consultez l'onglet « À prendre ».</Empty> :
          b.mine.map(o => (
            <Card key={o.id} className="space-y-3 border-brand-300">
              <div className="flex items-start justify-between gap-2">
                <div><div className="flex items-center gap-1 text-lg font-bold text-brand-900"><MapPin className="h-5 w-5 text-tomato" />{o.area}</div>
                  <div className="text-sm text-gray-600">{slotTxt(o.slot_start, o.slot_end)} · <span className="font-mono">{o.order_number}</span></div></div>
                <StatusBadge s={o.status} />
              </div>
              <div className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm">
                <div className="text-base font-semibold">{o.customer}</div>
                {o.phone && <a href={`tel:${o.phone.replace(/\s/g, '')}`} className="flex items-center gap-1 font-semibold text-brand-700"><Phone className="h-4 w-4" />{o.phone}</a>}
                <div>{o.street}, {o.area}, {o.city}</div>
                {o.instructions && <div className="rounded bg-amber-50 p-1.5 text-amber-900">📝 {o.instructions}</div>}
                {o.customer_note && <div className="text-gray-600">💬 {o.customer_note}</div>}
                <a target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.street ?? ''} ${o.area ?? ''} ${o.city ?? ''}`)}`}><Navigation className="h-4 w-4" />Itinéraire</a>
              </div>
              <details className="text-sm"><summary className="cursor-pointer font-semibold"><Package className="mr-1 inline h-4 w-4" />{o.items?.length ?? 0} article(s)</summary>
                <ul className="mt-1 list-disc pl-6">{o.items?.map((i, k) => <li key={k}>{i.name} × {Number(i.qty).toLocaleString('fr-FR')} {UNIT_LABEL[i.unit]}</li>)}</ul></details>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-2 text-center text-sm">
                <div><div className="text-xs text-gray-500">Frais livraison</div><div className="font-bold text-brand-800">{money(o.delivery_fee)}</div></div>
                <div><div className="text-xs text-gray-500">Marchandise</div><div className="font-bold">{money(o.subtotal)}</div></div>
                <div><div className="text-xs text-gray-500">À encaisser</div><div className={`font-bold ${o.payment_status === 'paid' ? 'text-brand-700' : 'text-tomato'}`}>{toCollect(o)}</div></div>
              </div>
              {/* actions selon l'étape */}
              {['confirmed', 'preparing'].includes(o.status) && <p className="rounded-xl bg-gray-100 p-2 text-center text-sm text-gray-700">⏳ En préparation. Vous recevrez « Commande prête » pour venir la récupérer.</p>}
              <div className="grid gap-2">
                {['ready', 'delivery_failed'].includes(o.status) && <Button loading={busy === o.id} onClick={() => act(o.id, () => rpc('set_order_status', { p_order: o.id, p_status: 'out_for_delivery' }))}><Bike className="h-4 w-4" />{o.status === 'ready' ? 'Commande récupérée — livraison en cours' : 'Nouvelle tentative de livraison'}</Button>}
                {o.status === 'out_for_delivery' && <>
                  <Button variant="warning" loading={busy === `n${o.id}`} onClick={() => act(`n${o.id}`, () => rpc('notify_order_event', { p_order: o.id, p_event: 'nearby' }))}><MapPin className="h-4 w-4" />Je suis dans le quartier (prévenir le client)</Button>
                  <Button onClick={() => { setRecv({ rel: 'self', name: '' }); setCode(''); setCodeMsg(null); setDeliver(o) }}><CheckCircle2 className="h-4 w-4" />Livraison effectuée (code client)</Button>
                  <Button variant="secondary" onClick={() => { setNote(''); setFail(o) }}>Livraison impossible</Button>
                </>}
                {o.payment_status !== 'paid' && ['out_for_delivery', 'delivered'].includes(o.status) &&
                  <Button variant={o.status === 'delivered' ? 'primary' : 'secondary'} onClick={() => setCash({ o, method: o.payment_method === 'mobile_money_on_delivery' ? 'mobile_money' : 'especes', amount: String(o.total), ref: '' })}><Wallet className="h-4 w-4" />Argent encaissé</Button>}
                {['confirmed', 'preparing', 'ready'].includes(o.status) && <button className="text-sm text-gray-500 underline" onClick={() => confirm('Rendre cette livraison ? Elle redeviendra disponible pour les autres livreurs.') && act(o.id, () => rpc('courier_release', { p_order: o.id, p_reason: 'Rendue par le livreur' }))}>Je ne peux plus faire cette livraison</button>}
              </div>
            </Card>
          ))
        ) : (
          b.history.length === 0 ? <Empty>Pas encore de livraison effectuée.</Empty> : (
            <Card className="divide-y !p-0">
              {b.history.map(h => (
                <div key={h.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="font-semibold">{h.area}</span><StatusBadge s={h.status} /></div>
                  <div className="text-xs text-gray-500">{fmtDateTime(h.delivered_at)} · <span className="font-mono">{h.order_number}</span></div>
                  {h.received_by && <div>Remise à : {h.received_by}</div>}
                  {h.failure_reason && <div className="text-tomato">Échec : {h.failure_reason}</div>}
                  <div className="mt-1 flex justify-between"><span>Frais : <strong>{money(h.delivery_fee)}</strong></span><span>{h.payment_status === 'paid' ? '✅ Encaissé' : '⏳ Non encaissé'}</span></div>
                </div>
              ))}
            </Card>
          )
        )}
      </main>

      <Modal open={!!deliver} onClose={() => setDeliver(null)} title="Livraison effectuée">
        {deliver && <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-900">Demandez au client son <strong>code de livraison</strong> (6 caractères) au moment de lui remettre la commande. Sans ce code, la livraison ne peut pas être confirmée.</p>
          <Field label="Code de livraison du client" required>
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8))} autoFocus
              inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="ex. 8MRCB3" className="text-center font-mono text-2xl tracking-[0.3em]" />
          </Field>
          {codeMsg && <p role="alert" className="text-sm font-semibold text-tomato">{codeMsg}</p>}
          <p className="text-xs text-gray-500">Date et heure enregistrées automatiquement : {new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Le client est notifié.</p>
          <Field label="Commande remise à" required>
            <Select value={recv.rel} onChange={e => setRecv({ ...recv, rel: e.target.value })}>
              <option value="self">Le client en personne ({deliver.customer ?? '—'})</option>
              <option value="sa fille">Sa fille</option><option value="son fils">Son fils</option><option value="son épouse">Son épouse</option>
              <option value="son époux">Son époux</option><option value="un parent">Un parent</option><option value="un voisin">Un voisin</option>
              <option value="le gardien">Le gardien</option><option value="autre personne">Autre personne</option>
            </Select>
          </Field>
          {recv.rel !== 'self' && <Field label="Nom de la personne" required><Input value={recv.name} onChange={e => setRecv({ ...recv, name: e.target.value })} placeholder="ex. Adèle" /></Field>}
          <Button className="w-full" loading={busy === 'd'} disabled={code.length < 6 || (recv.rel !== 'self' && recv.name.trim().length < 2)}
            onClick={() => act('d', async () => {
              const r = await rpc<{ ok: boolean; locked?: boolean; remaining?: number }>('courier_confirm_delivery', { p_order: deliver.id, p_code: code, p_received_by: receivedBy(deliver) })
              if (!r.ok) {
                setCodeMsg(r.locked ? 'Code bloqué après 5 erreurs. Appelez BENDO BIO (+242 06 606 70 58) : seul l\'administrateur peut confirmer.' : `Code incorrect. Il reste ${r.remaining} essai(s).`)
                throw new Error(r.locked ? 'Code bloqué' : 'Code incorrect')
              }
            }, () => setDeliver(null))}>Valider la livraison avec le code</Button>
        </div>}
      </Modal>
      <Modal open={!!fail} onClose={() => setFail(null)} title="Livraison impossible">
        <div className="space-y-3">
          <Field label="Motif" required><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Client absent, injoignable, adresse introuvable…" /></Field>
          <Button className="w-full" variant="warning" loading={busy === 'f'} disabled={note.trim().length < 3}
            onClick={() => fail && act('f', () => rpc('set_order_status', { p_order: fail.id, p_status: 'delivery_failed', p_note: note }), () => setFail(null))}>Enregistrer l'échec</Button>
        </div>
      </Modal>
      <Modal open={!!cash} onClose={() => setCash(null)} title="Argent encaissé">
        {cash && <div className="space-y-3">
          <Field label="Moyen" required><Select value={cash.method} onChange={e => setCash({ ...cash, method: e.target.value })}><option value="especes">Espèces</option><option value="mobile_money">Mobile money</option></Select></Field>
          <Field label="Montant encaissé" required><Input type="number" min="0" value={cash.amount} onChange={e => setCash({ ...cash, amount: e.target.value })} /></Field>
          {cash.method === 'mobile_money' && <Field label="N° de transaction"><Input value={cash.ref} onChange={e => setCash({ ...cash, ref: e.target.value })} /></Field>}
          <Button className="w-full" loading={busy === 'c'} disabled={!(parseFloat(cash.amount) > 0)}
            onClick={() => act('c', () => rpc('confirm_payment', { p_order: cash.o.id, p_provider: cash.method, p_external_ref: cash.ref.trim() || null, p_amount: parseFloat(cash.amount) }), () => setCash(null))}>
            Confirmer · {money(parseFloat(cash.amount) || 0)}</Button>
        </div>}
      </Modal>
    </div>
  )
}
