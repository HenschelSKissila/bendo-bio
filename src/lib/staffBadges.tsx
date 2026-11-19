import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { useRealtime } from './hooks'

export interface StaffBadges {
  new_orders: number; new_customers: number; new_products: number; new_lots: number; new_users: number
  to_prepare: number; to_deliver: number; pending_payment: number; role_requests: number; data_requests: number
  open_alerts: number; critical_alerts: number; unassigned_deliveries: number
  since: { orders: string; customers: string; products: string; stock: string }
}
const C = createContext<{ b: StaffBadges | null; reload: () => void }>({ b: null, reload: () => {} })

// rubrique ↔ section « vue » (le compteur « nouveau » revient à zéro à l'ouverture)
const SECTION: Record<string, string> = {
  '/admin/commandes': 'orders', '/admin/clients': 'customers', '/admin/produits': 'products',
  '/admin/stock': 'stock', '/admin/utilisateurs': 'users',
}

/** Compteurs du menu de gestion : nouveautés depuis la dernière visite + choses à traiter (temps réel). */
export function StaffBadgesProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [b, setB] = useState<StaffBadges | null>(null)
  const loc = useLocation()
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('staff_badges')
    if (!error) setB(data as StaffBadges)
  }, [])
  useEffect(() => { if (enabled) { reload(); const t = setInterval(reload, 60000); return () => clearInterval(t) } }, [enabled, reload])
  useRealtime(['orders', 'profiles', 'products', 'lots', 'alerts', 'data_requests'], reload, enabled)
  // ouverture d'une rubrique → marquée comme vue (après un court délai pour laisser voir les nouveautés)
  useEffect(() => {
    if (!enabled) return
    const sec = SECTION[loc.pathname]
    if (!sec) return
    const t = setTimeout(() => { supabase.rpc('mark_section_seen', { p_section: sec }).then(() => reload()) }, 1500)
    return () => clearTimeout(t)
  }, [loc.pathname, enabled, reload])
  return <C.Provider value={{ b, reload }}>{children}</C.Provider>
}
export const useStaffBadges = () => useContext(C)

/** Pastilles : rouge = nouveau depuis votre dernière visite, orange = à traiter. */
export function NavBadges({ items }: { items: { n: number; tone: 'new' | 'todo' | 'critical'; title: string }[] }) {
  const shown = items.filter(i => i.n > 0)
  if (!shown.length) return null
  return (
    <span className="ml-auto flex gap-1">
      {shown.map((i, k) => (
        <span key={k} title={i.title} aria-label={`${i.n} ${i.title}`}
          className={`min-w-[1.4rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none ${
            i.tone === 'new' ? 'bg-tomato text-white' : i.tone === 'critical' ? 'bg-red-700 text-white' : 'bg-amber-400 text-amber-950'}`}>
          {i.n > 99 ? '99+' : i.n}
        </span>
      ))}
    </span>
  )
}
