import { describe, expect, it } from 'vitest'
import { cashBalance, reminderState } from './finance'
import { driverLedger, withBreakdowns, type LedgerVehicle } from './ledger'

describe('caisse', () => {
  it('solde par devise, entrées moins sorties', () => {
    const b = cashBalance([
      { date: '2026-11-01', direction: 'in', amount: 100000, currency: 'CDF' },
      { date: '2026-11-02', direction: 'out', amount: 30000, currency: 'CDF' },
      { date: '2026-11-02', direction: 'in', amount: 2000, currency: 'USD' },
      { date: '2026-11-05', direction: 'out', amount: 500, currency: 'USD' },
    ])
    expect(b).toEqual({ CDF: 70000, USD: 1500 })
  })
  it('solde à une date', () => {
    expect(cashBalance([{ date: '2026-11-05', direction: 'in', amount: 1, currency: 'CDF' }], '2026-11-04')).toEqual({ CDF: 0, USD: 0 })
  })
})

describe('échéances', () => {
  const r = { dueDate: '2026-11-20', notifyDays: 7, doneAt: null }
  it('plus tard, bientôt, dépassée, faite', () => {
    expect(reminderState(r, '2026-11-10')).toBe('later')
    expect(reminderState(r, '2026-11-13')).toBe('soon')
    expect(reminderState(r, '2026-11-21')).toBe('overdue')
    expect(reminderState({ ...r, doneAt: '2026-11-19' }, '2026-11-21')).toBe('done')
  })
})

describe('immobilisations dans le grand livre', () => {
  const v: LedgerVehicle = { id: 'v', name: 'Taxi', serviceDate: '2026-11-01', restWeekdays: [], amounts: [{ amount: 1000, currency: 'CDF', effectiveFrom: '2026-11-01' }] }
  const marks = withBreakdowns(
    [{ vehicleId: 'v', date: '2026-11-12', kind: 'override', amount: 500, currency: 'CDF', reason: 'Réparé à midi' }],
    [{ id: 'b', vehicleId: 'v', startDate: '2026-11-10', endDate: '2026-11-12', reason: 'Moteur' }],
    '2026-11-09',
    '2026-11-13',
  )
  const days = driverLedger({
    assignments: [{ id: 'a', vehicleId: 'v', vehicleName: null, driverId: 'd', driverName: null, startDate: '2026-11-01', endDate: null }],
    vehicles: new Map([['v', v]]), defaultRest: [], marks, allocations: [], from: '2026-11-09', to: '2026-11-13',
  })
  it('aucun versement exigé pendant l’immobilisation, la marque explicite reste prioritaire', () => {
    expect(days.map((d) => [d.date.slice(8), d.kind, d.expected])).toEqual([
      ['09', 'due', 1000], ['10', 'breakdown', 0], ['11', 'breakdown', 0], ['12', 'due', 500], ['13', 'due', 1000],
    ])
    expect(days[1].reason).toBe('Moteur')
  })
  it('immobilisation en cours (sans fin) jusqu’à la date demandée', () => {
    const m = withBreakdowns([], [{ id: 'b', vehicleId: 'v', startDate: '2026-11-12', endDate: null, reason: 'x' }], '2026-11-01', '2026-11-14')
    expect(m.map((x) => x.date)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14'])
  })
})
