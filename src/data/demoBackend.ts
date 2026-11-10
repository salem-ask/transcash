// Source de données de DÉMONSTRATION : tout est stocké dans le navigateur (localStorage).
// Sert à la prévisualisation sans serveur. Reproduit les règles de l'API PHP (mêmes messages d'erreur).
import type { Backend } from './backend'
import { BackendError } from './backend'
import { can, type Permission } from '../domain/permissions'
import { convert } from '../domain/money'
import { addDays, isValidDate, todayIn } from '../domain/fleet'
import { allocate, driverLedger, expectedFor, summarize, totalIn, withBreakdowns, type Allocation, type Breakdown, type DayMark, type LedgerVehicle, type Totals } from '../domain/ledger'
import { cashBalance, reminderState, type CashEntry } from '../domain/finance'
import type { ReportData } from '../domain/report'
import type {
  NewPaymentInput,
  AuditEntry,
  CashLine,
  CashMovement,
  CashState,
  Expense,
  PaymentMethod,
  Reminder,
  VehicleBreakdown,
  AmountChange,
  Assignment,
  Dashboard,
  DashboardLine,
  Debtor,
  LedgerPayload,
  Payment,
  PaymentDetail,
  VehicleDay,
  VehicleDays,
  Currency,
  Driver,
  DriverDetail,
  DriverInput,
  ExchangeRate,
  Role,
  Settings,
  User,
  Vehicle,
  VehicleDetail,
  VehicleInput,
  VehicleType,
} from '../domain/types'

const KEY = 'transcash-demo-v4'
export const DEMO_PASSWORD = 'demo1234'

interface DemoUser extends User {
  password: string
}
interface DemoVehicle extends Omit<Vehicle, 'currentDriver'> {
  amounts: AmountChange[]
}
interface DemoDriver extends Omit<Driver, 'currentVehicle' | 'hasAccount'> {
  userId: string | null
}
interface DemoPayment extends Omit<PaymentDetail, 'driverName' | 'driverPhone' | 'vehicleName' | 'createdByName' | 'allocations' | 'ownerName'> {
  createdBy: string
  allocations: Allocation[]
}
interface DemoBreakdown extends Breakdown {
  cancelled: boolean
  cancelReason: string | null
}
interface DemoExpense extends Omit<Expense, 'vehicleName' | 'driverName' | 'createdByName'> {
  createdBy: string
}
interface DemoMovement extends Omit<CashMovement, 'createdByName'> {
  createdBy: string
}
interface DemoReminder extends Omit<Reminder, 'vehicleName' | 'state'> {
  deleted: boolean
}
interface DemoState {
  ownerName: string
  marks: DayMark[]
  payments: DemoPayment[]
  breakdowns: DemoBreakdown[]
  expenses: DemoExpense[]
  movements: DemoMovement[]
  reminders: DemoReminder[]
  audit: AuditEntry[]
  users: DemoUser[]
  settings: Settings
  rates: ExchangeRate[]
  vehicles: DemoVehicle[]
  drivers: DemoDriver[]
  assignments: Assignment[]
  sessionUserId: string | null
}

const id = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

/** Parc d'exemple : quelques engins typiques de Kinshasa, avec un historique récent (dates relatives à aujourd'hui). */
function seed(): DemoState {
  const ownerId = id()
  const today = todayIn('Africa/Kinshasa')
  const day = (n: number) => addDays(today, n)
  const mkUser = (name: string, login: string, role: Role): DemoUser => ({
    id: id(), ownerId, name, login, role, active: true, lastLoginAt: null, password: DEMO_PASSWORD,
  })
  const users = [
    mkUser('Propriétaire', 'patron@demo.cd', 'super_admin'),
    mkUser('Administrateur', 'admin@demo.cd', 'admin'),
    mkUser('Comptable', 'compta@demo.cd', 'accountant'),
    mkUser('Gestionnaire', 'gestion@demo.cd', 'manager'),
    mkUser('Jean Mukendi', '+243810000001', 'driver'),
  ]
  const mkVehicle = (type: VehicleType, name: string, plate: string, model: string, amount: number, currency: Currency, serviceDate: string): DemoVehicle => ({
    id: id(), type, name, plate, model, dailyAmount: amount, currency, restWeekdays: null, serviceDate,
    status: 'active', notes: null, amounts: [{ amount, currency, effectiveFrom: serviceDate }],
  })
  const taxi = mkVehicle('taxi', 'Taxi 1', 'KN 4521 BB', 'Toyota Corolla', 40000, 'CDF', day(-30))
  taxi.amounts.push({ amount: 45000, currency: 'CDF', effectiveFrom: day(-10) })
  taxi.dailyAmount = 45000
  const moto = mkVehicle('moto', 'Moto TVS rouge', 'KN 7781 AM', 'TVS HLX 125', 15000, 'CDF', day(-25))
  const tri = mkVehicle('tricycle', 'Bajaj 2', 'KN 3302 TR', 'Bajaj RE', 25000, 'CDF', day(-20))
  const bus = mkVehicle('minibus', 'Hiace Matete', 'KN 1190 BS', 'Toyota Hiace', 3500, 'USD', day(-30))
  const truck = mkVehicle('camion', 'Camion benne', 'KN 0456 CM', 'Mitsubishi Canter', 5000, 'USD', day(-5))
  truck.restWeekdays = [0, 6]

  const mkDriver = (name: string, phone: string, extra: Partial<DemoDriver> = {}): DemoDriver => ({
    id: id(), name, phone, idNumber: null, licenseNumber: null, address: null, notes: null, active: true, userId: null, ...extra,
  })
  const jean = mkDriver('Jean Mukendi', '+243810000001', { userId: users[4].id, licenseNumber: 'KIN-B-552310', address: 'Lemba, Kinshasa' })
  const patrick = mkDriver('Patrick Ilunga', '+243820000002', { address: 'Ngaba, Kinshasa' })
  const blaise = mkDriver('Blaise Tshibanda', '+243970000003')
  const didier = mkDriver('Didier Kalonji', '+243840000004', { licenseNumber: 'KIN-C-118274' })
  const serge = mkDriver('Serge Mbuyi', '+243990000005', { notes: 'Disponible, a conduit la Hiace' })

  const mkA = (v: DemoVehicle, d: DemoDriver, startDate: string, endDate: string | null): Assignment => ({
    id: id(), vehicleId: v.id, vehicleName: v.name, driverId: d.id, driverName: d.name, startDate, endDate,
  })
  const assignments = [
    mkA(taxi, jean, day(-30), null),
    mkA(moto, patrick, day(-25), null),
    mkA(tri, blaise, day(-20), null),
    mkA(bus, serge, day(-30), day(-16)),
    mkA(bus, didier, day(-15), null),
  ]
  const marks: DayMark[] = [
    { vehicleId: tri.id, date: day(-6), kind: 'breakdown', amount: null, currency: null, reason: 'Crevaison, réparé le lendemain' },
    { vehicleId: taxi.id, date: day(-3), kind: 'override', amount: 25000, currency: 'CDF', reason: 'Demi-journée (contrôle routier)' },
  ]
  const state: DemoState = {
    ownerName: 'Transports Démo',
    users,
    settings: {
      baseCurrency: 'CDF', secondaryCurrency: 'USD', showEquivalent: true,
      rateMode: 'auto', timezone: 'Africa/Kinshasa', restWeekdays: [0],
    },
    rates: [{ id: id(), base: 'USD', quote: 'CDF', rate: 2850, source: 'manual', createdAt: nowIso() }],
    vehicles: [taxi, moto, tri, bus, truck],
    drivers: [jean, patrick, blaise, didier, serge],
    assignments,
    marks,
    payments: [],
    breakdowns: [
      { id: id(), vehicleId: bus.id, startDate: day(-12), endDate: day(-11), reason: 'Embrayage', cancelled: false, cancelReason: null },
    ],
    expenses: [],
    movements: [],
    reminders: [],
    audit: [],
    sessionUserId: null,
  }

  // Historique de versements : la plupart des jours payés, quelques partiels, quelques oublis (→ dettes)
  const collector = users[3].id
  let receipt = 0
  for (const d of state.drivers) {
    const days = ledgerOf(state, d.id, day(-31), day(-1)).filter((x) => x.kind === 'due')
    days.forEach((x, i) => {
      const k = (i * 7 + d.name.length) % 11
      if (k === 0) return // oublié
      const amount = k === 1 ? Math.round(x.expected / 2) : x.expected
      receipt++
      state.payments.push({
        id: id(), receiptNo: receipt, driverId: d.id, vehicleId: x.vehicleId, kind: 'daily', amount, currency: x.currency,
        method: k % 3 === 0 ? 'mobile_money' : 'cash', reference: k % 3 === 0 ? `MP${x.date.replace(/-/g, '').slice(2)}.${100 + k}` : null,
        paidOn: k === 2 ? addDays(x.date, 1) : x.date, rate: 2850, note: null, createdAt: `${x.date} 18:00:00`, createdBy: collector,
        cancelled: false, cancelReason: null,
        allocations: [{ date: x.date, vehicleId: x.vehicleId, amount }],
      })
    })
  }
  state.payments.sort((a, b) => a.receiptNo - b.receiptNo)

  const mkExpense = (v: DemoVehicle | null, category: Expense['category'], amount: number, currency: Currency, n: number, note: string, breakdownId: string | null = null): DemoExpense => ({
    id: id(), vehicleId: v?.id ?? null, breakdownId, category, amount, currency, spentOn: day(n), paidBy: 'cash', driverId: null, paymentId: null,
    supplier: null, note, rate: 2850, createdBy: collector, createdAt: `${day(n)} 12:00:00`, cancelled: false, cancelReason: null,
  })
  state.expenses.push(
    mkExpense(bus, 'repair', 18000, 'USD', -11, 'Kit embrayage + main d\'œuvre', state.breakdowns[0].id),
    mkExpense(taxi, 'maintenance', 35000, 'CDF', -9, 'Vidange + filtre'),
    mkExpense(moto, 'parts', 22000, 'CDF', -4, 'Chaîne et pignon'),
    mkExpense(taxi, 'tax', 60000, 'CDF', -2, 'Parking et taxe municipale'),
    mkExpense(null, 'other', 15000, 'CDF', -1, 'Crédit téléphone bureau'),
  )
  state.movements.push(
    { id: id(), kind: 'deposit', amount: 300000, currency: 'CDF', movedOn: day(-31), note: 'Solde initial', createdBy: users[0].id, cancelled: false, cancelReason: null },
    { id: id(), kind: 'withdrawal', amount: 15000, currency: 'USD', movedOn: day(-7), note: 'Retrait du propriétaire', createdBy: users[0].id, cancelled: false, cancelReason: null },
  )
  const mkReminder = (v: DemoVehicle, kind: Reminder['kind'], n: number, notifyDays = 7): DemoReminder => ({
    id: id(), vehicleId: v.id, kind, label: null, dueDate: day(n), notifyDays, notes: null, doneAt: null, deleted: false,
  })
  state.reminders.push(
    mkReminder(taxi, 'insurance', 5, 15),
    mkReminder(moto, 'vignette', -3),
    mkReminder(bus, 'oil_change', 40),
    mkReminder(truck, 'inspection', 90, 30),
  )
  return state
}

