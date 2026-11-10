import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Field, Select, Spinner } from '../../components/ui'
import { assignableRoles, can, roleLabel } from '../../domain/permissions'
import type { Role, User } from '../../domain/types'
import { formatDateTime } from '../../lib/format'

const EMPTY = { name: '', login: '', role: 'manager' as Role, password: '' }

export function UsersPage() {
  const { session, bundle } = useSession()
  const me = session!.user!
  const canManage = can(me.role, 'users.manage')
  const [users, setUsers] = useState<User[] | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // Action en cours sur une fiche : saisie d'un nouveau mot de passe ou confirmation de désactivation
  const [pending, setPending] = useState<{ id: string; kind: 'password' | 'deactivate'; value: string } | null>(null)

  useEffect(() => {
    backend.listUsers().then(setUsers, (e) => setMsg({ kind: 'error', text: e.message }))
  }, [])

  async function run(action: () => Promise<User[]>, success: string) {
    setBusy(true)
    setMsg(null)
    try {
      setUsers(await action())
      setMsg({ kind: 'success', text: success })
      return true
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (await run(() => backend.createUser(form), `Compte de ${form.name} créé`)) {
      setForm(EMPTY)
      setShowForm(false)
    }
  }

  async function confirmPending(u: User) {
    if (!pending) return
    const ok =
      pending.kind === 'password'
        ? await run(() => backend.updateUser(u.id, { password: pending.value }), `Mot de passe de ${u.name} modifié`)
        : await run(() => backend.updateUser(u.id, { active: false }), `Compte de ${u.name} désactivé`)
    if (ok) setPending(null)
  }

  const editable = (u: User) => canManage && u.id !== me.id && (u.role !== 'super_admin' || me.role === 'super_admin')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Équipe</h1>
        {canManage && !showForm && <Button onClick={() => setShowForm(true)}>+ Ajouter</Button>}
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {showForm && (
        <Card title="Nouveau compte">
          <form onSubmit={create} className="space-y-3">
            <Field label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Field label="Identifiant" hint="E-mail ou numéro de téléphone" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
            <Select label="Rôle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {assignableRoles(me.role).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
            <Field label="Mot de passe provisoire" hint="8 caractères minimum, à communiquer à la personne" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button type="submit" className="flex-1" busy={busy}>
                Créer
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!users ? (
        <Spinner />
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className={`rounded-2xl border border-line bg-surface p-4 ${u.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {u.name} {u.id === me.id && <span className="text-xs font-normal text-ink-soft">(vous)</span>}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{u.login}</p>
                  <p className="text-xs text-ink-soft">Dernière connexion : {formatDateTime(u.lastLoginAt, bundle?.settings.timezone)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-strong">
                  {u.active ? roleLabel(u.role) : 'Désactivé'}
                </span>
              </div>
              {editable(u) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    aria-label={`Rôle de ${u.name}`}
                    value={u.role}
                    disabled={busy}
                    onChange={(e) => void run(() => backend.updateUser(u.id, { role: e.target.value as Role }), 'Rôle modifié')}
                    className="min-h-11 rounded-xl border border-line bg-surface px-2 text-sm"
                  >
                    {assignableRoles(me.role).map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" className="min-h-11 text-sm" disabled={busy} onClick={() => setPending({ id: u.id, kind: 'password', value: '' })}>
                    Mot de passe
                  </Button>
                  <Button
                    variant={u.active ? 'ghost' : 'secondary'}
                    className="min-h-11 text-sm"
                    disabled={busy}
                    onClick={() =>
                      u.active
                        ? setPending({ id: u.id, kind: 'deactivate', value: '' })
                        : void run(() => backend.updateUser(u.id, { active: true }), `Compte de ${u.name} réactivé`)
                    }
                  >
                    {u.active ? 'Désactiver' : 'Réactiver'}
                  </Button>
                </div>
              )}
              {pending?.id === u.id && (
                <form
                  className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void confirmPending(u)
                  }}
                >
                  {pending.kind === 'password' ? (
                    <Field
                      label={`Nouveau mot de passe pour ${u.name}`}
                      hint="8 caractères minimum, à communiquer à la personne"
                      autoComplete="off"
                      value={pending.value}
                      onChange={(e) => setPending({ ...pending, value: e.target.value })}
                      required
                      minLength={8}
                    />
                  ) : (
                    <p className="text-sm">{u.name} ne pourra plus se connecter. Vous pourrez réactiver le compte plus tard.</p>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="min-h-11 flex-1 text-sm" onClick={() => setPending(null)}>
                      Annuler
                    </Button>
                    <Button type="submit" variant={pending.kind === 'deactivate' ? 'danger' : 'primary'} className="min-h-11 flex-1 text-sm" busy={busy}>
                      {pending.kind === 'password' ? 'Enregistrer' : 'Désactiver'}
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
