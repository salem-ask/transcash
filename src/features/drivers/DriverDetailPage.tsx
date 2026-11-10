import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { AssignmentHistory, Pill, VehicleBadge } from '../../components/fleet'
import { Alert, BackLink, Button, Card, Field, Spinner } from '../../components/ui'
import { formatDay, todayIn } from '../../domain/fleet'
import { can } from '../../domain/permissions'
import type { DriverDetail } from '../../domain/types'
import { errorText, useLoad } from '../../lib/useLoad'

export function DriverDetailPage() {
  const { id } = useParams()
  const { session, bundle } = useSession()
  const role = session?.user?.role
  const canManage = can(role, 'drivers.manage')
  const canAccounts = can(role, 'users.manage')
  const today = todayIn(bundle!.settings.timezone)
  const { data, error, setData } = useLoad(() => backend.getDriver(id!), [id])
  const [panel, setPanel] = useState<null | 'account' | 'deactivate'>(null)
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Spinner />
  const d = data.driver

  async function run(action: () => Promise<DriverDetail>, success: string) {
    setBusy(true)
    setMsg(null)
    try {
      setData(await action())
      setPanel(null)
      setPassword('')
      setMsg({ kind: 'success', text: success })
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const fields = { name: d.name, phone: d.phone, idNumber: d.idNumber ?? '', licenseNumber: d.licenseNumber ?? '', address: d.address ?? '', notes: d.notes ?? '' }
  const toggleActive = (active: boolean) =>
    run(() => backend.updateDriver(d.id, { ...fields, active }), active ? `${d.name} est réactivé` : `${d.name} est désactivé`)

  function createAccount(e: FormEvent) {
    e.preventDefault()
    void run(() => backend.createDriverAccount(d.id, password), `Accès créé. Identifiant : ${d.phone}`)
  }

  return (
    <div className="space-y-4">
      <BackLink to="/chauffeurs">Chauffeurs</BackLink>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">{d.name}</h1>
            <p className="select-all text-ink-soft">{d.phone}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {!d.active && <Pill kind="inactive">Désactivé</Pill>}
              {d.hasAccount && <Pill kind="due">Accès consultation</Pill>}
            </div>
          </div>
          {canManage && (
            <Link to={`/chauffeurs/${d.id}/modifier`} className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-brand/10">
              Modifier
            </Link>
          )}
        </div>
        {(d.idNumber || d.licenseNumber || d.address || d.notes) && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {d.idNumber && (<><dt className="text-ink-soft">Pièce d'identité</dt><dd>{d.idNumber}</dd></>)}
            {d.licenseNumber && (<><dt className="text-ink-soft">Permis</dt><dd>{d.licenseNumber}</dd></>)}
            {d.address && (<><dt className="text-ink-soft">Adresse</dt><dd>{d.address}</dd></>)}
            {d.notes && (<><dt className="text-ink-soft">Notes</dt><dd className="whitespace-pre-line">{d.notes}</dd></>)}
          </dl>
        )}
      </Card>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Engin conduit">
        {d.currentVehicle ? (
          <Link to={`/engins/${d.currentVehicle.id}`} className="flex items-center gap-3 rounded-xl hover:bg-surface-2">
            <VehicleBadge type={d.currentVehicle.type} />
            <div className="min-w-0">
              <p className="font-semibold">{d.currentVehicle.name}</p>
              <p className="text-sm text-ink-soft">
                {d.currentVehicle.plate ? `${d.currentVehicle.plate} · ` : ''}depuis le {formatDay(d.currentVehicle.since)}
              </p>
            </div>
          </Link>
        ) : (
          <p className="text-sm text-ink-soft">
            {d.active ? "Disponible. Pour l'affecter, ouvrez la fiche de l'engin et choisissez « Affecter un chauffeur »." : 'Chauffeur désactivé.'}
          </p>
        )}
      </Card>

      <Card title="Historique">
        <AssignmentHistory items={data.assignments} show="vehicle" today={today} />
      </Card>

      {canAccounts && d.active && !d.hasAccount && (
        <Card title="Accès de consultation">
          {panel === 'account' ? (
            <form onSubmit={createAccount} className="space-y-3">
              <p className="text-sm text-ink-soft">
                {d.name} pourra se connecter avec son numéro <strong className="text-ink">{d.phone}</strong> pour consulter ses versements et ses dettes. Il ne pourra rien modifier.
              </p>
              <Field label="Mot de passe provisoire" hint="8 caractères minimum, à lui communiquer" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setPanel(null)}>
                  Annuler
                </Button>
                <Button type="submit" className="flex-1" busy={busy}>
                  Créer l'accès
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setPanel('account')}>
              Donner un accès au chauffeur
            </Button>
          )}
        </Card>
      )}

      {canManage && (
        <Card>
          {d.active ? (
            panel === 'deactivate' ? (
              <div className="space-y-3">
                <p className="text-sm">
                  {d.name} ne pourra plus être affecté à un engin{d.hasAccount ? ' et son accès sera coupé' : ''}. Son historique est conservé.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)}>
                    Annuler
                  </Button>
                  <Button variant="danger" className="flex-1" busy={busy} onClick={() => void toggleActive(false)}>
                    Désactiver
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full text-danger"
                onClick={() => {
                  setMsg(null)
                  setPanel('deactivate')
                }}
              >
                Désactiver le chauffeur
              </Button>
            )
          ) : (
            <Button variant="secondary" className="w-full" busy={busy} onClick={() => void toggleActive(true)}>
              Réactiver le chauffeur
            </Button>
          )}
          {d.active && d.currentVehicle && panel === 'deactivate' && (
            <p className="mt-2 text-xs text-ink-soft">Il faut d'abord le retirer de « {d.currentVehicle.name} ».</p>
          )}
        </Card>
      )}
    </div>
  )
}
