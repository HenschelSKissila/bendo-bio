import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Megaphone, ArrowLeft } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { useStaffBadges } from '../../lib/staffBadges'
import { fmtDateTime } from '../../lib/format'
import type { Product, Profile } from '../../lib/types'
import { KIND_LABEL, type Msg } from '../shop/Messages'
import { Button, Card, Field, Input, Select, Textarea, ErrorBox, SuccessBox, Spinner, Empty, Badge } from '../../components/ui'

interface Ann { id: number; title: string; body: string; audience: string; recipients: number; created_at: string; expires_at: string | null }

/** Messagerie de l'équipe : conversations clients + annonces / promotions. */
export default function Messaging() {
  const { reload: reloadBadges } = useStaffBadges()
  const [tab, setTab] = useState<'conv' | 'ann'>('conv')
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [people, setPeople] = useState<Record<string, Profile>>({})
  const [products, setProducts] = useState<Product[]>([])
  const [anns, setAnns] = useState<Ann[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [a, setA] = useState({ title: '', body: '', product: '', audience: 'marketing', days: '7' })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  // fait défiler la conversation jusqu'au dernier message, sans faire bouger la page
  const toBottom = () => { const box = end.current?.parentElement; if (box) box.scrollTop = box.scrollHeight }

  const load = useCallback(async () => {
    const [m, an] = await Promise.all([
      supabase.from('messages').select('*').order('created_at').limit(3000),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    const list = (m.data as Msg[]) ?? []
    setMsgs(list); setAnns((an.data as Ann[]) ?? [])
    const ids = [...new Set(list.map(x => x.customer_id))]
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('*').in('id', ids)
      setPeople(Object.fromEntries(((data as Profile[]) ?? []).map(p => [p.id, p])))
    }
  }, [])
  useEffect(() => { load(); supabase.from('products').select('*').order('name').then(({ data }) => setProducts((data as Product[]) ?? [])) }, [load])
  useRealtime(['messages', 'announcements'], load)
  const threads = useMemo(() => {
    const t = new Map<string, { last: Msg; unread: number }>()
    for (const m of msgs ?? []) {
      const cur = t.get(m.customer_id) ?? { last: m, unread: 0 }
      cur.last = m; if (!m.from_staff && !m.read_by_staff_at) cur.unread++
      t.set(m.customer_id, cur)
    }
    return [...t.entries()].sort((x, y) => y[1].last.created_at.localeCompare(x[1].last.created_at))
  }, [msgs])
  const thread = (msgs ?? []).filter(m => m.customer_id === sel)
  useEffect(() => {
    if (!sel) return
    toBottom()
    if (thread.some(m => !m.from_staff && !m.read_by_staff_at)) rpc('mark_messages_read', { p_customer: sel }).then(() => { load(); reloadBadges() }).catch(() => {})
  }, [sel, thread.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const pname = (id: string | null) => products.find(p => p.id === id)?.name

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setErr(null); setOk(null); setBusy(true)
    try { await fn(); after?.(); await load(); reloadBadges() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Messagerie</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab('conv')} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === 'conv' ? 'bg-brand-700 text-white' : 'border bg-white'}`}>💬 Conversations clients</button>
        <button onClick={() => setTab('ann')} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === 'ann' ? 'bg-brand-700 text-white' : 'border bg-white'}`}>📣 Annonces & promotions</button>
      </div>
      <ErrorBox>{err}</ErrorBox><SuccessBox>{ok}</SuccessBox>

      {tab === 'conv' ? (!msgs ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className={`max-h-[70vh] divide-y overflow-y-auto !p-0 ${sel ? 'hidden lg:block' : ''}`}>
            {threads.length === 0 && <p className="p-4 text-sm text-gray-500">Aucun message de client pour le moment.</p>}
            {threads.map(([cid, t]) => (
              <button key={cid} onClick={() => setSel(cid)} className={`block w-full p-3 text-left hover:bg-brand-50 ${sel === cid ? 'bg-brand-50' : ''}`}>
                <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{people[cid]?.full_name ?? 'Client'}</span>
                  {t.unread > 0 && <Badge cls="bg-tomato text-white">{t.unread}</Badge>}</div>
                <div className="truncate text-xs text-gray-600">{t.last.from_staff ? 'Vous : ' : ''}{t.last.body}</div>
                <div className="text-[11px] text-gray-400">{fmtDateTime(t.last.created_at)}</div>
              </button>
            ))}
          </Card>
          {sel ? (
            <Card className="flex max-h-[75vh] flex-col !p-0">
              <div className="flex items-center gap-2 border-b p-3">
                <button className="lg:hidden" onClick={() => setSel(null)} aria-label="Retour"><ArrowLeft className="h-5 w-5" /></button>
                <div><div className="font-semibold">{people[sel]?.full_name}</div><div className="text-xs text-gray-500">{people[sel]?.phone} · {people[sel]?.email}</div></div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3">
                {thread.map(m => (
                  <div key={m.id} className={`flex ${m.from_staff ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.from_staff ? 'bg-brand-700 text-white' : 'bg-white'}`}>
                      {!m.from_staff && m.kind !== 'other' && KIND_LABEL[m.kind] && <div className="text-xs font-semibold text-carrot">{KIND_LABEL[m.kind]}{m.product_id ? ` : ${pname(m.product_id) ?? ''}` : ''}</div>}
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div className={`mt-0.5 text-[10px] ${m.from_staff ? 'text-brand-100' : 'text-gray-400'}`}>{fmtDateTime(m.created_at)}{m.from_staff && (m.read_by_customer_at ? ' · lu' : ' · envoyé')}</div>
                    </div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              <div className="space-y-2 border-t p-3">
                <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Votre réponse (le client reçoit une notification)…" />
                <Button className="w-full" loading={busy} disabled={reply.trim().length < 2} onClick={() => run(() => rpc('staff_send_message', { p_customer: sel, p_body: reply }), () => setReply(''))}><Send className="h-4 w-4" />Répondre</Button>
              </div>
            </Card>
          ) : <div className="hidden lg:block"><Empty>Choisissez une conversation.</Empty></div>}
        </div>
      )) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="flex items-center gap-2 font-bold"><Megaphone className="h-5 w-5 text-carrot" />Nouvelle annonce</h2>
            <Field label="Titre" required><Input value={a.title} maxLength={120} onChange={e => setA({ ...a, title: e.target.value })} placeholder="ex. Promo tomates 🍅" /></Field>
            <Field label="Message" required><Textarea value={a.body} maxLength={1000} onChange={e => setA({ ...a, body: e.target.value })} placeholder="ex. Nous avons de la bonne tomate pour le saka-saka : -20 % jusqu'à dimanche !" /></Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Produit lié"><Select value={a.product} onChange={e => setA({ ...a, product: e.target.value })}><option value="">— aucun —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Destinataires"><Select value={a.audience} onChange={e => setA({ ...a, audience: e.target.value })}>
                <option value="marketing">Clients ayant accepté les offres</option><option value="all">Tous les clients (information de service)</option></Select></Field>
              <Field label="Visible (jours)"><Input type="number" min="1" max="90" value={a.days} onChange={e => setA({ ...a, days: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-gray-500">Les promotions ne sont envoyées qu'aux clients qui ont accepté les offres (règle de consentement). « Tous les clients » est réservé aux informations de service (fermeture, changement d'horaires…).</p>
            <Button className="w-full" loading={busy} disabled={a.title.trim().length < 2 || a.body.trim().length < 2}
              onClick={() => run(async () => {
                const n = await rpc<number>('publish_announcement', { p_title: a.title, p_body: a.body, p_product: a.product || null, p_audience: a.audience, p_days: parseInt(a.days) || 7 })
                setOk(`Annonce envoyée à ${n} client(s) — notification dans l'application et sur leur téléphone.`)
              }, () => setA({ title: '', body: '', product: '', audience: 'marketing', days: '7' }))}><Send className="h-4 w-4" />Publier et notifier</Button>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Annonces publiées</h2>
            {anns.length === 0 ? <p className="text-sm text-gray-500">Aucune annonce.</p> : (
              <ul className="divide-y text-sm">
                {anns.map(x => (
                  <li key={x.id} className="py-2">
                    <div className="font-semibold">{x.title}</div><div className="text-gray-700">{x.body}</div>
                    <div className="text-xs text-gray-500">{fmtDateTime(x.created_at)} · {x.recipients} destinataire(s) · {x.audience === 'all' ? 'tous les clients' : 'clients « offres »'}
                      {x.expires_at && (new Date(x.expires_at) < new Date() ? ' · expirée' : ` · jusqu'au ${new Date(x.expires_at).toLocaleDateString('fr-FR')}`)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
