import { ShieldAlert } from 'lucide-react'

/** Code de livraison affiché au client (jamais au livreur). */
export default function DeliveryCodeBox({ code }: { code: string }) {
  return (
    <div className="rounded-2xl border-2 border-brand-600 bg-white p-4 text-center shadow-sm">
      <div className="text-sm font-semibold text-brand-800">🔐 Votre code de livraison</div>
      <div className="my-2 select-all font-mono text-4xl font-extrabold tracking-[0.3em] text-brand-900">{code}</div>
      <p className="text-sm text-gray-700">Donnez ce code au livreur <strong>uniquement en main propre</strong>, au moment où il vous remet votre commande. C'est votre preuve de réception.</p>
      <p className="mt-2 flex items-start justify-center gap-1 rounded-xl bg-red-50 p-2 text-sm font-semibold text-red-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" />Ne communiquez JAMAIS ce code par téléphone, SMS ou WhatsApp — même à quelqu'un qui dit appeler de la part de BENDO BIO.
      </p>
    </div>
  )
}
