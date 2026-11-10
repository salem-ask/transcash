import { useEffect, useState } from 'react'
import { backend } from '../data'
import type { SyncState } from '../data/offline'

const DEMO_STATE: SyncState = { online: true, staleSince: null, pending: [], rejected: [], syncing: false, lastSyncAt: null }

/** État de la synchronisation hors connexion (toujours « en ligne » en démo). */
export function useSync(): SyncState {
  const [state, setState] = useState<SyncState>(DEMO_STATE)
  useEffect(() => {
    if (backend.isDemo) return
    let off = () => {}
    void import('../data/offlineSetup').then(({ offline }) => {
      off = offline.subscribe(setState) as () => void
    })
    return () => off()
  }, [])
  return state
}
