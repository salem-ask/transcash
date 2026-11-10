import type {
  Dashboard,
  NewUserInput,
  RatesBundle,
  SessionState,
  Settings,
  SettingsBundle,
  SetupInput,
  User,
  UserPatch,
} from '../domain/types'

/** Contrat commun aux deux sources de données : l'API PHP (production) et la démo (prévisualisation). */
export interface Backend {
  readonly isDemo: boolean
  status(): Promise<SessionState>
  setup(input: SetupInput): Promise<SessionState>
  login(login: string, password: string): Promise<SessionState>
  logout(): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  getSettings(): Promise<SettingsBundle>
  updateSettings(patch: Partial<Settings>): Promise<SettingsBundle>
  listRates(): Promise<RatesBundle>
  addManualRate(rate: number): Promise<RatesBundle>
  refreshRate(): Promise<RatesBundle>
  listUsers(): Promise<User[]>
  createUser(input: NewUserInput): Promise<User[]>
  updateUser(id: string, patch: UserPatch): Promise<User[]>
  dashboard(): Promise<Dashboard>
}

/** Erreur lisible par l'utilisateur, avec le code HTTP correspondant. */
export class BackendError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
