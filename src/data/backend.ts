import type {
  Dashboard,
  LedgerPayload,
  MarkDayInput,
  NewPaymentInput,
  Payment,
  PaymentDetail,
  VehicleDays,
  DriverDetail,
  Driver,
  DriverInput,
  Vehicle,
  VehicleDetail,
  VehicleInput,
  VehicleStatus,
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

  // Parc (phase 2)
  listVehicles(): Promise<Vehicle[]>
  getVehicle(id: string): Promise<VehicleDetail>
  createVehicle(input: VehicleInput): Promise<VehicleDetail>
  updateVehicle(id: string, input: VehicleInput): Promise<VehicleDetail>
  setVehicleStatus(id: string, status: VehicleStatus, date: string): Promise<VehicleDetail>
  /** Affecte un chauffeur à partir de `startDate` ; le chauffeur précédent termine la veille. */
  assignDriver(vehicleId: string, driverId: string, startDate: string): Promise<VehicleDetail>
  /** Le chauffeur actuel conduit encore le jour `endDate` inclus. */
  unassignDriver(vehicleId: string, endDate: string): Promise<VehicleDetail>
  listDrivers(): Promise<Driver[]>
  getDriver(id: string): Promise<DriverDetail>
  createDriver(input: DriverInput): Promise<DriverDetail>
  updateDriver(id: string, input: DriverInput): Promise<DriverDetail>
  /** Crée l'accès de consultation du chauffeur (identifiant = son téléphone). */
  createDriverAccount(id: string, password: string): Promise<DriverDetail>

  // Versements et dettes (phase 3)
  /** Grand livre d'un chauffeur : journées, résumé (dettes, avance), derniers versements */
  getLedger(driverId: string): Promise<LedgerPayload>
  /** Pour le chauffeur connecté */
  myLedger(): Promise<LedgerPayload>
  listPayments(date: string): Promise<Payment[]>
  getPayment(id: string): Promise<PaymentDetail>
  createPayment(input: NewPaymentInput): Promise<PaymentDetail>
  cancelPayment(id: string, reason: string): Promise<PaymentDetail>
  vehicleDays(vehicleId: string): Promise<VehicleDays>
  markDay(vehicleId: string, input: MarkDayInput): Promise<VehicleDays>
}

/** Erreur lisible par l'utilisateur, avec le code HTTP correspondant. */
export class BackendError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
