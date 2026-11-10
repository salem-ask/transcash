import { describe, expect, it } from 'vitest'
import { addDays, amountOn, assignmentOn, dayStatus, daysBetween, isValidDate, todayIn, weekdayOf } from './fleet'
import type { AmountChange, Assignment } from './types'

describe('dates', () => {
  it('jour précédent / suivant, y compris changement de mois et année bissextile', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('jour de la semaine', () => {
    expect(weekdayOf('2026-11-10')).toBe(2) // mardi
    expect(weekdayOf('2026-11-15')).toBe(0) // dimanche
  })
  it('date du jour selon le fuseau', () => {
    const lateUtc = new Date('2026-11-10T23:30:00Z')
    expect(todayIn('Africa/Kinshasa', lateUtc)).toBe('2026-11-11') // UTC+1
    expect(todayIn('UTC', lateUtc)).toBe('2026-11-10')
  })
  it('validation et durée', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2026-02-28')).toBe(true)
    expect(daysBetween('2026-02-01', '2026-02-28')).toBe(28)
  })
})

describe('montant attendu', () => {
  const history: AmountChange[] = [
    { amount: 30000, currency: 'CDF', effectiveFrom: '2026-01-01' },
    { amount: 35000, currency: 'CDF', effectiveFrom: '2026-06-01' },
  ]
  it("applique le montant en vigueur ce jour-là", () => {
    expect(amountOn(history, '2025-12-31')).toBeNull()
    expect(amountOn(history, '2026-05-31')?.amount).toBe(30000)
    expect(amountOn(history, '2026-06-01')?.amount).toBe(35000)
  })
})

describe('situation du jour', () => {
  const a: Assignment[] = [
    { id: '1', vehicleId: 'v', vehicleName: null, driverId: 'jean', driverName: null, startDate: '2026-02-01', endDate: '2026-02-28' },
    { id: '2', vehicleId: 'v', vehicleName: null, driverId: 'paul', driverName: null, startDate: '2026-03-01', endDate: null },
  ]
  it('trouve le chauffeur du jour', () => {
    expect(assignmentOn(a, '2026-02-28')?.driverId).toBe('jean')
    expect(assignmentOn(a, '2026-03-01')?.driverId).toBe('paul')
    expect(assignmentOn(a, '2026-01-15')).toBeNull()
  })
  it('repos, sans chauffeur, à verser', () => {
    const amount = { amount: 1, currency: 'CDF' as const, effectiveFrom: '2026-01-01' }
    expect(dayStatus({ amount, restDays: [0], date: '2026-11-15', hasDriver: true })).toBe('rest')
    expect(dayStatus({ amount, restDays: [0], date: '2026-11-10', hasDriver: false })).toBe('no_driver')
    expect(dayStatus({ amount, restDays: [0], date: '2026-11-10', hasDriver: true })).toBe('due')
    expect(dayStatus({ amount: null, restDays: [], date: '2026-11-10', hasDriver: true })).toBe('not_started')
  })
})
