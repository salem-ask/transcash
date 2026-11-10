// Reçu de versement : texte à envoyer par WhatsApp ou SMS (aucun service payant).
import { formatMoney } from './money'
import type { Currency, PaymentDetail, PaymentMethod } from './types'

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile Money',
  bank: 'Banque',
  driver_expense: 'Dépense payée par le chauffeur',
}

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
export const receiptNumber = (n: number) => `N° ${String(n).padStart(6, '0')}`

/**
 * Texte du reçu. `remaining` : reste dû du chauffeur après ce versement (déjà formaté), si connu.
 * `expectedByDay` : montant attendu de chaque journée payée (clé « vehicule|date »), pour indiquer complet/partiel.
 */
export function receiptText(
  p: PaymentDetail,
  opts: { ownerName: string; remaining?: string | null; expectedByDay?: Map<string, number> },
): string {
  const lines = [
    `${opts.ownerName} — Reçu de versement`,
    `${receiptNumber(p.receiptNo)} du ${shortDate(p.paidOn)}`,
    `Chauffeur : ${p.driverName ?? ''}`,
  ]
  if (p.vehicleName) lines.push(`Engin : ${p.vehicleName}`)
  lines.push(`Montant : ${formatMoney(p.amount, p.currency)} (${METHOD_LABEL[p.method]}${p.reference ? ` ${p.reference}` : ''})`)
  if (p.kind === 'extra') {
    lines.push(`Versement exceptionnel : ${p.note ?? ''}`)
  } else if (p.allocations.length) {
    lines.push('Journées payées :')
    for (const a of p.allocations) {
      const expected = opts.expectedByDay?.get(`${a.vehicleId}|${a.date}`)
      const partial = expected !== undefined && a.amount < expected
      lines.push(`- ${shortDate(a.date)} : ${formatMoney(a.amount, a.currency as Currency)}${partial ? ' (partiel)' : ''}`)
    }
  }
  if (opts.remaining) lines.push(`Reste dû à ce jour : ${opts.remaining}`)
  if (p.cancelled) lines.push(`ANNULÉ : ${p.cancelReason ?? ''}`)
  lines.push('Merci.')
  // Espaces insécables du formatage → espaces simples (meilleur rendu dans les SMS)
  return lines.join('\n').replace(/[\u00a0\u202f]/g, ' ')
}

/**
 * Numéro international sans « + » pour WhatsApp. Les numéros locaux (0…) sont considérés comme congolais (+243).
 */
export function internationalNumber(phone: string, countryCode = '243'): string {
  const digits = phone.replace(/[^0-9+]/g, '')
  if (digits.startsWith('+')) return digits.slice(1)
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return countryCode + digits.slice(1)
  return digits
}

export const whatsappLink = (phone: string, text: string) => `https://wa.me/${internationalNumber(phone)}?text=${encodeURIComponent(text)}`
export const smsLink = (phone: string, text: string) => `sms:+${internationalNumber(phone)}?body=${encodeURIComponent(text)}`
