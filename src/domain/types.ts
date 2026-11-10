import type { DayKind, DayMarkKind, LedgerDay, PayState, Totals } from './ledger'

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
}

// ---------- Versements et dettes ----------

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank'
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
