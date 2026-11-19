import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { relinkPush, showLocal } from './push'
import { playChime } from './chime'

export interface AppNotif { id: number; event: string; order_id: string | null; subject: string | null; body: string | null; created_at: string; read_at: string | null }
interface Ctx { list: AppNotif[]; unread: number; markAllRead: () => Promise<void>; toast: AppNotif | null; dismissToast: () => void }
const C = createContext<Ctx>({ list: [], unread: 0, markAllRead: async () => {}, toast: null, dismissToast: () => {} })

/** Notifications du client connecté : liste, non lues, arrivée en temps réel. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const [list, setList] = useState<AppNotif[]>([])
  const [toast, setToast] = useState<AppNotif | null>(null)
  const lastId = useRef(0)
  /** Nouvelle notification reçue (temps réel ou vérification) : liste, bandeau, son, vibration. */
  const arrive = (n: AppNotif) => {
    if (n.id <= lastId.current) return
    lastId.current = n.id
    setList(l => [n, ...l.filter(x => x.id !== n.id)])
    setToast(n); setTimeout(() => setToast(t => (t?.id === n.id ? null : t)), 9000)
    const urgent = n.event.startsWith('courier_') || ['status_out_for_delivery', 'nearby'].includes(n.event)
    playChime(urgent)
    // application en arrière-plan : notification système (le push serveur couvre l'application fermée)
    if (document.visibilityState === 'hidden') showLocal(n.subject ?? 'BENDO BIO', n.body ?? '', n.event.startsWith('courier_') ? '/livreur' : '/notifications')
  }
  const load = useCallback(async () => {
    if (!uid) { setList([]); return }
    const { data } = await supabase.from('notifications').select('id, event, order_id, subject, body, created_at, read_at')
      .eq('user_id', uid).eq('channel', 'app').order('created_at', { ascending: false }).limit(100)
    setList((data as AppNotif[]) ?? [])
    lastId.current = Math.max(lastId.current, ...((data as AppNotif[]) ?? []).map(n => n.id))
  }, [uid])
  useEffect(() => { load(); if (uid) relinkPush() }, [load, uid])
  useEffect(() => {
    if (!uid) return
    const ch = supabase.channel(`notif-${uid}`).on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, p => {
        const n = p.new as AppNotif & { channel: string }
        if (n.channel !== 'app') return
        arrive(n)
      }).subscribe()
    // filet de sécurité : si le temps réel est coupé (réseau mobile instable), on vérifie toutes les 30 s
    const poll = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.from('notifications').select('id, event, order_id, subject, body, created_at, read_at')
        .eq('user_id', uid).eq('channel', 'app').gt('id', lastId.current).order('id').limit(20)
      for (const n of (data as AppNotif[]) ?? []) arrive(n)
    }, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps
  const markAllRead = async () => {
    await supabase.rpc('mark_notifications_read')
    setList(l => l.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }
  return <C.Provider value={{ list, unread: list.filter(n => !n.read_at).length, markAllRead, toast, dismissToast: () => setToast(null) }}>{children}</C.Provider>
}
export const useNotifications = () => useContext(C)
