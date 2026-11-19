import { Link, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useCart } from '../../lib/cart'
import { useCatalog } from '../../lib/hooks'
import { money, unitPrice, UNIT_LABEL, num } from '../../lib/format'
import { ProductImage } from '../../components/ProductCard'
import { Button, QtyInput, Spinner, Empty, Card } from '../../components/ui'

export function useCartDetails() {
  const cart = useCart()
  const cat = useCatalog()
  const rows = cart.lines.map(l => {
    const p = cat.products.find(x => x.id === l.product_id)
    const av = Number(cat.stock[l.product_id]?.available ?? 0)
    return { ...l, p, av, problem: !p ? 'Produit retiré' : p.status !== 'active' || av <= 0 ? 'Indisponible' : l.quantity > av ? `Stock disponible : ${num(av)} ${UNIT_LABEL[p.unit]}` : null }
  })
  const subtotal = rows.reduce((s, r) => s + (r.p ? Math.round(r.p.price * r.quantity * 100) / 100 : 0), 0)
  return { cart, cat, rows, subtotal, hasProblem: rows.some(r => r.problem) }
}

export default function Cart() {
  const nav = useNavigate()
  const { cart, cat, rows, subtotal, hasProblem } = useCartDetails()
  if (cat.loading) return <Spinner />
  if (!rows.length) return <Empty>Votre panier est vide. <Link to="/catalogue" className="font-semibold text-brand-700 underline">Découvrir nos produits</Link></Empty>
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="mb-4 text-2xl font-bold text-brand-900">Mon panier</h1>
        <div className="space-y-3">
          {rows.map(r => (
            <Card key={r.product_id} className="flex gap-3">
              {r.p && <ProductImage p={r.p} className="h-20 w-20 flex-none rounded-xl" />}
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-semibold">{r.p?.name ?? 'Produit indisponible'}</div>
                    {r.p && <div className="text-xs text-gray-500">{money(r.p.price)} {unitPrice(r.p.unit)}</div>}
                  </div>
                  <button onClick={() => cart.remove(r.product_id)} aria-label="Retirer" className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-tomato"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="flex items-center justify-between">
                  {r.p && <QtyInput value={r.quantity} step={Number(r.p.qty_step)} min={Number(r.p.min_qty)} max={r.av} onChange={n => cart.set(r.product_id, n)} />}
                  <div className="font-bold text-brand-800">{r.p ? money(r.p.price * r.quantity) : '—'}</div>
                </div>
                {r.problem && <div className="text-sm font-medium text-tomato" role="alert">{r.problem} — ajustez la quantité.</div>}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Card className="h-fit lg:sticky lg:top-20">
        <div className="flex justify-between text-lg font-bold"><span>Sous-total</span><span>{money(subtotal)}</span></div>
        <p className="mt-1 text-xs text-gray-500">Frais de livraison calculés à l'étape suivante selon votre adresse. Prix TTC.</p>
        <Button className="mt-4 w-full" disabled={hasProblem} onClick={() => nav('/commande')}>Choisir livraison ou retrait</Button>
        <Link to="/catalogue" className="mt-3 block text-center text-sm font-medium text-brand-700">Continuer mes achats</Link>
      </Card>
    </div>
  )
}
