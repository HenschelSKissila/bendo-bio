import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { ShoppingBasket, User, LayoutDashboard, Bell, X, MessageCircle, Home, LayoutGrid } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/hooks'
import { useNotifications } from '../../lib/notifications'
import ThemeToggle from '../../components/ThemeToggle'
import ContactLinks from '../../components/ContactLinks'
import { useCart } from '../../lib/cart'
import { useAuth } from '../../lib/auth'
import { useSettings } from '../../lib/hooks'
import { BRAND } from '../../lib/brand'

export default function ShopLayout() {
  const { count } = useCart()
  const { session, isStaff, isCourier } = useAuth()
  const { settings } = useSettings()
  const { unread, toast, dismissToast } = useNotifications()
  // messages de l'équipe non lus par le client
  const [unreadMsg, setUnreadMsg] = useState(0)
  const uid = session?.user.id
  const loadMsg = useCallback(async () => {
    if (!uid) { setUnreadMsg(0); return }
    const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('customer_id', uid).eq('from_staff', true).is('read_by_customer_at', null)
    setUnreadMsg(count ?? 0)
  }, [uid])
  useEffect(() => { loadMsg() }, [loadMsg])
  useRealtime(['messages'], loadMsg, !!uid)
  const pill = (n: number) => n > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-tomato px-1 text-xs font-bold text-white">{n}</span> : null
  const tab = (to: string, label: string, Icon: typeof Home, n = 0, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand-700' : 'text-gray-600'}`}>
      <span className="relative"><Icon className="h-6 w-6" />{pill(n)}</span>{label}
    </NavLink>
  )
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link to="/" className="flex items-center gap-2" aria-label="Accueil BENDO BIO">
            <img src="/logo.png" alt="" className="h-11 w-11" />
            <span className="font-display text-xl text-brand-700">Bendo Bio</span>
          </Link>
          <nav className="ml-4 hidden gap-1 md:flex">
            <NavLink to="/catalogue" className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-50'}`}>Catalogue</NavLink>
            <NavLink to="/messages" end className={({ isActive }) => `relative rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-50'}`}>💬 Messages{unreadMsg > 0 && <span className="ml-1 rounded-full bg-tomato px-1.5 text-xs font-bold text-white">{unreadMsg}</span>}</NavLink>
            <NavLink to="/messages?onglet=promos" className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-50'}`}>Promotions</NavLink>
            <NavLink to="/suivi" className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-50'}`}>Suivre une commande</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {isCourier && <Link to="/livreur" className="flex items-center gap-1 rounded-xl bg-carrot px-3 py-2 text-sm font-semibold text-white" title="Espace livreur">🛵<span className="hidden sm:inline">Livraisons</span></Link>}
            {isStaff && <Link to="/admin" className="flex items-center gap-1 rounded-xl bg-brand-800 px-3 py-2 text-sm font-semibold text-white" title="Espace gestion"><LayoutDashboard className="h-4 w-4" /><span className="hidden sm:inline">Gestion</span></Link>}
            {session && (
              <Link to="/notifications" className="relative rounded-xl p-2.5 text-brand-800 hover:bg-brand-50" aria-label={`Notifications (${unread} non lue(s))`}>
                <Bell className="h-5 w-5" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-tomato px-1 text-xs font-bold text-white">{unread}</span>}
              </Link>
            )}
            <Link to={session ? '/compte' : '/connexion'} className="hidden rounded-xl p-2.5 text-brand-800 hover:bg-brand-50 md:block" aria-label="Mon compte"><User className="h-5 w-5" /></Link>
            <Link to="/panier" className="relative hidden rounded-xl p-2.5 text-brand-800 hover:bg-brand-50 md:block" aria-label={`Panier (${count} article(s))`}>
              <ShoppingBasket className="h-6 w-6" />
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-tomato px-1 text-xs font-bold text-white">{count}</span>}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:pb-5"><Outlet /></main>
      {toast && (
        <div role="status" className="fixed inset-x-3 top-20 z-50 mx-auto max-w-md rounded-2xl border border-brand-200 bg-white p-4 shadow-2xl sm:right-4 sm:left-auto">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 flex-none text-brand-700" />
            <Link to="/notifications" onClick={dismissToast} className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900">{toast.subject}</div>
              {toast.body && <div className="text-sm text-gray-700">{toast.body}</div>}
            </Link>
            <button onClick={dismissToast} aria-label="Fermer"><X className="h-4 w-4 text-gray-500" /></button>
          </div>
        </div>
      )}
      {/* Barre de navigation du bas (téléphone) — visible par tous les visiteurs */}
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
        {tab('/', 'Accueil', Home, 0, true)}
        {tab('/catalogue', 'Catalogue', LayoutGrid)}
        {tab('/messages', 'Messages', MessageCircle, unreadMsg)}
        {tab(session ? '/compte' : '/connexion', 'Compte', User)}
        {tab('/panier', 'Panier', ShoppingBasket, count)}
      </nav>
      <footer className="mb-16 mt-10 bg-brand-900 text-brand-100 md:mb-0">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
          <div>
            <div className="font-display text-2xl text-white">Bendo Bio</div>
            <p className="mt-2 text-brand-200">Produits frais et bio, livrés à la demande ou à retirer sur créneau. Chaque commande est vérifiée par nos agents.</p>
          </div>
          <div>
            <div className="font-semibold text-white">Contact</div>
            <ContactLinks phone={settings?.contact_phone || BRAND.phone} email={settings?.contact_email || BRAND.email}
              address={`${settings?.pickup_address || BRAND.address}, ${BRAND.country}`} />
          </div>
          <div className="flex flex-col gap-1">
            <Link to="/legal/mentions" className="hover:underline">Mentions légales</Link>
            <Link to="/legal/cgv" className="hover:underline">Conditions générales de vente</Link>
            <Link to="/legal/confidentialite" className="hover:underline">Politique de confidentialité</Link>
            <Link to="/connexion?staff=1" className="mt-2 text-brand-300 hover:underline">Accès personnel</Link>
          </div>
        </div>
        <div className="border-t border-brand-800 px-4 py-4 text-center text-xs text-brand-300">
          © {BRAND.year} {BRAND.name} — {BRAND.cities}, {BRAND.country}. Tous droits réservés. · Application créée par {BRAND.creator}.
        </div>
      </footer>
    </div>
  )
}
