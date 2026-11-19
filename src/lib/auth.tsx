import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { unlinkPush } from './push'
import type { Profile } from './types'

interface AuthCtx {
  session: Session | null; profile: Profile | null; loading: boolean
  isStaff: boolean; isAdmin: boolean; isCourier: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void>
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile) ?? null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session); await loadProfile(data.session); setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // différé pour éviter un blocage du client auth
      setTimeout(() => {
        loadProfile(s)
        if (event === 'SIGNED_IN') supabase.rpc('touch_last_login').then(() => {})
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const active = profile?.active !== false
  const value: AuthCtx = {
    session, profile, loading,
    isStaff: active && (profile?.role === 'employee' || profile?.role === 'admin'),
    isAdmin: active && profile?.role === 'admin',
    isCourier: active && profile?.role === 'courier',
    refreshProfile: () => loadProfile(session),
    signOut: async () => { await unlinkPush(); await supabase.auth.signOut(); setProfile(null) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