let memory: DemoState | null = null
function load(): DemoState {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(KEY)
    memory = raw ? (JSON.parse(raw) as DemoState) : seed()
  } catch {
    memory = seed()
  }
  return memory
}
function save(s: DemoState) {
  memory = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* stockage indisponible : on garde en mémoire */
  }
}
export function resetDemo() {
  memory = seed()
  save(memory)
}

const pause = () => new Promise((r) => setTimeout(r, 120))
const publicUser = ({ password: _p, ...u }: DemoUser): User => u
const fail = (status: number, message: string): never => {
  throw new BackendError(status, message)
}

function me(s: DemoState): DemoUser {
  const u = s.users.find((x) => x.id === s.sessionUserId && x.active)
  if (!u) throw new BackendError(401, 'Veuillez vous connecter')
  return u
}
function need(s: DemoState, p: Permission): DemoUser {
  const u = me(s)
  if (!can(u.role, p)) throw new BackendError(403, "Vous n'avez pas le droit d'effectuer cette action")
  return u
}
const normalizeLogin = (l: string) => {
  const t = l.trim().toLowerCase()
  return /^[+0-9 ().-]+$/.test(t) ? t.replace(/[ ().-]/g, '') : t
}
const today = (s: DemoState) => todayIn(s.settings.timezone)

const latest = (s: DemoState, src?: string) => s.rates.find((r) => !src || r.source === src) ?? null

async function fetchAutoRate(): Promise<number | null> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 4000)
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctl.signal })
    clearTimeout(t)
    const rate = (await res.json())?.rates?.CDF
    return typeof rate === 'number' && rate > 0 ? rate : null
  } catch {
    return null
  }
}

async function effectiveRate(s: DemoState): Promise<ExchangeRate | null> {
  if (s.settings.rateMode === 'manual') return latest(s, 'manual') ?? latest(s)
  const auto = latest(s, 'auto')
  const stale = !auto || Date.now() - Date.parse(auto.createdAt.replace(' ', 'T') + 'Z') > 6 * 3600_000
  if (stale) {
    const r = await fetchAutoRate()
    if (r) {
      s.rates.unshift({ id: id(), base: 'USD', quote: 'CDF', rate: r, source: 'auto', createdAt: nowIso() })
      save(s)
      return s.rates[0]
    }
  }
  return auto ?? latest(s)
}

function session(s: DemoState) {
  const u = s.users.find((x) => x.id === s.sessionUserId && x.active)
  return { needsSetup: false, user: u ? publicUser(u) : null, ownerName: u ? s.ownerName : null }
}

// ---------- Grand livre (même calcul que l'API, via src/domain/ledger.ts) ----------

const ledgerVehicle = (v: DemoVehicle): LedgerVehicle => ({
  id: v.id, name: v.name, serviceDate: v.serviceDate, amounts: v.amounts, restWeekdays: v.restWeekdays,
})
const livePayments = (s: DemoState) => s.payments.filter((p) => !p.cancelled)

/** Marques explicites + jours d'immobilisation (en panne). */
function marksOf(s: DemoState, from: string, to: string): DayMark[] {
  return withBreakdowns(s.marks, s.breakdowns.filter((b) => !b.cancelled), from, to)
}
function markAt(s: DemoState, vehicleId: string, date: string): DayMark | undefined {
  return marksOf(s, date, date).find((m) => m.vehicleId === vehicleId && m.date === date)
}
function audit(s: DemoState, entity: string, entityId: string, action: string, oldValue: unknown, newValue: unknown) {
  const u = s.users.find((x) => x.id === s.sessionUserId)
  s.audit.unshift({
    id: (s.audit[0]?.id ?? 0) + 1, entity, entityId, action, userName: u?.name ?? null, createdAt: nowIso(),
    oldValue: (oldValue ?? null) as AuditEntry['oldValue'], newValue: (newValue ?? null) as AuditEntry['newValue'],
  })
}

function ledgerOf(s: DemoState, driverId: string, from: string, to: string) {
  return driverLedger({
    assignments: s.assignments.filter((a) => a.driverId === driverId),
    vehicles: new Map(s.vehicles.map((v) => [v.id, ledgerVehicle(v)])),
    defaultRest: s.settings.restWeekdays,
    marks: marksOf(s, from, to),
    allocations: livePayments(s).filter((p) => p.driverId === driverId).flatMap((p) => p.allocations),
    from,
    to,
  })
}

function paidOnVehicleDay(s: DemoState, vehicleId: string, date: string): number {
  return livePayments(s)
    .flatMap((p) => p.allocations)
    .filter((a) => a.vehicleId === vehicleId && a.date === date)
    .reduce((t, a) => t + a.amount, 0)
}

function paymentDetail(s: DemoState, p: DemoPayment): PaymentDetail {
  const d = s.drivers.find((x) => x.id === p.driverId)
  const vName = (vid: string | null) => s.vehicles.find((v) => v.id === vid)?.name ?? null
  const { createdBy, ...rest } = p
  return {
    ...rest,
    driverName: d?.name ?? null,
    driverPhone: d?.phone ?? null,
    vehicleName: vName(p.vehicleId),
    createdByName: s.users.find((u) => u.id === createdBy)?.name ?? null,
    ownerName: s.ownerName,
    allocations: p.allocations.map((a) => {
      const v = s.vehicles.find((x) => x.id === a.vehicleId)!
      const cur = expectedFor(ledgerVehicle(v), a.date, s.settings.restWeekdays, s.marks.find((m) => m.vehicleId === v.id && m.date === a.date)).currency
      return { ...a, vehicleName: v.name, currency: cur }
    }),
  }
}
const publicPayment = (s: DemoState, p: DemoPayment): Payment => {
  const { allocations: _a, ownerName: _o, ...rest } = paymentDetail(s, p)
  return rest
}

