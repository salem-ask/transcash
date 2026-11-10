// Source de données de DÉMONSTRATION : tout est stocké dans le navigateur (localStorage).
// Sert à la prévisualisation sans serveur. Reproduit les règles de l'API PHP (mêmes messages d'erreur).
import type { Backend } from './backend'
import { BackendError } from './backend'
import { can, type Permission } from '../domain/permissions'
import { convert } from '../domain/money'
import { addDays, amountOn, dayStatus, isValidDate, todayIn } from '../domain/fleet'
import type {
  AmountChange,
  Assignment,
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

const KEY = 'transcash-demo-v2'
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
interface DemoState {
  ownerName: string
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

/** Parc d'exemple : quelques engins typiques de Kinshasa, avec un historique de chauffeurs. */
function seed(): DemoState {
  const ownerId = id()
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
  const taxi = mkVehicle('taxi', 'Taxi 1', 'KN 4521 BB', 'Toyota Corolla', 40000, 'CDF', '2026-01-05')
  taxi.amounts.push({ amount: 45000, currency: 'CDF', effectiveFrom: '2026-07-01' })
  taxi.dailyAmount = 45000
  const moto = mkVehicle('moto', 'Moto TVS rouge', 'KN 7781 AM', 'TVS HLX 125', 15000, 'CDF', '2026-02-01')
  const tri = mkVehicle('tricycle', 'Bajaj 2', 'KN 3302 TR', 'Bajaj RE', 25000, 'CDF', '2026-03-10')
  const bus = mkVehicle('minibus', 'Hiace Matete', 'KN 1190 BS', 'Toyota Hiace', 3500, 'USD', '2026-01-15')
  const truck = mkVehicle('camion', 'Camion benne', 'KN 0456 CM', 'Mitsubishi Canter', 5000, 'USD', '2026-04-01')
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
  return {
    ownerName: 'Transports Démo',
    users,
    settings: {
      baseCurrency: 'CDF', secondaryCurrency: 'USD', showEquivalent: true,
      rateMode: 'auto', timezone: 'Africa/Kinshasa', restWeekdays: [0],
    },
    rates: [{ id: id(), base: 'USD', quote: 'CDF', rate: 2850, source: 'manual', createdAt: nowIso() }],
    vehicles: [taxi, moto, tri, bus, truck],
    drivers: [jean, patrick, blaise, didier, serge],
    assignments: [
      mkA(taxi, jean, '2026-01-05', null),
      mkA(moto, patrick, '2026-02-01', null),
      mkA(tri, blaise, '2026-03-10', null),
      mkA(bus, serge, '2026-01-15', '2026-05-31'),
      mkA(bus, didier, '2026-06-01', null),
    ],
    sessionUserId: null,
  }
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

  async dashboard() {
    await pause()
    const s = load()
    const u = me(s)
    if (!can(u.role, 'dashboard.view') && !can(u.role, 'dashboard.own'))
      throw new BackendError(403, "Vous n'avez pas accès au tableau de bord")
    const rate = await effectiveRate(s)
    const date = today(s)
    const base = s.settings.baseCurrency
    const myDriver = u.role === 'driver' ? s.drivers.find((d) => d.userId === u.id) : null
    let total = 0
    let missingRate = false
    const lines = s.vehicles
      .filter((v) => v.status === 'active')
      .map((v) => {
        const a = s.assignments.find((x) => x.vehicleId === v.id && x.startDate <= date && (x.endDate === null || x.endDate >= date))
        return { v, a }
      })
      .filter(({ a }) => u.role !== 'driver' || (a && myDriver && a.driverId === myDriver.id))
      .sort((x, y) => x.v.name.localeCompare(y.v.name))
      .map(({ v, a }) => {
        const amount = amountOn(v.amounts, date)
        const status = dayStatus({ amount, restDays: v.restWeekdays ?? s.settings.restWeekdays, date, hasDriver: !!a })
        if (status === 'due' && amount) {
          if (amount.currency !== base && !rate) missingRate = true
          else total += convert(amount.amount, amount.currency, base, rate?.rate ?? 1)
        }
        return {
          vehicleId: v.id, vehicleName: v.name, type: v.type, driverName: a?.driverName ?? null, status,
          amount: amount?.amount ?? 0, currency: amount?.currency ?? base,
        }
      })
    const count = (st: string) => lines.filter((l) => l.status === st).length
    return {
      currency: base,
      date,
      rate,
      today: { expected: total, paid: 0, debt: 0 },
      month: { expected: 0, paid: 0, expenses: 0, profit: 0 },
      vehicles: { total: lines.length, working: count('due'), resting: count('rest'), noDriver: count('no_driver'), immobilized: 0 },
      missingRate,
      lines,
      totalDebt: 0,
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
}

export const DEMO_ACCOUNTS = () => load().users.filter((u) => u.active).map(publicUser)
