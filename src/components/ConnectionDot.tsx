import { useConnection } from '../lib/hooks'

/** Pastille d'état de la connexion à la base (visible en permanence dans l'admin). */
export default function ConnectionDot({ compact }: { compact?: boolean }) {
  const { state, latency } = useConnection()
  const m = {
    checking: ['bg-gray-400', 'Vérification…'],
    online: ['bg-green-500', `Base connectée${latency ? ` · ${latency} ms` : ''}`],
    offline: ['bg-red-500', 'Base injoignable'],
    not_initialized: ['bg-orange-500', 'Base non initialisée'],
  }[state]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600" title={m[1]} role="status">
      <span className={`h-2.5 w-2.5 rounded-full ${m[0]} ${state === 'online' ? 'animate-pulse' : ''}`} />
      {!compact && m[1]}
    </span>
  )
}