function ledgerPayload(s: DemoState, d: DemoDriver): LedgerPayload {
  const today = todayIn(s.settings.timezone)
  const first = s.assignments.filter((a) => a.driverId === d.id).map((a) => a.startDate).sort()[0]
  const days = first ? ledgerOf(s, d.id, first, addDays(today, 31)) : []
  return {
    driver: { id: d.id, name: d.name, phone: d.phone },
    today,
    days,
    summary: summarize(days, today),
    rate: latest(s),
    payments: s.payments
      .filter((p) => p.driverId === d.id)
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.receiptNo - a.receiptNo)
      .slice(0, 30)
      .map((p) => publicPayment(s, p)),
  }
}

// ---------- Parc ----------

const openAssignment = (s: DemoState, by: 'vehicleId' | 'driverId', ref: string) =>
  s.assignments.find((a) => a[by] === ref && a.endDate === null) ?? null

const byNewest = (a: Assignment, b: Assignment) => b.startDate.localeCompare(a.startDate)

function findVehicle(s: DemoState, vid: string): DemoVehicle {
  return s.vehicles.find((v) => v.id === vid) ?? fail(404, 'Engin introuvable')
}
function findDriver(s: DemoState, did: string): DemoDriver {
  return s.drivers.find((d) => d.id === did) ?? fail(404, 'Chauffeur introuvable')
}

function publicVehicle(s: DemoState, v: DemoVehicle): Vehicle {
  const { amounts: _a, ...rest } = v
  const a = openAssignment(s, 'vehicleId', v.id)
  const d = a ? findDriver(s, a.driverId) : null
  return { ...rest, currentDriver: a && d ? { id: d.id, name: d.name, phone: d.phone, since: a.startDate } : null }
}
function vehicleDetail(s: DemoState, vid: string): VehicleDetail {
  const v = findVehicle(s, vid)
  return {
    vehicle: publicVehicle(s, v),
    assignments: s.assignments.filter((a) => a.vehicleId === vid).sort(byNewest),
    amounts: [...v.amounts].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
  }
}
function publicDriver(s: DemoState, d: DemoDriver): Driver {
  const { userId, ...rest } = d
  const a = openAssignment(s, 'driverId', d.id)
  const v = a ? findVehicle(s, a.vehicleId) : null
  return {
    ...rest,
    hasAccount: userId !== null,
    currentVehicle: a && v ? { id: v.id, name: v.name, type: v.type, plate: v.plate, since: a.startDate } : null,
  }
}
function driverDetail(s: DemoState, did: string): DriverDetail {
  return {
    driver: publicDriver(s, findDriver(s, did)),
    assignments: s.assignments.filter((a) => a.driverId === did).sort(byNewest),
  }
}

function checkDate(date: string | undefined, label: string): string {
  if (!date || !isValidDate(date)) fail(422, `${label} : date invalide`)
  return date!
}
function checkAmount(n: number) {
  if (!Number.isInteger(n)) fail(422, 'Montant invalide (nombre entier attendu)')
  if (n <= 0 || n > 1e12) fail(422, 'Le montant journalier doit être supérieur à zéro')
}
function normalizePlate(p?: string) {
  const t = (p ?? '').trim()
  return t ? t.replace(/\s+/g, ' ').toUpperCase() : null
}
function checkPlate(s: DemoState, plate: string | null, exceptId?: string) {
  const other = plate && s.vehicles.find((v) => v.plate === plate && v.id !== exceptId)
  if (other) fail(409, `L'immatriculation ${plate} est déjà utilisée par « ${other.name} »`)
}
function cleanDriver(s: DemoState, input: DriverInput, exceptId?: string) {
  if (!input.name?.trim()) fail(422, 'Le nom est obligatoire')
  if (!input.phone?.trim()) fail(422, 'Le téléphone est obligatoire')
  const phone = normalizeLogin(input.phone)
  if (!/^\+?[0-9]{6,15}$/.test(phone)) fail(422, 'Numéro de téléphone invalide')
  const other = s.drivers.find((d) => d.phone === phone && d.id !== exceptId)
  if (other) fail(409, `Ce numéro est déjà celui de ${other.name}`)
  const opt = (x?: string) => (x?.trim() ? x.trim() : null)
  return {
    name: input.name.trim(), phone, idNumber: opt(input.idNumber), licenseNumber: opt(input.licenseNumber),
    address: opt(input.address), notes: opt(input.notes),
  }
}

