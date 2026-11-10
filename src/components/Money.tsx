import { useSession } from '../app/session'
import { convert, formatMoney } from '../domain/money'
import type { Currency } from '../domain/types'
import { totalIn, type Totals } from '../domain/ledger'

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

/**
 * Total multi-devises (ex. dettes en FC et en $), affiché dans la devise principale.
 * Si un taux manque, affiche chaque devise séparément.
 */
export function MoneyTotals({ totals, className = '', large }: { totals: Totals; className?: string; large?: boolean }) {
  const { bundle } = useSession()
  const base = bundle?.settings.baseCurrency ?? 'CDF'
  const total = totalIn(totals, base, bundle?.rate?.rate ?? null)
  if (total !== null) return <Money amount={total} currency={base} className={className} large={large} />
  return (
    <span className={`inline-flex flex-col font-semibold tabular-nums ${className}`}>
      {(Object.entries(totals) as [Currency, number][]).map(([c, n]) => (
        <span key={c}>{formatMoney(n, c)}</span>
      ))}
    </span>
  )
}
