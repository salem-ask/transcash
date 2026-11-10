// Caisse et échéances : calculs purs (mêmes règles que api/routes/finance.php).
import { addDays } from './fleet'
import type { Currency } from './types'

export type CashDirection = 'in' | 'out'

/** Un mouvement de caisse : versement reçu, dépense payée par la caisse, retrait ou apport du propriétaire. */
export interface CashEntry {
  date: string
  direction: CashDirection
  amount: number
  currency: Currency
}

/** Solde de caisse par devise (une seule caisse, un solde en FC et un en $). */
export function cashBalance(entries: CashEntry[], until?: string): Record<Currency, number> {
  const b: Record<Currency, number> = { CDF: 0, USD: 0 }
  for (const e of entries) {
    if (until && e.date > until) continue
    b[e.currency] += e.direction === 'in' ? e.amount : -e.amount
  }
  return b
}

export type ReminderKind = 'insurance' | 'vignette' | 'oil_change' | 'inspection' | 'other'
export const REMINDER_LABEL: Record<ReminderKind, string> = {
  insurance: 'Assurance',
  vignette: 'Vignette',
  oil_change: 'Vidange',
  inspection: 'Contrôle technique',
  other: 'Autre',
}

/** Nom affiché d'une échéance (« Autre » : son libellé). */
export const reminderName = (r: { kind: ReminderKind; label: string | null }) => (r.kind === 'other' ? (r.label ?? 'Autre') : REMINDER_LABEL[r.kind])

export type ReminderState = 'overdue' | 'soon' | 'later' | 'done'

/** État d'une échéance : dépassée, bientôt (dans la fenêtre d'alerte), plus tard, ou faite. */
export function reminderState(r: { dueDate: string; notifyDays: number; doneAt: string | null }, today: string): ReminderState {
  if (r.doneAt) return 'done'
  if (r.dueDate < today) return 'overdue'
  if (r.dueDate <= addDays(today, r.notifyDays)) return 'soon'
  return 'later'
}

export type ExpenseCategory = 'fuel' | 'repair' | 'parts' | 'maintenance' | 'tax' | 'insurance' | 'fine' | 'salary' | 'other'
export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  fuel: 'Carburant',
  repair: 'Réparation',
  parts: 'Pièces',
  maintenance: 'Entretien / vidange',
  tax: 'Taxes, vignette',
  insurance: 'Assurance',
  fine: 'Amende',
  salary: 'Salaire, prime',
  other: 'Autre',
}