export const demoBackend: Backend = {
  isDemo: true,
  async status() {
    await pause()
    return session(load())
  },
  async setup() {
    throw new BackendError(409, 'Le compte principal existe déjà (mode démo)')
  },
  async login(login, password) {
    await pause()
    const s = load()
    const u = s.users.find((x) => x.login === normalizeLogin(login))
    if (!u || u.password !== password) throw new BackendError(401, 'Identifiant ou mot de passe incorrect')
    if (!u.active) throw new BackendError(403, 'Ce compte est désactivé')
    u.lastLoginAt = nowIso()
    s.sessionUserId = u.id
    save(s)
    return session(s)
  },
  async logout() {
    const s = load()
    s.sessionUserId = null
    save(s)
  },
  async changePassword(current, next) {
    const s = load()
    const u = me(s)
    if (u.password !== current) throw new BackendError(422, 'Mot de passe actuel incorrect')
    if (next.length < 8) throw new BackendError(422, 'Le mot de passe doit contenir au moins 8 caractères')
    u.password = next
    save(s)
  },
  async getSettings() {
    await pause()
    const s = load()
    me(s)
    return { settings: s.settings, rate: await effectiveRate(s) }
  },
  async updateSettings(patch) {
    const s = load()
    need(s, 'settings.edit')
    const next = { ...s.settings, ...patch }
    next.secondaryCurrency = next.baseCurrency === 'CDF' ? 'USD' : 'CDF'
    next.restWeekdays = [...new Set(next.restWeekdays)].filter((d) => d >= 0 && d <= 6).sort()
    s.settings = next
    save(s)
    return { settings: s.settings, rate: await effectiveRate(s) }
  },
  async listRates() {
    const s = load()
    need(s, 'settings.view')
    return { current: await effectiveRate(s), history: s.rates.slice(0, 30) }
  },
  async addManualRate(rate) {
    const s = load()
    need(s, 'rates.edit')
    if (!(rate > 0) || rate > 1_000_000) throw new BackendError(422, 'Taux de change invalide')
    s.rates.unshift({ id: id(), base: 'USD', quote: 'CDF', rate, source: 'manual', createdAt: nowIso() })
    save(s)
    return this.listRates()
  },
  async refreshRate() {
    const s = load()
    need(s, 'rates.edit')
    const r = await fetchAutoRate()
    if (!r) throw new BackendError(502, 'Impossible de récupérer le taux automatique pour le moment')
    s.rates.unshift({ id: id(), base: 'USD', quote: 'CDF', rate: r, source: 'auto', createdAt: nowIso() })
    save(s)
    return this.listRates()
  },
  async listUsers() {
    await pause()
    const s = load()
    need(s, 'users.view')
    return s.users.map(publicUser).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  },
  async createUser(input) {
    const s = load()
    const actor = need(s, 'users.manage')
    if (input.role === 'super_admin' && actor.role !== 'super_admin')
      throw new BackendError(403, 'Seul un super administrateur peut attribuer ce rôle')
    if (!input.name.trim() || !input.login.trim()) throw new BackendError(422, 'Nom et identifiant obligatoires')
    if (input.password.length < 8) throw new BackendError(422, 'Le mot de passe doit contenir au moins 8 caractères')
    const login = normalizeLogin(input.login)
    if (s.users.some((u) => u.login === login)) throw new BackendError(409, 'Cet identifiant est déjà utilisé')
    s.users.push({
      id: id(), ownerId: actor.ownerId, name: input.name.trim(), login, role: input.role,
      active: true, lastLoginAt: null, password: input.password,
    })
    save(s)
    return this.listUsers()
  },
  async updateUser(userId, patch) {
    const s = load()
    const actor = need(s, 'users.manage')
    const t = s.users.find((u) => u.id === userId)
    if (!t) throw new BackendError(404, 'Utilisateur introuvable')
    if (t.role === 'super_admin' && actor.role !== 'super_admin')
      throw new BackendError(403, 'Seul un super administrateur peut modifier ce compte')
    if (t.id === actor.id && ((patch.role && patch.role !== t.role) || patch.active === false))
      throw new BackendError(422, 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte')
    if (patch.role === 'super_admin' && actor.role !== 'super_admin')
      throw new BackendError(403, 'Seul un super administrateur peut attribuer ce rôle')
    if (patch.password !== undefined && patch.password.length < 8)
      throw new BackendError(422, 'Le mot de passe doit contenir au moins 8 caractères')
    Object.assign(t, {
      name: patch.name?.trim() || t.name,
      role: patch.role ?? t.role,
      active: patch.active ?? t.active,
      password: patch.password || t.password,
    })
    save(s)
    return this.listUsers()
  },

  async dashboard(): Promise<Dashboard> {
    await pause()
    const s = load()
    const u = me(s)
    if (!can(u.role, 'dashboard.view') && !can(u.role, 'dashboard.own'))
      throw new BackendError(403, "Vous n'avez pas accès au tableau de bord")
    const rateRow = await effectiveRate(s)
    const rate = rateRow?.rate ?? null
    const date = today(s)
    const base = s.settings.baseCurrency
    const myDriver = u.role === 'driver' ? s.drivers.find((d) => d.userId === u.id) : null
    let missingRate = false
    const conv = (n: number, c: Currency) => {
      if (c === base) return n
      if (!rate) {
        missingRate = true
        return 0
      }
      return convert(n, c, base, rate)
    }
    const lines: DashboardLine[] = s.vehicles
      .filter((v) => v.status === 'active')
      .map((v) => ({ v, a: s.assignments.find((x) => x.vehicleId === v.id && x.startDate <= date && (x.endDate === null || x.endDate >= date)) }))
      .filter(({ a }) => u.role !== 'driver' || (a && myDriver && a.driverId === myDriver.id))
      .map(({ v, a }) => {
        const e = expectedFor(ledgerVehicle(v), date, s.settings.restWeekdays, markAt(s, v.id, date))
        const status = e.kind === 'due' && !a ? 'no_driver' : e.kind
        const expected = status === 'due' ? e.expected : 0
        const paid = paidOnVehicleDay(s, v.id, date)
        const remaining = Math.max(expected - paid, 0)
        return {
          vehicleId: v.id, vehicleName: v.name, type: v.type, driverId: a?.driverId ?? null, driverName: a?.driverName ?? null,
          status, amount: expected || (e.kind === 'due' ? e.expected : v.dailyAmount), paid, remaining,
          state: expected === 0 ? (paid > 0 ? 'paid' : 'none') : remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
          currency: e.currency,
        } satisfies DashboardLine
      })
      .sort((x, y) => x.vehicleName.localeCompare(y.vehicleName))

    const sum = (f: (l: DashboardLine) => number, only?: (l: DashboardLine) => boolean) =>
      lines.filter((l) => !only || only(l)).reduce((t, l) => t + conv(f(l), l.currency), 0)
    const debtors: Debtor[] = []
    for (const d of s.drivers.filter((x) => !myDriver || x.id === myDriver.id)) {
      const first = s.assignments.filter((a) => a.driverId === d.id).map((a) => a.startDate).sort()[0]
      if (!first || first >= date) continue
      const sm = summarize(ledgerOf(s, d.id, first, addDays(date, -1)), date)
      const debt = totalIn(sm.arrears, base, rate)
      if (debt === null) missingRate = true
      else if (debt > 0) debtors.push({ driverId: d.id, driverName: d.name, debt, unpaidDays: sm.unpaidDays })
    }
    debtors.sort((a, b) => b.debt - a.debt)
    const toBase = (n: number, c: Currency, r: number | null) => (c === base ? n : r ? convert(n, c, base, r) : 0)
    const received = (from: string, withDriverExpenses = false) =>
      livePayments(s)
        .filter((p) => p.paidOn >= from && p.paidOn <= date && (!myDriver || p.driverId === myDriver.id))
        .filter((p) => withDriverExpenses || p.method !== 'driver_expense')
        .reduce((t, p) => t + toBase(p.amount, p.currency, p.rate), 0)
    const count = (st: string) => lines.filter((l) => l.status === st).length
    const monthStart = date.slice(0, 8) + '01'
    const month = received(monthStart, true)
    const monthExpenses = myDriver
      ? 0
      : s.expenses.filter((e) => !e.cancelled && e.spentOn >= monthStart && e.spentOn <= date).reduce((t, e) => t + toBase(e.amount, e.currency, e.rate ?? rate), 0)
    const alerts = myDriver ? [] : remindersOf(s, null).filter((r) => r.state === 'overdue' || r.state === 'soon')
    return {
      currency: base,
      date,
      rate: rateRow,
      today: {
        expected: sum((l) => l.amount, (l) => l.status === 'due'),
        paid: sum((l) => l.paid),
        debt: sum((l) => l.remaining),
        received: received(date),
      },
      month: { expected: 0, paid: month, expenses: monthExpenses, profit: month - monthExpenses },
      cash: can(u.role, 'cash.manage') ? cashBalance(cashEntriesOf(s).filter((e) => e.date <= date)) : null,
      alerts,
      vehicles: { total: lines.length, working: count('due'), resting: count('rest'), noDriver: count('no_driver'), immobilized: count('breakdown') },
      missingRate,
      lines,
      totalDebt: debtors.reduce((t, d) => t + d.debt, 0),
      debtors: debtors.slice(0, 10),
    }
  },

  async listVehicles() {
    await pause()
    const s = load()
    need(s, 'vehicles.view')
    return s.vehicles
      .map((v) => publicVehicle(s, v))
      .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name))
  },
  async getVehicle(vid) {
    await pause()
    const s = load()
    need(s, 'vehicles.view')
    return vehicleDetail(s, vid)
  },
  async createVehicle(input: VehicleInput) {
    const s = load()
    need(s, 'vehicles.manage')
    if (!input.name?.trim()) fail(422, 'Le nom est obligatoire')
    checkAmount(input.dailyAmount)
    const serviceDate = checkDate(input.serviceDate ?? today(s), 'Date de mise en service')
    const plate = normalizePlate(input.plate)
    checkPlate(s, plate)
    const v: DemoVehicle = {
      id: id(), type: input.type, name: input.name.trim(), plate, model: input.model?.trim() || null,
      dailyAmount: input.dailyAmount, currency: input.currency, restWeekdays: input.restWeekdays, serviceDate,
      status: 'active', notes: input.notes?.trim() || null,
      amounts: [{ amount: input.dailyAmount, currency: input.currency, effectiveFrom: serviceDate }],
    }
    s.vehicles.push(v)
    save(s)
    return vehicleDetail(s, v.id)
  },
  async updateVehicle(vid, input) {
    const s = load()
    need(s, 'vehicles.manage')
    const v = findVehicle(s, vid)
    if (!input.name?.trim()) fail(422, 'Le nom est obligatoire')
    checkAmount(input.dailyAmount)
    const plate = normalizePlate(input.plate)
    checkPlate(s, plate, vid)
    if (input.dailyAmount !== v.dailyAmount || input.currency !== v.currency) {
      let from = checkDate(input.amountFrom ?? today(s), 'Date du nouveau montant')
      if (from < v.serviceDate) from = v.serviceDate
      v.amounts = v.amounts.filter((a) => a.effectiveFrom < from)
      v.amounts.push({ amount: input.dailyAmount, currency: input.currency, effectiveFrom: from })
    }
    Object.assign(v, {
      type: input.type, name: input.name.trim(), plate, model: input.model?.trim() || null,
      dailyAmount: input.dailyAmount, currency: input.currency, restWeekdays: input.restWeekdays,
      notes: input.notes?.trim() || null,
    })
    for (const a of s.assignments) if (a.vehicleId === vid) a.vehicleName = v.name
    save(s)
    return vehicleDetail(s, vid)
  },
  async setVehicleStatus(vid, status, date) {
    const s = load()
    need(s, 'vehicles.manage')
    const v = findVehicle(s, vid)
    checkDate(date, 'Date')
    const a = openAssignment(s, 'vehicleId', vid)
    if (status === 'retired' && a) {
      if (date < a.startDate) fail(422, `La date de fin ne peut pas précéder le début de l'affectation (${a.startDate})`)
      a.endDate = date
    }
    v.status = status
    save(s)
    return vehicleDetail(s, vid)
  },
  async assignDriver(vid, did, startDate) {
    const s = load()
    need(s, 'vehicles.manage')
    const v = findVehicle(s, vid)
    checkDate(startDate, 'Date de début')
    if (v.status !== 'active') fail(422, 'Cet engin est retiré du parc')
    if (startDate < v.serviceDate) fail(422, `La date de début précède la mise en service de l'engin (${v.serviceDate})`)
    const d = findDriver(s, did)
    if (!d.active) fail(422, 'Ce chauffeur est désactivé')
    const busy = openAssignment(s, 'driverId', did)
    if (busy?.vehicleId === vid) fail(422, `${d.name} conduit déjà cet engin`)
    if (busy) fail(409, `${d.name} conduit déjà « ${findVehicle(s, busy.vehicleId).name} ». Retirez-le d'abord de cet engin.`)
    if (s.assignments.some((a) => a.driverId === did && a.endDate !== null && a.endDate >= startDate))
      fail(422, 'Ce chauffeur avait déjà une affectation à cette date')
    const current = openAssignment(s, 'vehicleId', vid)
    if (current) {
      if (startDate <= current.startDate)
        fail(422, `La date de début doit être postérieure au ${current.startDate} (début du chauffeur actuel)`)
      current.endDate = addDays(startDate, -1)
    } else {
      const last = s.assignments.filter((a) => a.vehicleId === vid).map((a) => a.endDate ?? '').sort().pop()
      if (last && startDate <= last) fail(422, `La date de début doit être postérieure au ${last} (fin du chauffeur précédent)`)
    }
    s.assignments.push({ id: id(), vehicleId: vid, vehicleName: v.name, driverId: did, driverName: d.name, startDate, endDate: null })
    save(s)
    return vehicleDetail(s, vid)
  },
  async unassignDriver(vid, endDate) {
    const s = load()
    need(s, 'vehicles.manage')
    findVehicle(s, vid)
    checkDate(endDate, 'Date de fin')
    const a = openAssignment(s, 'vehicleId', vid) ?? fail(422, "Cet engin n'a pas de chauffeur")
    if (endDate < a.startDate) fail(422, `La date de fin ne peut pas précéder le début de l'affectation (${a.startDate})`)
    a.endDate = endDate
    save(s)
    return vehicleDetail(s, vid)
  },
  async listDrivers() {
    await pause()
    const s = load()
    need(s, 'drivers.view')
    return s.drivers
      .map((d) => publicDriver(s, d))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  },
  async getDriver(did) {
    await pause()
    const s = load()
    need(s, 'drivers.view')
    return driverDetail(s, did)
  },
  async createDriver(input) {
    const s = load()
    need(s, 'drivers.manage')
    const d: DemoDriver = { id: id(), ...cleanDriver(s, input), active: true, userId: null }
    s.drivers.push(d)
    save(s)
    return driverDetail(s, d.id)
  },
  async updateDriver(did, input) {
    const s = load()
    need(s, 'drivers.manage')
    const d = findDriver(s, did)
    const clean = cleanDriver(s, input, did)
    const active = input.active ?? d.active
    if (!active && d.active) {
      const busy = openAssignment(s, 'driverId', did)
      if (busy) fail(422, `Retirez d'abord ce chauffeur de « ${findVehicle(s, busy.vehicleId).name} » avant de le désactiver`)
    }
    Object.assign(d, clean, { active })
    for (const a of s.assignments) if (a.driverId === did) a.driverName = d.name
    const account = s.users.find((u) => u.id === d.userId)
    if (account) Object.assign(account, { name: d.name, active })
    save(s)
    return driverDetail(s, did)
  },
  async createDriverAccount(did, password) {
    const s = load()
    const actor = need(s, 'users.manage')
    if (password.length < 8) fail(422, 'Le mot de passe doit contenir au moins 8 caractères')
    const d = findDriver(s, did)
    if (d.userId) fail(409, 'Ce chauffeur a déjà un accès')
    if (!d.active) fail(422, 'Ce chauffeur est désactivé')
    if (s.users.some((u) => u.login === d.phone)) fail(409, 'Un compte utilise déjà ce numéro comme identifiant')
    const user: DemoUser = {
      id: id(), ownerId: actor.ownerId, name: d.name, login: d.phone, role: 'driver', active: true, lastLoginAt: null, password,
    }
    s.users.push(user)
    d.userId = user.id
    save(s)
    return driverDetail(s, did)
  },
  async getLedger(did) {
    await pause()
    const s = load()
    const u = me(s)
    const d = findDriver(s, did)
    if (!can(u.role, 'drivers.view') && d.userId !== u.id) fail(403, "Vous n'avez pas accès à cette fiche")
    return ledgerPayload(s, d)
  },
  async myLedger() {
    await pause()
    const s = load()
    const u = need(s, 'dashboard.own')
    const d = s.drivers.find((x) => x.userId === u.id) ?? fail(404, 'Aucune fiche chauffeur liée à ce compte')
    return ledgerPayload(s, d)
  },
  async listPayments(date) {
    await pause()
    const s = load()
    need(s, 'payments.view')
    return s.payments.filter((p) => p.paidOn === date).sort((a, b) => b.receiptNo - a.receiptNo).map((p) => publicPayment(s, p))
  },
  async getPayment(pid) {
    await pause()
    const s = load()
    const u = me(s)
    const p = s.payments.find((x) => x.id === pid) ?? fail(404, 'Versement introuvable')
    if (!can(u.role, 'payments.view') && s.drivers.find((d) => d.id === p.driverId)?.userId !== u.id)
      fail(403, "Vous n'avez pas accès à cette fiche")
    return paymentDetail(s, p)
  },
  async createPayment(input) {
    await pause()
    const s = load()
    const u = need(s, 'payments.create')
    const existing = s.payments.find((p) => p.id === input.id)
    if (existing) return paymentDetail(s, existing)
    const p = recordPayment(s, u, input, input.method)
    save(s)
    return paymentDetail(s, p)
  },
  async cancelPayment(pid, reason) {
    const s = load()
    need(s, 'payments.edit')
    if (!reason.trim()) fail(422, "Le motif d'annulation est obligatoire")
    const p = s.payments.find((x) => x.id === pid) ?? fail(404, 'Versement introuvable')
    if (p.cancelled) fail(422, 'Ce versement est déjà annulé')
    p.cancelled = true
    p.cancelReason = reason.trim()
    save(s)
    return paymentDetail(s, p)
  },
  async vehicleDays(vid) {
    await pause()
    const s = load()
    need(s, 'vehicles.view')
    return vehicleDaysOf(s, vid)
  },
  async markDay(vid, input) {
    const s = load()
    need(s, 'days.mark')
    const v = findVehicle(s, vid)
    const date = checkDate(input.date, 'Date')
    if (date < v.serviceDate) fail(422, "Cette date précède la mise en service de l'engin")
    let mark: DayMark | undefined
    if (input.kind === 'override') {
      checkAmount(input.amount ?? NaN)
      if (!input.reason?.trim()) fail(422, 'Indiquez la raison du montant exceptionnel')
    }
    if (input.kind !== 'clear') {
      mark = {
        vehicleId: vid, date, kind: input.kind, amount: input.kind === 'override' ? input.amount! : null,
        currency: input.kind === 'override' ? (input.currency ?? v.currency) : null, reason: input.reason?.trim() || null,
      }
    }
    const inBreakdown = s.breakdowns.some((b) => !b.cancelled && b.vehicleId === vid && b.startDate <= date && (b.endDate === null || b.endDate >= date))
    const effective = mark ?? (inBreakdown ? { vehicleId: vid, date, kind: 'breakdown' as const, amount: null, currency: null, reason: null } : undefined)
    const e = expectedFor(ledgerVehicle(v), date, s.settings.restWeekdays, effective)
    const paid = paidOnVehicleDay(s, vid, date)
    if (paid > e.expected)
      fail(422, `Des versements ont déjà été reçus pour ce jour (${paid} ${e.currency}) : annulez-les d'abord ou choisissez un montant au moins égal`)
    s.marks = s.marks.filter((m) => !(m.vehicleId === vid && m.date === date))
    if (mark) s.marks.push(mark)
    save(s)
    return vehicleDaysOf(s, vid)
  },
  // ---------- Phase 4 ----------
  async listExpenses(p) {
    await pause()
    const s = load()
    need(s, 'expenses.manage')
    const date = today(s)
    const from = p.from ?? date.slice(0, 8) + '01'
    const to = p.to ?? date
    const list = s.expenses
      .filter((e) => e.spentOn >= from && e.spentOn <= to && (!p.vehicleId || e.vehicleId === p.vehicleId))
      .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt))
    const totals: Totals = {}
    for (const e of list) if (!e.cancelled) totals[e.currency] = (totals[e.currency] ?? 0) + e.amount
    return { from, to, expenses: list.map((e) => publicExpense(s, e)), totals }
  },
  async getExpense(eid) {
    await pause()
    const s = load()
    need(s, 'expenses.manage')
    return publicExpense(s, s.expenses.find((e) => e.id === eid) ?? fail(404, 'Dépense introuvable'))
  },
  async createExpense(input) {
    await pause()
    const s = load()
    const u = need(s, 'expenses.manage')
    const existing = s.expenses.find((e) => e.id === input.id)
    if (existing) return publicExpense(s, existing)
    const f = expenseFields(s, input)
    checkMoney(input.amount)
    const spentOn = checkDate(input.spentOn ?? today(s), 'Date de la dépense')
    if (spentOn > today(s)) fail(422, 'La date de la dépense ne peut pas être dans le futur')
    const paidBy = input.paidBy === 'driver' ? 'driver' : 'cash'
    let paymentId: string | null = null
    let driverId: string | null = null
    if (paidBy === 'driver') {
      if (!can(u.role, 'payments.create')) fail(403, "Vous n'avez pas le droit d'enregistrer un versement")
      driverId = input.driverId ?? ''
      const p = recordPayment(s, u, {
        id: id(), driverId, kind: 'daily', amount: input.amount, currency: input.currency, method: 'driver_expense',
        paidOn: spentOn, days: input.days ?? [], note: `Dépense payée par le chauffeur${f.note ? ' : ' + f.note : ''}`,
      }, 'driver_expense')
      paymentId = p.id
      f.vehicleId = f.vehicleId ?? p.vehicleId
    }
    const e: DemoExpense = {
      id: input.id, ...f, amount: input.amount, currency: input.currency, spentOn, paidBy, driverId, paymentId,
      rate: latest(s)?.rate ?? null, createdBy: u.id, createdAt: nowIso(), cancelled: false, cancelReason: null,
    }
    s.expenses.push(e)
    audit(s, 'expense', e.id, 'create', null, { category: e.category, amount: e.amount, currency: e.currency, paidBy })
    save(s)
    return publicExpense(s, e)
  },
  async updateExpense(eid, input) {
    const s = load()
    need(s, 'expenses.manage')
    const e = s.expenses.find((x) => x.id === eid) ?? fail(404, 'Dépense introuvable')
    if (e.cancelled) fail(422, 'Cette dépense est annulée')
    const f = expenseFields(s, { ...input, vehicleId: input.vehicleId === undefined ? e.vehicleId : input.vehicleId })
    const old = { ...e }
    if (e.paidBy === 'driver') {
      if (input.amount !== e.amount || input.currency !== e.currency || (input.spentOn && input.spentOn !== e.spentOn))
        fail(422, 'Dépense payée par le chauffeur : pour changer le montant ou la date, annulez-la puis saisissez-la à nouveau')
      Object.assign(e, { ...f, vehicleId: e.vehicleId })
    } else {
      checkMoney(input.amount)
      const spentOn = checkDate(input.spentOn ?? e.spentOn, 'Date de la dépense')
      if (spentOn > today(s)) fail(422, 'La date de la dépense ne peut pas être dans le futur')
      Object.assign(e, f, { amount: input.amount, currency: input.currency, spentOn })
    }
    audit(s, 'expense', e.id, 'update', strip(old), strip(e))
    save(s)
    return publicExpense(s, e)
  },
  async cancelExpense(eid, reason) {
    const s = load()
    need(s, 'expenses.manage')
    if (!reason.trim()) fail(422, "Le motif d'annulation est obligatoire")
    const e = s.expenses.find((x) => x.id === eid) ?? fail(404, 'Dépense introuvable')
    if (e.cancelled) fail(422, 'Cette dépense est déjà annulée')
    e.cancelled = true
    e.cancelReason = reason.trim()
    const p = s.payments.find((x) => x.id === e.paymentId)
    if (p && !p.cancelled) Object.assign(p, { cancelled: true, cancelReason: `Dépense annulée : ${reason.trim()}` })
    audit(s, 'expense', e.id, 'cancel', { cancelled: false }, { cancelled: true, reason })
    save(s)
    return publicExpense(s, e)
  },
  async getCash(from, to) {
    await pause()
    const s = load()
    need(s, 'cash.manage')
    return cashStateOf(s, from, to)
  },
  async createMovement(input) {
    const s = load()
    const u = need(s, 'cash.manage')
    if (!s.movements.some((m) => m.id === input.id)) {
      const m = movementFields(s, input)
      s.movements.push({ id: input.id, ...m, createdBy: u.id, cancelled: false, cancelReason: null })
      audit(s, 'cash_movement', input.id, 'create', null, m)
      save(s)
    }
    return cashStateOf(s)
  },
  async updateMovement(mid, input) {
    const s = load()
    need(s, 'cash.manage')
    const m = s.movements.find((x) => x.id === mid && !x.cancelled) ?? fail(404, 'Mouvement introuvable ou annulé')
    const old = { ...m }
    Object.assign(m, movementFields(s, input))
    audit(s, 'cash_movement', mid, 'update', strip(old), strip(m))
    save(s)
    return cashStateOf(s)
  },
  async cancelMovement(mid, reason) {
    const s = load()
    need(s, 'cash.manage')
    if (!reason.trim()) fail(422, "Le motif d'annulation est obligatoire")
    const m = s.movements.find((x) => x.id === mid && !x.cancelled) ?? fail(404, 'Mouvement introuvable ou déjà annulé')
    Object.assign(m, { cancelled: true, cancelReason: reason.trim() })
    audit(s, 'cash_movement', mid, 'cancel', { cancelled: false }, { cancelled: true, reason })
    save(s)
    return cashStateOf(s)
  },
  async listBreakdowns(vid) {
    await pause()
    const s = load()
    need(s, 'vehicles.view')
    findVehicle(s, vid)
    return breakdownsOf(s, vid)
  },
  async createBreakdown(vid, input) {
    const s = load()
    need(s, 'days.mark')
    const v = findVehicle(s, vid)
    if (!input.reason?.trim()) fail(422, 'La cause est obligatoire')
    const start = checkDate(input.startDate, 'Début')
    const end = input.endDate ? checkDate(input.endDate, 'Fin') : null
    checkBreakdownFree(s, v, start, end, null)
    const b: DemoBreakdown = { id: id(), vehicleId: vid, startDate: start, endDate: end, reason: input.reason!.trim(), cancelled: false, cancelReason: null }
    s.breakdowns.push(b)
    audit(s, 'breakdown', b.id, 'create', null, { vehicle: v.name, start, end, reason: b.reason })
    save(s)
    return breakdownsOf(s, vid)
  },
  async updateBreakdown(bid, input) {
    const s = load()
    need(s, 'days.mark')
    const b = s.breakdowns.find((x) => x.id === bid && !x.cancelled) ?? fail(404, 'Immobilisation introuvable')
    const start = checkDate(input.startDate ?? b.startDate, 'Début')
    const end = input.endDate === undefined ? b.endDate : input.endDate ? checkDate(input.endDate, 'Fin') : null
    const reason = input.reason === undefined ? b.reason : input.reason.trim() || fail(422, 'La cause est obligatoire')
    checkBreakdownFree(s, findVehicle(s, b.vehicleId), start, end, bid)
    audit(s, 'breakdown', bid, 'update', { start: b.startDate, end: b.endDate, reason: b.reason }, { start, end, reason })
    Object.assign(b, { startDate: start, endDate: end, reason })
    save(s)
    return breakdownsOf(s, b.vehicleId)
  },
  async cancelBreakdown(bid, reason) {
    const s = load()
    need(s, 'days.mark')
    if (!reason.trim()) fail(422, "Le motif d'annulation est obligatoire")
    const b = s.breakdowns.find((x) => x.id === bid && !x.cancelled) ?? fail(404, 'Immobilisation introuvable')
    Object.assign(b, { cancelled: true, cancelReason: reason.trim() })
    audit(s, 'breakdown', bid, 'cancel', { cancelled: false }, { cancelled: true, reason })
    save(s)
    return breakdownsOf(s, b.vehicleId)
  },
  async listReminders(vid) {
    await pause()
    const s = load()
    need(s, 'vehicles.view')
    return { today: today(s), reminders: remindersOf(s, vid ?? null) }
  },
  async createReminder(vid, input) {
    const s = load()
    need(s, 'vehicles.manage')
    findVehicle(s, vid)
    const r: DemoReminder = { id: id(), vehicleId: vid, ...reminderFields(input), doneAt: null, deleted: false }
    s.reminders.push(r)
    audit(s, 'reminder', r.id, 'create', null, reminderFields(input))
    save(s)
    return { today: today(s), reminders: remindersOf(s, vid) }
  },
  async updateReminder(rid, input) {
    const s = load()
    need(s, 'vehicles.manage')
    const r = s.reminders.find((x) => x.id === rid && !x.deleted) ?? fail(404, 'Échéance introuvable')
    const old = { ...r }
    Object.assign(r, reminderFields(input))
    audit(s, 'reminder', rid, 'update', strip(old), strip(r))
    save(s)
    return { today: today(s), reminders: remindersOf(s, r.vehicleId) }
  },
  async doneReminder(rid, nextDueDate) {
    const s = load()
    need(s, 'vehicles.manage')
    const r = s.reminders.find((x) => x.id === rid && !x.deleted) ?? fail(404, 'Échéance introuvable')
    if (r.doneAt) fail(422, 'Échéance déjà faite')
    r.doneAt = today(s)
    if (nextDueDate) s.reminders.push({ ...r, id: id(), dueDate: checkDate(nextDueDate, 'Prochaine échéance'), doneAt: null })
    audit(s, 'reminder', rid, 'done', null, { doneAt: r.doneAt, next: nextDueDate ?? null })
    save(s)
    return { today: today(s), reminders: remindersOf(s, r.vehicleId) }
  },
  async cancelReminder(rid) {
    const s = load()
    need(s, 'vehicles.manage')
    const r = s.reminders.find((x) => x.id === rid && !x.deleted) ?? fail(404, 'Échéance introuvable')
    r.deleted = true
    audit(s, 'reminder', rid, 'delete', strip(r), null)
    save(s)
    return { today: today(s), reminders: remindersOf(s, r.vehicleId) }
  },
  async vehicleFinance(vid) {
    await pause()
    const s = load()
    need(s, 'vehicles.view')
    findVehicle(s, vid)
    const date = today(s)
    const from = date.slice(0, 8) + '01'
    const base = s.settings.baseCurrency
    const rate = latest(s)?.rate ?? null
    const toBase = (n: number, c: Currency, r: number | null) => (c === base ? n : convert(n, c, base, r ?? rate ?? 1))
    const revenue = livePayments(s).filter((p) => p.vehicleId === vid && p.paidOn >= from && p.paidOn <= date).reduce((t, p) => t + toBase(p.amount, p.currency, p.rate), 0)
    const expenses = s.expenses.filter((e) => !e.cancelled && e.vehicleId === vid && e.spentOn >= from && e.spentOn <= date).reduce((t, e) => t + toBase(e.amount, e.currency, e.rate), 0)
    const current = breakdownsOf(s, vid).find((b) => !b.cancelled && b.startDate <= date && (b.endDate === null || b.endDate >= date)) ?? null
    return { from, to: date, currency: base, revenue, expenses, profit: revenue - expenses, currentBreakdown: current }
  },
  async backup() {
    const s = load()
    need(s, 'backup.download')
    const { users, sessionUserId: _s, ...rest } = s
    return {
      format: 'transcash-backup', version: 1, exportedAt: nowIso(), demo: true,
      tables: { ...rest, users: users.map(({ password: _p, ...u }) => u) },
    }
  },
  async reportData(from, to) {
    await pause()
    const s = load()
    need(s, 'reports.view')
    if (to < from) fail(422, 'La fin de la période précède son début')
    const date = today(s)
    const last = to < date ? to : date
    const days: ReportData['days'] = []
    for (const v of s.vehicles) {
      for (let d = from > v.serviceDate ? from : v.serviceDate; d <= last; d = addDays(d, 1)) {
        const a = s.assignments.find((x) => x.vehicleId === v.id && x.startDate <= d && (x.endDate === null || x.endDate >= d))
        const e = expectedFor(ledgerVehicle(v), d, s.settings.restWeekdays, markAt(s, v.id, d))
        const paid = paidOnVehicleDay(s, v.id, d)
        if (!a && paid === 0 && e.kind !== 'breakdown') continue
        days.push({ vehicleId: v.id, date: d, driverId: a?.driverId ?? null, kind: e.kind, expected: a ? e.expected : 0, paid, currency: e.currency })
      }
    }
    return {
      ownerName: s.ownerName, from, to, today: date, currency: s.settings.baseCurrency, rate: latest(s)?.rate ?? null,
      vehicles: s.vehicles.map((v) => ({ id: v.id, name: v.name, type: v.type, plate: v.plate, status: v.status })).sort((a, b) => a.name.localeCompare(b.name)),
      drivers: s.drivers.map((d) => ({ id: d.id, name: d.name, phone: d.phone })).sort((a, b) => a.name.localeCompare(b.name)),
      days,
      payments: livePayments(s).filter((p) => p.paidOn >= from && p.paidOn <= to).sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.receiptNo - b.receiptNo)
        .map((p) => ({ id: p.id, receiptNo: p.receiptNo, date: p.paidOn, driverId: p.driverId, vehicleId: p.vehicleId, kind: p.kind, method: p.method, amount: p.amount, currency: p.currency, rate: p.rate, reference: p.reference })),
      expenses: s.expenses.filter((e) => !e.cancelled && e.spentOn >= from && e.spentOn <= to).sort((a, b) => a.spentOn.localeCompare(b.spentOn))
        .map((e) => ({ id: e.id, date: e.spentOn, vehicleId: e.vehicleId, driverId: e.driverId, category: e.category, amount: e.amount, currency: e.currency, rate: e.rate, paidBy: e.paidBy, note: e.note, supplier: e.supplier })),
    }
  },
  async auditLog(p) {
    await pause()
    const s = load()
    need(s, 'audit.view')
    return s.audit.filter((a) => !p.before || a.id < p.before).slice(0, p.limit ?? 50)
  },
}

