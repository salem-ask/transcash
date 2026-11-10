import type { Backend } from './backend'
import { BackendError } from './backend'
import type { RatesBundle, SessionState, SettingsBundle, User } from '../domain/types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? './api'

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-TransCash': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new BackendError(0, 'Pas de connexion au serveur. Vérifiez votre réseau.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new BackendError(res.status, data?.error ?? `Erreur ${res.status}`)
  return data as T
}

const users = (r: { users: User[] }) => r.users

export const apiBackend: Backend = {
  isDemo: false,
  status: () => call<SessionState>('GET', '/auth/status'),
  setup: (input) => call<SessionState>('POST', '/auth/setup', input),
  login: (login, password) => call<SessionState>('POST', '/auth/login', { login, password }),
  logout: async () => {
    await call('POST', '/auth/logout')
  },
  changePassword: async (currentPassword, newPassword) => {
    await call('POST', '/auth/password', { currentPassword, newPassword })
  },
  getSettings: () => call<SettingsBundle>('GET', '/settings'),
  updateSettings: (patch) => call<SettingsBundle>('PUT', '/settings', patch),
  listRates: () => call<RatesBundle>('GET', '/rates'),
  addManualRate: (rate) => call<RatesBundle>('POST', '/rates', { rate }),
  refreshRate: () => call<RatesBundle>('POST', '/rates/refresh'),
  listUsers: () => call<{ users: User[] }>('GET', '/users').then(users),
  createUser: (input) => call<{ users: User[] }>('POST', '/users', input).then(users),
  updateUser: (id, patch) => call<{ users: User[] }>('PUT', `/users/${id}`, patch).then(users),
  dashboard: () => call('GET', '/dashboard'),
}
