import { describe, expect, it } from 'vitest'
import { buildReport, periodPresets, type ReportData } from './report'

const data: ReportData = {
  ownerName: 'Test', from: '2026-11-01', to: '2026-11-03', today: '2026-11-10', currency: 'CDF', rate: 2850,
  vehicles: [
    { id: 'taxi', name: 'Taxi', type: 'taxi', plate: null, status: 'active' },
    { id: 'bus', name: 'Bus', type: 'minibus', plate: null, status: 'active' },
  ],
  drivers: [{ id: 'jean', name: 'Jean', phone: '' }, { id: 'paul', name: 'Paul', phone: '' }],
  days: [
    { vehicleId: 'taxi', date: '2026-11-01', driverId: 'jean', kind: 'due', expected: 40000, paid: 40000, currency: 'CDF' },
    { vehicleId: 'taxi', date: '2026-11-02', driverId: 'jean', kind: 'due', expected: 40000, paid: 10000, currency: 'CDF' },
    { vehicleId: 'taxi', date: '2026-11-03', driverId: 'jean', kind: 'breakdown', expected: 0, paid: 0, currency: 'CDF' },
    { vehicleId: 'bus', date: '2026-11-01', driverId: 'paul', kind: 'due', expected: 2000, paid: 0, currency: 'USD' }, // 20 $ = 57 000 FC
  ],
  payments: [
    { id: 'p1', receiptNo: 1, date: '2026-11-01', driverId: 'jean', vehicleId: 'taxi', kind: 'daily', method: 'cash', amount: 40000, currency: 'CDF', rate: 2850, reference: null },
    { id: 'p2', receiptNo: 2, date: '2026-11-02', driverId: 'jean', vehicleId: 'taxi', kind: 'daily', method: 'driver_expense', amount: 10000, currency: 'CDF', rate: 2850, reference: null },
    { id: 'p3', receiptNo: 3, date: '2026-11-03', driverId: 'paul', vehicleId: 'bus', kind: 'extra', method: 'mobile_money', amount: 1000, currency: 'USD', rate: 3000, reference: 'X' },
  ],
  expenses: [
    { id: 'e1', date: '2026-11-02', vehicleId: 'taxi', driverId: 'jean', category: 'repair', amount: 10000, currency: 'CDF', rate: 2850, paidBy: 'driver', note: null, supplier: null },
    { id: 'e2', date: '2026-11-03', vehicleId: null, driverId: null, category: 'other', amount: 5000, currency: 'CDF', rate: 2850, paidBy: 'cash', note: null, supplier: null },
  ],
}

describe('rapport', () => {
  const r = buildReport(data)
  it('totaux du parc, convertis en FC', () => {
    expect(r.totals.expected).toBe(40000 + 40000 + 57000)
    expect(r.totals.paid).toBe(50000)
    expect(r.totals.remaining).toBe(30000 + 57000)
    expect(r.totals.received).toBe(40000 + 10000 + 30000) // 10 $ au taux du versement (3 000)
    expect(r.totals.receivedCash).toBe(70000)
    expect(r.totals.receivedDriverExpenses).toBe(10000)
    expect(r.totals.expenses).toBe(15000)
    expect(r.totals.profit).toBe(80000 - 15000)
    expect(r.totals.unpaidDays).toBe(2)
    expect(r.totals.breakdownDays).toBe(1)
    expect(r.totals.collectionRate).toBeCloseTo(50000 / 137000)
  })
  it('par engin et par chauffeur', () => {
    const taxi = r.byVehicle.find((v) => v.id === 'taxi')!
    expect(taxi).toMatchObject({ expected: 80000, paid: 50000, received: 50000, expenses: 10000, profit: 40000, related: ['Jean'] })
    expect(r.byVehicle.find((v) => v.id === '—')?.expenses).toBe(5000) // dépenses générales
    expect(r.byDriver.find((d) => d.id === 'paul')).toMatchObject({ expected: 57000, remaining: 57000, received: 30000, related: ['Bus'] })
  })
  it('filtre par engin', () => {
    const t = buildReport(data, { vehicleId: 'bus' })
    expect(t.title).toBe('Rapport — Bus')
    expect(t.totals.expected).toBe(57000)
    expect(t.totals.expenses).toBe(0)
  })
  it('filtre par chauffeur', () => {
    const j = buildReport(data, { driverId: 'jean' })
    expect(j.totals.expected).toBe(80000)
    expect(j.totals.expenses).toBe(10000) // dépense qu'il a payée
  })
  it('signale un taux manquant', () => {
    expect(buildReport({ ...data, rate: null }).missingRate).toBe(true)
  })
})

describe('périodes', () => {
  it('semaine du lundi, mois, mois dernier', () => {
    const p = Object.fromEntries(periodPresets('2026-11-11').map((x) => [x.id, [x.from, x.to]]))
    expect(p.week).toEqual(['2026-11-09', '2026-11-11'])
    expect(p.month).toEqual(['2026-11-01', '2026-11-11'])
    expect(p['last-month']).toEqual(['2026-10-01', '2026-10-31'])
    expect(p['30d']).toEqual(['2026-10-13', '2026-11-11'])
  })
})
