import { Link } from 'react-router-dom'
import { useSession } from '../../app/session'
import { setFlash } from '../../lib/flash'
import { Button, Card } from '../../components/ui'
import { can, roleLabel, type Permission } from '../../domain/permissions'

const ENTRIES: { to: string; label: string; hint: string; perm?: Permission }[] = [
  { to: '/rapports', label: 'Rapports', hint: 'Semaine, mois, par engin ou chauffeur · PDF et Excel', perm: 'reports.view' },
  { to: '/depenses', label: 'Dépenses', hint: 'Carburant, réparations, taxes…', perm: 'expenses.manage' },
  { to: '/caisse', label: 'Caisse', hint: 'Solde, retraits et apports', perm: 'cash.manage' },
  { to: '/echeances', label: 'Échéances', hint: 'Assurance, vignette, vidange', perm: 'vehicles.view' },
  { to: '/journal', label: "Journal d'activité", hint: 'Qui a modifié quoi, et quand', perm: 'audit.view' },
  { to: '/parametres', label: 'Paramètres', hint: 'Devise, taux de change, jours de repos', perm: 'settings.view' },
  { to: '/utilisateurs', label: 'Équipe', hint: 'Comptes et rôles', perm: 'users.view' },
  { to: '/compte', label: 'Mon compte', hint: 'Mot de passe' },
]

/** Menu du téléphone : les entrées qui ne tiennent pas dans la barre du bas. */
export function MenuPage() {
  const { session, logout } = useSession()
  const user = session!.user!
  return (
    <div className="space-y-4">
      <Card>
        <p className="font-semibold">{user.name}</p>
        <p className="text-sm text-ink-soft">
          {roleLabel(user.role)} · {session!.ownerName}
        </p>
      </Card>
      <nav className="overflow-hidden rounded-2xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {ENTRIES.filter((e) => !e.perm || can(user.role, e.perm)).map((e) => (
            <li key={e.to}>
              <Link to={e.to} className="flex min-h-16 items-center justify-between gap-3 px-4 hover:bg-surface-2">
                <span>
                  <span className="block font-medium">{e.label}</span>
                  <span className="block text-sm text-ink-soft">{e.hint}</span>
                </span>
                <span aria-hidden className="text-xl text-ink-soft">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Button variant="secondary" className="w-full" onClick={() => logout().catch((e: unknown) => setFlash(e instanceof Error ? e.message : String(e), 'error'))}>
        Se déconnecter
      </Button>
    </div>
  )
}
