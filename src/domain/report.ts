// Rapport d'une période (global, par engin ou par chauffeur), calculé à partir des données brutes.
// Utilisé tel quel pour l'application en ligne (données de l'API) et la démo.
import { convert } from './money'
import type { ExpenseCategory } from './finance'
import type { DayKind } from './ledger'
import type { Currency, PaymentKind, PaymentMethod, VehicleType } from './types'

export interface ReportData {
  ownerName: string
  from: string
  to: string
  today: string
  currency: Currency
  /** CDF pour 1 USD (taux actuel) */
  rate: number | null
  vehicles: { id: string; name: string; type: VehicleType; plate: string | null; status: string }[]
  drivers: { id: string; name: string; phone: string }[]
  /** Journées passées de la période, par engin */
  days: { vehicleId: string; date: string; driverId: string | null; kind: DayKind; expected: number; paid: number; currency: Currency }[]
  payments: { id: string; receiptNo: number; date: string; driverId: string; vehicleId: string | null; kind: PaymentKind; method: PaymentMethod; amount: number; currency: Currency; rate: number | null; reference: string | null }[]
  expenses: { id: string; date: string; vehicleId: string | null; driverId: string | null; category: ExpenseCategory; amount: number; currency: Currency; rate: number | null; paidBy: 'cash' | 'driver'; note: string | null; supplier: string | null }[]
}

export interface ReportFilter {
  vehicleId?: string
  driverId?: string
}

export interface ReportLine {
  id: string
  name: string
  /** Attendu, payé (pour ces journées), reste dû : dans la devise du rapport */
  expected: number
  paid: number
  remaining: number
  /** Versements reçus sur la période (date de réception) */
  received: number
  expenses: number
  profit: number
  dueDays: number
  unpaidDays: number
  breakdownDays: number
  restDays: number
  /** Noms des chauffeurs (ligne engin) ou des engins (ligne chauffeur) */
  related: string[]
}

export interface Report {
  title: string
  from: string
  to: string
  currency: Currency
  missingRate: boolean
  totals: ReportLine & { collectionRate: number | null; receivedCash: number; receivedDriverExpenses: number; receivedExtra: number }
  daily: { date: string; expected: number; paid: number; received: number; expenses: number }[]
  byVehicle: ReportLine[]
  byDriver: ReportLine[]
  expensesByCategory: { category: ExpenseCategory; amount: number }[]
  payments: (ReportData['payments'][number] & { driverName: string; vehicleName: string; converted: number })[]
  expenses: (ReportData['expenses'][number] & { vehicleName: string; converted: number })[]
}

const emptyLine = (id: string, name: string): ReportLine => ({
  id, name, expected: 0, paid: 0, remaining: 0, received: 0, expenses: 0, profit: 0,
  dueDays: 0, unpaidDays: 0, breakdownDays: 0, restDays: 0, related: [],
})

