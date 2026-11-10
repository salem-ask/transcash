import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { AssignmentHistory, Pill, VehicleBadge } from '../../components/fleet'
import { Alert, BackLink, Button, Card, Field, Select, Spinner } from '../../components/ui'
import { addDays, formatDay, todayIn, vehicleTypeLabel } from '../../domain/fleet'
import { can } from '../../domain/permissions'
import type { Driver, VehicleDetail } from '../../domain/types'
import { WEEKDAYS } from '../../lib/format'
import { errorText, useLoad } from '../../lib/useLoad'

type Panel = null | 'assign' | 'unassign' | 'retire'

export function VehicleDetailPage() {
  const { id } = useParams()
  const { session, bundle } = useSession()
  const canManage = can(session?.user?.role, 'vehicles.manage')
  const today = todayIn(bundle!.settings.timezone)
  const { data, error, setData } = useLoad(() => backend.getVehicle(id!), [id])
  const [panel, setPanel] = useState<Panel>(null)
  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState(today)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Spinner />
  const { vehicle: v, assignments, amounts } = data
  const current = v.currentDriver

  function open(p: Panel) {
    setMsg(null)
    setPanel(p)
    // Par défaut : relève demain si un chauffeur conduit aujourd'hui, sinon aujourd'hui
    setDate(p === 'assign' && current ? (current.since >= today ? addDays(current.since, 1) : today) : today)
    if (p === 'assign') {
      setDriverId('')
      backend.listDrivers().then(setDrivers, (e) => setMsg({ kind: 'error', text: errorText(e) }))
    }
  }

  async function run(action: () => Promise<VehicleDetail>, success: string) {
    setBusy(true)
    setMsg(null)
    try {
      setData(await action())
      setPanel(null)
      setMsg({ kind: 'success', text: success })
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function submitPanel(e: FormEvent) {
    e.preventDefault()
    if (panel === 'assign') {
      const d = drivers?.find((x) => x.id === driverId)
      void run(() => backend.assignDriver(v.id, driverId, date), `${d?.name ?? 'Le chauffeur'} conduit ${v.name} à partir du ${formatDay(date)}`)
    } else if (panel === 'unassign') {
      void run(() => backend.unassignDriver(v.id, date), `${current?.name} retiré de ${v.name} (dernier jour : ${formatDay(date)})`)
    } else if (panel === 'retire') {
      void run(() => backend.setVehicleStatus(v.id, 'retired', date), `${v.name} est retiré du parc`)
    }
  }

  const available = (drivers ?? []).filter((d) => d.active && !d.currentVehicle)
  const restDays = v.restWeekdays ?? bundle!.settings.restWeekdays
  const restLabel = restDays.map((d) => WEEKDAYS[d]).join(', ') || 'Aucun'

  return (
    <div className="space-y-4">
      <BackLink to="/engins">Engins</BackLink>

      <Card>
        <div className="flex items-start gap-3">
          <VehicleBadge type={v.type} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight">{v.name}</h1>
            <p className="text-sm text-ink-soft">{[vehicleTypeLabel(v.type), v.plate, v.model].filter(Boolean).join(' · ')}</p>
            {v.status === 'retired' && <div className="mt-1"><Pill kind="retired">Retiré du parc</Pill></div>}
          </div>
          {canManage && (
            <Link to={`/engins/${v.id}/modifier`} className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-brand/10">
              Modifier
            </Link>
          )}
        </div>
        <div className="mt-4 flex items-end justify-between gap-3 rounded-xl bg-surface-2 p-3">
          <div>
            <p className="text-xs text-ink-soft">Versement attendu</p>
            <Money amount={v.dailyAmount} currency={v.currency} large />
          </div>
          <p className="text-right text-xs text-ink-soft">par jour travaillé</p>
        </div>
      </Card>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Chauffeur">
        {current ? (
          <div>
            <Link to={`/chauffeurs/${current.id}`} className="text-lg font-semibold underline-offset-2 hover:underline">
              {current.name}
            </Link>
            <p className="text-sm text-ink-soft">
              <span className="select-all">{current.phone}</span> · depuis le {formatDay(current.since)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            {v.status === 'retired' ? 'Engin retiré du parc.' : "Aucun chauffeur : aucun versement n'est attendu tant qu'il n'est pas affecté."}
          </p>
        )}

        {canManage && v.status === 'active' && panel === null && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={current ? 'secondary' : 'primary'} onClick={() => open('assign')}>
              {current ? 'Changer de chauffeur' : 'Affecter un chauffeur'}
            </Button>
            {current && (
              <Button variant="ghost" onClick={() => open('unassign')}>
                Retirer le chauffeur
              </Button>
            )}
          </div>
        )}

        {(panel === 'assign' || panel === 'unassign') && (
          <form onSubmit={submitPanel} className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
            {panel === 'assign' ? (
              drivers === null ? (
                <Spinner />
              ) : available.length === 0 ? (
                <Alert kind="info">
                  Aucun chauffeur disponible : ils conduisent tous déjà un engin. <Link to="/chauffeurs/nouveau" className="font-semibold underline">Ajouter un chauffeur</Link>
                </Alert>
              ) : (
                <>
                  <Select label="Nouveau chauffeur" value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
                    <option value="">Choisir…</option>
                    {available.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.phone}
                      </option>
                    ))}
                  </Select>
                  <Field label="Premier jour de conduite" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  {current && <p className="text-xs text-ink-soft">{current.name} terminera la veille ({formatDay(addDays(date, -1))}).</p>}
                </>
              )
            ) : (
              <>
                <Field label={`Dernier jour de conduite de ${current?.name}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                <p className="text-xs text-ink-soft">À partir du lendemain, aucun versement ne sera attendu pour cet engin tant qu'un autre chauffeur n'est pas affecté.</p>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setPanel(null)}>
                Annuler
              </Button>
              <Button type="submit" className="flex-1" busy={busy} disabled={panel === 'assign' && available.length === 0}>
                Confirmer
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card title="Historique des chauffeurs">
        <AssignmentHistory items={assignments} show="driver" today={today} />
      </Card>

      <Card title="Informations">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-soft">Mise en service</dt>
          <dd>{formatDay(v.serviceDate)}</dd>
          <dt className="text-ink-soft">Jours de repos</dt>
          <dd>
            {restLabel}
            {v.restWeekdays === null && <span className="text-ink-soft"> (paramètres généraux)</span>}
          </dd>
          {v.notes && (
            <>
              <dt className="text-ink-soft">Notes</dt>
              <dd className="whitespace-pre-line">{v.notes}</dd>
            </>
          )}
        </dl>
        {amounts.length > 1 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer py-1 font-medium text-brand">Historique du montant journalier</summary>
            <ul className="divide-y divide-line">
              {amounts.map((a) => (
                <li key={a.effectiveFrom} className="flex justify-between py-2">
                  <span>À partir du {formatDay(a.effectiveFrom)}</span>
                  <Money amount={a.amount} currency={a.currency} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {canManage && (
        <Card>
          {v.status === 'active' ? (
            panel === 'retire' ? (
              <form onSubmit={submitPanel} className="space-y-3">
                <p className="text-sm">
                  L'engin n'apparaîtra plus dans le suivi quotidien{current ? ` et ${current.name} n'en sera plus le chauffeur` : ''}. Son historique est conservé et il pourra être remis en service.
                </p>
                <Field label="Date du retrait" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setPanel(null)}>
                    Annuler
                  </Button>
                  <Button type="submit" variant="danger" className="flex-1" busy={busy}>
                    Retirer du parc
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="ghost" className="w-full text-danger" onClick={() => open('retire')}>
                Retirer du parc (vendu, hors service…)
              </Button>
            )
          ) : (
            <Button variant="secondary" className="w-full" busy={busy} onClick={() => void run(() => backend.setVehicleStatus(v.id, 'active', today), `${v.name} est remis en service`)}>
              Remettre en service
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
