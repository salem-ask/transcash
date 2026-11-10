import { describe, expect, it } from 'vitest'
import { createOfflineClient, isQueued, memoryKV } from './offline'

/** Faux serveur : enregistre les requêtes ; `down` coupe le réseau ; anti-doublon par clé comme l'API. */
function fakeServer() {
  const seen = new Map<string, { status: number; body: unknown }>()
  const created: unknown[] = []
  const srv = {
    down: false,
    reject: (_b: unknown): string | null => null,
    created,
    calls: 0,
    fetch: (async (url: string, init: RequestInit) => {
      srv.calls++
      if (srv.down) throw new TypeError('Failed to fetch')
      const key = (init.headers as Record<string, string>)['X-Idempotency-Key']
      const method = init.method ?? 'GET'
      if (method === 'GET') return new Response(JSON.stringify({ url, n: created.length }), { status: 200 })
      if (key && seen.has(key)) return new Response(JSON.stringify(seen.get(key)!.body), { status: seen.get(key)!.status })
      const body = JSON.parse(String(init.body ?? 'null'))
      const err = srv.reject(body)
      const out = err ? { status: 422, body: { error: err } } : { status: 200, body: { ok: true, body } }
      if (!err) created.push(body)
      if (key) seen.set(key, out)
      return new Response(JSON.stringify(out.body), { status: out.status })
    }) as unknown as typeof fetch,
  }
  return srv
}

let n = 0
const make = (srv: ReturnType<typeof fakeServer>, kv = memoryKV()) =>
  createOfflineClient({ kv, base: '/api', fetchImpl: srv.fetch, uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, label: (_m, p) => p })

describe('hors connexion', () => {
  it('lecture : copie locale servie sans réseau', async () => {
    const srv = fakeServer()
    const c = make(srv)
    const online = await c.request<{ n: number }>('GET', '/dashboard')
    srv.down = true
    expect(await c.request('GET', '/dashboard')).toEqual(online)
    expect(c.getState().online).toBe(false)
    expect(c.getState().staleSince).not.toBeNull()
    await expect(c.request('GET', '/jamais-vu')).rejects.toThrow(/Pas de connexion/)
  })

  it('écriture sans réseau : mise en file, envoyée au retour, une seule fois', async () => {
    const srv = fakeServer()
    const c = make(srv)
    srv.down = true
    const e = await c.request('POST', '/payments', { a: 1 }).catch((x) => x)
    expect(isQueued(e)).toBe(true)
    expect(c.getState().pending).toHaveLength(1)
    // Une deuxième écriture attend derrière la première (ordre conservé)
    await c.request('POST', '/expenses', { b: 2 }).catch(() => undefined)
    expect(c.getState().pending.map((p) => p.path)).toEqual(['/payments', '/expenses'])
    srv.down = false
    expect(await c.flush()).toBe(2)
    expect(srv.created).toEqual([{ a: 1 }, { b: 2 }])
    expect(c.getState().pending).toHaveLength(0)
    // Renvoi de la même opération (ex. réponse perdue) : pas de doublon côté serveur
    expect(await c.flush()).toBe(0)
    expect(srv.created).toHaveLength(2)
  })

  it('coupure pendant la synchronisation : reprise sans doublon', async () => {
    const srv = fakeServer()
    const c = make(srv)
    srv.down = true
    await c.request('POST', '/payments', { a: 1 }).catch(() => undefined)
    srv.down = false
    // Le serveur a reçu l'opération mais la réponse est perdue : on simule en l'envoyant à la main avec la même clé
    const key = c.getState().pending[0].id
    await srv.fetch('/api/payments', { method: 'POST', headers: { 'X-Idempotency-Key': key }, body: JSON.stringify({ a: 1 }) })
    await c.flush()
    expect(srv.created).toEqual([{ a: 1 }])
  })

  it('refus à la synchronisation : à corriger, la suite continue', async () => {
    const srv = fakeServer()
    srv.reject = (b) => ((b as { conflict?: boolean }).conflict ? 'La journée du 09/11 ne doit rien (déjà payée)' : null)
    const kv = memoryKV()
    const c = make(srv, kv)
    srv.down = true
    await c.request('POST', '/payments', { conflict: true }).catch(() => undefined)
    await c.request('POST', '/payments', { ok: 1 }).catch(() => undefined)
    srv.down = false
    await c.flush()
    expect(srv.created).toEqual([{ ok: 1 }])
    expect(c.getState().rejected).toHaveLength(1)
    expect(c.getState().rejected[0].error).toMatch(/déjà payée/)
    // Conservé sur l'appareil (rechargement de l'application)
    const again = make(srv, kv)
    await new Promise<void>((r) => again.subscribe(() => r()))
    expect(again.getState().rejected).toHaveLength(1)
    await again.discard(again.getState().rejected[0].id)
    expect(again.getState().rejected).toHaveLength(0)
  })

  it('la connexion n’est jamais mise en file', async () => {
    const srv = fakeServer()
    const c = make(srv)
    srv.down = true
    const e = await c.request('POST', '/auth/login', {}).catch((x) => x)
    expect(isQueued(e)).toBe(false)
    expect(c.getState().pending).toHaveLength(0)
  })
})
