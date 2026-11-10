// Grand livre des journées d'un chauffeur : ce qui était dû chaque jour, ce qui a été payé, ce qui reste.
// Mêmes règles que api/lib/ledger.php — toute modification doit être faite des deux côtés (tests à l'appui).
import { convert } from './money'
import { addDays, amountOn, weekdayOf } from './fleet'
import type { AmountChange, Assignment, Currency } from './types'

/** Marque posée sur une journée d'un engin. */
export type DayMarkKind = 'rest' | 'breakdown' | 'override'
export interface DayMark {
  vehicleId: string
  date: string
  kind: DayMarkKind
  /** Pour `override` : montant attendu ce jour-là à la place du montant habituel */
  amount: number | null
  currency: Currency | null
  reason: string | null
}

/** Nature de la journée pour le chauffeur. */
export type DayKind = 'due' | 'rest' | 'breakdown' | 'not_started'
/** État du paiement de la journée. */
export type PayState = 'paid' | 'partial' | 'unpaid' | 'none'

export interface LedgerDay {
  date: string
  vehicleId: string
  vehicleName: string
  kind: DayKind
  /** Montant attendu (0 si repos/panne), dans `currency` */
  expected: number
  currency: Currency
  paid: number
  remaining: number
  state: PayState
  /** Montant du jour modifié à titre exceptionnel */
  override: boolean
  reason: string | null
}

export interface LedgerVehicle {
  id: string
  name: string
  serviceDate: string
  amounts: AmountChange[]
  /** null = jours de repos des paramètres */
  restWeekdays: number[] | null
}

export interface Allocation {
  date: string
  vehicleId: string
  /** Dans la devise de la journée */
  amount: number
}

/** Immobilisation d'un engin sur plusieurs jours (end null = en cours). */
export interface Breakdown {
  id: string
  vehicleId: string
  startDate: string
  endDate: string | null
  reason: string
}

/**
 * Transforme les immobilisations en marques « panne » jour par jour, entre from et to.
 * Une marque posée explicitement sur un jour reste prioritaire (ex. « demi-journée » le jour de la réparation).
 */
export function withBreakdowns(marks: DayMark[], breakdowns: Breakdown[], from: string, to: string): DayMark[] {
  const explicit = new Set(marks.map((m) => `${m.vehicleId}|${m.date}`))
  const out = [...marks]
  for (const b of breakdowns) {
    const end = b.endDate && b.endDate < to ? b.endDate : to
    for (let d = b.startDate > from ? b.startDate : from; d <= end; d = addDays(d, 1)) {
      if (!explicit.has(`${b.vehicleId}|${d}`)) out.push({ vehicleId: b.vehicleId, date: d, kind: 'breakdown', amount: null, currency: null, reason: b.reason })
    }
  }
  return out
}

/** Situation d'un jour donné pour un engin, avant paiement. */
export function expectedFor(
  v: LedgerVehicle,
  date: string,
  defaultRest: number[],
  mark: DayMark | undefined,
): { kind: DayKind; expected: number; currency: Currency; override: boolean } {
  const base = amountOn(v.amounts, date)
  const currency = mark?.kind === 'override' && mark.currency ? mark.currency : (base?.currency ?? 'CDF')
  if (!base) return { kind: 'not_started', expected: 0, currency, override: false }
  if (mark?.kind === 'breakdown') return { kind: 'breakdown', expected: 0, currency, override: false }
  if (mark?.kind === 'rest') return { kind: 'rest', expected: 0, currency, override: false }
  // Un montant exceptionnel s'applique même un jour de repos habituel (jour travaillé exceptionnellement)
  if (mark?.kind === 'override') return { kind: 'due', expected: mark.amount ?? 0, currency, override: true }
  if ((v.restWeekdays ?? defaultRest).includes(weekdayOf(date))) return { kind: 'rest', expected: 0, currency, override: false }
  return { kind: 'due', expected: base.amount, currency, override: false }
}

/**
 * Journées d'un chauffeur entre `from` et `to` (inclus), selon ses affectations.
 * Les affectations en cours s'étendent jusqu'à `to` (permet d'afficher les jours à venir pour une avance).
 */
