import type { DayKind, DayMarkKind, LedgerDay, PayState, Totals } from './ledger'
import type { CashDirection, ExpenseCategory, ReminderKind, ReminderState } from './finance'

// Types partagés entre l'interface et les sources de données (API PHP ou démo).

export type Role = 'super_admin' | 'admin' | 'accountant' | 'manager' | 'driver'
export type Currency = 'CDF' | 'USD'
export type RateMode = 'auto' | 'manual'

export interface User {
  id: string
  ownerId: string
  name: string
  login: string
  role: Role
  active: boolean
  lastLoginAt: string | null
}

export interface SessionState {
  /** Premier lancement sur l'hébergement : la base de données n'est pas encore configurée */
  needsConfig?: boolean
  /** Nom de base proposé par le serveur (ex. u977986808_transcash) */
  suggestedDb?: string | null
  needsSetup: boolean
  user: User | null
  ownerName: string | null
}

export interface Settings {
  baseCurrency: Currency
  secondaryCurrency: Currency
  showEquivalent: boolean
  rateMode: RateMode
  timezone: string
  /** 0 = dimanche … 6 = samedi */
  restWeekdays: number[]
}

/** Taux : nombre de CDF pour 1 USD. */
export interface ExchangeRate {
  id: string
  base: 'USD'
  quote: 'CDF'
  rate: number
  source: RateMode
  createdAt: string
}

export interface SettingsBundle {
  settings: Settings
  rate: ExchangeRate | null
}

export interface RatesBundle {
  current: ExchangeRate | null
  history: ExchangeRate[]
}

/** Situation d'un engin pour la journée : doit verser, repos, panne, sans chauffeur, pas encore en service. */
export type DayStatus = 'due' | 'rest' | 'breakdown' | 'no_driver' | 'not_started'

export interface DashboardLine {
  vehicleId: string
  vehicleName: string
  type: VehicleType
  driverId: string | null
  driverName: string | null
  status: DayStatus
  /** Montant attendu (ou habituel si le jour n'est pas dû) */
  amount: number
  paid: number
  remaining: number
  state: 'paid' | 'partial' | 'unpaid' | 'none'
  currency: Currency
}

export interface Debtor {
  driverId: string
  driverName: string
  /** Dans la devise principale */
  debt: number
  unpaidDays: number
}

export interface Dashboard {
  currency: Currency
  date: string
  rate: ExchangeRate | null
  /** expected/paid/debt : journées d'aujourd'hui ; received : argent reçu aujourd'hui (tous versements) */
  today: { expected: number; paid: number; debt: number; received: number }
  month: { expected: number; paid: number; expenses: number; profit: number }
  vehicles: { total: number; working: number; resting: number; noDriver: number; immobilized: number }
  missingRate: boolean
  lines: DashboardLine[]
  totalDebt: number
  debtors: Debtor[]
  /** Solde de caisse (si l'utilisateur y a accès) */
  cash: Record<Currency, number> | null
  /** Échéances dépassées ou proches */
  alerts: Reminder[]
}

// ---------- Versements et dettes ----------

/** driver_expense : dépense payée par le chauffeur, comptée comme versement (n'entre pas en caisse) */
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'driver_expense'
export type PaymentKind = 'daily' | 'extra'

export interface Payment {
  id: string
  receiptNo: number
  driverId: string
  driverName: string | null
  driverPhone: string | null
  vehicleId: string | null
  vehicleName: string | null
  kind: PaymentKind
  amount: number
  currency: Currency
  method: PaymentMethod
  reference: string | null
  /** Date de réception de l'argent */
  paidOn: string
  /** Taux (CDF pour 1 USD) en vigueur lors du versement */
  rate: number | null
  note: string | null
  createdAt: string
  createdByName: string | null
  cancelled: boolean
  cancelReason: string | null
}

export interface PaymentDetail extends Payment {
  allocations: { date: string; vehicleId: string; vehicleName: string; amount: number; currency: Currency }[]
  ownerName?: string
}

export interface LedgerPayload {
  driver: { id: string; name: string; phone: string }
  today: string
  days: LedgerDay[]
  summary: { arrears: Totals; dueToday: Totals; advance: Totals; unpaidDays: number }
  rate: ExchangeRate | null
  payments: Payment[]
}

export interface NewPaymentInput {
  /** Généré par l'appareil : un renvoi ne crée pas de doublon */
  id: string
  driverId: string
  kind: PaymentKind
  amount: number
  currency: Currency
  method: PaymentMethod
  reference?: string
  paidOn?: string
  note?: string
  /** Pour « daily » : journées payées, dans l'ordre */
  days?: { date: string; vehicleId: string }[]
}

export interface VehicleDay {
  date: string
  driver: { id: string; name: string } | null
  kind: DayKind | 'no_driver'
  expected: number
  currency: Currency
  paid: number
  remaining: number
  state: PayState
  mark: { kind: DayMarkKind; amount: number | null; currency: Currency | null; reason: string | null } | null
}

export interface VehicleDays {
  vehicleId: string
  today: string
  /** Du plus récent au plus ancien */
  days: VehicleDay[]
}

export interface MarkDayInput {
  date: string
  kind: DayMarkKind | 'clear'
  amount?: number
  currency?: Currency
  reason?: string
}

// ---------- Parc : engins, chauffeurs, affectations ----------

