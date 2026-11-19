import { useEffect, useState } from 'react'

export type ThemeMode = 'auto' | 'light' | 'dark'
const KEY = 'bendo-theme'

export function getMode(): ThemeMode {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto' } catch { return 'auto' }
}
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

/** Applique le thème sur <html> (classe .dark) et la couleur de la barre du navigateur. */
export function applyTheme(mode: ThemeMode = getMode()) {
  const dark = mode === 'dark' || (mode === 'auto' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1712' : '#1f5130')
}

/** Mode Auto (suit le téléphone / l'ordinateur), Clair ou Sombre — Auto par défaut. */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(getMode)
  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'auto') return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = () => applyTheme('auto')
    mq?.addEventListener?.('change', on)
    return () => mq?.removeEventListener?.('change', on)
  }, [mode])
  const setMode = (m: ThemeMode) => { try { localStorage.setItem(KEY, m) } catch { /* ignore */ } setModeState(m); window.dispatchEvent(new Event('bendo-theme')) }
  useEffect(() => { const f = () => setModeState(getMode()); window.addEventListener('bendo-theme', f); return () => window.removeEventListener('bendo-theme', f) }, [])
  return { mode, setMode }
}