// ---------- Phase 4 : fonctions de la démo ----------

const strip = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => !['createdBy', 'createdAt', 'deleted'].includes(k)))
function checkMoney(n: number) {
  if (!Number.isInteger(n) || n <= 0 || n > 1e12) fail(422, 'Montant invalide')
}
function expenseFields(s: DemoState, input: { category: Expense['category']; vehicleId?: string | null; breakdownId?: string | null; supplier?: string; note?: string }) {
  if (!input.category) fail(422, 'Choisissez une catégorie de dépense')
  let vehicleId = input.vehicleId ? findVehicle(s, input.vehicleId).id : null
  let breakdownId: string | null = null
  if (input.breakdownId) {
    const b = s.breakdowns.find((x) => x.id === input.breakdownId && !x.cancelled)
    if (!b || (vehicleId && b.vehicleId !== vehicleId)) fail(422, 'Immobilisation introuvable pour cet engin')
    breakdownId = b!.id
    vehicleId = vehicleId ?? b!.vehicleId
  }
  return { category: input.category, vehicleId, breakdownId, supplier: input.supplier?.trim() || null, note: input.note?.trim() || null }
}
function publicExpense(s: DemoState, e: DemoExpense): Expense {
  const { createdBy, ...rest } = e
  return {
    ...rest,
    vehicleName: s.vehicles.find((v) => v.id === e.vehicleId)?.name ?? null,
    driverName: s.drivers.find((d) => d.id === e.driverId)?.name ?? null,
    createdByName: s.users.find((u) => u.id === createdBy)?.name ?? null,
  }
}
function cashEntriesOf(s: DemoState): (CashEntry & CashLine)[] {
  const out: (CashEntry & CashLine)[] = []
  for (const p of livePayments(s)) {
    if (p.method === 'driver_expense') continue
    out.push({ type: 'payment', id: p.id, date: p.paidOn, direction: 'in', amount: p.amount, currency: p.currency,
      label: s.drivers.find((d) => d.id === p.driverId)?.name ?? null, method: p.method, receiptNo: p.receiptNo, note: null })
  }
  for (const e of s.expenses) {
    if (e.cancelled || e.paidBy !== 'cash') continue
    out.push({ type: 'expense', id: e.id, date: e.spentOn, direction: 'out', amount: e.amount, currency: e.currency,
      label: s.vehicles.find((v) => v.id === e.vehicleId)?.name ?? null, category: e.category, note: e.note })
  }
  for (const m of s.movements) {
    if (m.cancelled) continue
    out.push({ type: m.kind, id: m.id, date: m.movedOn, direction: m.kind === 'deposit' ? 'in' : 'out', amount: m.amount, currency: m.currency, label: null, note: m.note })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}
function cashStateOf(s: DemoState, from?: string, to?: string): CashState {
  const date = today(s)
  const f = from ?? addDays(date, -30)
  const t = to ?? date
  const all = cashEntriesOf(s)
  const period = all.filter((e) => e.date >= f && e.date <= t)
  const sum = (dir: 'in' | 'out') => {
    const r = { CDF: 0, USD: 0 }
    for (const e of period) if (e.direction === dir) r[e.currency] += e.amount
    return r
  }
  return {
    from: f, to: t,
    balance: cashBalance(all, date),
    opening: cashBalance(all, addDays(f, -1)),
    totalIn: sum('in'), totalOut: sum('out'),
    entries: period,
    movements: s.movements.filter((m) => m.movedOn >= f && m.movedOn <= t).sort((a, b) => b.movedOn.localeCompare(a.movedOn))
      .map(({ createdBy, ...m }) => ({ ...m, createdByName: s.users.find((u) => u.id === createdBy)?.name ?? null })),
  }
}
function movementFields(s: DemoState, input: { kind: 'withdrawal' | 'deposit'; amount: number; currency: Currency; movedOn?: string; note?: string }) {
  checkMoney(input.amount)
  const movedOn = checkDate(input.movedOn ?? today(s), 'Date')
  if (movedOn > today(s)) fail(422, 'La date ne peut pas être dans le futur')
  return { kind: input.kind === 'deposit' ? ('deposit' as const) : ('withdrawal' as const), amount: input.amount, currency: input.currency, movedOn, note: input.note?.trim() || null }
}
function breakdownsOf(s: DemoState, vid: string): VehicleBreakdown[] {
  return s.breakdowns
    .filter((b) => b.vehicleId === vid)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((b) => {
      const expenses: Totals = {}
      for (const e of s.expenses) if (!e.cancelled && e.breakdownId === b.id) expenses[e.currency] = (expenses[e.currency] ?? 0) + e.amount
      return { ...b, vehicleName: s.vehicles.find((v) => v.id === vid)?.name ?? null, expenses }
    })
}
function checkBreakdownFree(s: DemoState, v: DemoVehicle, start: string, end: string | null, exceptId: string | null) {
  if (start < v.serviceDate) fail(422, "L'immobilisation commence avant la mise en service de l'engin")
  if (end !== null && end < start) fail(422, 'La fin ne peut pas précéder le début')
  const other = s.breakdowns.find((b) => !b.cancelled && b.vehicleId === v.id && b.id !== exceptId && b.startDate <= (end ?? '9999-12-31') && (b.endDate === null || b.endDate >= start))
  if (other) fail(422, `Une autre immobilisation couvre déjà ces jours (depuis le ${other.startDate})`)
  const paid = livePayments(s)
    .flatMap((p) => p.allocations)
    .filter((a) => a.vehicleId === v.id && a.date >= start && a.date <= (end ?? '9999-12-31') && !s.marks.some((m) => m.vehicleId === v.id && m.date === a.date))
    .map((a) => a.date)
    .sort()[0]
  if (paid) fail(422, `Un versement a déjà été reçu pour le ${paid} : annulez-le d'abord, ou commencez l'immobilisation après cette date`)
}
function reminderFields(input: { kind: Reminder['kind']; label?: string; dueDate: string; notifyDays: number; notes?: string }) {
  const label = input.label?.trim() || null
  if (input.kind === 'other' && !label) fail(422, "Précisez le nom de l'échéance")
  if (input.notifyDays < 0 || input.notifyDays > 180) fail(422, "Le délai d'alerte doit être entre 0 et 180 jours")
  return { kind: input.kind, label, dueDate: checkDate(input.dueDate, 'Échéance'), notifyDays: input.notifyDays, notes: input.notes?.trim() || null }
}
function remindersOf(s: DemoState, vid: string | null): Reminder[] {
  const date = today(s)
  return s.reminders
    .filter((r) => !r.deleted && (vid ? r.vehicleId === vid : !r.doneAt) && s.vehicles.find((v) => v.id === r.vehicleId)?.status === 'active')
    .sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || a.dueDate.localeCompare(b.dueDate))
    .map(({ deleted: _d, ...r }) => ({ ...r, vehicleName: s.vehicles.find((v) => v.id === r.vehicleId)?.name ?? null, state: reminderState(r, date) }))
}

