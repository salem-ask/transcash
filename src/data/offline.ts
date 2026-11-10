// Hors connexion : cache des lectures, file d'envoi des écritures, liste « à corriger ».
//
// - Lecture (GET) réussie → gardée sur l'appareil ; sans réseau, on relit la dernière copie.
// - Écriture sans réseau → mise en file avec une clé unique (X-Idempotency-Key) ; envoyée dans l'ordre
//   au retour du réseau. Le serveur reconnaît la clé : un renvoi ne crée jamais de doublon.
// - Écriture refusée par le serveur à la synchronisation (ex. journée déjà payée par un collègue)
//   → liste « à corriger » : le premier arrivé passe, le second est à revoir. Rien n'est perdu.
import { BackendError } from './backend'

/** Stockage clé → valeur (IndexedDB dans le navigateur, mémoire dans les tests). */
export interface KV {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(): Promise<string[]>
}

export interface OutboxItem {
  /** Clé d'idempotence, envoyée à chaque tentative */
  id: string
  method: string
  path: string
  body: unknown
  label: string
  createdAt: string
  attempts: number
  lastError?: string
}

export interface RejectedItem extends OutboxItem {
  status: number
  error: string
  rejectedAt: string
}

export interface SyncState {
  online: boolean
  /** Une lecture a été servie depuis la copie locale (date de cette copie) */
  staleSince: string | null
  pending: OutboxItem[]
  rejected: RejectedItem[]
  syncing: boolean
  lastSyncAt: string | null
}

/** L'opération a été enregistrée sur l'appareil et sera envoyée plus tard. */
export class QueuedError extends BackendError {
  readonly item: OutboxItem
  constructor(item: OutboxItem) {
    super(202, `Enregistré sur ce téléphone (« ${item.label} ») : envoi automatique dès le retour du réseau.`)
    this.item = item
  }
}

export const isQueued = (e: unknown): e is QueuedError => e instanceof QueuedError

/** Écritures jamais mises en file : elles n'ont de sens qu'avec le serveur. */
const NOT_QUEUEABLE = /^\/auth\//

const OUTBOX = 'outbox'
const REJECTED = 'rejected'
const CACHE_PREFIX = 'cache:'

export interface OfflineClientOptions {
  kv: KV
  base: string
  fetchImpl?: typeof fetch
  uuid?: () => string
  now?: () => string
  label?: (method: string, path: string, body: unknown) => string
}

