import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { money } from '../../lib/format'
import { Card } from '../../components/ui'

export default function OrderDone() {
  let o: { order_number?: string; total?: number; contact?: string } = {}
  try { o = JSON.parse(sessionStorage.getItem('bendo-last-order') || '{}') } catch { /* ignore */ }
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CheckCircle2 className="mx-auto h-16 w-16 text-brand-600" />
      <h1 className="mt-3 text-2xl font-bold text-brand-900">Merci pour votre commande !</h1>
      {o.order_number && <p className="mt-2 text-gray-700">Numéro de commande : <strong className="font-mono text-lg">{o.order_number}</strong></p>}
      {o.total !== undefined && <p className="text-gray-700">Total : <strong>{money(o.total)}</strong> — à régler à la remise.</p>}
      <p className="mt-3 text-sm text-gray-600">Conservez ce numéro : il vous permet de suivre votre commande avec votre téléphone ou e-mail.</p>
      <div className="mt-5 flex justify-center gap-3">
        <Link to={`/suivi?n=${o.order_number ?? ''}`} className="rounded-xl bg-brand-700 px-4 py-2.5 font-semibold text-white">Suivre ma commande</Link>
        <Link to="/catalogue" className="rounded-xl border border-brand-200 px-4 py-2.5 font-semibold text-brand-800">Retour à la boutique</Link>
      </div>
    </Card>
  )
}
