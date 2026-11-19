import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Truck, Store } from 'lucide-react'
import { supabase, rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useSettings } from '../../lib/hooks'
import { money, fmtTime, PAYMENT_LABEL } from '../../lib/format'
import type { Fulfillment } from '../../lib/types'
import { useCartDetails } from './Cart'
import { Button, Card, Field, Input, Textarea, ErrorBox, Spinner, Empty } from '../../components/ui'

interface ZoneCheck { ok: boolean; zone_id?: string; name?: string; fee?: number; min_order?: number; free_above?: number | null }
interface AvSlot { id: string; starts_at: string; ends_at: string; remaining: number }
interface Addr { id: string; street: string; city: string; postal_code: string; instructions: string | null; label: string }

export default function Checkout() {
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const { settings } = useSettings()
  const { cart, cat, rows, subtotal, hasProblem } = useCartDetails()
  const [ff, setFf] = useState<Fulfillment>('delivery')
  const [f, setF] = useState({ name: '', email: '', phone: '', street: '', city: '', postal: '', instructions: '', note: '' })
  const [zone, setZone] = useState<ZoneCheck | null>(null)
  const [slots, setSlots] = useState<AvSlot[] | null>(null)
  const [slot, setSlot] = useState<string>('')
  const [pay, setPay] = useState<'cash_on_delivery' | 'mobile_money_on_delivery'>('cash_on_delivery')
  const [terms, setTerms] = useState(false)
  const [saveAddr, setSaveAddr] = useState(true)
  const [addrs, setAddrs] = useState<Addr[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    if (profile) setF(s => ({ ...s, name: s.name || profile.full_name || '', email: s.email || profile.email || '', phone: s.phone || profile.phone || '' }))
    if (session) supabase.from('addresses').select('*').eq('user_id', session.user.id).then(({ data }) => setAddrs((data as Addr[]) ?? []))
  }, [profile, session])

  // vérification de zone dès que le code postal est saisi
  useEffect(() => {
    if (ff !== 'delivery' || f.postal.trim().length < 3) { setZone(null); return }
    const t = setTimeout(() => rpc<ZoneCheck>('check_zone', { p_postal: f.postal }).then(setZone).catch(() => setZone(null)), 350)
    return () => clearTimeout(t)
  }, [f.postal, ff])

  // créneaux disponibles (capacité réelle, délai de préparation, zone)
  useEffect(() => {
    setSlot(''); setSlots(null)
    if (ff === 'delivery' && !zone?.ok) return
    rpc<AvSlot[]>('available_slots', { p_type: ff, p_postal: ff === 'delivery' ? f.postal : null }).then(setSlots).catch(e => setErr(errMsg(e)))
  }, [ff, zone?.ok, zone?.zone_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (cat.loading) return <Spinner />
  if (!rows.length) return <Empty>Votre panier est vide. <Link to="/catalogue" className="text-brand-700 underline">Catalogue</Link></Empty>

  const fee = ff === 'delivery' && zone?.ok ? (zone.free_above != null && subtotal >= zone.free_above ? 0 : Number(zone.fee)) : 0
  const minOk = ff !== 'delivery' || !zone?.ok || subtotal >= Number(zone.min_order ?? 0)
  const total = subtotal + fee
  const contactOk = f.name.trim() && f.phone.trim().length >= 6
  const addrOk = ff === 'pickup' || (zone?.ok && f.street.trim() && f.city.trim())
  const canSubmit = !hasProblem && contactOk && addrOk && slot && terms && minOk && (session || settings?.allow_guest_checkout)

  const byDay = (slots ?? []).reduce<Record<string, AvSlot[]>>((acc, s) => {
    const d = new Date(s.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    ;(acc[d] ||= []).push(s); return acc
  }, {})

  async function submit() {
    setErr(null); setBusy(true)
    try {
      const res = await rpc<{ id: string; order_number: string; total: number }>('place_order', {
        p: {
          items: cart.lines, fulfillment: ff, street: f.street, city: f.city, postal_code: f.postal, instructions: f.instructions,
          slot_id: slot, payment_method: pay, guest_name: f.name, guest_email: f.email, guest_phone: f.phone,
          note: f.note, accept_terms: terms, save_address: saveAddr,
        },
      })
      cart.clear()
      try { sessionStorage.setItem('bendo-last-order', JSON.stringify({ ...res, contact: f.phone })) } catch { /* ignore */ }
      nav(`/commande/merci`)
    } catch (e) {
      setErr(errMsg(e))
      // créneau complet entre-temps : recharger les créneaux
      rpc<AvSlot[]>('available_slots', { p_type: ff, p_postal: ff === 'delivery' ? f.postal : null }).then(setSlots).catch(() => {})
      cat.reload()
    } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-brand-900">Finaliser ma commande</h1>
        {!session && (
          <Card className="bg-brand-50 text-sm">
            Vous avez un compte ? <Link to="/connexion?next=/commande" className="font-semibold text-brand-700 underline">Connectez-vous</Link> pour retrouver vos adresses et votre historique.
            {!settings?.allow_guest_checkout && <div className="mt-1 font-semibold text-tomato">La commande sans compte est désactivée.</div>}
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-bold">1. Mode de réception</h2>
          <div className="grid grid-cols-2 gap-3">
            {([['delivery', Truck, 'Livraison', 'À votre adresse'], ['pickup', Store, 'Retrait', settings?.pickup_address ?? 'Au point de retrait']] as const)
              .filter(([k]) => k === 'delivery' || settings?.allow_pickup !== false)
              .map(([k, I, t, d]) => (
                <button key={k} type="button" onClick={() => setFf(k)} aria-pressed={ff === k}
                  className={`rounded-2xl border-2 p-4 text-left transition ${ff === k ? 'border-brand-600 bg-brand-50' : 'border-gray-200 bg-white'}`}>
                  <I className="h-6 w-6 text-brand-700" /><div className="mt-1 font-semibold">{t}</div><div className="text-xs text-gray-600">{d}</div>
                </button>
              ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">2. Coordonnées {ff === 'delivery' && '& adresse'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom complet" required><Input value={f.name} onChange={up('name')} autoComplete="name" /></Field>
            <Field label="Téléphone" required hint="Pour vous joindre le jour de la livraison"><Input type="tel" value={f.phone} onChange={up('phone')} autoComplete="tel" /></Field>
            <Field label="E-mail" hint="Pour recevoir la confirmation"><Input type="email" value={f.email} onChange={up('email')} autoComplete="email" /></Field>
          </div>
          {ff === 'delivery' && (
            <>
              {addrs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {addrs.map(a => (
                    <button key={a.id} type="button" className="rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-brand-50"
                      onClick={() => setF(s => ({ ...s, street: a.street, city: a.city, postal: a.postal_code, instructions: a.instructions ?? '' }))}>
                      📍 {a.label} — {a.street}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                <Field label="Rue / quartier" required><Input value={f.street} onChange={up('street')} autoComplete="street-address" /></Field>
                <Field label="Code postal" required error={zone && !zone.ok ? 'Adresse hors zone desservie. Choisissez le retrait sur place.' : null}
                  hint={zone?.ok ? `✓ ${zone.name} — livraison ${money(zone.fee)}${zone.free_above ? `, offerte dès ${money(zone.free_above)}` : ''}` : undefined}>
                  <Input value={f.postal} onChange={up('postal')} autoComplete="postal-code" inputMode="numeric" />
                </Field>
                <Field label="Ville" required><Input value={f.city} onChange={up('city')} autoComplete="address-level2" /></Field>
                <Field label="Instructions (interphone, étage…)"><Input value={f.instructions} onChange={up('instructions')} /></Field>
              </div>
              {session && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveAddr} onChange={e => setSaveAddr(e.target.checked)} className="accent-brand-700" /> Enregistrer cette adresse</label>}
            </>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">3. Créneau de {ff === 'delivery' ? 'livraison' : 'retrait'}</h2>
          {ff === 'delivery' && !zone?.ok ? <p className="text-sm text-gray-500">Saisissez un code postal desservi pour voir les créneaux.</p>
            : slots === null ? <Spinner label="Recherche des créneaux…" />
            : slots.length === 0 ? <p className="text-sm text-gray-600">Aucun créneau disponible pour le moment. Réessayez plus tard ou contactez-nous.</p>
            : <div className="space-y-3">
                {Object.entries(byDay).map(([d, ss]) => (
                  <div key={d}>
                    <div className="mb-1 text-sm font-semibold capitalize text-gray-700">{d}</div>
                    <div className="flex flex-wrap gap-2">
                      {ss.map(s => (
                        <button key={s.id} type="button" onClick={() => setSlot(s.id)} aria-pressed={slot === s.id}
                          className={`rounded-xl border-2 px-3 py-2 text-sm font-medium ${slot === s.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white hover:border-brand-300'}`}>
                          {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                          {s.remaining <= 2 && <span className={`ml-1 text-xs ${slot === s.id ? 'text-white' : 'text-orange-600'}`}>({s.remaining} place{s.remaining > 1 ? 's' : ''})</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">4. Paiement</h2>
          {(['cash_on_delivery', 'mobile_money_on_delivery'] as const).map(k => (
            <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${pay === k ? 'border-brand-600 bg-brand-50' : 'border-gray-200'}`}>
              <input type="radio" name="pay" checked={pay === k} onChange={() => setPay(k)} className="accent-brand-700" />
              <span className="font-medium">{PAYMENT_LABEL[k]}</span>
            </label>
          ))}
          <p className="text-xs text-gray-500">Le paiement en ligne par carte sera activé dès le choix du prestataire de paiement.</p>
          <Field label="Message pour l'équipe (optionnel)"><Textarea value={f.note} onChange={up('note')} rows={2} /></Field>
        </Card>
      </div>

      <Card className="h-fit space-y-3 lg:sticky lg:top-20">
        <h2 className="font-bold">Récapitulatif</h2>
        <ul className="space-y-1 text-sm">
          {rows.map(r => <li key={r.product_id} className="flex justify-between gap-2"><span>{r.p?.name} × {r.quantity.toLocaleString('fr-FR')}</span><span>{r.p ? money(r.p.price * r.quantity) : ''}</span></li>)}
        </ul>
        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between"><span>Sous-total</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between"><span>{ff === 'delivery' ? 'Livraison' : 'Retrait'}</span><span>{fee ? money(fee) : 'Offert'}</span></div>
          <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total TTC</span><span>{money(total)}</span></div>
          {!minOk && <p className="text-xs font-medium text-tomato">Minimum de commande pour cette zone : {money(zone?.min_order)}</p>}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-1 accent-brand-700" />
          <span>J'accepte les <Link to="/legal/cgv" target="_blank" className="text-brand-700 underline">conditions de vente</Link> et la <Link to="/legal/confidentialite" target="_blank" className="text-brand-700 underline">politique de confidentialité</Link>.</span>
        </label>
        <ErrorBox>{err}</ErrorBox>
        <Button className="w-full py-3 text-base" disabled={!canSubmit} loading={busy} onClick={submit}>Confirmer la commande · {money(total)}</Button>
        {!canSubmit && <p className="text-xs text-gray-500">Complétez : {[!contactOk && 'coordonnées', !addrOk && 'adresse', !slot && 'créneau', !terms && 'conditions'].filter(Boolean).join(', ')}</p>}
      </Card>
    </div>
  )
}
