import { useState } from 'react'
import { Alert, Button, Card } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { useSync } from '../../lib/useSync'
import { useSession } from '../../app/session'
import { errorText } from '../../lib/useLoad'

const when = (iso: string, tz?: string) => formatDateTime(iso.slice(0, 19).replace('T', ' '), tz)

/** Synchronisation : opérations saisies hors connexion, en attente ou refusées par le serveur. */
export function SyncPage() {
  const s = useSync()
  const { bundle } = useSession()
  const tz = bundle?.settings.timezone
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(id: string, fn: (o: typeof import('../../data/offlineSetup').offline) => Promise<unknown>) {
    setBusy(id)
    setMsg(null)
    try {
      const { offline } = await import('../../data/offlineSetup')
      await fn(offline)
    } catch (e) {
      setMsg(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Synchronisation</h1>
      <Card>
        <p className="font-medium">{s.online ? 'Connecté au serveur' : 'Hors connexion'}</p>
        <p className="text-sm text-ink-soft">
          Les opérations saisies sans réseau restent sur ce téléphone et partent automatiquement, dans l'ordre, dès que le réseau revient.
          Le serveur reconnaît chaque opération : un renvoi ne crée jamais de doublon.
        </p>
        {s.lastSyncAt && <p className="mt-1 text-xs text-ink-soft">Dernier envoi : {when(s.lastSyncAt, tz)}</p>}
        <Button className="mt-3 w-full" variant="secondary" busy={busy === 'flush'} disabled={s.pending.length === 0} onClick={() => void act('flush', (o) => o.flush())}>
          Envoyer maintenant
        </Button>
      </Card>
      {msg && <Alert>{msg}</Alert>}

      <Card title={`En attente (${s.pending.length})`}>
        {s.pending.length === 0 ? (
          <p className="text-sm text-ink-soft">Rien en attente.</p>
        ) : (
          <ul className="divide-y divide-line">
            {s.pending.map((p) => (
              <li key={p.id} className="py-2">
                <p className="font-medium">{p.label}</p>
                <p className="text-xs text-ink-soft">
                  Saisi le {when(p.createdAt, tz)}
                  {p.lastError ? ` · dernier essai : ${p.lastError}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`À corriger (${s.rejected.length})`}>
        {s.rejected.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucune opération refusée.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink-soft">
              Le serveur a refusé ces opérations (souvent : un collègue a saisi la même chose avant vous). Corrigez la cause puis renvoyez, ou abandonnez-les.
            </p>
            <ul className="divide-y divide-line">
              {s.rejected.map((r) => (
                <li key={r.id} className="py-3">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-sm text-danger">{r.error}</p>
                  <p className="text-xs text-ink-soft">Saisi le {when(r.createdAt, tz)} · refusé le {when(r.rejectedAt, tz)}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" className="min-h-10 flex-1 text-sm" busy={busy === r.id} onClick={() => void act(r.id, (o) => o.retry(r.id))}>
                      Renvoyer
                    </Button>
                    <Button variant="ghost" className="min-h-10 flex-1 text-sm text-danger" disabled={busy !== null} onClick={() => void act(r.id, (o) => o.discard(r.id))}>
                      Abandonner
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
