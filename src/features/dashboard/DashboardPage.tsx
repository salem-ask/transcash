import { useEffect, useState } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { Alert, ButtonLink, Card, Spinner } from '../../components/ui'
import { useLoad } from '../../lib/useLoad'
import { DayStatePill, LedgerView } from '../payments/LedgerView'
import { ReminderPill } from '../vehicles/VehicleOpsCards'
import { reminderName } from '../../domain/finance'
import { formatMoney } from '../../domain/money'
import { formatRate } from '../../domain/money'
import { can } from '../../domain/permissions'
import type { Dashboard } from '../../domain/types'
import { formatDateTime, formatToday } from '../../lib/format'
import { Link } from 'react-router-dom'
import { Pill, VehicleBadge } from '../../components/fleet'

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-2 p-3">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  )
}

const UPCOMING = [
  { title: 'Rapports PDF / Excel', phase: 5 },
  { title: 'Hors connexion, application installable', phase: 6 },
]

export function DashboardPage() {
  const { session, bundle } = useSession()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tz = bundle?.settings.timezone

  const isDriver = !can(session?.user?.role, 'dashboard.view')
  const own = useLoad(() => (isDriver ? backend.myLedger() : Promise.resolve(null)), [isDriver])

  useEffect(() => {
    backend.dashboard().then(setData, (e) => setError(e.message))
  }, [bundle])

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Spinner />

  const canOpen = can(session?.user?.role, 'vehicles.view')
  const c = data.currency
  const order = { due: 0, no_driver: 1, breakdown: 2, rest: 3, not_started: 4 }
  const lines = [...data.lines].sort((a, b) => order[a.status] - order[b.status] || a.vehicleName.localeCompare(b.vehicleName))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold first-letter:uppercase">{formatToday(tz)}</h1>
        <p className="text-sm text-ink-soft">{isDriver ? 'Votre situation' : 'Vue globale de tous vos engins'}</p>
      </div>

      <Card title="Aujourd'hui">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Attendu"><Money amount={data.today.expected} currency={c} /></Stat>
          <Stat label="Versé"><Money amount={data.today.paid} currency={c} /></Stat>
          <Stat label="Manque">
            <Money amount={data.today.debt} currency={c} className={data.today.debt ? 'text-danger' : ''} />
          </Stat>
        </div>
        {!isDriver && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Encaissé aujourd'hui"><Money amount={data.today.received} currency={c} /></Stat>
            <Link to="/versements" className="rounded-xl hover:ring-2 hover:ring-brand/30">
              <Stat label="Dettes totales">
                <Money amount={data.totalDebt} currency={c} className={data.totalDebt ? 'text-danger' : ''} />
              </Stat>
            </Link>
          </div>
        )}
        {!isDriver && can(session?.user?.role, 'payments.create') && (
          <div className="mt-3">
            <ButtonLink to="/versements/nouveau">Encaisser un versement</ButtonLink>
          </div>
        )}
      </Card>

      {isDriver && own.data && <LedgerView data={own.data} canCollect={false} />}

      {data.alerts.length > 0 && (
        <Card title={`Échéances (${data.alerts.length})`} action={<Link to="/echeances" className="text-sm font-medium text-brand">Tout voir</Link>}>
          <ul className="divide-y divide-line">
            {data.alerts.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link to={`/engins/${r.vehicleId}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-2">
                  <span className="min-w-0 truncate font-medium">{reminderName(r)} · {r.vehicleName}</span>
                  <ReminderPill r={r} today={data.date} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!isDriver && data.debtors.length > 0 && (
        <Card title="Plus grosses dettes" action={<Link to="/versements" className="text-sm font-medium text-brand">Tout voir</Link>}>
          <ul className="divide-y divide-line">
            {data.debtors.slice(0, 3).map((x) => (
              <li key={x.driverId}>
                <Link to={`/chauffeurs/${x.driverId}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{x.driverName}</span>
                    <span className="text-xs text-ink-soft">{x.unpaidDays} jour{x.unpaidDays > 1 ? 's' : ''} impayé{x.unpaidDays > 1 ? 's' : ''}</span>
                  </span>
                  <Money amount={x.debt} currency={c} className="items-end text-sm text-danger" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.missingRate && (
        <Alert>Certains montants sont dans l'autre devise et aucun taux de change n'est disponible : saisissez un taux dans les paramètres.</Alert>
      )}

      <Card title={isDriver ? 'Mon engin' : 'Le parc aujourd\'hui'}>
        {data.lines.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {isDriver ? "Aucun engin ne vous est affecté aujourd'hui." : 'Aucun engin en service. '}
            {!isDriver && canOpen && (
              <Link to="/engins/nouveau" className="font-semibold text-brand underline">
                Ajouter un engin
              </Link>
            )}
          </p>
        ) : (
          <>
            {!isDriver && (
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Doivent verser"><span className="text-xl font-bold">{data.vehicles.working}</span></Stat>
                <Stat label="Repos"><span className="text-xl font-bold">{data.vehicles.resting}</span></Stat>
                <Stat label="Sans chauffeur">
                  <span className={`text-xl font-bold ${data.vehicles.noDriver ? 'text-danger' : ''}`}>{data.vehicles.noDriver}</span>
                </Stat>
              </div>
            )}
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const content = (
                  <>
                    <VehicleBadge type={l.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{l.vehicleName}</p>
                      <p className="truncate text-sm text-ink-soft">{l.driverName ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                      {l.status === 'due' ? <Money amount={l.amount} currency={l.currency} className="items-end" /> : null}
                      {l.status === 'due' ? <DayStatePill day={{ kind: 'due', state: l.state }} /> : <Pill kind={l.status} />}
                    </div>
                  </>
                )
                return (
                  <li key={l.vehicleId}>
                    {canOpen ? (
                      <Link to={`/engins/${l.vehicleId}`} className="flex items-center gap-3 py-2 hover:bg-surface-2">
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 py-2">{content}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>

      {!isDriver && (
        <Card title="Ce mois">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Encaissé"><Money amount={data.month.paid} currency={c} /></Stat>
            <Stat label="Dépenses"><Money amount={data.month.expenses} currency={c} /></Stat>
            <Stat label="Bénéfice réel"><Money amount={data.month.profit} currency={c} /></Stat>
          </div>
          {data.cash && (
            <Link to="/caisse" className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm hover:ring-2 hover:ring-brand/30">
              <span className="text-ink-soft">Caisse</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(data.cash.CDF, 'CDF')} · {formatMoney(data.cash.USD, 'USD')}
              </span>
            </Link>
          )}
        </Card>
      )}

      <Card title="Taux de change">
        {data.rate ? (
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-bold tabular-nums">{formatRate(data.rate.rate)}</p>
            <p className="text-right text-xs text-ink-soft">
              {data.rate.source === 'auto' ? 'Automatique' : 'Manuel'}
              <br />
              {formatDateTime(data.rate.createdAt, tz)}
            </p>
          </div>
        ) : (
          <Alert kind="info">Aucun taux disponible. Saisissez-en un dans les paramètres.</Alert>
        )}
      </Card>

      {!isDriver && (
        <Card title="Bientôt disponible">
          <ul className="divide-y divide-line">
            {UPCOMING.map((m) => (
              <li key={m.title} className="flex items-center justify-between py-2 text-sm">
                <span>{m.title}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-soft">Phase {m.phase}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
