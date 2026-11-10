import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from './session'
import { can, type Permission } from '../domain/permissions'
import { backend } from '../data'

interface NavItem {
  to: string
  label: string
  icon: string
  perm?: Permission
  /** Où l'entrée apparaît : barre du bas (téléphone), colonne (ordinateur), ou les deux */
  show?: 'mobile' | 'desktop'
}

const NAV: NavItem[] = [
  { to: '/', label: 'Accueil', icon: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z' },
  { to: '/versements', label: 'Versements', icon: 'M3 7h18v12H3zM3 11h18M7 15h4M16 3l-4 4-4-4', perm: 'payments.view' },
  { to: '/engins', label: 'Engins', icon: 'M5 17h14M3 17v-4l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4h-2M7 17a2 2 0 1 0 4 0M13 17a2 2 0 1 0 4 0M3 13h18', perm: 'vehicles.view' },
  { to: '/chauffeurs', label: 'Chauffeurs', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', perm: 'drivers.view' },
  { to: '/menu', label: 'Menu', icon: 'M4 6h16M4 12h16M4 18h16', show: 'mobile' },
  { to: '/parametres', show: 'desktop', label: 'Paramètres', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z', perm: 'settings.view' },
  { to: '/utilisateurs', show: 'desktop', label: 'Équipe', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4', perm: 'users.view' },
  { to: '/compte', show: 'desktop', label: 'Compte', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export function Layout() {
  const { session } = useSession()
  const role = session?.user?.role
  const items = NAV.filter((n) => !n.perm || can(role, n.perm))

  return (
    <div className="min-h-dvh pb-24 md:pb-0 md:pl-56">
      {backend.isDemo && (
        <div className="bg-accent px-4 py-1 text-center text-xs font-semibold text-black">
          Mode démonstration — données stockées dans ce navigateur uniquement
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-brand">TransCash</p>
            <p className="truncate text-xs text-ink-soft">{session?.ownerName}</p>
          </div>
          <p className="truncate text-right text-sm text-ink-soft">{session?.user?.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <Outlet />
      </main>

      {/* Navigation : barre en bas sur téléphone, colonne à gauche sur ordinateur */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-56 md:border-t-0 md:border-r md:pt-20">
        <ul className="mx-auto flex max-w-3xl md:flex-col md:gap-1 md:px-3">
          {items.map((n) => (
            <li key={n.to} className={`flex-1 ${n.show === 'mobile' ? 'md:hidden' : n.show === 'desktop' ? 'hidden md:block' : ''}`}>
              <NavLink
                to={n.to}
                end={n.to === '/' || n.to === '/menu'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium md:min-h-12 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-sm ${
                    isActive ? 'text-brand md:bg-brand/10' : 'text-ink-soft hover:text-ink'
                  }`
                }
              >
                <Icon d={n.icon} />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
