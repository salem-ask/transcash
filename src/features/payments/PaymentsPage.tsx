import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { Pill, VehicleBadge } from '../../components/fleet'
import { Alert, ButtonLink, Card, Spinner } from '../../components/ui'
import { addDays, formatDay, todayIn } from '../../domain/fleet'
import { PAY_STATE_LABEL } from '../../domain/ledger'
import { formatMoney } from '../../domain/money'
import { can } from '../../domain/permissions'
import { useLoad } from '../../lib/useLoad'
import { DayStatePill, PaymentRow } from './LedgerView'

/** Versements : qui doit verser aujourd'hui, débiteurs, journal des versements par date. */
export function PaymentsPage() {
  const { session, bundle } = useSession()
  const canCreate = can(session?.user?.role, 'payments.create')
  const today = todayIn(bundle!.settings.timezone)
  const [date, setDate] = useState(today)
  const dash = useLoad(() => backend.dashboard(), [])
  const journal = useLoad(() => backend.listPayments(date), [date])

  if (dash.error) return <Alert>{dash.error}</Alert>
  if (!dash.data) return <Spinner />
  const d = dash.data
  const toCollect = d.lines.filter((l) => l.status === 'due').sort((a, b) => Number(a.state === 'paid') - Number(b.state === 'paid') || a.vehicleName.localeCompare(b.vehicleName))
  const live = (journal.data ?? []).filter((p) => !p.cancelled)
  const dayTotals = live.reduce<Record<string, number>>((t, p) => ({ ...t, [p.currency]: (t[p.currency] ?? 0) + p.amount }), {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Versements</h1>
        {canCreate && <ButtonLink to="/versements/nouveau">+ Encaisser</ButtonLink>}
      </div>

      <Card title="À encaisser aujourd'hui">
        {toCollect.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun engin ne doit verser aujourd'hui.</p>
        ) : (
          <ul className="divide-y divide-line">
            {toCollect.map((l) => {
              const row = (
                <>
                  <VehicleBadge type={l.type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.driverName}</p>
                    <p className="truncate text-xs text-ink-soft">{l.vehicleName}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                    <span className="font-semibold tabular-nums">
                      {l.state === 'partial' ? `${formatMoney(l.remaining, l.currency)} restants` : formatMoney(l.amount, l.currency)}
                    </span>
                    <DayStatePill day={{ kind: 'due', state: l.state }} />
                  </div>
                </>
              )
              return (
                <li key={l.vehicleId}>
                  {canCreate && l.state !== 'paid' && l.driverId ? (
                    <Link to={`/versements/nouveau?chauffeur=${l.driverId}`} className="flex items-center gap-3 py-2 hover:bg-surface-2" aria-label={`Encaisser ${l.driverName}, ${PAY_STATE_LABEL[l.state]}`}>
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {d.lines.some((l) => l.status === 'no_driver') && (
          <p className="mt-2 text-xs text-ink-soft">
            Sans chauffeur aujourd'hui : {d.lines.filter((l) => l.status === 'no_driver').map((l) => l.vehicleName).join(', ')}
          </p>
        )}
      </Card>

      {d.debtors.length > 0 && (
        <Card title="Dettes des chauffeurs" action={<span className="text-sm font-semibold text-danger"><Money amount={d.totalDebt} currency={d.currency} className="items-end" /></span>}>
          <ul className="divide-y divide-line">
            {d.debtors.map((x) => (
              <li key={x.driverId}>
                <Link to={canCreate ? `/versements/nouveau?chauffeur=${x.driverId}` : `/chauffeurs/${x.driverId}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{x.driverName}</span>
                    <span className="text-xs text-ink-soft">{x.unpaidDays} jour{x.unpaidDays > 1 ? 's' : ''} impayé{x.unpaidDays > 1 ? 's' : ''}</span>
                  </span>
                  <Money amount={x.debt} currency={d.currency} className="items-end text-sm" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Journal"
        action={
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Jour précédent" className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2" onClick={() => setDate(addDays(date, -1))}>
              ‹
            </button>
            <input type="date" aria-label="Date du journal" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm" />
            <button type="button" aria-label="Jour suivant" disabled={date >= today} className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-30" onClick={() => setDate(addDays(date, 1))}>
              ›
            </button>
          </div>
        }
      >
        <p className="mb-2 text-sm text-ink-soft">
          {formatDay(date)} · {live.length} versement{live.length > 1 ? 's' : ''}
          {Object.entries(dayTotals).map(([c, n]) => ` · ${formatMoney(n, c as 'CDF')}`)}
        </p>
        {journal.error ? (
          <Alert>{journal.error}</Alert>
        ) : !journal.data ? (
          <Spinner />
        ) : journal.data.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun versement reçu ce jour-là.</p>
        ) : (
          <div className="divide-y divide-line">
            {journal.data.map((p) => (
              <PaymentRow key={p.id} p={p} showDriver />
            ))}
          </div>
        )}
      </Card>
      {d.vehicles.immobilized > 0 && <Pill kind="breakdown">{d.vehicles.immobilized} engin(s) en panne aujourd'hui</Pill>}
    </div>
  )
}
