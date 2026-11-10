import { describe, expect, it } from 'vitest'
import { internationalNumber, receiptText, whatsappLink } from './receipt'
import type { PaymentDetail } from './types'

const payment: PaymentDetail = {
  id: 'x', receiptNo: 42, driverId: 'd', driverName: 'Jean Mukendi', driverPhone: '0810000001', vehicleId: 'v',
  vehicleName: 'Taxi 1', kind: 'daily', amount: 60000, currency: 'CDF', method: 'mobile_money', reference: 'MP123',
  paidOn: '2026-11-10', rate: 2850, note: null, createdAt: '', createdByName: null, cancelled: false, cancelReason: null,
  allocations: [
    { date: '2026-11-09', vehicleId: 'v', vehicleName: 'Taxi 1', amount: 40000, currency: 'CDF' },
    { date: '2026-11-10', vehicleId: 'v', vehicleName: 'Taxi 1', amount: 20000, currency: 'CDF' },
  ],
}

describe('reçu', () => {
  it('contient le numéro, le montant, les journées et le reste dû', () => {
    const text = receiptText(payment, {
      ownerName: 'Transports Mukendi',
      remaining: '20 000 FC',
      expectedByDay: new Map([['v|2026-11-09', 40000], ['v|2026-11-10', 40000]]),
    })
    expect(text).toContain('N° 000042 du 10/11/2026')
    expect(text).toContain('Montant : 60 000 FC (Mobile Money MP123)')
    expect(text).toContain('- 09/11/2026 : 40 000 FC\n')
    expect(text).toContain('- 10/11/2026 : 20 000 FC (partiel)')
    expect(text).toContain('Reste dû à ce jour : 20 000 FC')
    expect(text).not.toMatch(/[\u00a0\u202f]/)
  })
  it('versement exceptionnel : motif, pas de journées', () => {
    const text = receiptText({ ...payment, kind: 'extra', note: 'Participation pneu', allocations: [] }, { ownerName: 'X' })
    expect(text).toContain('Versement exceptionnel : Participation pneu')
    expect(text).not.toContain('Journées payées')
  })
})

describe('numéros', () => {
  it('format international', () => {
    expect(internationalNumber('0812345678')).toBe('243812345678')
    expect(internationalNumber('+243 81 234 5678')).toBe('243812345678')
    expect(internationalNumber('00243812345678')).toBe('243812345678')
  })
  it('lien WhatsApp', () => {
    expect(whatsappLink('0812345678', 'Bonjour à vous')).toBe('https://wa.me/243812345678?text=Bonjour%20%C3%A0%20vous')
  })
})
