// État global : session (utilisateur connecté) et paramètres (devise, taux).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { backend } from '../data'
import type { SessionState, SettingsBundle } from '../domain/types'

interface Ctx {
  session: SessionState | null
  bundle: SettingsBundle | null
  error: string | null
  setSession: (s: SessionState) => void
  setBundle: (b: SettingsBundle) => void
  reload: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionState | null>(null)
  const [bundle, setBundle] = useState<SettingsBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async (s: SessionState) => {
    setBundle(s.user ? await backend.getSettings() : null)
  }, [])

  const reload = useCallback(async () => {
    try {
      setError(null)
      const s = await backend.status()
      setSessionState(s)
      await loadSettings(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [loadSettings])

  useEffect(() => {
    void reload()
  }, [reload])

  const setSession = useCallback(
    (s: SessionState) => {
      setSessionState(s)
      void loadSettings(s).catch((e) => setError(e.message))
    },
    [loadSettings],
  )

  const logout = useCallback(async () => {
    if (!backend.isDemo) {
      const { offline } = await import('../data/offlineSetup')
      const pending = offline.getState().pending.length
      if (pending > 0) {
        await offline.flush()
        if (offline.getState().pending.length > 0)
          throw new Error(`${offline.getState().pending.length} opération(s) pas encore envoyée(s) : retrouvez du réseau avant de vous déconnecter, sinon elles seraient perdues.`)
      }
      await backend.logout().catch(() => undefined) // hors ligne : on se déconnecte quand même sur ce téléphone
      await offline.clearCache()
    } else {
      await backend.logout()
    }
    // Le prochain utilisateur (téléphone partagé) repart de l'accueil
    window.location.hash = '#/'
    setBundle(null)
    setSessionState({ needsSetup: false, user: null, ownerName: null })
  }, [])


  return (
    <SessionContext.Provider value={{ session, bundle, error, setSession, setBundle, reload, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession hors de SessionProvider')
  return ctx
}
