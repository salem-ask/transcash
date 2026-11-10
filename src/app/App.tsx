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
        <Route path="compte" element={<AccountPage />} />
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
