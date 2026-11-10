// Source de données de DÉMONSTRATION : tout est stocké dans le navigateur (localStorage).
// Sert à la prévisualisation sans serveur. Reproduit les règles de l'API PHP.
import type { Backend } from './backend'
import { BackendError } from './backend'
import { can, type Permission } from '../domain/permissions'
import type { ExchangeRate, Role, Settings, User } from '../domain/types'

const KEY = 'transcash-demo-v1'
export const DEMO_PASSWORD = 'demo1234'

interface DemoUser extends User {
  password: string
}
interface DemoState {
  ownerName: string
  users: DemoUser[]
  settings: Settings
  rates: ExchangeRate[]
  sessionUserId: string | null
}

const id = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

function seed(): DemoState {
  const ownerId = id()
  const mk = (name: string, login: string, role: Role): DemoUser => ({
    id: id(), ownerId, name, login, role, active: true, lastLoginAt: null, password: DEMO_PASSWORD,
  })
  return {
    ownerName: 'Transports Démo',
    users: [
      mk('Propriétaire', 'patron@demo.cd', 'super_admin'),
      mk('Administrateur', 'admin@demo.cd', 'admin'),
      mk('Comptable', 'compta@demo.cd', 'accountant'),
      mk('Gestionnaire', 'gestion@demo.cd', 'manager'),
      mk('Chauffeur Kabila M.', '+243810000001', 'driver'),
    ],
    settings: {
      baseCurrency: 'CDF', secondaryCurrency: 'USD', showEquivalent: true,
      rateMode: 'auto', timezone: 'Africa/Kinshasa', restWeekdays: [0],
    },
    rates: [{ id: id(), base: 'USD', quote: 'CDF', rate: 2850, source: 'manual', createdAt: nowIso() }],
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
    return {
      currency: s.settings.baseCurrency,
      rate: await effectiveRate(s),
      today: { expected: 0, paid: 0, debt: 0 },
      month: { expected: 0, paid: 0, expenses: 0, profit: 0 },
      vehicles: { total: 0, active: 0, immobilized: 0 },
      totalDebt: 0,
    }
  },
}

export const DEMO_ACCOUNTS = () => load().users.filter((u) => u.active).map(publicUser)
