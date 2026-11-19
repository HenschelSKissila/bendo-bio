import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCatalog } from '../../lib/hooks'
import { useCart } from '../../lib/cart'
import { money, unitPrice, UNIT_LABEL, num } from '../../lib/format'
import { availabilityOf, ProductImage } from '../../components/ProductCard'
import { Button, QtyInput, Spinner, Badge, Empty } from '../../components/ui'

export default function ProductPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { products, categories, stock, loading } = useCatalog()
  const cart = useCart()
  const p = products.find(x => x.id === id)
  const [qty, setQty] = useState<number | null>(null)
  if (loading) return <Spinner />
  if (!p) return <Empty>Produit introuvable. <Link className="text-brand-700 underline" to="/catalogue">Retour au catalogue</Link></Empty>
  const a = availabilityOf(p, stock[p.id])
  const inCart = cart.lines.find(l => l.product_id === p.id)?.quantity ?? 0
  const maxAdd = Math.max(0, a.av - inCart)
  const q = qty ?? Number(p.min_qty)
  const cat = categories.find(c => c.id === p.category_id)
  const info: [string, string | null][] = [
    ['Origine', p.origin], ['Conditionnement', p.packaging], ['Ingrédients', p.ingredients],
    ['Allergènes', p.allergens], ['Conservation', p.conservation],
  ]
  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700"><ArrowLeft className="h-4 w-4" /> Retour</button>
      <div className="grid gap-6 md:grid-cols-2">
        <ProductImage p={p} className="aspect-square w-full rounded-3xl" />
        <div>
          {cat && <div className="text-sm font-medium text-brand-600">{cat.icon} {cat.name}</div>}
          <h1 className="mt-1 text-3xl font-bold text-brand-900">{p.name}</h1>
          <div className="mt-2 text-2xl font-bold text-brand-800">{money(p.price)} <span className="text-base font-normal text-gray-500">{unitPrice(p.unit)}</span></div>
          <div className="mt-2 flex flex-wrap gap-2"><Badge cls={a.cls}>{a.label}</Badge>{p.organic && <Badge cls="bg-brand-100 text-brand-800">Agriculture biologique</Badge>}</div>
          {p.variable_weight && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Produit au poids variable : le prix final est recalculé selon le poids réel pesé à la préparation. Vous êtes informé(e) de tout écart.</p>}
          {p.description && <p className="mt-4 text-gray-700">{p.description}</p>}
          {a.av > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <QtyInput value={q} step={Number(p.qty_step)} min={Number(p.min_qty)} max={maxAdd} onChange={setQty} />
              <span className="text-sm text-gray-600">{UNIT_LABEL[p.unit]} · {money(p.price * q)}</span>
              <Button disabled={q > maxAdd + 1e-9} onClick={() => { cart.add(p.id, q); nav('/panier') }}>Ajouter au panier</Button>
              {inCart > 0 && <span className="w-full text-xs text-gray-500">Déjà {num(inCart)} {UNIT_LABEL[p.unit]} dans votre panier.</span>}
            </div>
          ) : <div className="mt-5 space-y-2"><p className="font-semibold text-gray-500">Ce produit est momentanément indisponible.</p>
            <Link to={`/messages?produit=${p.id}`} className="inline-block rounded-xl border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">🔎 Demander quand il sera disponible</Link></div>}
          <dl className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-2 p-3 text-sm"><dt className="font-medium text-gray-600">{k}</dt><dd className="col-span-2 text-gray-900">{v || '—'}</dd></div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
