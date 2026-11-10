import { useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, resetDemo } from '../../data/demoBackend'
import { roleLabel } from '../../domain/permissions'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Field } from '../../components/ui'
import { AuthScreen } from './AuthScreen'

export function LoginPage() {
  const { setSession } = useSession()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(l: string, p: string) {
    setBusy(true)
    setError(null)
    try {
      setSession(await backend.login(l, p))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void signIn(login, password)
  }

  return (
    <AuthScreen subtitle="Suivi des versements de vos engins">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Identifiant"
            hint="E-mail ou numéro de téléphone"
            autoComplete="username"
            inputMode="email"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
          <Field
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            Se connecter
          </Button>
        </form>
      </Card>

      {backend.isDemo && (
        <Card title="Essayer la démo" className="mt-4">
          <p className="mb-3 text-sm text-ink-soft">
            Choisissez un profil pour voir ce que chaque rôle peut faire (mot de passe : {DEMO_PASSWORD}).
          </p>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS().map((u) => (
              <Button key={u.id} variant="secondary" disabled={busy} onClick={() => void signIn(u.login, DEMO_PASSWORD)} className="justify-between">
                <span>{roleLabel(u.role)}</span>
                <span className="text-sm font-normal text-ink-soft">{u.login}</span>
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-2 w-full text-sm"
            onClick={() => {
              resetDemo()
              location.reload()
            }}
          >
            Réinitialiser les données de démo
          </Button>
        </Card>
      )}
    </AuthScreen>
  )
}
