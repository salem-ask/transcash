import { useEffect, useState } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Spinner } from '../../components/ui'
import type { AuditEntry } from '../../domain/types'
import { formatDateTime } from '../../lib/format'
import { errorText } from '../../lib/useLoad'

const ENTITY: Record<string, string> = {
  owner: 'Entreprise', user: 'Compte', settings: 'Paramètres', exchange_rate: 'Taux de change', vehicle: 'Engin',
  driver: 'Chauffeur', assignment: 'Affectation', payment: 'Versement', day_mark: 'Journée', expense: 'Dépense',
  cash_movement: 'Caisse', breakdown: 'Immobilisation', reminder: 'Échéance',
}
const ACTION: Record<string, string> = {
  create: 'créé', update: 'modifié', cancel: 'annulé', delete: 'supprimé', status: 'statut changé', end: 'terminé',
  set: 'marqué', done: 'fait', password: 'mot de passe changé',
}

/** Champs dont la valeur a changé entre ancienne et nouvelle version. */
function diff(e: AuditEntry): [string, unknown, unknown][] {
  const keys = new Set([...Object.keys(e.oldValue ?? {}), ...Object.keys(e.newValue ?? {})])
  const out: [string, unknown, unknown][] = []
  for (const k of keys) {
    const a = e.oldValue?.[k]
    const b = e.newValue?.[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push([k, a, b])
  }
  return out
}
const show = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Journal d'activité : qui a fait quoi, quand, avec l'ancienne et la nouvelle valeur. */
export function AuditPage() {
  const { bundle } = useSession()
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    backend.auditLog({ limit: 50 }).then((e) => { setEntries(e); setMore(e.length === 50) }, (e) => setError(errorText(e)))
  }, [])

  async function loadMore() {
    if (!entries?.length) return
    setBusy(true)
    try {
      const next = await backend.auditLog({ limit: 50, before: entries[entries.length - 1].id })
      setEntries([...entries, ...next])
      setMore(next.length === 50)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Alert>{error}</Alert>
  if (!entries) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Journal d'activité</h1>
      <p className="text-sm text-ink-soft">Chaque création, modification ou annulation est enregistrée ici, avec l'ancienne et la nouvelle valeur.</p>
      {entries.length === 0 ? (
        <Alert kind="info">Aucune activité pour le moment.</Alert>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {entries.map((e) => {
            const changes = diff(e)
            return (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {ENTITY[e.entity] ?? e.entity} {ACTION[e.action] ?? e.action}
                  </p>
                  <p className="shrink-0 text-xs text-ink-soft">{formatDateTime(e.createdAt, bundle?.settings.timezone)}</p>
                </div>
                <p className="text-xs text-ink-soft">par {e.userName ?? 'système'}</p>
                {changes.length > 0 && (
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-brand">Détail ({changes.length})</summary>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-left">
                        <tbody>
                          {changes.map(([k, a, b]) => (
                            <tr key={k} className="align-top">
                              <th className="py-0.5 pr-2 font-medium text-ink-soft">{k}</th>
                              {e.oldValue && <td className="py-0.5 pr-2 text-danger line-through">{show(a)}</td>}
                              <td className="py-0.5">{show(b)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {more && entries.length > 0 && (
        <Button variant="secondary" className="w-full" busy={busy} onClick={() => void loadMore()}>
          Plus ancien
        </Button>
      )}
    </div>
  )
}
