import { isQueued } from '../data/offline'
import { useCallback, useEffect, useState } from 'react'

/** Charge une donnée asynchrone ; `reload` la recharge, `setData` la remplace (après une modification). */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps)

  const reload = useCallback(() => {
    setError(null)
    load().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  useEffect(reload, [reload])
  // Après une synchronisation (opérations hors ligne envoyées), recharger les données affichées
  useEffect(() => {
    window.addEventListener('transcash:synced', reload)
    return () => window.removeEventListener('transcash:synced', reload)
  }, [reload])
  return { data, error, reload, setData }
}

/** Message d'erreur lisible. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Message pour une erreur : « info » si l'opération a été mise en file hors connexion. */
export function msgOf(e: unknown): { kind: 'error' | 'info'; text: string } {
  return { kind: isQueued(e) ? 'info' : 'error', text: errorText(e) }
}