export type VehicleType = 'moto' | 'tricycle' | 'taxi' | 'minibus' | 'camion' | 'autre'
export type VehicleStatus = 'active' | 'retired'

export interface Vehicle {
  id: string
  type: VehicleType
  name: string
  plate: string | null
  model: string | null
  /** Montant journalier attendu actuel (unité minimale de `currency`) */
  dailyAmount: number
  currency: Currency
  /** null = jours de repos des paramètres */
  restWeekdays: number[] | null
  /** AAAA-MM-JJ : début des versements attendus */
  serviceDate: string
  status: VehicleStatus
  notes: string | null
  currentDriver: { id: string; name: string; phone: string; since: string } | null
}

export interface Assignment {
  id: string
  vehicleId: string
  vehicleName: string | null
  driverId: string
  driverName: string | null
  startDate: string
  /** null = en cours */
  endDate: string | null
}

export interface AmountChange {
  amount: number
  currency: Currency
  effectiveFrom: string
}

export interface VehicleDetail {
  vehicle: Vehicle
  assignments: Assignment[]
  amounts: AmountChange[]
}

export interface VehicleInput {
  type: VehicleType
  name: string
  plate?: string
  model?: string
  dailyAmount: number
  currency: Currency
  restWeekdays: number[] | null
  serviceDate?: string
  notes?: string
  /** Si le montant change : date à partir de laquelle il s'applique */
  amountFrom?: string
}

export interface Driver {
  id: string
  name: string
  phone: string
  idNumber: string | null
  licenseNumber: string | null
  address: string | null
  notes: string | null
  active: boolean
  hasAccount: boolean
  currentVehicle: { id: string; name: string; type: VehicleType; plate: string | null; since: string } | null
}

export interface DriverDetail {
  driver: Driver
  assignments: Assignment[]
}

export interface DriverInput {
  name: string
  phone: string
  idNumber?: string
  licenseNumber?: string
  address?: string
  notes?: string
  active?: boolean
}

export interface SetupInput {
  ownerName: string
  name: string
  login: string
  password: string
}

export interface NewUserInput {
  name: string
  login: string
  role: Role
  password: string
}

export interface UserPatch {
  name?: string
  role?: Role
  active?: boolean
  password?: string
}

// ---------- Phase 4 : dépenses, caisse, immobilisations, échéances, journal ----------

export interface Expense {
  id: string
  vehicleId: string | null
  vehicleName: string | null
  breakdownId: string | null
  category: ExpenseCategory
  amount: number
  currency: Currency
  spentOn: string
  /** cash : sortie de caisse ; driver : payée par le chauffeur (comptée comme versement) */
  paidBy: 'cash' | 'driver'
  driverId: string | null
  driverName: string | null
  paymentId: string | null
  supplier: string | null
  note: string | null
  rate: number | null
  createdByName: string | null
  createdAt: string
  cancelled: boolean
  cancelReason: string | null
}

export interface ExpenseInput {
  id: string
  vehicleId?: string | null
  breakdownId?: string | null
  category: ExpenseCategory
  amount: number
  currency: Currency
  spentOn?: string
  supplier?: string
  note?: string
  paidBy?: 'cash' | 'driver'
  driverId?: string
  days?: { date: string; vehicleId: string }[]
}

export interface ExpenseList {
  from: string
  to: string
  expenses: Expense[]
  totals: Totals
}

export interface CashLine {
  type: 'payment' | 'expense' | 'withdrawal' | 'deposit'
  id: string
  date: string
  direction: CashDirection
  amount: number
  currency: Currency
  label: string | null
  method?: PaymentMethod
  receiptNo?: number
  category?: ExpenseCategory
  note: string | null
}

export interface CashMovement {
  id: string
  kind: 'withdrawal' | 'deposit'
  amount: number
  currency: Currency
  movedOn: string
  note: string | null
  createdByName: string | null
  cancelled: boolean
  cancelReason: string | null
}

export interface CashState {
  from: string
  to: string
  balance: Record<Currency, number>
  opening: Record<Currency, number>
  totalIn: Record<Currency, number>
  totalOut: Record<Currency, number>
  entries: CashLine[]
  movements: CashMovement[]
}

export interface MovementInput {
  id: string
  kind: 'withdrawal' | 'deposit'
  amount: number
  currency: Currency
  movedOn?: string
  note?: string
}

export interface VehicleBreakdown {
  id: string
  vehicleId: string
  vehicleName: string | null
  startDate: string
  /** null = encore immobilisé */
  endDate: string | null
  reason: string
  /** Réparations liées, par devise */
  expenses: Totals
  cancelled: boolean
  cancelReason: string | null
}

export interface BreakdownInput {
  startDate?: string
  endDate?: string | null
  reason?: string
}

export interface Reminder {
  id: string
  vehicleId: string
  vehicleName: string | null
  kind: ReminderKind
  label: string | null
  dueDate: string
  notifyDays: number
  notes: string | null
  doneAt: string | null
  state: ReminderState
}

export interface ReminderInput {
  kind: ReminderKind
  label?: string
  dueDate: string
  notifyDays: number
  notes?: string
}

export interface VehicleFinance {
  from: string
  to: string
  currency: Currency
  /** null si un taux de change manque */
  revenue: number | null
  expenses: number | null
  profit: number | null
  currentBreakdown: VehicleBreakdown | null
}

export interface AuditEntry {
  id: number
  entity: string
  entityId: string
  action: string
  userName: string | null
  createdAt: string
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
}