export function createOfflineClient(opts: OfflineClientOptions) {
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const uuid = opts.uuid ?? (() => crypto.randomUUID())
  const now = opts.now ?? (() => new Date().toISOString())
  const label = opts.label ?? ((m: string, p: string) => `${m} ${p}`)
  const listeners = new Set<(s: SyncState) => void>()
  let state: SyncState = { online: true, staleSince: null, pending: [], rejected: [], syncing: false, lastSyncAt: null }
  let loaded: Promise<void> | null = null
  // File des opérations sur le stockage (évite deux écritures concurrentes de la file)
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn)
    chain = p.catch(() => undefined)
    return p
  }

  const emit = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l(state)
  }
  const load = () =>
    (loaded ??= (async () => {
      emit({
        pending: (await opts.kv.get<OutboxItem[]>(OUTBOX)) ?? [],
        rejected: (await opts.kv.get<RejectedItem[]>(REJECTED)) ?? [],
      })
    })())
  const saveQueues = async (pending: OutboxItem[], rejected: RejectedItem[]) => {
    await opts.kv.set(OUTBOX, pending)
    await opts.kv.set(REJECTED, rejected)
    emit({ pending, rejected })
  }

  async function send(method: string, path: string, body: unknown, key?: string): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-TransCash': '1' }
    if (key) headers['X-Idempotency-Key'] = key
    return fetchImpl(`${opts.base}${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async function readJson(res: Response): Promise<unknown> {
    return res.json().catch(() => null)
  }

  async function enqueue(method: string, path: string, body: unknown, key: string): Promise<OutboxItem> {
    return serial(async () => {
      await load()
      const item: OutboxItem = { id: key, method, path, body, label: label(method, path, body), createdAt: now(), attempts: 0 }
      await saveQueues([...state.pending, item], state.rejected)
      return item
    })
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await load()
    if (method === 'GET') {
      try {
        const res = await send(method, path, undefined)
        const data = await readJson(res)
        if (!res.ok) throw new BackendError(res.status, (data as { error?: string } | null)?.error ?? `Erreur ${res.status}`)
        await opts.kv.set(CACHE_PREFIX + path, { at: now(), data })
        if (!state.online || state.staleSince) emit({ online: true, staleSince: null })
        if (state.pending.length) void flush()
        return data as T
      } catch (e) {
        if (e instanceof BackendError) throw e
        const cached = await opts.kv.get<{ at: string; data: T }>(CACHE_PREFIX + path)
        emit({ online: false, staleSince: cached?.at ?? state.staleSince })
        if (cached) return cached.data
        throw new BackendError(0, "Pas de connexion, et ces données n'ont pas encore été consultées sur ce téléphone.")
      }
    }

    const key = uuid()
    const queueable = !NOT_QUEUEABLE.test(path)
    // Respecter l'ordre : tant que des opérations attendent, les suivantes attendent aussi derrière
    if (queueable && state.pending.length > 0) {
      const item = await enqueue(method, path, body, key)
      void flush()
      throw new QueuedError(item)
    }
    let res: Response
    try {
      res = await send(method, path, body, queueable ? key : undefined)
    } catch {
      emit({ online: false })
      if (!queueable) throw new BackendError(0, 'Pas de connexion au serveur. Vérifiez votre réseau.')
      throw new QueuedError(await enqueue(method, path, body, key))
    }
    if (!state.online) emit({ online: true })
    const data = await readJson(res)
    if (!res.ok) throw new BackendError(res.status, (data as { error?: string } | null)?.error ?? `Erreur ${res.status}`)
    return data as T
  }

  let flushQueue: Promise<unknown> = Promise.resolve()
  /** Envoie la file dans l'ordre. Retourne le nombre d'opérations envoyées. Les appels s'enchaînent sans se chevaucher. */
  function flush(): Promise<number> {
    const run = flushQueue.then(doFlush, doFlush)
    flushQueue = run.catch(() => undefined)
    return run
  }
  function doFlush(): Promise<number> {
    return (async () => {
      await load()
      emit({ syncing: true })
      let sent = 0
      try {
        while (state.pending.length) {
          const item = state.pending[0]
          let res: Response
          try {
            res = await send(item.method, item.path, item.body, item.id)
          } catch {
            emit({ online: false })
            break // toujours pas de réseau : on réessaiera
          }
          emit({ online: true })
          if (res.ok) {
            sent++
            await serial(() => saveQueues(state.pending.slice(1), state.rejected))
            continue
          }
          const data = (await readJson(res)) as { error?: string } | null
          if (res.status === 401 || res.status >= 500 || res.status === 503) {
            // Session expirée ou serveur indisponible : on garde l'opération, on réessaiera
            await serial(() => saveQueues([{ ...item, attempts: item.attempts + 1, lastError: data?.error ?? `Erreur ${res.status}` }, ...state.pending.slice(1)], state.rejected))
            break
          }
          // Refus métier (conflit, règle) : à corriger, sans bloquer la suite
          const rejected: RejectedItem = { ...item, attempts: item.attempts + 1, status: res.status, error: data?.error ?? `Erreur ${res.status}`, rejectedAt: now() }
          await serial(() => saveQueues(state.pending.slice(1), [...state.rejected, rejected]))
        }
      } finally {
        emit({ syncing: false, lastSyncAt: sent ? now() : state.lastSyncAt })
      }
      return sent
    })()
  }

  return {
    request,
    flush,
    getState: () => state,
    subscribe(fn: (s: SyncState) => void) {
      listeners.add(fn)
      void load().then(() => fn(state))
      return () => listeners.delete(fn)
    },
    /** Remet une opération refusée dans la file (après correction de la cause). */
    retry: (id: string) =>
      serial(async () => {
        const item = state.rejected.find((r) => r.id === id)
        if (!item) return
        const { status: _s, error: _e, rejectedAt: _r, ...back } = item
        await saveQueues([...state.pending, back], state.rejected.filter((r) => r.id !== id))
      }).then(() => flush()),
    /** Abandonne une opération refusée. */
    discard: (id: string) => serial(() => saveQueues(state.pending, state.rejected.filter((r) => r.id !== id))),
    /** Met à jour la copie locale d'une lecture (ex. l'état de session après une connexion). */
    prime: (path: string, data: unknown) => opts.kv.set(CACHE_PREFIX + path, { at: now(), data }),
    /** À la déconnexion : efface les copies locales (données de l'entreprise) ; la file doit être vide. */
    async clearCache() {
      for (const k of await opts.kv.keys()) if (k.startsWith(CACHE_PREFIX)) await opts.kv.del(k)
      await opts.kv.set(CACHE_PREFIX + '/auth/status', { at: now(), data: { needsSetup: false, user: null, ownerName: null } })
      emit({ staleSince: null })
    },
  }
}

export type OfflineClient = ReturnType<typeof createOfflineClient>

/** Stockage en mémoire (tests, ou navigateur sans IndexedDB). */
export function memoryKV(): KV {
  const m = new Map<string, unknown>()
  return {
    get: async <T,>(k: string) => structuredClone(m.get(k)) as T | undefined,
    set: async (k, v) => void m.set(k, structuredClone(v)),
    del: async (k) => void m.delete(k),
    keys: async () => [...m.keys()],
  }
}
