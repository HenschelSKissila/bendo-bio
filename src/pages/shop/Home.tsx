import { Link } from 'react-router-dom'
import { Truck, Store, Leaf, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCatalog, useSettings } from '../../lib/hooks'
import ProductCard from '../../components/ProductCard'
import { Spinner, ErrorBox } from '../../components/ui'

export default function Home() {
  const { products, categories, stock, loading, error } = useCatalog()
  const { settings } = useSettings()
  const featured = products.filter(p => p.featured && p.status === 'active').slice(0, 8)
  const [promo, setPromo] = useState<{ title: string; body: string; product_id: string | null } | null>(null)
  useEffect(() => { supabase.from('announcements').select('title, body, product_id').order('created_at', { ascending: false }).limit(1).then(({ data }) => setPromo(data?.[0] ?? null)) }, [])
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-10 text-white sm:px-10">
        <div className="relative z-10 max-w-xl">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">Bendo Bio</h1>
          <p className="mt-3 text-lg text-brand-50">Fruits, légumes, volailles et produits frais bio, récoltés et élevés près de chez vous, livrés sur le créneau de votre choix.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/catalogue" className="rounded-xl bg-white px-5 py-3 font-semibold text-brand-800 shadow hover:bg-brand-50">Voir le catalogue</Link>
            <Link to="/suivi" className="rounded-xl border border-white/60 px-5 py-3 font-semibold text-white hover:bg-white/10">Suivre ma commande</Link>
          </div>
        </div>
        <img src="/logo.png" alt="" className="absolute right-6 top-1/2 hidden h-72 w-72 -translate-y-1/2 object-contain drop-shadow-2xl md:block" />
      </section>

      {promo && (
        <Link to={promo.product_id ? `/produit/${promo.product_id}` : '/messages?onglet=promos'} className="block rounded-2xl border-2 border-carrot bg-orange-50 p-4 hover:bg-orange-100">
          <div className="font-bold text-orange-900">📣 {promo.title}</div><div className="text-sm text-orange-900">{promo.body}</div>
        </Link>
      )}

      <ErrorBox>{error && `Impossible de charger le catalogue (${error}). Vérifiez la configuration de la base dans Gestion > Paramètres.`}</ErrorBox>

      <section>
        <h2 className="mb-3 text-xl font-bold text-brand-900">Nos rayons</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {categories.map(c => (
            <Link key={c.id} to={`/catalogue?cat=${c.slug}`} className="flex flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white font-semibold text-brand-900 shadow-sm hover:border-brand-300">
              {c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                : <span className="flex aspect-[4/3] items-center justify-center text-5xl" aria-hidden>{c.icon}</span>}
              <span className="px-3 py-2 text-sm">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-900">Sélection du moment</h2>
          <Link to="/catalogue" className="text-sm font-semibold text-brand-700 hover:underline">Tout voir →</Link>
        </div>
        {loading ? <Spinner /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map(p => <ProductCard key={p.id} p={p} s={stock[p.id]} />)}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          [Truck, 'Livraison à la demande', 'Aux frais du client, dans les quartiers desservis de Pointe-Noire'],
          [Store, 'Retrait sur place', settings?.pickup_address || 'Ngoyo centrale, Pointe-Noire'],
          [Clock, 'Vérifié par nos agents', 'Chaque commande est contrôlée avant la remise'],
          [Leaf, 'Frais & traçable', 'Suivi des lots et des dates limites'],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof Truck
          return (
            <div key={t as string} className="rounded-2xl bg-white p-4 shadow-sm">
              <I className="h-6 w-6 text-brand-600" />
              <div className="mt-2 font-semibold text-brand-900">{t as string}</div>
              <div className="text-sm text-gray-600">{d as string}</div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
