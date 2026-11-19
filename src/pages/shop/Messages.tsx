import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Send, Megaphone } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useRealtime } from '../../lib/hooks'
import { fmtDateTime } from '../../lib/format'
import type { Product } from '../../lib/types'
import { Button, Card, Select, Textarea, ErrorBox, Spinner, Empty } from '../../components/ui'

export interface Msg { id: number; customer_id: string; from_staff: boolean; kind: string; product_id: string | null; body: string; created_at: string; read_by_customer_at: string | null; read_by_staff_at: string | null }
interface Ann { id: number; title: string; body: string; product_id: string | null; created_at: string; expires_at: string | null }
export const KIND_LABEL: Record<string, string> = { availability: '🔎 Disponibilité d\'un produit', special_request: '✨ Demande spéciale (hors catalogue)', order: '🧾 À propos d\'une commande', other: '💬 Autre question', reply: '' }

/** Messagerie du client avec BENDO BIO + annonces / promotions. */
export default function Messages() {
  const { session, loading } = useAuth()
  const [sp] = useSearchParams()
  const [tab, setTab] = useState<'chat' | 'promo'>(sp.get('onglet') === 'promos' ? 'promo' : 'chat')
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [anns, setAnns] = useState<Ann[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [body, setBody] = useState('')
  const [kind, setKind] = useState(sp.get('produit') ? 'availability' : 'other')
  const [product, setProduct] = useState(sp.get('produit') ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const uid = session?.user.id

  const load = useCallback(async () => {
    if (!uid) return
    const [m, a] = await Promise.all([
      supabase.from('messages').select('*').eq('customer_id', uid).order('created_at'),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(30),
    ])
    setMsgs((m.data as Msg[]) ?? []); setAnns((a.data as Ann[]) ?? [])
    rpc('mark_messages_read').catch(() => {})
  }, [uid])
  useEffect(() => { load(); supabase.from('products').select('*').neq('status', 'hidden').order('name').then(({ data }) => setProducts((data as Product[]) ?? [])) }, [load])
  useRealtime(['messages', 'announcements'], load, !!uid)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs?.length])

  if (loading) return <Spinner />
  if (!session) return <Navigate to={`/connexion?next=${encodeURIComponent('/messages' + window.location.search)}`} />
  const pname = (id: string | null) => products.find(p => p.id === id)?.name

  async function send() {
    setErr(null); setBusy(true)
    try { await rpc('send_customer_message', { p_body: body, p_kind: kind, p_product: kind === 'availability' && product ? product : null }); setBody(''); await load() }
    catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Messages</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab('chat')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${tab === 'chat' ? 'bg-brand-700 text-white' : 'border bg-white'}`}>💬 Écrire à BENDO BIO</button>
        <button onClick={() => setTab('promo')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${tab === 'promo' ? 'bg-brand-700 text-white' : 'border bg-white'}`}>📣 Promotions & infos {anns.length ? `(${anns.length})` : ''}</button>
      </div>
      {tab === 'chat' ? (
        <>
          <Card className="max-h-[55vh] space-y-2 overflow-y-auto bg-gray-50">
            {!msgs ? <Spinner /> : msgs.length === 0 ? <Empty>Posez votre question : disponibilité d'un produit, demande d'un article qui n'est pas au catalogue, question sur une commande… L'équipe vous répond ici et vous recevez une notification.</Empty>
              : msgs.map(m => (
                <div key={m.id} className={`flex ${m.from_staff ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.from_staff ? 'bg-white text-gray-900' : 'bg-brand-700 text-white'}`}>
                    {m.from_staff && <div className="text-xs font-bold text-brand-700">BENDO BIO</div>}
                    {!m.from_staff && KIND_LABEL[m.kind] && m.kind !== 'other' && <div className="text-xs opacity-80">{KIND_LABEL[m.kind]}{m.product_id ? ` : ${pname(m.product_id) ?? ''}` : ''}</div>}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className={`mt-0.5 text-[10px] ${m.from_staff ? 'text-gray-400' : 'text-brand-100'}`}>{fmtDateTime(m.created_at)}{!m.from_staff && (m.read_by_staff_at ? ' · lu' : ' · envoyé')}</div>
                  </div>
                </div>
              ))}
            <div ref={end} />
          </Card>
          <Card className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={kind} onChange={e => setKind(e.target.value)} aria-label="Sujet">
                {['availability', 'special_request', 'order', 'other'].map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </Select>
              {kind === 'availability' && (
                <Select value={product} onChange={e => setProduct(e.target.value)} aria-label="Produit">
                  <option value="">— choisir le produit —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </div>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={2000}
              placeholder={kind === 'special_request' ? 'ex. Pouvez-vous me trouver du manioc frais, 5 kg pour samedi ?' : kind === 'availability' ? 'ex. Quand aurez-vous de nouveau ce produit ?' : 'Votre message…'} />
            <ErrorBox>{err}</ErrorBox>
            <Button className="w-full" loading={busy} disabled={body.trim().length < 2} onClick={send}><Send className="h-4 w-4" />Envoyer</Button>
          </Card>
        </>
      ) : (
        anns.length === 0 ? <Empty>Aucune promotion en cours. Activez « Recevoir les offres » dans votre compte pour être prévenu(e).</Empty> :
        anns.map(a => (
          <Card key={a.id} className="space-y-1 border-carrot/40">
            <div className="flex items-center gap-2 font-bold text-brand-900"><Megaphone className="h-5 w-5 text-carrot" />{a.title}</div>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{a.body}</p>
            <div className="flex justify-between text-xs text-gray-500"><span>{fmtDateTime(a.created_at)}{a.expires_at ? ` · jusqu'au ${new Date(a.expires_at).toLocaleDateString('fr-FR')}` : ''}</span>
              {a.product_id && <Link to={`/produit/${a.product_id}`} className="font-semibold text-brand-700 underline">Voir le produit</Link>}</div>
          </Card>
        ))
      )}
    </div>
  )
}
