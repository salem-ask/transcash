import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { matches } from '../../lib/search'
import { ListToolbar, Pill, VehicleIcon } from '../../components/fleet'
import { Alert, ButtonLink, Spinner } from '../../components/ui'
import { can } from '../../domain/permissions'
import { useLoad } from '../../lib/useLoad'

type Tab = 'driving' | 'free' | 'inactive'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export function DriversPage() {
  const { session } = useSession()
  const { data: drivers, error } = useLoad(() => backend.listDrivers(), [])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('driving')

  if (error) return <Alert>{error}</Alert>
  if (!drivers) return <Spinner />

  const tabOf = (d: (typeof drivers)[number]): Tab => (!d.active ? 'inactive' : d.currentVehicle ? 'driving' : 'free')
  const shown = drivers.filter((d) => tabOf(d) === tab && matches(search, d.name, d.phone, d.currentVehicle?.name, d.currentVehicle?.plate))
  const count = (t: Tab) => drivers.filter((d) => tabOf(d) === t).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Chauffeurs</h1>
        {can(session?.user?.role, 'drivers.manage') && <ButtonLink to="/chauffeurs/nouveau">+ Ajouter</ButtonLink>}
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Rechercher : nom, téléphone, engin…"
        tabs={[
          { id: 'driving', label: 'En service', count: count('driving') },
          { id: 'free', label: 'Disponibles', count: count('free') },
          { id: 'inactive', label: 'Désactivés', count: count('inactive') },
        ]}
        tab={tab}
        onTab={setTab}
      />

      {drivers.length === 0 ? (
        <Alert kind="info">Aucun chauffeur pour le moment. Ajoutez-en un, puis affectez-le à un engin.</Alert>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">Aucun chauffeur dans cette liste.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.id}>
              <Link
                to={`/chauffeurs/${d.id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-ink-soft">{initials(d.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.name}</p>
                  <p className="truncate text-sm text-ink-soft">{d.phone}</p>
                </div>
                {d.currentVehicle ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-ink-soft">
                    <VehicleIcon type={d.currentVehicle.type} className="size-5" />
                    <span className="max-w-28 truncate">{d.currentVehicle.name}</span>
                  </span>
                ) : (
                  <Pill kind={d.active ? 'no_driver' : 'inactive'}>{d.active ? 'Disponible' : 'Désactivé'}</Pill>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
