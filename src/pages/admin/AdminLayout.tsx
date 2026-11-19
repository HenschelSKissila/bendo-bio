import { useEffect, useState } from 'react'
import { NavLink, Outlet, Navigate, Link, useNavigate } from 'react-router-dom'
import { MessageCircle, Sun, ClipboardList, Package, Boxes, Users, CalendarClock, Bell, BarChart3, Settings, ShieldCheck, MapPin, History, Store, LogOut, ScanLine } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import ConnectionDot from '../../components/ConnectionDot'
import { StaffBadgesProvider, useStaffBadges, NavBadges, type StaffBadges } from '../../lib/staffBadges'
import PushPrompt from '../../components/PushPrompt'
import ThemeToggle from '../../components/ThemeToggle'
import { pushState } from '../../lib/push'
import { Spinner } from '../../components/ui'

const NAV = [
  { to: '/admin', label: "Aujourd'hui", icon: Sun, end: true },
  { to: '/admin/commandes', label: 'Commandes', icon: ClipboardList },
  { to: '/admin/stock', label: 'Stock', icon: Boxes },
  { to: '/admin/scanner', label: 'Scanner', icon: ScanLine },
  { to: '/admin/produits', label: 'Produits', icon: Package },
  { to: '/admin/creneaux', label: 'Créneaux', icon: CalendarClock },
  { to: '/admin/alertes', label: 'Alertes', icon: Bell },
  { to: '/admin/messagerie', label: 'Messagerie', icon: MessageCircle },
  { to: '/admin/clients', label: 'Clients', icon: Users },
  { to: '/admin/rapports', label: 'Rapports', icon: BarChart3 },
  { to: '/admin/zones', label: 'Zones', icon: MapPin, admin: true },
  { to: '/admin/utilisateurs', label: 'Utilisateurs', icon: ShieldCheck, admin: true },
  { to: '/admin/journal', label: "Journal d'audit", icon: History, admin: true },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
]

type Badge = { n: number; tone: 'new' | 'todo' | 'critical'; title: string }
function badgesFor(to: string, b: StaffBadges | null): Badge[] {
  if (!b) return []
  switch (to) {
    case '/admin': return [{ n: b.to_prepare + b.to_deliver, tone: 'todo', title: 'commande(s) à préparer ou à livrer' }]
    case '/admin/commandes': return [{ n: b.new_orders, tone: 'new', title: 'nouvelle(s) commande(s) depuis votre dernière visite' },
      { n: b.to_prepare, tone: 'todo', title: 'à préparer' }]
    case '/admin/clients': return [{ n: b.new_customers, tone: 'new', title: 'nouveau(x) client(s) inscrit(s)' },
      { n: b.data_requests, tone: 'todo', title: 'demande(s) RGPD à traiter' }]
    case '/admin/messagerie': return [{ n: b.unread_messages ?? 0, tone: 'new', title: 'message(s) client non lu(s)' }]
    case '/admin/produits': return [{ n: b.new_products, tone: 'new', title: 'nouvel(s) article(s) ajouté(s)' }]
    case '/admin/stock': return [{ n: b.new_lots, tone: 'new', title: 'nouvelle(s) réception(s) de stock' }]
    case '/admin/alertes': return [{ n: b.critical_alerts, tone: 'critical', title: 'alerte(s) critique(s)' },
      { n: b.open_alerts - b.critical_alerts, tone: 'todo', title: 'autre(s) alerte(s) ouverte(s)' }]
    case '/admin/utilisateurs': return [{ n: b.role_requests, tone: 'todo', title: 'demande(s) d\'accès livreur / gestionnaire' }]
    default: return []
  }
}

export default function AdminLayout() {
  const { isStaff } = useAuth()
  return <StaffBadgesProvider enabled={isStaff}><AdminShell /></StaffBadgesProvider>
}

