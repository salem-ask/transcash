import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { matches } from '../../lib/search'
import { ListToolbar, Pill, VehicleBadge } from '../../components/fleet'
import { Alert, ButtonLink, Spinner } from '../../components/ui'
import { can } from '../../domain/permissions'
import { vehicleTypeLabel } from '../../domain/fleet'
import { useLoad } from '../../lib/useLoad'

type Tab = 'active' | 'retired'

export function VehiclesPage() {
  const { session } = useSession()
  const { data: vehicles, error } = useLoad(() => backend.listVehicles(), [])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('active')

  if (error) return <Alert>{error}</Alert>
  if (!vehicles) return <Spinner />

  const shown = vehicles.filter(
    (v) => v.status === tab && matches(search, v.name, v.plate, v.model, v.currentDriver?.name, vehicleTypeLabel(v.type)),
  )
  const count = (t: Tab) => vehicles.filter((v) => v.status === t).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Engins</h1>
        {can(session?.user?.role, 'vehicles.manage') && (
          <ButtonLink to="/engins/nouveau">+ Ajouter</ButtonLink>
        )}
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Rechercher : nom, plaque, chauffeur…"
        tabs={[
          { id: 'active', label: 'En service', count: count('active') },
          { id: 'retired', label: 'Retirés', count: count('retired') },
        ]}
        tab={tab}
        onTab={setTab}
      />

      {vehicles.length === 0 ? (
        <Alert kind="info">Aucun engin pour le moment. Ajoutez votre premier engin pour suivre ses versements.</Alert>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">Aucun engin ne correspond.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((v) => (
            <li key={v.id}>
              <Link
                to={`/engins/${v.id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <VehicleBadge type={v.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.name}</p>
                  <p className="truncate text-sm text-ink-soft">
                    {[v.plate, v.model].filter(Boolean).join(' · ') || vehicleTypeLabel(v.type)}
                  </p>
                  <div className="mt-1">
                    {v.status === 'retired' ? (
                      <Pill kind="retired">Retiré du parc</Pill>
                    ) : v.currentDriver ? (
                      <span className="text-sm text-ink">{v.currentDriver.name}</span>
                    ) : (
                      <Pill kind="no_driver" />
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <Money amount={v.dailyAmount} currency={v.currency} />
                  <span className="block text-xs text-ink-soft">par jour</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