export function buildReport(data: ReportData, filter: ReportFilter = {}): Report {
  const base = data.currency
  let missingRate = false
  const conv = (n: number, c: Currency, r: number | null = null) => {
    if (c === base) return n
    const rate = r ?? data.rate
    if (!rate) {
      missingRate = true
      return 0
    }
    return convert(n, c, base, rate)
  }
  const vName = new Map(data.vehicles.map((v) => [v.id, v.name]))
  const dName = new Map(data.drivers.map((d) => [d.id, d.name]))

  const days = data.days.filter((d) => (!filter.vehicleId || d.vehicleId === filter.vehicleId) && (!filter.driverId || d.driverId === filter.driverId))
  const payments = data.payments.filter((p) => (!filter.vehicleId || p.vehicleId === filter.vehicleId) && (!filter.driverId || p.driverId === filter.driverId))
  const expenses = data.expenses.filter(
    (e) => (!filter.vehicleId || e.vehicleId === filter.vehicleId) && (!filter.driverId || e.driverId === filter.driverId),
  )

  const totals = { ...emptyLine('total', 'Total'), collectionRate: null as number | null, receivedCash: 0, receivedDriverExpenses: 0, receivedExtra: 0 }
  const byVehicle = new Map<string, ReportLine>()
  const byDriver = new Map<string, ReportLine>()
  const daily = new Map<string, Report['daily'][number]>()
  const dayOf = (date: string) => {
    if (!daily.has(date)) daily.set(date, { date, expected: 0, paid: 0, received: 0, expenses: 0 })
    return daily.get(date)!
  }
  const vehicleLine = (id: string | null) => {
    const key = id ?? '—'
    if (!byVehicle.has(key)) byVehicle.set(key, emptyLine(key, id ? (vName.get(id) ?? '?') : 'Dépenses générales'))
    return byVehicle.get(key)!
  }
  const driverLine = (id: string) => {
    if (!byDriver.has(id)) byDriver.set(id, emptyLine(id, dName.get(id) ?? '?'))
    return byDriver.get(id)!
  }
  const addRelated = (line: ReportLine, name: string | undefined) => {
    if (name && !line.related.includes(name)) line.related.push(name)
  }

  for (const d of days) {
    const expected = conv(d.expected, d.currency)
    const paid = conv(d.paid, d.currency)
    const remaining = conv(Math.max(d.expected - d.paid, 0), d.currency)
    const lines = [totals, vehicleLine(d.vehicleId), ...(d.driverId ? [driverLine(d.driverId)] : [])]
    for (const l of lines) {
      l.expected += expected
      l.paid += paid
      l.remaining += remaining
      if (d.kind === 'due' && d.expected > 0) l.dueDays++
      if (d.kind === 'due' && d.expected > d.paid) l.unpaidDays++
      if (d.kind === 'breakdown') l.breakdownDays++
      if (d.kind === 'rest') l.restDays++
    }
    if (d.driverId) {
      addRelated(vehicleLine(d.vehicleId), dName.get(d.driverId))
      addRelated(driverLine(d.driverId), vName.get(d.vehicleId))
    }
    const day = dayOf(d.date)
    day.expected += expected
    day.paid += paid
  }

  const paymentRows: Report['payments'] = []
  for (const p of payments) {
    const amount = conv(p.amount, p.currency, p.rate)
    for (const l of [totals, vehicleLine(p.vehicleId), driverLine(p.driverId)]) l.received += amount
    if (p.method === 'driver_expense') totals.receivedDriverExpenses += amount
    else if (p.kind === 'extra') totals.receivedExtra += amount
    if (p.method !== 'driver_expense') totals.receivedCash += amount
    dayOf(p.date).received += amount
    paymentRows.push({ ...p, driverName: dName.get(p.driverId) ?? '?', vehicleName: p.vehicleId ? (vName.get(p.vehicleId) ?? '?') : '—', converted: amount })
  }

  const byCategory = new Map<ExpenseCategory, number>()
  const expenseRows: Report['expenses'] = []
  for (const e of expenses) {
    const amount = conv(e.amount, e.currency, e.rate)
    totals.expenses += amount
    vehicleLine(e.vehicleId).expenses += amount
    if (e.driverId && e.paidBy === 'driver') driverLine(e.driverId).expenses += amount
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + amount)
    dayOf(e.date).expenses += amount
    expenseRows.push({ ...e, vehicleName: e.vehicleId ? (vName.get(e.vehicleId) ?? '?') : 'Générale', converted: amount })
  }

  for (const l of [totals, ...byVehicle.values(), ...byDriver.values()]) l.profit = l.received - l.expenses
  totals.collectionRate = totals.expected > 0 ? totals.paid / totals.expected : null

  const title = filter.vehicleId
    ? `Rapport — ${vName.get(filter.vehicleId) ?? 'engin'}`
    : filter.driverId
      ? `Rapport — ${dName.get(filter.driverId) ?? 'chauffeur'}`
      : 'Rapport — tout le parc'

  const byName = (a: ReportLine, b: ReportLine) => a.name.localeCompare(b.name)
  return {
    title,
    from: data.from,
    to: data.to,
    currency: base,
    missingRate,
    totals,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byVehicle: [...byVehicle.values()].sort(byName),
    byDriver: [...byDriver.values()].sort(byName),
    expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    payments: paymentRows,
    expenses: expenseRows,
  }
}

/** Périodes proposées : cette semaine (lundi → aujourd'hui), ce mois, mois dernier, 30 derniers jours. */
export function periodPresets(today: string): { id: string; label: string; from: string; to: string }[] {
  const d = new Date(`${today}T00:00:00Z`)
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const lastMonthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  const lastMonthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
  const minus30 = new Date(d)
  minus30.setUTCDate(d.getUTCDate() - 29)
  return [
    { id: 'week', label: 'Cette semaine', from: iso(monday), to: today },
    { id: 'month', label: 'Ce mois', from: iso(monthStart), to: today },
    { id: 'last-month', label: 'Mois dernier', from: iso(lastMonthStart), to: iso(lastMonthEnd) },
    { id: '30d', label: '30 derniers jours', from: iso(minus30), to: today },
  ]
}