function AdminShell() {
  const { loading, session, isStaff, isAdmin, isCourier, profile, signOut } = useAuth()
  const nav = useNavigate()
  const { b: badges, reload: reloadBadges } = useStaffBadges()
  const [toast, setToast] = useState<string | null>(null)
  const [askPush, setAskPush] = useState(() => {
    try { return ['default', 'ios_needs_install'].includes(pushState()) && localStorage.getItem('bendo-push-dismissed') !== '1' } catch { return false }
  })

  // notification instantanée d'une nouvelle commande
  useEffect(() => {
    if (!isStaff) return
    const ch = supabase.channel('new-orders').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, p => {
      const n = (p.new as { order_number?: string }).order_number
      setToast(`Nouvelle commande ${n ?? ''}`)
      try { navigator.vibrate?.(200) } catch { /* ignore */ }
      setTimeout(() => setToast(null), 8000)
      reloadBadges()
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, p => {
      const r = p.new as { full_name?: string; requested_role?: string | null }
      setToast(r.requested_role ? `Demande d'accès ${r.requested_role === 'courier' ? 'livreur' : 'gestionnaire'} : ${r.full_name ?? ''}` : `Nouveau client inscrit : ${r.full_name ?? ''}`)
      setTimeout(() => setToast(null), 8000)
      reloadBadges()
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isStaff])

  if (loading) return <Spinner />
  if (!session) return <Navigate to="/connexion?staff=1&next=/admin" />
  if (!isStaff && isCourier) return <Navigate to="/livreur" />
  if (!isStaff) return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-6 text-center shadow">
      <h1 className="text-lg font-bold">Accès réservé au personnel</h1>
      <p className="mt-2 text-sm text-gray-600">Votre compte ({session.user.email}) n'a pas les droits gestionnaire.{profile?.requested_role === 'employee' ? ' Votre demande est en attente de validation par l\'administrateur.' : ' Demandez à l\'administrateur de vous attribuer le rôle « Gestionnaire ».'}</p>
      {profile?.active === false && <p className="mt-2 text-sm font-semibold text-tomato">Ce compte est désactivé.</p>}
      <div className="mt-4 flex justify-center gap-2"><Link to="/" className="text-brand-700 underline">Boutique</Link> · <Link to="/installation" className="text-brand-700 underline">Installation</Link></div>
    </div>
  )
  const items = NAV.filter(n => !n.admin || isAdmin)
  const link = (n: typeof NAV[number], mobile = false) => (
    <NavLink key={n.to} to={n.to} end={n.end}
      className={({ isActive }) => mobile
        ? `flex flex-none flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-brand-700 text-white' : 'text-brand-900'}`
        : `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-700 text-white' : 'text-brand-900 hover:bg-brand-50'}`}>
      {mobile ? (
        <span className="relative"><n.icon className="h-5 w-5" />
          {badgesFor(n.to, badges).some(x => x.n > 0) && <span className="absolute -right-2 -top-2 rounded-full bg-tomato px-1 text-[10px] font-bold text-white">{badgesFor(n.to, badges).reduce((a, x) => a + x.n, 0)}</span>}
        </span>
      ) : <n.icon className="h-5 w-5 flex-none" />}
      {n.label}
      {!mobile && <NavBadges items={badgesFor(n.to, badges)} />}
    </NavLink>
  )
  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      <aside className="hidden w-60 flex-none flex-col border-r border-gray-200 bg-white p-3 lg:flex print:hidden">
        <Link to="/admin" className="mb-4 flex items-center gap-2 px-2"><img src="/logo.png" className="h-10 w-10" alt="" /><div><div className="font-display text-lg text-brand-700">Bendo Bio</div><div className="text-[11px] text-gray-500">Gestion</div></div></Link>
        <nav className="flex flex-1 flex-col gap-0.5">{items.map(n => link(n))}</nav>
        <div className="mt-3 space-y-2 border-t pt-3 text-xs">
          <div className="flex items-center justify-between"><ConnectionDot /><ThemeToggle withLabel className="!p-1.5" /></div>
          <div className="truncate text-gray-600">{profile?.full_name} · <span className="font-semibold">{profile?.role === 'admin' ? 'Administrateur' : 'Employé'}</span></div>
          <div className="flex gap-3"><Link to="/" className="flex items-center gap-1 text-brand-700"><Store className="h-3.5 w-3.5" />Boutique</Link>
            <button onClick={async () => { await signOut(); nav('/') }} className="flex items-center gap-1 text-gray-600"><LogOut className="h-3.5 w-3.5" />Déconnexion</button></div>
        </div>
      </aside>
      <div className="sticky top-0 z-30 border-b bg-white lg:hidden print:hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <Link to="/admin" className="flex items-center gap-2"><img src="/logo.png" className="h-8 w-8" alt="" /><span className="font-display text-brand-700">Bendo Bio</span></Link>
          <div className="flex items-center gap-3"><ConnectionDot compact /><ThemeToggle className="!p-1" /><Link to="/" aria-label="Boutique"><Store className="h-5 w-5 text-brand-700" /></Link>
            <button aria-label="Déconnexion" onClick={async () => { await signOut(); nav('/') }}><LogOut className="h-5 w-5 text-gray-600" /></button></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">{items.map(n => link(n, true))}</nav>
      </div>
      <main className="min-w-0 flex-1 p-3 sm:p-5">
        {askPush && (
          <div className="mb-4 print:hidden">
            <PushPrompt staff compact />
            <button className="mt-1 text-xs text-gray-500 underline" onClick={() => { setAskPush(false); try { localStorage.setItem('bendo-push-dismissed', '1') } catch { /* ignore */ } }}>Plus tard</button>
          </div>
        )}
        <Outlet />
      </main>
      {toast && <button onClick={() => { setToast(null); nav(toast.startsWith('Nouveau client') ? '/admin/clients' : toast.startsWith('Demande') ? '/admin/utilisateurs' : '/admin/commandes') }} className="fixed bottom-4 right-4 z-50 rounded-2xl bg-brand-800 px-5 py-3 font-semibold text-white shadow-xl print:hidden">{toast.startsWith('Nouvelle commande') ? '🛒' : '👤'} {toast}</button>}
    </div>
  )
}
