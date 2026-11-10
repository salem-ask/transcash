// Règles du parc, en fonctions pures (mêmes règles que api/lib/fleet.php et api/routes/vehicles.php).
import type { AmountChange, Assignment, DayStatus, VehicleType } from './types'

export const VEHICLE_TYPES: { id: VehicleType; label: string }[] = [
  { id: 'moto', label: 'Moto' },
  { id: 'tricycle', label: 'Tricycle' },
  { id: 'taxi', label: 'Taxi' },
  { id: 'minibus', label: 'Minibus' },
  { id: 'camion', label: 'Camion' },
  { id: 'autre', label: 'Autre' },
]

export const vehicleTypeLabel = (t: VehicleType) => VEHICLE_TYPES.find((x) => x.id === t)?.label ?? t

/** Date du jour AAAA-MM-JJ dans un fuseau horaire. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`)

export function addDays(date: string, days: number): string {
  const d = asUtc(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0 = dimanche … 6 = samedi */
export const weekdayOf = (date: string) => asUtc(date).getUTCDay()

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(asUtc(date).getTime()) && asUtc(date).toISOString().startsWith(date)
}

/** Montant en vigueur à une date selon l'historique ; null avant la mise en service. */
export function amountOn(history: AmountChange[], date: string): AmountChange | null {
  return (
    [...history]
      .filter((a) => a.effectiveFrom <= date)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  )
}

/** Chauffeur affecté à une date donnée, s'il y en a un. */
export function assignmentOn(assignments: Assignment[], date: string): Assignment | null {
  return assignments.find((a) => a.startDate <= date && (a.endDate === null || a.endDate >= date)) ?? null
}

/** Situation d'un engin un jour donné (avant versements). */
export function dayStatus(opts: { amount: AmountChange | null; restDays: number[]; date: string; hasDriver: boolean }): DayStatus {
  if (!opts.amount) return 'not_started'
  if (opts.restDays.includes(weekdayOf(opts.date))) return 'rest'
  return opts.hasDriver ? 'due' : 'no_driver'
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  due: 'Doit verser',
  rest: 'Repos',
  breakdown: 'Panne',
  no_driver: 'Sans chauffeur',
  not_started: 'Pas encore en service',
}

/** « 2026-03-01 » → « 1 mars 2026 » */
export function formatDay(date: string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(asUtc(date))
}

/** Nombre de jours (inclus) entre deux dates. */
export function daysBetween(start: string, end: string): number {
  return Math.round((asUtc(end).getTime() - asUtc(start).getTime()) / 86_400_000) + 1
}
