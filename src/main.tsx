import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme } from './lib/theme'
applyTheme()

// Mises à jour automatiques : dès qu'une nouvelle version est publiée, la page se recharge d'elle-même
// sur la même adresse. Vérification toutes les 60 s, au retour sur l'application, au focus et à la reconnexion.
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({ immediate: true, onNeedRefresh() { updateSW(true) } })
  }).catch(() => { /* service worker indisponible (navigation privée…) */ })

  const check = () => {
    if (!navigator.onLine) return
    navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {})
  }
  setInterval(check, 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
