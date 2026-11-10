import { useEffect, useState } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { Alert, Card, Spinner } from '../../components/ui'
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
  { title: 'Versements, dettes et reçus', phase: 3 },
  { title: 'Dépenses et pannes', phase: 4 },
  { title: 'Rapports PDF / Excel', phase: 5 },
]

export function DashboardPage() {
  const { session, bundle } = useSession()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tz = bundle?.settings.timezone

  useEffect(() => {
    backend.dashboard().then(setData, (e) => setError(e.message))
  }, [bundle])

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Spinner />

  const isDriver = !can(session?.user?.role, 'dashboard.view')
  const canOpen = can(session?.user?.role, 'vehicles.view')
  const c = data.currency
  const order = { due: 0, no_driver: 1, rest: 2, not_started: 3 }
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
          <Stat label="Manque"><Money amount={data.today.debt} currency={c} /></Stat>
        </div>
      </Card>

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
                      <Pill kind={l.status} />
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
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Versements"><Money amount={data.month.paid} currency={c} /></Stat>
            <Stat label="Dépenses"><Money amount={data.month.expenses} currency={c} /></Stat>
            <Stat label="Bénéfice réel"><Money amount={data.month.profit} currency={c} /></Stat>
            <Stat label="Dettes totales"><Money amount={data.totalDebt} currency={c} /></Stat>
          </div>
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
