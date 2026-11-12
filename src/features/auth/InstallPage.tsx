import { useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Field } from '../../components/ui'
import { errorText } from '../../lib/useLoad'
import { AuthScreen } from './AuthScreen'

/** Tout premier lancement sur l'hébergement : relier l'application à sa base de données (une seule fois). */
export function InstallPage() {
  const { session, setSession } = useSession()
  const suggested = session?.suggestedDb ?? ''
  const [form, setForm] = useState({ dbName: suggested, dbUser: suggested, dbPass: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setSession(await backend.installConfig(form))
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <AuthScreen subtitle="Installation : reliez l'application à sa base de données">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-soft">
            Cette étape n'a lieu qu'une fois. Le mot de passe est enregistré sur le serveur, hors du site public, et n'est jamais affiché ensuite.
          </p>
          <Field label="Nom de la base" value={form.dbName} onChange={set('dbName')} required autoComplete="off" />
          <Field label="Utilisateur de la base" value={form.dbUser} onChange={set('dbUser')} required autoComplete="off" />
          <Field label="Mot de passe de la base" type="password" value={form.dbPass} onChange={set('dbPass')} required autoComplete="off" />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            Installer
          </Button>
        </form>
      </Card>
    </AuthScreen>
  )
}
