import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme } from './lib/theme'
applyTheme()

// Mises à jour automatiques : vérifie une nouvelle version toutes les 60 s et au retour sur l'application ;
// dès qu'elle est disponible, la page se recharge d'elle-même sur la même adresse.
import('virtual:pwa-register').then(({ registerSW }) => {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { updateSW(true) },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}) }
      setInterval(check, 60_000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
      window.addEventListener('focus', check)
      window.addEventListener('online', check)
    },
  })
}).catch(() => { /* service worker indisponible (navigation privée…) */ })

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
