import type { OrderStatus, Unit, MovementType } from './types'

let currency = 'EUR'
export const setCurrency = (c: string) => { currency = c || 'EUR' }
export const money = (n: number | null | undefined) => {
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(n ?? 0)) }
  catch { return `${Number(n ?? 0).toFixed(2)} ${currency}` }
}
export const num = (n: number | null | undefined, d = 3) => Number(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: d })

export const UNIT_LABEL: Record<Unit, string> = {
  piece: 'pièce', kg: 'kg', g: 'g', l: 'L', botte: 'botte', barquette: 'barquette', sachet: 'sachet', pack: 'pack', colis: 'colis',
}
export const unitPrice = (u: Unit) => (u === 'kg' ? '/ kg' : u === 'l' ? '/ L' : `/ ${UNIT_LABEL[u]}`)

export const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending_payment: { label: 'En attente de paiement', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmée', cls: 'bg-blue-100 text-blue-800' },
  preparing: { label: 'En préparation', cls: 'bg-indigo-100 text-indigo-800' },
  ready: { label: 'Prête', cls: 'bg-teal-100 text-teal-800' },
  out_for_delivery: { label: 'En livraison', cls: 'bg-purple-100 text-purple-800' },
  delivered: { label: 'Livrée / retirée', cls: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Annulée', cls: 'bg-gray-200 text-gray-700' },
  refunded: { label: 'Remboursée', cls: 'bg-gray-200 text-gray-700' },
  partially_refunded: { label: 'Part. remboursée', cls: 'bg-gray-200 text-gray-700' },
  delivery_failed: { label: 'Échec de livraison', cls: 'bg-red-100 text-red-800' },
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  reception: 'Réception', sale: 'Vente', return_restock: 'Réintégration', adjustment: 'Ajustement', inventory: 'Inventaire',
  loss: 'Perte', breakage: 'Casse', donation: 'Don', destruction: 'Destruction', correction: 'Correction',
}

export const PAYMENT_LABEL: Record<string, string> = {
  cash_on_delivery: 'Espèces à la remise', mobile_money_on_delivery: 'Mobile money à la remise', online: 'Paiement en ligne',
}

export const fmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'
export const fmtDay = (d: string | null | undefined) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR') : '—'
export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
export const fmtDateTime = (d: string | null | undefined) => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
export const fmtSlot = (s?: { starts_at: string; ends_at: string } | null) =>
  s ? `${new Date(s.starts_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}` : '—'

export const daysUntil = (d: string | null) => {
  if (!d) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((new Date(d + 'T00:00:00').getTime() - t.getTime()) / 86400000)
}
export const today = () => new Date().toISOString().slice(0, 10)
