import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider, useSession } from './session'
import { Layout } from './Layout'
import { Alert, Button, Spinner } from '../components/ui'
import { LoginPage } from '../features/auth/LoginPage'
import { SetupPage } from '../features/auth/SetupPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { UsersPage } from '../features/users/UsersPage'
import { AccountPage } from '../features/account/AccountPage'
import { MenuPage } from '../features/account/MenuPage'
import { PaymentsPage } from '../features/payments/PaymentsPage'
import { NewPaymentPage } from '../features/payments/NewPaymentPage'
import { ReceiptPage } from '../features/payments/ReceiptPage'
import { ExpensesPage } from '../features/expenses/ExpensesPage'
import { ExpenseFormPage } from '../features/expenses/ExpenseFormPage'
import { CashPage } from '../features/cash/CashPage'
import { RemindersPage } from '../features/reminders/RemindersPage'
import { AuditPage } from '../features/audit/AuditPage'
import { VehiclesPage } from '../features/vehicles/VehiclesPage'
import { VehicleFormPage } from '../features/vehicles/VehicleFormPage'
import { VehicleDetailPage } from '../features/vehicles/VehicleDetailPage'
import { DriversPage } from '../features/drivers/DriversPage'
import { DriverFormPage } from '../features/drivers/DriverFormPage'
import { DriverDetailPage } from '../features/drivers/DriverDetailPage'
import { can, type Permission } from '../domain/permissions'
import type { ReactNode } from 'react'

function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { session } = useSession()
  return can(session?.user?.role, perm) ? children : <Navigate to="/" replace />
}

function Root() {
  const { session, error, reload } = useSession()

  if (error && !session)
    return (
      <div className="mx-auto max-w-sm space-y-3 p-6">
        <Alert>{error}</Alert>
        <Button className="w-full" onClick={() => void reload()}>
          Réessayer
        </Button>
      </div>
    )
  if (!session) return <Spinner label="Démarrage…" />
  if (session.needsSetup) return <SetupPage />
  if (!session.user) return <LoginPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="parametres" element={<Guard perm="settings.view"><SettingsPage /></Guard>} />
        <Route path="utilisateurs" element={<Guard perm="users.view"><UsersPage /></Guard>} />
        <Route path="engins" element={<Guard perm="vehicles.view"><VehiclesPage /></Guard>} />
        <Route path="engins/nouveau" element={<Guard perm="vehicles.manage"><VehicleFormPage /></Guard>} />
        <Route path="engins/:id" element={<Guard perm="vehicles.view"><VehicleDetailPage /></Guard>} />
        <Route path="engins/:id/modifier" element={<Guard perm="vehicles.manage"><VehicleFormPage /></Guard>} />
        <Route path="chauffeurs" element={<Guard perm="drivers.view"><DriversPage /></Guard>} />
        <Route path="chauffeurs/nouveau" element={<Guard perm="drivers.manage"><DriverFormPage /></Guard>} />
        <Route path="chauffeurs/:id" element={<Guard perm="drivers.view"><DriverDetailPage /></Guard>} />
        <Route path="chauffeurs/:id/modifier" element={<Guard perm="drivers.manage"><DriverFormPage /></Guard>} />
        <Route path="versements" element={<Guard perm="payments.view"><PaymentsPage /></Guard>} />
        <Route path="versements/nouveau" element={<Guard perm="payments.create"><NewPaymentPage /></Guard>} />
        <Route path="versements/:id" element={<ReceiptPage />} />
        <Route path="depenses" element={<Guard perm="expenses.manage"><ExpensesPage /></Guard>} />
        <Route path="depenses/nouvelle" element={<Guard perm="expenses.manage"><ExpenseFormPage /></Guard>} />
        <Route path="depenses/:id" element={<Guard perm="expenses.manage"><ExpenseFormPage /></Guard>} />
        <Route path="caisse" element={<Guard perm="cash.manage"><CashPage /></Guard>} />
        <Route path="echeances" element={<Guard perm="vehicles.view"><RemindersPage /></Guard>} />
        <Route path="journal" element={<Guard perm="audit.view"><AuditPage /></Guard>} />
        <Route path="compte" element={<AccountPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <SessionProvider>
      {/* Routage par « # » : fonctionne sur Hostinger sans configuration serveur et dans la prévisualisation. */}
      <HashRouter>
        <Root />
      </HashRouter>
    </SessionProvider>
  )
}
