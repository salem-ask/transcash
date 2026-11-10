// Situation d'un chauffeur : dettes, reste du jour, avance, journées récentes et derniers versements.
import { Link } from 'react-router-dom'
import { Money, MoneyTotals } from '../../components/Money'
import { Alert, ButtonLink, Card } from '../../components/ui'
import { formatDay } from '../../domain/fleet'
import { formatMoney } from '../../domain/money'
import { DAY_KIND_LABEL, PAY_STATE_LABEL, type LedgerDay } from '../../domain/ledger'
import { METHOD_LABEL, receiptNumber } from '../../domain/receipt'
import type { LedgerPayload, Payment } from '../../domain/types'

const STATE_STYLE: Record<string, string> = {
  paid: 'bg-brand/15 text-brand-strong',
  partial: 'bg-accent/25 text-ink',
  unpaid: 'bg-danger/15 text-danger',
  none: 'bg-surface-2 text-ink-soft',
}

export function DayStatePill({ day }: { day: Pick<LedgerDay, 'kind' | 'state'> }) {
  const label = day.kind === 'due' ? PAY_STATE_LABEL[day.state] : DAY_KIND_LABEL[day.kind]
  const style = day.kind === 'breakdown' ? 'bg-danger/10 text-danger' : day.kind === 'due' ? STATE_STYLE[day.state] : STATE_STYLE.none
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>
}

/** Une ligne de journée : date, engin, attendu / payé, état. */
export function DayRow({ d, showVehicle, today }: { d: LedgerDay; showVehicle?: boolean; today: string }) {
  const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-16 shrink-0 text-sm">
        <span className="block font-medium capitalize">{d.date === today ? "Auj." : weekday}</span>
        <span className="text-xs text-ink-soft">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {d.kind === 'due' ? (
          <span className="tabular-nums">
            {d.paid > 0 && d.remaining > 0 ? (
              `${formatMoney(d.paid, d.currency)} sur ${formatMoney(d.expected, d.currency)}`
            ) : (
              <Money amount={d.expected} currency={d.currency} />
            )}
          </span>
        ) : (
          <span className="text-ink-soft">{d.reason ?? ''}</span>
        )}
        {showVehicle && <span className="block truncate text-xs text-ink-soft">{d.vehicleName}</span>}
        {d.override && <span className="block truncate text-xs text-ink-soft">Montant exceptionnel : {d.reason}</span>}
      </div>
      <DayStatePill day={d} />
    </div>
  )
}

export function PaymentRow({ p, showDriver }: { p: Payment; showDriver?: boolean }) {
  return (
    <Link to={`/versements/${p.id}`} className={`flex items-center gap-3 py-2 hover:bg-surface-2 ${p.cancelled ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${p.cancelled ? 'line-through' : ''}`}>{showDriver ? p.driverName : formatDay(p.paidOn)}</p>
        <p className="truncate text-xs text-ink-soft">
          {receiptNumber(p.receiptNo)} · {METHOD_LABEL[p.method]}
          {p.kind === 'extra' ? ' · Exceptionnel' : ''}
          {p.cancelled ? ' · Annulé' : ''}
        </p>
      </div>
      <Money amount={p.amount} currency={p.currency} className="items-end text-sm" />
    </Link>
  )
}

export function LedgerView({ data, canCollect }: { data: LedgerPayload; canCollect: boolean }) {
  const { summary, today } = data
  const hasArrears = Object.keys(summary.arrears).length > 0
  // 14 dernières journées travaillées ou marquées, plus aujourd'hui
  const recent = data.days.filter((d) => d.date <= today && d.kind !== 'not_started').slice(-14).reverse()
  const multiVehicle = new Set(recent.map((d) => d.vehicleId)).size > 1
  const unpaid = data.days.filter((d) => d.date < today && d.remaining > 0)

  return (
    <>
      <Card title="Situation">
        <div className="grid grid-cols-3 gap-2">
          <div className={`rounded-xl p-3 ${hasArrears ? 'bg-danger/10' : 'bg-surface-2'}`}>
            <p className="text-xs font-medium text-ink-soft">Dettes</p>
            {hasArrears ? <MoneyTotals totals={summary.arrears} className="text-danger" /> : <p className="font-semibold">Aucune</p>}
            {summary.unpaidDays > 0 && <p className="text-xs text-ink-soft">{summary.unpaidDays} jour{summary.unpaidDays > 1 ? 's' : ''}</p>}
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-medium text-ink-soft">Reste aujourd'hui</p>
            {Object.keys(summary.dueToday).length ? <MoneyTotals totals={summary.dueToday} /> : <p className="font-semibold">—</p>}
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-medium text-ink-soft">Avance</p>
            {Object.keys(summary.advance).length ? <MoneyTotals totals={summary.advance} /> : <p className="font-semibold">—</p>}
          </div>
        </div>
        {canCollect && (
          <div className="mt-3">
            <ButtonLink to={`/versements/nouveau?chauffeur=${data.driver.id}`}>Encaisser un versement</ButtonLink>
          </div>
        )}
      </Card>

      {unpaid.length > 0 && (
        <Card title={`Journées impayées (${unpaid.length})`}>
          <div className="divide-y divide-line">
            {unpaid.slice(0, 31).map((d) => (
              <DayRow key={d.vehicleId + d.date} d={d} showVehicle={multiVehicle} today={today} />
            ))}
          </div>
          {unpaid.length > 31 && <p className="pt-2 text-xs text-ink-soft">… et {unpaid.length - 31} autres journées plus anciennes.</p>}
        </Card>
      )}

      <Card title="14 derniers jours">
        {recent.length === 0 ? (
          <Alert kind="info">Aucune journée pour le moment : le chauffeur n'a pas encore été affecté à un engin.</Alert>
        ) : (
          <div className="divide-y divide-line">
            {recent.map((d) => (
              <DayRow key={d.vehicleId + d.date} d={d} showVehicle={multiVehicle} today={today} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Derniers versements">
        {data.payments.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun versement enregistré.</p>
        ) : (
          <div className="divide-y divide-line">
            {data.payments.slice(0, 10).map((p) => (
              <PaymentRow key={p.id} p={p} />
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
