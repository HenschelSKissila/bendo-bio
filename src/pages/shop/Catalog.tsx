import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCatalog } from '../../lib/hooks'
import ProductCard from '../../components/ProductCard'
import { Input, Select, Spinner, Empty, ErrorBox } from '../../components/ui'

export default function Catalog() {
  const { products, categories, stock, loading, error } = useCatalog()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [onlyAvail, setOnlyAvail] = useState(false)
  const [sort, setSort] = useState('name')
  const cat = sp.get('cat') ?? ''
  const list = useMemo(() => {
    const c = categories.find(x => x.slug === cat)
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    let l = products.filter(p => (!c || p.category_id === c.id)
      && (!q || norm(`${p.name} ${p.description ?? ''} ${p.origin ?? ''}`).includes(norm(q)))
      && (!onlyAvail || Number(stock[p.id]?.available ?? 0) > 0))
    if (sort === 'price') l = [...l].sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') l = [...l].sort((a, b) => b.price - a.price)
    return l
  }, [products, categories, stock, cat, q, onlyAvail, sort])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-brand-900">Catalogue</h1>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setSp({})} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${!cat ? 'bg-brand-700 text-white' : 'bg-white text-brand-800 border border-brand-200'}`}>Tout</button>
        {categories.map(c => (
          <button key={c.id} onClick={() => setSp({ cat: c.slug })}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${cat === c.slug ? 'bg-brand-700 text-white' : 'bg-white text-brand-800 border border-brand-200'}`}>
            {c.image_url ? <img src={c.image_url} alt="" className="mr-1 inline h-6 w-6 rounded-md align-middle" /> : `${c.icon} `}{c.name}
          </button>
        ))}
      </div>
      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input type="search" placeholder="Rechercher un produit (tomate, oignon…)" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher" />
        <Select value={sort} onChange={e => setSort(e.target.value)} aria-label="Trier">
          <option value="name">Trier : nom</option><option value="price">Prix croissant</option><option value="price-desc">Prix décroissant</option>
        </Select>
        <label className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm">
          <input type="checkbox" checked={onlyAvail} onChange={e => setOnlyAvail(e.target.checked)} className="h-4 w-4 accent-brand-700" /> Disponibles uniquement
        </label>
      </div>
      <ErrorBox>{error}</ErrorBox>
      {loading ? <Spinner /> : list.length === 0 ? <Empty>Aucun produit ne correspond à votre recherche.</Empty> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map(p => <ProductCard key={p.id} p={p} s={stock[p.id]} />)}
        </div>
      )}
    </div>
  )
}
