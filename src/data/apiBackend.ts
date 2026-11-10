import type { Backend } from './backend'
import { offline } from './offlineSetup'
import type { ReportData } from '../domain/report'
import type { AuditEntry, CashState, Expense, ExpenseList, Reminder, VehicleBreakdown, VehicleFinance, LedgerPayload, Payment, PaymentDetail, VehicleDays, Driver, DriverDetail, RatesBundle, SessionState, SettingsBundle, User, Vehicle, VehicleDetail } from '../domain/types'

/** Toutes les requêtes passent par la couche hors connexion (cache des lectures, file des écritures). */
function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return offline.request<T>(method, path, body)
}

const users = (r: { users: User[] }) => r.users

/** Après connexion : la copie locale de l'état de session doit refléter l'utilisateur connecté (rechargement hors ligne). */
async function remember(p: Promise<SessionState>): Promise<SessionState> {
  const s = await p
  await offline.prime('/auth/status', s)
  return s
}

export const apiBackend: Backend = {
  isDemo: false,
  status: () => call<SessionState>('GET', '/auth/status'),
  setup: (input) => remember(call<SessionState>('POST', '/auth/setup', input)),
  login: (login, password) => remember(call<SessionState>('POST', '/auth/login', { login, password })),
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

  listExpenses: (p) => call<ExpenseList>('GET', `/expenses?${qs(p)}`),
  getExpense: (id) => call<Expense>('GET', `/expenses/${id}`),
  createExpense: (input) => call<Expense>('POST', '/expenses', input),
  updateExpense: (id, input) => call<Expense>('PUT', `/expenses/${id}`, input),
  cancelExpense: (id, reason) => call<Expense>('POST', `/expenses/${id}/cancel`, { reason }),
  getCash: (from, to) => call<CashState>('GET', `/cash?${qs({ from, to })}`),
  createMovement: (input) => call<CashState>('POST', '/cash/movements', input),
  updateMovement: (id, input) => call<CashState>('PUT', `/cash/movements/${id}`, input),
  cancelMovement: (id, reason) => call<CashState>('POST', `/cash/movements/${id}/cancel`, { reason }),
  listBreakdowns: (id) => call<{ breakdowns: VehicleBreakdown[] }>('GET', `/vehicles/${id}/breakdowns`).then((r) => r.breakdowns),
  createBreakdown: (id, input) => call<{ breakdowns: VehicleBreakdown[] }>('POST', `/vehicles/${id}/breakdowns`, input).then((r) => r.breakdowns),
  updateBreakdown: (id, input) => call<{ breakdowns: VehicleBreakdown[] }>('PUT', `/breakdowns/${id}`, input).then((r) => r.breakdowns),
  cancelBreakdown: (id, reason) => call<{ breakdowns: VehicleBreakdown[] }>('POST', `/breakdowns/${id}/cancel`, { reason }).then((r) => r.breakdowns),
  listReminders: (vehicleId) => call<{ today: string; reminders: Reminder[] }>('GET', `/reminders?${qs({ vehicleId })}`),
  createReminder: (id, input) => call<{ today: string; reminders: Reminder[] }>('POST', `/vehicles/${id}/reminders`, input),
  updateReminder: (id, input) => call<{ today: string; reminders: Reminder[] }>('PUT', `/reminders/${id}`, input),
  doneReminder: (id, nextDueDate) => call<{ today: string; reminders: Reminder[] }>('POST', `/reminders/${id}/done`, { nextDueDate }),
  cancelReminder: (id) => call<{ today: string; reminders: Reminder[] }>('POST', `/reminders/${id}/cancel`, {}),
  vehicleFinance: (id) => call<VehicleFinance>('GET', `/vehicles/${id}/finance`),
  backup: () => call<unknown>('GET', '/backup'),
  reportData: (from, to) => call<ReportData>('GET', `/reports/data?${qs({ from, to })}`),
  auditLog: (p) => call<{ entries: AuditEntry[] }>('GET', `/audit?${qs(p)}`).then((r) => r.entries),
}

/** Paramètres d'URL, sans les valeurs vides. */
function qs(p: Record<string, string | number | undefined | null>): string {
  return new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
}