export function driverLedger(opts: {
  assignments: Assignment[]
  vehicles: Map<string, LedgerVehicle>
  defaultRest: number[]
  marks: DayMark[]
  allocations: Allocation[]
  from: string
  to: string
}): LedgerDay[] {
  const markKey = (vid: string, d: string) => `${vid}|${d}`
  const marks = new Map(opts.marks.map((m) => [markKey(m.vehicleId, m.date), m]))
  const paid = new Map<string, number>()
  for (const a of opts.allocations) paid.set(markKey(a.vehicleId, a.date), (paid.get(markKey(a.vehicleId, a.date)) ?? 0) + a.amount)

  const days: LedgerDay[] = []
  for (const a of opts.assignments) {
    const v = opts.vehicles.get(a.vehicleId)
    if (!v) continue
    let d = a.startDate > opts.from ? a.startDate : opts.from
    const end = a.endDate && a.endDate < opts.to ? a.endDate : opts.to
    for (; d <= end; d = addDays(d, 1)) {
      const mark = marks.get(markKey(v.id, d))
      const e = expectedFor(v, d, opts.defaultRest, mark)
      const p = paid.get(markKey(v.id, d)) ?? 0
      const remaining = Math.max(e.expected - p, 0)
      days.push({
        date: d,
        vehicleId: v.id,
        vehicleName: v.name,
        kind: e.kind,
        expected: e.expected,
        currency: e.currency,
        paid: p,
        remaining,
        state: e.expected === 0 ? (p > 0 ? 'paid' : 'none') : remaining === 0 ? 'paid' : p > 0 ? 'partial' : 'unpaid',
        override: e.override,
        reason: mark?.reason ?? null,
      })
    }
  }
  return days.sort((x, y) => x.date.localeCompare(y.date) || x.vehicleName.localeCompare(y.vehicleName))
}

export type Totals = Partial<Record<Currency, number>>

const add = (t: Totals, c: Currency, n: number) => {
  if (n) t[c] = (t[c] ?? 0) + n
}

/**
 * Résumé : arriérés (jours passés non payés = dettes), reste à payer aujourd'hui,
 * avance (jours futurs déjà payés), par devise.
 */
export function summarize(days: LedgerDay[], today: string) {
  const arrears: Totals = {}
  const dueToday: Totals = {}
  const advance: Totals = {}
  let unpaidDays = 0
  for (const d of days) {
    if (d.date < today) {
      add(arrears, d.currency, d.remaining)
      if (d.remaining > 0) unpaidDays++
    } else if (d.date === today) add(dueToday, d.currency, d.remaining)
    else add(advance, d.currency, d.paid)
  }
  return { arrears, dueToday, advance, unpaidDays }
}

/** Somme de totaux multi-devises, convertie dans une devise (taux : CDF pour 1 USD). */
export function totalIn(t: Totals, to: Currency, rate: number | null): number | null {
  let sum = 0
  for (const [c, n] of Object.entries(t) as [Currency, number][]) {
    if (c === to) sum += n
    else if (!rate) return null
    else sum += convert(n, c, to, rate)
  }
  return sum
}

/**
 * Répartit un versement sur les journées choisies, dans l'ordre donné.
 * Chaque journée reçoit au plus son reste dû ; la dernière peut n'être payée qu'en partie.
 * Le montant est converti une seule fois dans la devise des journées (pas de perte d'arrondi à chaque jour).
 * Retourne aussi ce qui n'a pas pu être affecté (dans la devise du versement).
 */
export function allocate(
  amount: number,
  currency: Currency,
  rate: number | null,
  selected: { date: string; vehicleId: string; remaining: number; currency: Currency }[],
): { allocations: Allocation[]; leftover: number } {
  let left = amount
  let cur = currency
  const allocations: Allocation[] = []
  for (const d of selected) {
    if (left <= 0) break
    if (d.remaining <= 0) continue
    if (d.currency !== cur) {
      if (!rate) throw new Error('Taux de change requis')
      left = convert(left, cur, d.currency, rate)
      cur = d.currency
    }
    const part = Math.min(d.remaining, left)
    allocations.push({ date: d.date, vehicleId: d.vehicleId, amount: part })
    left -= part
  }
  const leftover = cur === currency || left === 0 ? left : convert(left, cur, currency, rate!)
  return { allocations, leftover }
}

/** Libellés pour l'interface. */
export const PAY_STATE_LABEL: Record<PayState, string> = {
  paid: 'Payé',
  partial: 'Partiel',
  unpaid: 'Non payé',
  none: '—',
}
export const DAY_KIND_LABEL: Record<DayKind, string> = {
  due: 'Travaillé',
  rest: 'Repos',
  breakdown: 'Panne',
  not_started: 'Hors service',
}
