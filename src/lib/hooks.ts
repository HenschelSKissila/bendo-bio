import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react'
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
interface ConnSnapshot { state: ConnState; latency: number | null; lastCheck: Date | null; realtime: string }

/** Surveillance unique et partagée du lien avec la base (ping 30 s + websocket temps réel). */
const conn = (() => {
  let snap: ConnSnapshot = { state: 'checking', latency: null, lastCheck: null, realtime: 'connecting' }
  const subs = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | undefined
  let channel: ReturnType<typeof supabase.channel> | undefined
  const set = (p: Partial<ConnSnapshot>) => { snap = { ...snap, ...p }; subs.forEach(f => f()) }
  const check = async () => {
    const t0 = performance.now()
    const { error } = await supabase.rpc('ping')
    const latency = Math.round(performance.now() - t0)
    set({ latency, lastCheck: new Date(),
      state: !error ? 'online' : /does not exist|Could not find the function/i.test(error.message) ? 'not_initialized' : 'offline' })
  }
  const onOnline = () => { check() }
  const onOffline = () => set({ state: 'offline' })
  const start = () => {
    check()
    timer = setInterval(check, 30000)
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    channel = supabase.channel('bendo-heartbeat').subscribe(s => set({ realtime: s }))
  }
  const stop = () => {
    clearInterval(timer)
    window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline)
    if (channel) supabase.removeChannel(channel)
    channel = undefined
  }
  return {
    subscribe(f: () => void) { subs.add(f); if (subs.size === 1) start(); return () => { subs.delete(f); if (subs.size === 0) stop() } },
    get: () => snap,
    check,
  }
})()

export function useConnection() {
  const s = useSyncExternalStore(conn.subscribe, conn.get)
  return { ...s, check: conn.check }
}

/** Icône du rayon de chaque catégorie (image par défaut des produits sans photo). */
export const categoryIcons: Record<string, string> = {}
export const categoryImages: Record<string, string> = {}

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
    for (const cat of (c.data as Category[]) ?? []) { categoryIcons[cat.id] = cat.icon; if (cat.image_url) categoryImages[cat.id] = cat.image_url }
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
