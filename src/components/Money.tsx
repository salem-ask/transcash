import { useSession } from '../app/session'
import { convert, formatMoney } from '../domain/money'
import type { Currency } from '../domain/types'

/**
 * Affiche un montant dans sa devise, avec l'équivalent dans la devise secondaire
 * si l'administrateur l'a activé dans les paramètres.
 */
export function Money({ amount, currency, className = '', large }: { amount: number; currency: Currency; className?: string; large?: boolean }) {
  const { bundle } = useSession()
  const other = bundle?.settings.secondaryCurrency
  const rate = bundle?.rate?.rate
  const showEq = bundle?.settings.showEquivalent && other && other !== currency && rate
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`font-semibold tabular-nums ${large ? 'text-2xl' : ''}`}>{formatMoney(amount, currency)}</span>
      {showEq && (
        <span className="text-xs text-ink-soft tabular-nums">≈ {formatMoney(convert(amount, currency, other, rate), other)}</span>
      )}
    </span>
  )
}
