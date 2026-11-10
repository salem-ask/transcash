import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert } from '../../components/ui'
import { onFlash, peekFlash, takeFlash } from '../../lib/flash'
import { formatDateTime } from '../../lib/format'
import { useSync } from '../../lib/useSync'

/** Bandeau d'état : hors connexion, opérations en attente, à corriger ; et message laissé par l'écran précédent. */
export function SyncBanner({ timezone }: { timezone?: string }) {
  const s = useSync()
  const location = useLocation()
  const [flash, setFlashState] = useState<ReturnType<typeof takeFlash>>(null)

  // Changement d'écran : afficher le message laissé par l'écran précédent, sinon effacer
  useEffect(() => setFlashState(takeFlash()), [location.pathname])
  // Message posé sur l'écran courant : l'afficher tout de suite
  useEffect(() => onFlash(() => setFlashState(peekFlash())), [])

  const pending = s.pending.length
  const rejected = s.rejected.length
  return (
    <>
      {(!s.online || pending > 0 || rejected > 0) && (
        <Link
          to="/synchronisation"
          className={`block px-4 py-2 text-center text-sm font-medium ${rejected ? 'bg-danger text-white' : !s.online ? 'bg-ink text-page' : 'bg-accent text-black'}`}
        >
          {!s.online && 'Hors connexion'}
          {!s.online && s.staleSince && ` · données du ${formatDateTime(s.staleSince.slice(0, 19).replace('T', ' '), timezone)}`}
          {pending > 0 && `${!s.online ? ' · ' : ''}${pending} opération${pending > 1 ? 's' : ''} en attente d'envoi${s.syncing ? '…' : ''}`}
          {rejected > 0 && ` · ${rejected} à corriger`}
        </Link>
      )}
      {flash && (
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <Alert kind={flash.kind}>{flash.text}</Alert>
        </div>
      )}
    </>
  )
}
