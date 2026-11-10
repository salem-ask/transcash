import { describe, expect, it } from 'vitest'
import { convert, formatMoney, parseAmount } from './money'

describe('convert', () => {
  it('USD → CDF', () => {
    expect(convert(1000, 'USD', 'CDF', 2850)).toBe(28500) // 10,00 $ → 28 500 FC
    expect(convert(1, 'USD', 'CDF', 2850.5)).toBe(29) // 0,01 $ → 28,505 → 29 FC
  })
  it('CDF → USD arrondi au cent', () => {
    expect(convert(28500, 'CDF', 'USD', 2850)).toBe(1000)
    expect(convert(10000, 'CDF', 'USD', 2850)).toBe(351) // 3,5087… $ → 3,51 $
  })
  it('même devise : inchangé', () => {
    expect(convert(123, 'CDF', 'CDF', 0)).toBe(123)
  })
  it('refuse un taux invalide ou un montant non entier', () => {
    expect(() => convert(100, 'CDF', 'USD', 0)).toThrow()
    expect(() => convert(1.5, 'CDF', 'USD', 2850)).toThrow()
  })
})

describe('parseAmount', () => {
  it('lit les saisies françaises', () => {
    expect(parseAmount('12 500', 'CDF')).toBe(12500)
    expect(parseAmount('12,5', 'USD')).toBe(1250)
    expect(parseAmount('7', 'USD')).toBe(700)
  })
  it('rejette les saisies invalides', () => {
    expect(parseAmount('abc', 'CDF')).toBeNull()
    expect(parseAmount('12,5', 'CDF')).toBeNull() // pas de centimes en CDF
    expect(parseAmount('1,234', 'USD')).toBeNull()
    expect(parseAmount('-5', 'USD')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formate avec le symbole', () => {
    expect(formatMoney(12500, 'CDF').replace(/\s/g, ' ')).toBe('12 500 FC')
    expect(formatMoney(450, 'USD').replace(/\s/g, ' ')).toBe('4,50 $')
  })
})
