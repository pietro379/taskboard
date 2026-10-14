import { useEffect } from 'react'
import { errorMessage } from '../api.js'

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'text-slate-600 hover:bg-slate-100',
}

export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export const inputClass =
  'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none'

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export function ErrorBanner({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
      {errorMessage(error)}
    </p>
  )
}

export function Spinner({ label = 'Yükleniyor…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <span className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function Badge({ children, className = '' }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
}

export function Modal({ title, onClose, children, wide = false }) {
  // Escape ile kapanır; arka plan kaydırması modal açıkken kilitlenir.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:py-12" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-2xl bg-white p-6 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Kapat" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

export function Avatar({ name, className = '' }) {
  return (
    <span title={name} className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 ${className}`}>
      {initials(name)}
    </span>
  )
}

export const STATUSES = [
  { id: 'todo', label: 'Yapılacak', dot: 'bg-slate-400' },
  { id: 'in_progress', label: 'Devam ediyor', dot: 'bg-amber-500' },
  { id: 'done', label: 'Tamamlandı', dot: 'bg-emerald-500' },
]

export const PRIORITIES = {
  low: { label: 'Düşük', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Orta', className: 'bg-sky-100 text-sky-700' },
  high: { label: 'Yüksek', className: 'bg-rose-100 text-rose-700' },
}

// Etiket renkleri sabit bir paletten gelir (sunucudaki CHECK kısıtıyla aynı liste).
export const LABEL_STYLES = {
  slate: { chip: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
  red: { chip: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  amber: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  sky: { chip: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  violet: { chip: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  pink: { chip: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' },
}

export function LabelChip({ label }) {
  return <Badge className={LABEL_STYLES[label.color]?.chip ?? LABEL_STYLES.slate.chip}>{label.name}</Badge>
}
