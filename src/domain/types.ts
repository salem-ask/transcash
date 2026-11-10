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

/** Situation d'un engin pour la journée : doit verser, repos, sans chauffeur, pas encore en service. */
export type DayStatus = 'due' | 'rest' | 'no_driver' | 'not_started'

export interface DashboardLine {
  vehicleId: string
  vehicleName: string
  type: VehicleType
  driverName: string | null
  status: DayStatus
  amount: number
  currency: Currency
}

export interface Dashboard {
  currency: Currency
  date: string
  rate: ExchangeRate | null
  today: { expected: number; paid: number; debt: number }
  month: { expected: number; paid: number; expenses: number; profit: number }
  vehicles: { total: number; working: number; resting: number; noDriver: number; immobilized: number }
  missingRate: boolean
  lines: DashboardLine[]
  totalDebt: number
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
