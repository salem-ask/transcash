import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { MoneyTotals } from '../../components/Money'
import { Alert, ButtonLink, Card, Spinner } from '../../components/ui'
import { EXPENSE_LABEL } from '../../domain/finance'
import { addDays, formatDay, todayIn } from '../../domain/fleet'
import { formatMoney } from '../../domain/money'
import { useLoad } from '../../lib/useLoad'

/** Premier et dernier jour du mois contenant `date`. */
function monthRange(date: string): [string, string] {
  const start = date.slice(0, 8) + '01'
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return [start, addDays(next.toISOString().slice(0, 10), -1)]
}

export function ExpensesPage() {
  const { bundle } = useSession()
  const today = todayIn(bundle!.settings.timezone)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [from, to] = monthRange(`${month}-01`)
  const { data, error } = useLoad(() => backend.listExpenses({ from, to: to > today ? today : to }), [from, to])

  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    setMonth(d.toISOString().slice(0, 7))
  }
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))

  // Regroupement par jour
  const byDay = new Map<string, NonNullable<typeof data>['expenses']>()
  for (const e of data?.expenses ?? []) byDay.set(e.spentOn, [...(byDay.get(e.spentOn) ?? []), e])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Dépenses</h1>
        <ButtonLink to="/depenses/nouvelle">+ Dépense</ButtonLink>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Mois précédent" className="flex size-11 items-center justify-center rounded-lg text-xl hover:bg-surface-2" onClick={() => shift(-1)}>‹</button>
          <div className="text-center">
            <p className="font-semibold capitalize">{monthLabel}</p>
            {data && (Object.keys(data.totals).length ? <MoneyTotals totals={data.totals} className="items-center" /> : <p className="text-sm text-ink-soft">Aucune dépense</p>)}
          </div>
          <button type="button" aria-label="Mois suivant" disabled={month >= today.slice(0, 7)} className="flex size-11 items-center justify-center rounded-lg text-xl hover:bg-surface-2 disabled:opacity-30" onClick={() => shift(1)}>›</button>
        </div>
      </Card>

      {error ? (
        <Alert>{error}</Alert>
      ) : !data ? (
        <Spinner />
      ) : data.expenses.length === 0 ? (
        <Alert kind="info">Aucune dépense ce mois-ci. Touchez « + Dépense » pour enregistrer carburant, réparation, taxe…</Alert>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1 px-1 text-sm font-medium text-ink-soft">{formatDay(day)}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {list.map((e) => (
                <li key={e.id}>
                  <Link to={`/depenses/${e.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2 ${e.cancelled ? 'opacity-60' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${e.cancelled ? 'line-through' : ''}`}>
                        {EXPENSE_LABEL[e.category]}
                        {e.vehicleName ? ` · ${e.vehicleName}` : ' · Générale'}
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {e.paidBy === 'driver' ? `Payée par ${e.driverName}` : 'Caisse'}
                        {e.note ? ` · ${e.note}` : ''}
                        {e.cancelled ? ' · Annulée' : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
