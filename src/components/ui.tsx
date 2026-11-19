import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X, Loader2 } from 'lucide-react'
import { STATUS } from '../lib/format'
import type { OrderStatus } from '../lib/types'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning'
const V: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-brand-800 border border-brand-200 hover:bg-brand-50',
  danger: 'bg-tomato text-white hover:bg-red-700',
  warning: 'bg-carrot text-white hover:bg-orange-600',
  ghost: 'text-brand-800 hover:bg-brand-50',
}
export function Button({ variant = 'primary', loading, className = '', children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${V[variant]} ${className}`}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
    </button>
  )
}

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}{required && <span className="text-tomato"> *</span>}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-tomato">{error}</span>}
    </label>
  )
}
const inputCls = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ''}`} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ''}`} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={`${inputCls} ${p.className ?? ''}`} />

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
}

export function Badge({ children, cls = 'bg-gray-100 text-gray-700' }: { children: ReactNode; cls?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
}
export const StatusBadge = ({ s }: { s: OrderStatus }) => <Badge cls={STATUS[s]?.cls}>{STATUS[s]?.label ?? s}</Badge>

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> {label}</div>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">{children}</div>
}
export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{children}</div>
}
export function SuccessBox({ children }: { children: ReactNode }) {
  if (!children) return null
  return <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{children}</div>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-900">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function QtyInput({ value, onChange, step = 1, min = 0, max }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  const r = (n: number) => Math.round(n * 1000) / 1000
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-300 bg-white">
      <button type="button" aria-label="Diminuer" className="px-3 py-2 text-lg font-bold text-brand-800 disabled:opacity-30"
        disabled={value - step < min} onClick={() => onChange(r(value - step))}>−</button>
      <span className="min-w-[3rem] text-center text-sm font-semibold tabular-nums">{value.toLocaleString('fr-FR')}</span>
      <button type="button" aria-label="Augmenter" className="px-3 py-2 text-lg font-bold text-brand-800 disabled:opacity-30"
        disabled={max !== undefined && value + step > max + 1e-9} onClick={() => onChange(r(value + step))}>+</button>
    </div>
  )
}

export function Stat({ label, value, tone = 'brand', icon }: { label: string; value: ReactNode; tone?: 'brand' | 'warn' | 'danger' | 'gray'; icon?: ReactNode }) {
  const t = { brand: 'text-brand-800', warn: 'text-orange-600', danger: 'text-tomato', gray: 'text-gray-700' }[tone]
  return (
    <Card className="!p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">{icon}{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${t}`}>{value}</div>
    </Card>
  )
}
