import { useEffect, useState } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { Alert, ButtonLink, Card, Spinner } from '../../components/ui'
import { useLoad } from '../../lib/useLoad'
import { buildReport, periodPresets } from '../../domain/report'
import { DayStatePill, LedgerView } from '../payments/LedgerView'
import { ReminderPill } from '../vehicles/VehicleOpsCards'
import { reminderName } from '../../domain/finance'
import { formatMoney } from '../../domain/money'
import { convert, formatRate } from '../../domain/money'
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


/** Cette semaine (lundi → aujourd'hui) : attendu (ou objectif en montant libre), payé, recouvrement. */
function WeekCard({ today }: { today: string }) {
  const week = periodPresets(today)[0]
  const { data } = useLoad(() => backend.reportData(week.from, week.to), [week.from])
  if (!data) return null
  const t = buildReport(data).totals
  return (
    <Card title="Cette semaine" action={<Link to="/rapports" className="text-sm font-medium text-brand">Rapports</Link>}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t.freeDays > 0 ? 'Objectif' : 'Attendu'}><Money amount={t.target} currency={data.currency} /></Stat>
        <Stat label={t.freeDays > 0 ? 'Versé' : 'Payé'}><Money amount={t.paid} currency={data.currency} /></Stat>
        <Stat label={t.freeDays > 0 ? 'Atteint' : 'Recouvrement'}>
          <span className="text-xl font-bold">{t.collectionRate === null ? '—' : `${Math.round(t.collectionRate * 100)} %`}</span>
        </Stat>
      </div>
    </Card>
  )
}

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
  // Mode montant libre aujourd'hui : objectif du jour = somme des montants habituels des engins qui travaillent
  const freeLines = data.lines.filter((l) => l.status === 'due' && l.free)
  const freeMode = bundle?.settings.paymentMode === 'free' || freeLines.length > 0
  let todayObjective = 0
  for (const l of freeLines) {
    if (l.currency === c) todayObjective += l.amount
    else if (data.rate) todayObjective += convert(l.amount, l.currency, c, data.rate.rate)
  }
  const lines = [...data.lines].sort((a, b) => order[a.status] - order[b.status] || a.vehicleName.localeCompare(b.vehicleName))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold first-letter:uppercase">{formatToday(tz)}</h1>
        <p className="text-sm text-ink-soft">{isDriver ? 'Votre situation' : 'Vue globale de tous vos engins'}</p>
      </div>

      {freeMode && !isDriver && (
        <Alert kind="info">
          <strong>Mode montant libre activé</strong>
          {bundle?.settings.paymentModeFrom ? ` depuis le ${bundle.settings.paymentModeFrom.split('-').reverse().join('/')}` : ''} : aucune dette, le montant
          journalier des engins sert d'objectif.{' '}
          {can(session?.user?.role, 'settings.edit') && <Link to="/parametres" className="font-semibold underline">Changer</Link>}
        </Alert>
      )}

      <Card title="Aujourd'hui">
        {freeMode && !isDriver ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Objectif"><Money amount={todayObjective} currency={c} /></Stat>
            <Stat label="Versé"><Money amount={data.today.paid} currency={c} /></Stat>
            <Stat label="Atteint">
              <span className="text-xl font-bold">{todayObjective > 0 ? `${Math.round((data.today.paid / todayObjective) * 100)} %` : '—'}</span>
            </Stat>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Attendu"><Money amount={data.today.expected} currency={c} /></Stat>
            <Stat label="Versé"><Money amount={data.today.paid} currency={c} /></Stat>
            <Stat label="Manque">
              <Money amount={data.today.debt} currency={c} className={data.today.debt ? 'text-danger' : ''} />
            </Stat>
          </div>
        )}
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

      {isDriver && own.data && <LedgerView data={own.data} canCollect={false} showObjective={false} />}

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
                <Stat label={freeMode ? 'Au travail' : 'Doivent verser'}><span className="text-xl font-bold">{data.vehicles.working}</span></Stat>
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
                      {l.status === 'due' && !l.free ? <Money amount={l.amount} currency={l.currency} className="items-end" /> : null}
                      {l.status === 'due' && l.free ? (
                        <span className="text-right">
                          <Money amount={l.paid} currency={l.currency} className="items-end" />
                          {!isDriver && l.amount > 0 && <span className="block text-xs text-ink-soft">objectif {formatMoney(l.amount, l.currency)}</span>}
                        </span>
                      ) : null}
                      {l.status === 'due' ? <DayStatePill day={{ kind: 'due', state: l.state, free: l.free }} /> : <Pill kind={l.status} />}
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

      {can(session?.user?.role, 'reports.view') && <WeekCard today={data.date} />}

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
    </div>
  )
}
