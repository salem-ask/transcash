import type { Backend } from './backend'
import { BackendError } from './backend'
import type { LedgerPayload, Payment, PaymentDetail, VehicleDays, Driver, DriverDetail, RatesBundle, SessionState, SettingsBundle, User, Vehicle, VehicleDetail } from '../domain/types'

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

  listVehicles: () => call<{ vehicles: Vehicle[] }>('GET', '/vehicles').then((r) => r.vehicles),
  getVehicle: (id) => call<VehicleDetail>('GET', `/vehicles/${id}`),
  createVehicle: (input) => call<VehicleDetail>('POST', '/vehicles', input),
  updateVehicle: (id, input) => call<VehicleDetail>('PUT', `/vehicles/${id}`, input),
  setVehicleStatus: (id, status, date) => call<VehicleDetail>('POST', `/vehicles/${id}/status`, { status, date }),
  assignDriver: (id, driverId, startDate) => call<VehicleDetail>('POST', `/vehicles/${id}/assign`, { driverId, startDate }),
  unassignDriver: (id, endDate) => call<VehicleDetail>('POST', `/vehicles/${id}/unassign`, { endDate }),
  listDrivers: () => call<{ drivers: Driver[] }>('GET', '/drivers').then((r) => r.drivers),
  getDriver: (id) => call<DriverDetail>('GET', `/drivers/${id}`),
  createDriver: (input) => call<DriverDetail>('POST', '/drivers', input),
  updateDriver: (id, input) => call<DriverDetail>('PUT', `/drivers/${id}`, input),
  createDriverAccount: (id, password) => call<DriverDetail>('POST', `/drivers/${id}/account`, { password }),

  getLedger: (id) => call<LedgerPayload>('GET', `/drivers/${id}/ledger`),
  myLedger: () => call<LedgerPayload>('GET', '/me/ledger'),
  listPayments: (date) => call<{ payments: Payment[] }>('GET', `/payments?date=${encodeURIComponent(date)}`).then((r) => r.payments),
  getPayment: (id) => call<PaymentDetail>('GET', `/payments/${id}`),
  createPayment: (input) => call<PaymentDetail>('POST', '/payments', input),
  cancelPayment: (id, reason) => call<PaymentDetail>('POST', `/payments/${id}/cancel`, { reason }),
  vehicleDays: (id) => call<VehicleDays>('GET', `/vehicles/${id}/days`),
  markDay: (id, input) => call<VehicleDays>('POST', `/vehicles/${id}/days`, input),
}
