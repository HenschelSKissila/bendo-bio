import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'
import type { Product, Category, Stock, Settings } from './types'
import { setCurrency } from './format'

/** Recharge automatiquement quand les tables surveillées changent (Supabase Realtime). */
export function useRealtime(tables: string[], onChange: () => void, enabled = true) {
  const cb = useRef(onChange); cb.current = onChange
  const key = tables.join(',')
  useEffect(() => {
    if (!enabled) return
    let t: ReturnType<typeof setTimeout> | undefined
    const ch = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2)}`)
    for (const table of tables) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(t); t = setTimeout(() => cb.current(), 400)   // regroupe les rafales
      })
    }
    ch.subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
}

export type ConnState = 'checking' | 'online' | 'offline' | 'not_initialized'
/** Vérifie en permanence le lien avec la base (ping toutes les 30 s + temps réel). */
export function useConnection() {
  const [state, setState] = useState<ConnState>('checking')
  const [latency, setLatency] = useState<number | null>(null)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [realtime, setRealtime] = useState<string>('connecting')
  const check = useCallback(async () => {
    const t0 = performance.now()
    const { error } = await supabase.rpc('ping')
    setLatency(Math.round(performance.now() - t0)); setLastCheck(new Date())
    if (!error) setState('online')
    else if (/does not exist|Could not find the function/i.test(error.message)) setState('not_initialized')
    else setState('offline')
  }, [])
  useEffect(() => {
    check()
    const i = setInterval(check, 30000)
    const on = () => check()
    window.addEventListener('online', on); window.addEventListener('offline', () => setState('offline'))
    const ch = supabase.channel('bendo-heartbeat').subscribe(s => setRealtime(s))
    return () => { clearInterval(i); window.removeEventListener('online', on); supabase.removeChannel(ch) }
  }, [check])
  return { state, latency, lastCheck, realtime, check }
}

/** Catalogue public + stock disponible, mis à jour en temps réel. */
export function useCatalog() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stock, setStock] = useState<Record<string, Stock>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const [p, c, s] = await Promise.all([
      supabase.from('products').select('*').neq('status', 'hidden').order('name'),
      supabase.from('categories').select('*').eq('active', true).order('sort_order'),
      supabase.rpc('product_stock'),
    ])
    if (p.error || c.error || s.error) setError((p.error || c.error || s.error)!.message)
    else setError(null)
    setProducts((p.data as Product[]) ?? [])
    setCategories((c.data as Category[]) ?? [])
    setStock(Object.fromEntries(((s.data as Stock[]) ?? []).map(x => [x.product_id, x])))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useRealtime(['products', 'lots', 'orders'], load)
  return { products, categories, stock, loading, error, reload: load }
}

let settingsCache: Settings | null = null
export function useSettings() {
  const [s, setS] = useState<Settings | null>(settingsCache)
  const load = useCallback(async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    if (data) { settingsCache = data as Settings; setCurrency(settingsCache.currency); setS(settingsCache) }
  }, [])
  useEffect(() => { if (!settingsCache) load() }, [load])
  return { settings: s, reload: load }
}
