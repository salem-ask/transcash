import { useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Field } from '../../components/ui'
import { AuthScreen } from './AuthScreen'

/** Premier lancement : création de l'entreprise et du compte super administrateur. */
export function SetupPage() {
  const { setSession } = useSession()
  const [form, setForm] = useState({ ownerName: '', name: '', login: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) return setError('Les deux mots de passe ne correspondent pas')
    setBusy(true)
    setError(null)
    try {
      const { confirm: _c, ...input } = form
      setSession(await backend.setup(input))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthScreen subtitle="Bienvenue ! Créons votre compte principal.">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nom de l'entreprise" placeholder="Ex. Transports Mukendi" value={form.ownerName} onChange={set('ownerName')} required />
          <Field label="Votre nom" autoComplete="name" value={form.name} onChange={set('name')} required />
          <Field label="Identifiant" hint="E-mail ou numéro de téléphone" autoComplete="username" value={form.login} onChange={set('login')} required />
          <Field label="Mot de passe" hint="8 caractères minimum" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={8} />
          <Field label="Confirmer le mot de passe" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            Créer mon compte
          </Button>
        </form>
      </Card>
    </AuthScreen>
  )
}
