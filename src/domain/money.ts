// Montants : toujours des entiers dans l'unité minimale de la devise.
// CDF : 0 décimale (le franc, les centimes ne circulent pas) ; USD : 2 décimales (cents).
import type { Currency } from './types'

export const DECIMALS: Record<Currency, number> = { CDF: 0, USD: 2 }

const factor = (c: Currency) => 10 ** DECIMALS[c]

/** Arrondi commercial (au plus proche, les moitiés s'éloignent de zéro). */
function roundHalfAway(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x) + Number.EPSILON * Math.abs(x))
}

/**
 * Convertit un montant (unité minimale) d'une devise à l'autre.
 * @param rate nombre de CDF pour 1 USD
 */
export function convert(amount: number, from: Currency, to: Currency, rate: number): number {
  if (!Number.isInteger(amount)) throw new Error('Montant non entier')
  if (from === to) return amount
  if (!(rate > 0)) throw new Error('Taux de change invalide')
  const major = amount / factor(from)
  const converted = from === 'USD' ? major * rate : major / rate
  return roundHalfAway(converted * factor(to))
}

/** Convertit une saisie utilisateur (« 12 500 », « 12,50 ») en unité minimale. Null si invalide. */
export function parseAmount(input: string, currency: Currency): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const [int, dec = ''] = cleaned.split('.')
  const d = DECIMALS[currency]
  if (dec.length > d) return null
  return Number(int) * factor(currency) + Number(dec.padEnd(d, '0') || 0)
}

const SYMBOL: Record<Currency, string> = { CDF: 'FC', USD: '$' }

/** Formate pour l'affichage : « 12 500 FC », « 4,50 $ ». */
export function formatMoney(amount: number, currency: Currency): string {
  const d = DECIMALS[currency]
  const value = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(amount / factor(currency))
  return `${value} ${SYMBOL[currency]}`
}

/** Formate un taux : « 1 $ = 2 850 FC ». */
export function formatRate(rate: number): string {
  return `1 $ = ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(rate)} FC`
}
