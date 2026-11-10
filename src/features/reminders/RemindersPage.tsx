import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { Alert, Card, Spinner } from '../../components/ui'
import { formatDay } from '../../domain/fleet'
import { useLoad } from '../../lib/useLoad'
import { ReminderPill } from '../vehicles/VehicleOpsCards'
import { reminderName } from '../../domain/finance'

/** Toutes les échéances à faire du parc, de la plus urgente à la plus lointaine. */
export function RemindersPage() {
  const { data, error } = useLoad(() => backend.listReminders(), [])
  if (error) return <Alert>{error}</Alert>
  if (!data) return <Spinner />
  const urgent = data.reminders.filter((r) => r.state === 'overdue' || r.state === 'soon')
  const later = data.reminders.filter((r) => r.state === 'later')
  const list = (items: typeof data.reminders) => (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <Link to={`/engins/${r.vehicleId}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{reminderName(r)} · {r.vehicleName}</span>
              <span className="text-xs text-ink-soft">{formatDay(r.dueDate)}</span>
            </span>
            <ReminderPill r={r} today={data.today} />
          </Link>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Échéances</h1>
      <p className="text-sm text-ink-soft">Assurance, vignette, vidange, contrôle technique… Ajoutez-les depuis la fiche de chaque engin.</p>
      {data.reminders.length === 0 && <Alert kind="info">Aucune échéance enregistrée.</Alert>}
      {urgent.length > 0 && <Card title={`À traiter (${urgent.length})`}>{list(urgent)}</Card>}
      {later.length > 0 && <Card title="Plus tard">{list(later)}</Card>}
    </div>
  )
}
