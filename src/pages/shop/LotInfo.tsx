import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { rpc, errMsg } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmtDay, daysUntil } from '../../lib/format'
import { BRAND } from '../../lib/brand'
import { Card, Spinner, ErrorBox, Badge } from '../../components/ui'

interface LotPub { lot_number: string; received_at: string; expiry_date: string | null; expiry_kind: string | null; status: string; sellable: boolean
  product: string; sku: string; origin: string | null; conservation: string | null; allergens: string | null; organic: boolean; image_url: string | null; product_id: string }

/** Page ouverte en scannant le QR code d'une étiquette de lot (traçabilité publique). */
export default function LotInfo() {
  const { id } = useParams()
  const { isStaff } = useAuth()
  const [l, setL] = useState<LotPub | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { rpc<LotPub | null>('lot_public', { p_lot: id }).then(setL).catch(e => { setErr(errMsg(e)); setL(null) }) }, [id])
  if (l === undefined) return <Spinner />
  if (!l) return <Card className="mx-auto max-w-md"><ErrorBox>{err ?? 'Étiquette inconnue.'}</ErrorBox></Card>
  const d = daysUntil(l.expiry_date)
  const tone = d === null ? 'bg-gray-100 text-gray-700' : d < 0 ? 'bg-red-600 text-white' : d <= 2 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
  return (
    <div className="mx-auto max-w-md space-y-4">
      {isStaff && (
        <Link to={`/admin/scanner?code=${encodeURIComponent(window.location.href)}`} className="block rounded-2xl bg-brand-800 p-4 text-center font-semibold text-white">
          Gérer ce lot : sortie, perte, inventaire, blocage →
        </Link>
      )}
      <Card className="space-y-3 text-center">
        <img src="/logo.png" alt="BENDO BIO" className="mx-auto h-20 w-20" />
        <div className="flex items-center justify-center gap-1 text-sm font-semibold text-brand-700"><ShieldCheck className="h-4 w-4" />Produit tracé par BENDO BIO</div>
        <h1 className="text-2xl font-bold text-brand-900">{l.product}</h1>
        <div className="font-mono text-sm text-gray-600">Réf. {l.sku} · Lot {l.lot_number}</div>
        {l.expiry_date && <div><Badge cls={`${tone} !text-base !px-4 !py-1`}>{l.expiry_kind ?? 'DLC'} : {fmtDay(l.expiry_date)}{d !== null && d >= 0 ? ` (J-${d})` : ' — dépassée'}</Badge></div>}
        {!l.sellable && <p className="text-sm font-semibold text-tomato">Ce lot n'est plus proposé à la vente.</p>}
      </Card>
      <Card>
        <dl className="divide-y text-sm">
          {[['Reçu le', fmtDay(l.received_at)], ['Origine', l.origin], ['Agriculture biologique', l.organic ? 'Oui' : 'Non'], ['Conservation', l.conservation], ['Allergènes', l.allergens]]
            .map(([k, v]) => <div key={k} className="grid grid-cols-3 gap-2 py-2"><dt className="text-gray-600">{k}</dt><dd className="col-span-2">{v || '—'}</dd></div>)}
        </dl>
      </Card>
      <p className="text-center text-sm text-gray-600">Une question sur ce produit ? {BRAND.phone} · {BRAND.email} · <a href={BRAND.facebook} target="_blank" rel="noreferrer" className="text-brand-700 underline">Facebook</a></p>
      <div className="text-center"><Link to={`/produit/${l.product_id}`} className="font-semibold text-brand-700 underline">Commander ce produit</Link></div>
    </div>
  )
}
