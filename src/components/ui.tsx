// Composants d'interface de base — gros boutons, pensés pour le doigt sur téléphone.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { useId } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:opacity-50',
  secondary: 'bg-surface-2 text-ink border border-line hover:bg-line/60 disabled:opacity-50',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-brand hover:bg-brand/10 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className = '',
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors ${VARIANTS[variant]} ${className}`}
    >
      {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  )
}

export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      <select
        id={id}
        {...props}
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      >
        {children}
      </select>
    </label>
  )
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-danger/30 bg-danger/10 text-danger',
    success: 'border-brand/30 bg-brand/10 text-brand-strong',
    info: 'border-line bg-surface-2 text-ink-soft',
  }[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>
      {children}
    </div>
  )
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="text-base text-ink">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  )
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-ink-soft">
      <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  )
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        {...props}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
    </div>
  )
}

/** Choix exclusif en boutons (ex. CDF / USD). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: { id: T; label: ReactNode }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink-soft">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${value === o.id ? 'bg-surface text-brand shadow-sm' : 'text-ink-soft'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Choix des jours de la semaine (0 = dimanche). */
export function WeekdayPicker({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  const names = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  return (
    <div className="flex flex-wrap gap-2">
      {names.map((label, d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value.includes(d)}
          disabled={disabled}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
          className={`min-h-11 rounded-full border px-4 text-sm disabled:cursor-not-allowed ${value.includes(d) ? 'border-brand bg-brand text-white' : 'border-line'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand">
      <span aria-hidden>‹</span> {children}
    </Link>
  )
}

/** Lien présenté comme un bouton principal (évite un bouton dans un lien). */
export function ButtonLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold ${VARIANTS.primary}`}>
      {children}
    </Link>
  )
}
