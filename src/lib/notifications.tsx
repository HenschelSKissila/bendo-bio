import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { relinkPush, showLocal } from './push'

export interface AppNotif { id: number; event: string; order_id: string | null; subject: string | null; body: string | null; created_at: string; read_at: string | null }
interface Ctx { list: AppNotif[]; unread: number; markAllRead: () => Promise<void>; toast: AppNotif | null; dismissToast: () => void }
const C = createContext<Ctx>({ list: [], unread: 0, markAllRead: async () => {}, toast: null, dismissToast: () => {} })

/** Notifications du client connecté : liste, non lues, arrivée en temps réel. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [list, setList] = useState<AppNotif[]>([])
  const [toast, setToast] = useState<AppNotif | null>(null)
  const load = useCallback(async () => {
    if (!uid) { setList([]); return }
    const { data } = await supabase.from('notifications').select('id, event, order_id, subject, body, created_at, read_at')
      .eq('user_id', uid).eq('channel', 'app').order('created_at', { ascending: false }).limit(100)
    setList((data as AppNotif[]) ?? [])
  }, [uid])
  useEffect(() => { load(); if (uid) relinkPush() }, [load, uid])
  useEffect(() => {
    if (!uid) return
    const ch = supabase.channel(`notif-${uid}`).on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, p => {
        const n = p.new as AppNotif & { channel: string }
        if (n.channel !== 'app') return
        setList(l => [n, ...l.filter(x => x.id !== n.id)])
        setToast(n); setTimeout(() => setToast(t => (t?.id === n.id ? null : t)), 9000)
        try { navigator.vibrate?.([150, 80, 150]) } catch { /* ignore */ }
        // page en arrière-plan : notification système (le push serveur couvre l'application fermée)
        if (document.visibilityState === 'hidden') showLocal(n.subject ?? 'BENDO BIO', n.body ?? '', '/notifications')
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [uid])
  const markAllRead = async () => {
    await supabase.rpc('mark_notifications_read')
    setList(l => l.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }
  return <C.Provider value={{ list, unread: list.filter(n => !n.read_at).length, markAllRead, toast, dismissToast: () => setToast(null) }}>{children}</C.Provider>
}
export const useNotifications = () => useContext(C)
