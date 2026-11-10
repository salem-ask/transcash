// Éléments visuels du parc : icône par type d'engin, pastille d'état, ligne d'historique.
import { Link } from 'react-router-dom'
import { DAY_STATUS_LABEL, daysBetween, formatDay, vehicleTypeLabel } from '../domain/fleet'
import type { Assignment, DayStatus, VehicleType } from '../domain/types'

// Pictogrammes simples (traits), lisibles en petit
const ICONS: Record<VehicleType, string> = {
  moto: 'M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 14l4-6h5l2 3h3M9 8l3 6h4M14 8l1-3h3',
  tricycle: 'M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3 14V8a3 3 0 0 1 3-3h7l4 5h3a1 1 0 0 1 1 1v3M7 16h3M14 16h3',
  taxi: 'M5 17h14M3 17v-4l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4h-2M7 17a2 2 0 1 0 4 0M13 17a2 2 0 1 0 4 0M3 13h18M9 4h6v3H9z',
  minibus: 'M3 17V7a2 2 0 0 1 2-2h11l5 6v6h-2M3 17h2M9 17h6M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 11h18M8 5v6M13 5v6',
  camion: 'M2 16V6h12v10M14 9h4l4 4v3h-2M2 16h2M8 16h7M4 16a2 2 0 1 0 4 0M16 16a2 2 0 1 0 4 0',
  autre: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4l3 2',
}

export function VehicleIcon({ type, className = 'size-6' }: { type: VehicleType; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={vehicleTypeLabel(type)}>
      <path d={ICONS[type]} />
    </svg>
  )
}

export function VehicleBadge({ type }: { type: VehicleType }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
      <VehicleIcon type={type} />
    </span>
  )
}

const PILL: Record<DayStatus | 'retired' | 'inactive', string> = {
  due: 'bg-brand/15 text-brand-strong',
  rest: 'bg-surface-2 text-ink-soft',
  breakdown: 'bg-danger/15 text-danger',
  no_driver: 'bg-accent/20 text-ink',
  not_started: 'bg-surface-2 text-ink-soft',
  retired: 'bg-surface-2 text-ink-soft',
  inactive: 'bg-surface-2 text-ink-soft',
}

export function Pill({ kind, children }: { kind: keyof typeof PILL; children?: React.ReactNode }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PILL[kind]}`}>
      {children ?? DAY_STATUS_LABEL[kind as DayStatus]}
    </span>
  )
}

/** Historique des affectations (vu depuis un engin : on affiche le chauffeur ; depuis un chauffeur : l'engin). */
export function AssignmentHistory({ items, show, today }: { items: Assignment[]; show: 'driver' | 'vehicle'; today: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">Aucune affectation pour le moment.</p>
  return (
    <ol className="relative space-y-3 border-l-2 border-line pl-4">
      {items.map((a) => {
        const current = a.endDate === null
        const end = a.endDate ?? today
        const days = end >= a.startDate ? daysBetween(a.startDate, end) : 0
        return (
          <li key={a.id} className="relative">
            <span className={`absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-surface ${current ? 'bg-brand' : 'bg-line'}`} />
            <Link
              to={show === 'driver' ? `/chauffeurs/${a.driverId}` : `/engins/${a.vehicleId}`}
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              {show === 'driver' ? a.driverName : a.vehicleName}
            </Link>
            {current && <span className="ml-2 text-xs font-semibold text-brand">en cours</span>}
            <p className="text-sm text-ink-soft">
              {current ? `Depuis le ${formatDay(a.startDate)}` : `Du ${formatDay(a.startDate)} au ${formatDay(a.endDate)}`}
              {days > 0 && ` · ${days} jour${days > 1 ? 's' : ''}`}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/** Barre de recherche + filtres en onglets. */
export function ListToolbar<T extends string>({
  search,
  onSearch,
  placeholder,
  tabs,
  tab,
  onTab,
}: {
  search: string
  onSearch: (v: string) => void
  placeholder: string
  tabs: { id: T; label: string; count: number }[]
  tab: T
  onTab: (t: T) => void
}) {
  return (
    <div className="space-y-2">
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm ${tab === t.id ? 'border-brand bg-brand text-white' : 'border-line text-ink-soft'}`}
          >
            {t.label} <span className="opacity-75">{t.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
