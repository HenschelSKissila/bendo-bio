import { Phone, Mail, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { BRAND } from '../lib/brand'

/** Logo officiel Facebook (« f » blanc sur rond bleu #1877F2). */
export function FacebookLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M16.5 15.47 17.03 12h-3.33V9.75c0-.95.47-1.88 1.96-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H6.92v3.47h3.04V24h3.74v-8.53z" />
    </svg>
  )
}

/** Logo officiel WhatsApp (combiné blanc sur rond vert #25D366). */
export function WhatsAppLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#25D366" />
      <g transform="translate(6 6) scale(0.8333)" fill="#fff">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
      </g>
    </svg>
  )
}

/** Pastille ronde colorée avec pictogramme blanc (même style que les logos). */
function Disc({ color, children, size = 32 }: { color: string; children: ReactNode; size?: number }) {
  return (
    <span className="flex flex-none items-center justify-center rounded-full text-white shadow-sm" style={{ background: color, width: size, height: size }} aria-hidden="true">
      {children}
    </span>
  )
}

/** Bloc « Contact » : téléphone, WhatsApp, Facebook, e-mail, adresse — logos et pastilles harmonisés. */
export default function ContactLinks({ phone = BRAND.phone, email = BRAND.email, address = `${BRAND.address}, ${BRAND.country}` }:
  { phone?: string; email?: string; address?: string }) {
  const row = 'group flex items-center gap-3 rounded-xl py-1 transition hover:translate-x-0.5'
  const label = 'text-sm leading-tight group-hover:underline'
  return (
    <ul className="mt-3 space-y-2">
      <li><a href={BRAND.phoneHref} className={row}><Disc color="#2d6e2b"><Phone className="h-4 w-4" /></Disc><span className={label}>{phone}</span></a></li>
      <li><a href={BRAND.whatsapp} target="_blank" rel="noreferrer" className={row}><WhatsAppLogo /><span className={label}>WhatsApp</span></a></li>
      <li><a href={BRAND.facebook} target="_blank" rel="noreferrer" className={row}><FacebookLogo /><span className={label}>Facebook : /bendobio</span></a></li>
      <li><a href={`mailto:${email}`} className={row}><Disc color="#EA4335"><Mail className="h-4 w-4" /></Disc><span className={label}>{email}</span></a></li>
      <li><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Ngoyo, Pointe-Noire, Congo')}`} target="_blank" rel="noreferrer" className={row}>
        <Disc color="#e8892b"><MapPin className="h-4 w-4" /></Disc><span className={label}>{address}</span></a></li>
    </ul>
  )
}