/** Enregistre un versement dans l'état (sans sauvegarder). Même règles que l'API. */
function recordPayment(s: DemoState, u: DemoUser, input: NewPaymentInput, method: PaymentMethod): DemoPayment {
    if (!Number.isInteger(input.amount) || input.amount <= 0) fail(422, 'Montant invalide')
    const date = today(s)
    const paidOn = checkDate(input.paidOn ?? date, 'Date du versement')
    if (paidOn > date) fail(422, 'La date de réception ne peut pas être dans le futur')
    const note = input.note?.trim() || null
    if (input.kind === 'extra' && !note) fail(422, 'Indiquez le motif du versement exceptionnel')
    const d = findDriver(s, input.driverId)
    const rate = latest(s)?.rate ?? null
    let allocations: Allocation[] = []
    let vehicleId: string | null = null
    if (input.kind === 'daily') {
      const chosen = input.days ?? []
      if (!chosen.length) fail(422, 'Choisissez au moins une journée à payer')
      const dates = chosen.map((c) => checkDate(c.date, 'Journée'))
      if (dates.some((x) => x > addDays(date, 31))) fail(422, "On ne peut pas payer plus de 31 jours d'avance")
      const ledger = ledgerOf(s, d.id, [...dates].sort()[0], [...dates].sort().pop()!)
      const selected = chosen.map((c) => {
        const day = ledger.find((x) => x.date === c.date && x.vehicleId === c.vehicleId) ?? fail(422, `Le ${c.date}, ce chauffeur ne conduisait pas cet engin`)
        if (day.remaining <= 0) fail(422, `La journée du ${c.date} ne doit rien (déjà payée, repos ou panne)`)
        return day
      })
      let r: ReturnType<typeof allocate>
      try {
        r = allocate(input.amount, input.currency, rate, selected)
      } catch {
        return fail(422, 'Taux de change indisponible : saisissez un taux dans les paramètres')
      }
      if (r.leftover > 0)
        fail(422, `Le montant dépasse ce qui reste dû sur les journées choisies (surplus : ${r.leftover} ${input.currency}). Choisissez une journée de plus, ou enregistrez le surplus comme versement exceptionnel.`)
      if (r.allocations.length < selected.length) fail(422, 'Le montant ne suffit pas pour toutes les journées choisies : décochez la ou les dernières')
      allocations = r.allocations
      vehicleId = allocations[0].vehicleId
    } else {
      vehicleId = s.assignments.find((a) => a.driverId === d.id && a.endDate === null)?.vehicleId ?? null
    }
    const p: DemoPayment = {
      id: input.id, receiptNo: Math.max(0, ...s.payments.map((x) => x.receiptNo)) + 1, driverId: d.id, vehicleId,
      kind: input.kind, amount: input.amount, currency: input.currency, method: method,
      reference: input.reference?.trim() || null, paidOn, rate, note, createdAt: nowIso(), createdBy: u.id,
      cancelled: false, cancelReason: null, allocations,
    }
    s.payments.push(p)
    audit(s, 'payment', p.id, 'create', null, { receipt: p.receiptNo, amount: p.amount, currency: p.currency, method })
    return p
}

