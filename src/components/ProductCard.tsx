import { Link } from 'react-router-dom'
import { ShoppingBasket, Check } from 'lucide-react'
import { useState } from 'react'
import type { Product, Stock } from '../lib/types'
import { money, unitPrice, UNIT_LABEL, num } from '../lib/format'
import { useCart } from '../lib/cart'
import { Badge } from './ui'
import { categoryIcons, categoryImages } from '../lib/hooks'

export function availabilityOf(p: Product, s?: Stock) {
  const av = Number(s?.available ?? 0)
  if (p.status === 'unavailable' || av <= 0) return { av: 0, label: 'Indisponible', cls: 'bg-gray-200 text-gray-600' }
  if (av <= Number(p.low_threshold)) return { av, label: `Plus que ${num(av)} ${UNIT_LABEL[p.unit]}`, cls: 'bg-orange-100 text-orange-800' }
  return { av, label: 'En stock', cls: 'bg-green-100 text-green-800' }
}

export function ProductImage({ p, className = '' }: { p: Product; className?: string }) {
  const src = p.image_url || (p.category_id ? categoryImages[p.category_id] : undefined)
  return src
    ? <img src={src} alt={p.name} loading="lazy" className={`object-cover ${className}`} />
    : <div className={`flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 text-5xl ${className}`} aria-hidden>{(p.category_id && categoryIcons[p.category_id]) || '🥬'}</div>
}

export default function ProductCard({ p, s }: { p: Product; s?: Stock }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
  const a = availabilityOf(p, s)
  const inCart = cart.lines.find(l => l.product_id === p.id)?.quantity ?? 0
  const canAdd = a.av > 0 && inCart + Number(p.min_qty) <= a.av + 1e-9
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <Link to={`/produit/${p.id}`} className="relative block">
        <ProductImage p={p} className="aspect-square w-full" />
        {p.organic && <span className="absolute left-2 top-2 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Bio</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link to={`/produit/${p.id}`} className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-brand-700">{p.name}</Link>
        {p.packaging && <span className="text-xs text-gray-500">{p.packaging}</span>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <div className="text-base font-bold text-brand-800">{money(p.price)} <span className="text-xs font-normal text-gray-500">{unitPrice(p.unit)}</span></div>
            <Badge cls={a.cls}>{a.label}</Badge>
          </div>
          <button aria-label={`Ajouter ${p.name} au panier`} disabled={!canAdd}
            onClick={() => { cart.add(p.id, Number(p.min_qty)); setAdded(true); setTimeout(() => setAdded(false), 1200) }}
            className="rounded-xl bg-brand-700 p-2.5 text-white transition hover:bg-brand-800 disabled:bg-gray-300">
            {added ? <Check className="h-5 w-5" /> : <ShoppingBasket className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
