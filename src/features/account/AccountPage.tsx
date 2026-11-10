import { useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Field } from '../../components/ui'
import { roleLabel } from '../../domain/permissions'

export function AccountPage() {
  const { session, logout } = useSession()
  const user = session!.user!
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (pwd.next !== pwd.confirm) return setMsg({ kind: 'error', text: 'Les deux mots de passe ne correspondent pas' })
    setBusy(true)
    setMsg(null)
    try {
      await backend.changePassword(pwd.current, pwd.next)
      setPwd({ current: '', next: '', confirm: '' })
      setMsg({ kind: 'success', text: 'Mot de passe modifié' })
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mon compte</h1>
      <Card>
        <p className="text-lg font-semibold">{user.name}</p>
        <p className="text-sm text-ink-soft">{user.login}</p>
        <p className="mt-2 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-strong">{roleLabel(user.role)}</p>
      </Card>

      <Card title="Changer le mot de passe">
        <form onSubmit={changePassword} className="space-y-3">
          <Field label="Mot de passe actuel" type="password" autoComplete="current-password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required />
          <Field label="Nouveau mot de passe" hint="8 caractères minimum" type="password" autoComplete="new-password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required minLength={8} />
          <Field label="Confirmer" type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required />
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            Enregistrer
          </Button>
        </form>
      </Card>

      <Button variant="danger" className="w-full" onClick={() => void logout()}>
        Se déconnecter
      </Button>
    </div>
  )
}