function vehicleDaysOf(s: DemoState, vid: string): VehicleDays {
  const v = findVehicle(s, vid)
  const date = today(s)
  let from = addDays(date, -30)
  if (from < v.serviceDate) from = v.serviceDate
  const days: VehicleDay[] = []
  for (let d = from; d <= addDays(date, 7); d = addDays(d, 1)) {
    const a = s.assignments.find((x) => x.vehicleId === vid && x.startDate <= d && (x.endDate === null || x.endDate >= d))
    const explicit = s.marks.find((x) => x.vehicleId === vid && x.date === d)
    const m = explicit ?? markAt(s, vid, d)
    const e = expectedFor(ledgerVehicle(v), d, s.settings.restWeekdays, m)
    const expected = a ? e.expected : 0
    const paid = paidOnVehicleDay(s, vid, d)
    const remaining = Math.max(expected - paid, 0)
    days.push({
      date: d,
      driver: a ? { id: a.driverId, name: a.driverName ?? '' } : null,
      kind: a || e.kind !== 'due' ? e.kind : 'no_driver',
      expected, currency: e.currency, paid, remaining,
      state: expected === 0 ? (paid > 0 ? 'paid' : 'none') : remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      mark: explicit ? { kind: explicit.kind, amount: explicit.amount, currency: explicit.currency, reason: explicit.reason } : null,
    })
  }
  return { vehicleId: vid, today: date, days: days.reverse() }
}


export const DEMO_ACCOUNTS = () => load().users.filter((u) => u.active).map(publicUser)
