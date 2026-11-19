import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useNotifications } from '../../lib/notifications'
import { fmtDateTime } from '../../lib/format'
import PushPrompt from '../../components/PushPrompt'
import { Card, Empty, Spinner, Button } from '../../components/ui'

export default function Notifications() {
  const { session, loading } = useAuth()
  const { list, unread, markAllRead } = useNotifications()
  useEffect(() => { if (unread) { const t = setTimeout(markAllRead, 2500); return () => clearTimeout(t) } }, [unread, markAllRead])
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/connexion?next=/notifications" />
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-brand-900">Mes notifications</h1>
        {unread > 0 && <Button variant="ghost" onClick={markAllRead}>Tout marquer comme lu</Button>}</div>
      <PushPrompt />
      {list.length === 0 ? <Empty>Aucune notification pour le moment. Vous serez prévenu(e) à chaque étape de vos commandes.</Empty> : (
        <Card className="divide-y !p-0">
          {list.map(n => (
            <div key={n.id} className={`flex gap-3 p-4 ${n.read_at ? '' : 'bg-brand-50/60'}`}>
              <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${n.read_at ? 'bg-transparent' : 'bg-tomato'}`} aria-label={n.read_at ? 'Lue' : 'Non lue'} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">{n.subject}</div>
                {n.body && <div className="text-sm text-gray-700">{n.body}</div>}
                <div className="mt-1 flex gap-3 text-xs text-gray-500"><span>{fmtDateTime(n.created_at)}</span>
                  {n.order_id && <Link to={n.event.startsWith('courier_') ? '/livreur' : `/compte?commande=${n.order_id}`} className="text-brand-700 underline">{n.event.startsWith('courier_') ? 'Espace livreur' : 'Voir la commande'}</Link>}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
