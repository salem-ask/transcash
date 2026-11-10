import { describe, expect, it } from 'vitest'
import { allocate, driverLedger, summarize, totalIn, type DayMark, type LedgerVehicle } from './ledger'
import type { Assignment } from './types'

const taxi: LedgerVehicle = {
  id: 'taxi', name: 'Taxi 1', serviceDate: '2026-11-01', restWeekdays: null,
  amounts: [{ amount: 40000, currency: 'CDF', effectiveFrom: '2026-11-01' }],
}
const moto: LedgerVehicle = {
  id: 'moto', name: 'Moto', serviceDate: '2026-11-01', restWeekdays: [],
  amounts: [{ amount: 500, currency: 'USD', effectiveFrom: '2026-11-01' }],
}
const vehicles = new Map([[taxi.id, taxi], [moto.id, moto]])
const assign = (vehicleId: string, startDate: string, endDate: string | null): Assignment => ({
  id: vehicleId + startDate, vehicleId, vehicleName: null, driverId: 'jean', driverName: null, startDate, endDate,
})

describe('grand livre du chauffeur', () => {
  // Du dimanche 8 au mercredi 11 novembre 2026, repos le dimanche
  const base = { vehicles, defaultRest: [0], marks: [] as DayMark[], allocations: [], from: '2026-11-08', to: '2026-11-11' }

  it('dimanche = repos, autres jours dus', () => {
    const days = driverLedger({ ...base, assignments: [assign('taxi', '2026-11-01', null)] })
    expect(days.map((d) => [d.date, d.kind, d.expected])).toEqual([
      ['2026-11-08', 'rest', 0],
      ['2026-11-09', 'due', 40000],
      ['2026-11-10', 'due', 40000],
      ['2026-11-11', 'due', 40000],
    ])
  })

  it('panne et montant exceptionnel (même un jour de repos)', () => {
    const marks: DayMark[] = [
      { vehicleId: 'taxi', date: '2026-11-08', kind: 'override', amount: 20000, currency: 'CDF', reason: 'Dimanche travaillé' },
      { vehicleId: 'taxi', date: '2026-11-09', kind: 'breakdown', amount: null, currency: null, reason: 'Pneu' },
    ]
    const days = driverLedger({ ...base, marks, assignments: [assign('taxi', '2026-11-01', null)] })
    expect(days[0]).toMatchObject({ kind: 'due', expected: 20000, override: true })
    expect(days[1]).toMatchObject({ kind: 'breakdown', expected: 0, reason: 'Pneu' })
  })

  it('suit les changements d\'engin du chauffeur', () => {
    const days = driverLedger({
      ...base,
      assignments: [assign('taxi', '2026-11-01', '2026-11-09'), assign('moto', '2026-11-10', null)],
    })
    expect(days.map((d) => d.vehicleId)).toEqual(['taxi', 'taxi', 'moto', 'moto'])
  })

  it('états payé / partiel / non payé et résumé', () => {
    const days = driverLedger({
      ...base,
      assignments: [assign('taxi', '2026-11-01', null)],
      allocations: [
        { date: '2026-11-09', vehicleId: 'taxi', amount: 40000 },
        { date: '2026-11-10', vehicleId: 'taxi', amount: 15000 },
        { date: '2026-11-11', vehicleId: 'taxi', amount: 40000 }, // avance
      ],
    })
    expect(days.map((d) => d.state)).toEqual(['none', 'paid', 'partial', 'paid'])
    const s = summarize(days, '2026-11-10')
    expect(s.arrears).toEqual({})
    expect(s.dueToday).toEqual({ CDF: 25000 })
    expect(s.advance).toEqual({ CDF: 40000 })
    const later = summarize(days, '2026-11-11')
    expect(later.arrears).toEqual({ CDF: 25000 })
    expect(later.unpaidDays).toBe(1)
  })
})

describe('répartition d\'un versement', () => {
  const sel = [
    { date: '2026-11-09', vehicleId: 'taxi', remaining: 40000, currency: 'CDF' as const },
    { date: '2026-11-10', vehicleId: 'taxi', remaining: 40000, currency: 'CDF' as const },
  ]
  it('complet puis partiel, dans l\'ordre choisi', () => {
    expect(allocate(60000, 'CDF', null, sel)).toEqual({
      allocations: [
        { date: '2026-11-09', vehicleId: 'taxi', amount: 40000 },
        { date: '2026-11-10', vehicleId: 'taxi', amount: 20000 },
      ],
      leftover: 0,
    })
  })
  it('surplus non affecté signalé', () => {
    expect(allocate(100000, 'CDF', null, sel).leftover).toBe(20000)
  })
  it('versement en dollars sur des journées en francs', () => {
    // 20 $ à 2 850 = 57 000 FC → 40 000 + 17 000
    const r = allocate(2000, 'USD', 2850, sel)
    expect(r.allocations.map((a) => a.amount)).toEqual([40000, 17000])
    expect(r.leftover).toBe(0)
  })
  it('exige un taux si les devises diffèrent', () => {
    expect(() => allocate(2000, 'USD', null, sel)).toThrow()
  })
})

describe('totaux multi-devises', () => {
  it('convertit dans la devise principale', () => {
    expect(totalIn({ CDF: 28500, USD: 1000 }, 'CDF', 2850)).toBe(57000)
    expect(totalIn({ USD: 1000 }, 'CDF', null)).toBeNull()
    expect(totalIn({}, 'CDF', null)).toBe(0)
  })
})
