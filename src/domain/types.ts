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

export interface Dashboard {
  currency: Currency
  rate: ExchangeRate | null
  today: { expected: number; paid: number; debt: number }
  month: { expected: number; paid: number; expenses: number; profit: number }
  vehicles: { total: number; active: number; immobilized: number }
  totalDebt: number
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
