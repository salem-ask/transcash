// Instance unique de la couche hors connexion pour l'application en ligne (IndexedDB de l'appareil).
import { createStore, del, get, keys, set } from 'idb-keyval'
import { createOfflineClient, memoryKV, type KV } from './offline'
import { formatMoney } from '../domain/money'
import type { Currency } from '../domain/types'

function browserKV(): KV {
  try {
    if (typeof indexedDB === 'undefined') return memoryKV()
    const store = createStore('transcash', 'kv')
    return {
      get: (k) => get(k, store),
      set: (k, v) => set(k, v, store),
      del: (k) => del(k, store),
      keys: async () => (await keys(store)).map(String),
    }
  } catch {
    return memoryKV()
  }
}

/** Libellé lisible d'une opération en attente (liste « en attente » / « à corriger »). */
function label(method: string, path: string, body: unknown): string {
  const b = (body ?? {}) as { amount?: number; currency?: Currency; name?: string; kind?: string; reason?: string; date?: string }
  const money = b.amount && b.currency ? ` ${formatMoney(b.amount, b.currency).replace(/[\u00a0\u202f]/g, ' ')}` : ''
  const rules: [RegExp, string][] = [
    [/^\/payments\/[^/]+\/cancel$/, 'Annulation d’un versement'],
    [/^\/payments$/, `Versement${money}`],
    [/^\/expenses\/[^/]+\/cancel$/, 'Annulation d’une dépense'],
    [/^\/expenses/, `Dépense${money}`],
    [/^\/cash\/movements/, `${b.kind === 'deposit' ? 'Apport' : 'Retrait'}${money}`],
    [/\/days$/, `Journée ${b.date ?? ''} (${b.kind ?? ''})`],
    [/breakdowns/, 'Immobilisation'],
    [/reminders/, 'Échéance'],
    [/\/assign$/, 'Affectation de chauffeur'],
    [/\/unassign$/, 'Retrait de chauffeur'],
    [/^\/vehicles/, `Engin${b.name ? ` « ${b.name} »` : ''}`],
    [/^\/drivers/, `Chauffeur${b.name ? ` « ${b.name} »` : ''}`],
    [/^\/settings|^\/rates/, 'Paramètres'],
    [/^\/users/, 'Compte utilisateur'],
  ]
  for (const [re, text] of rules) if (re.test(path)) return text
  return `${method} ${path}`
}

export const offline = createOfflineClient({
  kv: browserKV(),
  base: (import.meta.env.VITE_API_URL as string | undefined) ?? './api',
  label,
})

// Synchroniser au retour du réseau, au retour sur l'application, et régulièrement
if (typeof window !== 'undefined' && import.meta.env.VITE_BACKEND !== 'demo') {
  const sync = () => {
    void offline.flush().then((sent) => {
      if (sent > 0) window.dispatchEvent(new Event('transcash:synced'))
    })
  }
  window.addEventListener('online', sync)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync())
  setInterval(sync, 30_000)
  setTimeout(sync, 2_000)
}
