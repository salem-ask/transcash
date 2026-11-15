import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Select, Spinner, Toggle, Field } from '../../components/ui'
import { formatRate } from '../../domain/money'
import { todayIn } from '../../domain/fleet'
import { can } from '../../domain/permissions'
import type { RatesBundle, Settings } from '../../domain/types'
import { formatDateTime, WEEKDAYS } from '../../lib/format'
import { useSync } from '../../lib/useSync'
import type { ResetScope } from '../../data/backend'

const TIMEZONES = [
  { id: 'Africa/Kinshasa', label: 'Kinshasa (UTC+1)' },
  { id: 'Africa/Lubumbashi', label: 'Lubumbashi (UTC+2)' },
]

export function SettingsPage() {
  const { session, bundle, setBundle } = useSession()
  const role = session?.user?.role
  const canEdit = can(role, 'settings.edit')
  const canRate = can(role, 'rates.edit')

  const [rates, setRates] = useState<RatesBundle | null>(null)
  const [manual, setManual] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [modeDraft, setModeDraft] = useState<'fixed' | 'free'>(bundle?.settings.paymentMode ?? 'fixed')
  const [modeFrom, setModeFrom] = useState(todayIn(bundle?.settings.timezone ?? 'Africa/Kinshasa'))
  // Réinitialisation : étape 1 = choix, étape 2 = mot « supprimer »
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)
  const [resetScope, setResetScope] = useState<ResetScope>('operations')
  const [resetWord, setResetWord] = useState('')
  const sync = useSync()

  useEffect(() => {
    backend.listRates().then(setRates, (e) => setMsg({ kind: 'error', text: e.message }))
  }, [bundle?.settings.rateMode])

  if (!bundle) return <Spinner />
  const s = bundle.settings
  const tz = s.timezone

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key)
    setMsg(null)
    try {
      await action()
      setMsg({ kind: 'success', text: success })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const update = (patch: Partial<Settings>) =>
    run('settings', async () => setBundle(await backend.updateSettings(patch)), 'Paramètres enregistrés')

  const syncRates = (r: RatesBundle) => {
    setRates(r)
    setBundle({ ...bundle, rate: r.current })
  }

  function saveManual(e: FormEvent) {
    e.preventDefault()
    const value = Number(manual.replace(/\s/g, '').replace(',', '.'))
    void run('manual', async () => {
      syncRates(await backend.addManualRate(value))
      setManual('')
    }, 'Taux manuel enregistré')
  }

  async function downloadBackup() {
    const data = await backend.backup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcash-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const toggleRest = (d: number) =>
    update({ restWeekdays: s.restWeekdays.includes(d) ? s.restWeekdays.filter((x) => x !== d) : [...s.restWeekdays, d] })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Paramètres</h1>
      {!canEdit && <Alert kind="info">Consultation seule : seuls les administrateurs peuvent modifier les paramètres.</Alert>}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Devise">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Devise principale">
            {(['CDF', 'USD'] as const).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={s.baseCurrency === c}
                disabled={!canEdit || busy !== null}
                onClick={() => update({ baseCurrency: c })}
                className={`min-h-14 rounded-xl border-2 px-3 text-left disabled:cursor-not-allowed ${
                  s.baseCurrency === c ? 'border-brand bg-brand/10' : 'border-line'
                }`}
              >
                <span className="block font-semibold">{c === 'CDF' ? 'Franc congolais' : 'Dollar américain'}</span>
                <span className="text-xs text-ink-soft">{c === 'CDF' ? 'CDF · FC' : 'USD · $'}</span>
              </button>
            ))}
          </div>
          <Toggle
            label={`Afficher l'équivalent en ${s.secondaryCurrency}`}
            checked={s.showEquivalent}
            disabled={!canEdit || busy !== null}
            onChange={(v) => update({ showEquivalent: v })}
          />
        </div>
      </Card>

      <Card title="Taux de change">
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-soft">Taux appliqué</p>
            {rates?.current ? (
              <>
                <p className="text-2xl font-bold tabular-nums">{formatRate(rates.current.rate)}</p>
                <p className="text-xs text-ink-soft">
                  {rates.current.source === 'auto' ? 'Automatique' : 'Manuel'} · {formatDateTime(rates.current.createdAt, tz)}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-soft">Aucun taux pour le moment</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode du taux">
            {(['auto', 'manual'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={s.rateMode === m}
                disabled={!canEdit || busy !== null}
                onClick={() => update({ rateMode: m })}
                className={`min-h-14 rounded-xl border-2 px-3 text-left disabled:cursor-not-allowed ${
                  s.rateMode === m ? 'border-brand bg-brand/10' : 'border-line'
                }`}
              >
                <span className="block font-semibold">{m === 'auto' ? 'Automatique' : 'Manuel'}</span>
                <span className="text-xs text-ink-soft">{m === 'auto' ? 'Mis à jour depuis internet' : 'Fixé par vous'}</span>
              </button>
            ))}
          </div>

          {canRate && (
            <>
              <form onSubmit={saveManual} className="flex items-end gap-2">
                <div className="flex-1">
                  <Field
                    label="Nouveau taux manuel (FC pour 1 $)"
                    inputMode="decimal"
                    placeholder="Ex. 2850"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" busy={busy === 'manual'} disabled={busy !== null}>
                  Enregistrer
                </Button>
              </form>
              {s.rateMode === 'auto' && (
                <Button
                  variant="secondary"
                  className="w-full"
                  busy={busy === 'refresh'}
                  disabled={busy !== null}
                  onClick={() => run('refresh', async () => syncRates(await backend.refreshRate()), 'Taux automatique mis à jour')}
                >
                  Actualiser le taux automatique
                </Button>
              )}
              {s.rateMode === 'auto' && (
                <p className="text-xs text-ink-soft">
                  En mode automatique, un taux manuel est conservé dans l'historique mais n'est pas appliqué.
                </p>
              )}
            </>
          )}

          {rates && rates.history.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer py-2 font-medium text-brand">Historique des taux</summary>
              <ul className="divide-y divide-line">
                {rates.history.map((r) => (
                  <li key={r.id} className="flex justify-between py-2">
                    <span className="tabular-nums">{formatRate(r.rate)}</span>
                    <span className="text-ink-soft">
                      {r.source === 'auto' ? 'Auto' : 'Manuel'} · {formatDateTime(r.createdAt, tz)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      {can(role, 'backup.download') && (
        <Card title="Sauvegarde">
          <p className="text-sm text-ink-soft">
            Télécharge toutes les données de l'entreprise (engins, chauffeurs, versements, dépenses, caisse, journal…) dans un fichier à garder en lieu sûr.
            Les mots de passe ne sont pas inclus. Hostinger fait aussi ses propres sauvegardes automatiques.
          </p>
          <Button variant="secondary" className="mt-3 w-full" busy={busy === 'backup'} disabled={busy !== null} onClick={() => run('backup', downloadBackup, 'Sauvegarde téléchargée')}>
            Télécharger une sauvegarde
          </Button>
        </Card>
      )}

      <Card title="Mode de versement">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de versement">
            {(['fixed', 'free'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modeDraft === m}
                disabled={!canEdit || busy !== null}
                onClick={() => setModeDraft(m)}
                className={`min-h-14 rounded-xl border-2 px-3 text-left disabled:cursor-not-allowed ${modeDraft === m ? 'border-brand bg-brand/10' : 'border-line'}`}
              >
                <span className="block font-semibold">{m === 'fixed' ? 'Montant fixe' : 'Montant libre'}</span>
                <span className="text-xs text-ink-soft">{m === 'fixed' ? 'Dette si un jour n’est pas payé' : 'On saisit ce qui est versé, sans dette'}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-soft">
            {(s.paymentMode ?? 'fixed') === 'free'
              ? `Montant libre en vigueur${s.paymentModeFrom ? ` depuis le ${s.paymentModeFrom.split('-').reverse().join('/')}` : ''} : le montant journalier des engins n'est qu'un objectif indicatif ; aucun jour non payé ne crée de dette.`
              : 'Montant fixe en vigueur : chaque jour travaillé non payé devient une dette.'}
            {s.nextPaymentMode && ` Changement prévu le ${s.nextPaymentMode.from.split('-').reverse().join('/')} : ${s.nextPaymentMode.mode === 'free' ? 'montant libre' : 'montant fixe'}.`}
          </p>
          {canEdit && modeDraft !== (s.paymentMode ?? 'fixed') && (
            <div className="space-y-3 rounded-xl bg-surface-2 p-3">
              <Field label="À partir du" type="date" value={modeFrom} onChange={(e) => setModeFrom(e.target.value)} required />
              <p className="text-xs text-ink-soft">Les jours d'avant gardent leurs règles : les dettes déjà dues ne disparaissent pas.</p>
              <Button
                className="w-full"
                busy={busy === 'settings'}
                disabled={busy !== null || !modeFrom}
                onClick={() => update({ paymentMode: modeDraft, paymentModeFrom: modeFrom })}
              >
                Passer en {modeDraft === 'free' ? 'montant libre' : 'montant fixe'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Général">
        <div className="space-y-4">
          <Select label="Fuseau horaire" value={s.timezone} disabled={!canEdit || busy !== null} onChange={(e) => update({ timezone: e.target.value })}>
            {TIMEZONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
          <div>
            <p className="mb-1 text-sm font-medium text-ink-soft">Jours de repos habituels</p>
            <p className="mb-2 text-xs text-ink-soft">Aucun versement n'est attendu ces jours-là (modifiable ensuite par engin).</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((label, d) => (
                <button
                  key={d}
                  aria-pressed={s.restWeekdays.includes(d)}
                  disabled={!canEdit || busy !== null}
                  onClick={() => toggleRest(d)}
                  className={`min-h-11 rounded-full border px-4 text-sm disabled:cursor-not-allowed ${
                    s.restWeekdays.includes(d) ? 'border-brand bg-brand text-white' : 'border-line'
                  }`}
                >
                  {label.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
      {can(role, 'data.reset') && (
        <Card title="Réinitialisation">
          {resetStep === 0 && (
            <>
              <p className="text-sm text-ink-soft">Efface les données pour repartir à zéro. Une sauvegarde complète est faite avant, sur cet appareil et sur le serveur.</p>
              <Button variant="ghost" className="mt-3 w-full text-danger" disabled={busy !== null} onClick={() => { setResetStep(1); setMsg(null) }}>
                Tout réinitialiser…
              </Button>
            </>
          )}
          {resetStep === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Étape 1 sur 2 : que faut-il effacer ?</p>
              <div className="grid gap-2" role="radiogroup" aria-label="Que faut-il effacer">
                {([
                  ['operations', 'Les opérations seulement', 'Versements, dépenses, caisse, journées repos/panne, immobilisations, échéances et journal. Engins, chauffeurs, équipe et paramètres sont gardés.'],
                  ['all', 'Tout', 'Les opérations, plus les engins, les chauffeurs et les comptes de l’équipe. Il reste l’entreprise, les paramètres et votre compte.'],
                ] as const).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={resetScope === id}
                    onClick={() => setResetScope(id)}
                    className={`rounded-xl border-2 p-3 text-left ${resetScope === id ? 'border-danger bg-danger/10' : 'border-line'}`}
                  >
                    <span className="block font-semibold">{label}</span>
                    <span className="text-xs text-ink-soft">{hint}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setResetStep(0)}>Retour</Button>
                <Button variant="danger" className="flex-1" onClick={() => { setResetWord(''); setResetStep(2) }}>Continuer</Button>
              </div>
            </div>
          )}
          {resetStep === 2 && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void run('reset', async () => {
                  await downloadBackup()
                  await backend.resetData(resetScope, resetWord)
                  setResetStep(0)
                  setResetWord('')
                  window.scrollTo(0, 0)
                }, `Données réinitialisées (${resetScope === 'all' ? 'tout' : 'opérations'}). Une sauvegarde a été téléchargée sur cet appareil et une copie est gardée sur le serveur.`)
              }}
            >
              <p className="text-sm font-medium">Étape 2 sur 2 : confirmation</p>
              <Alert>
                {resetScope === 'all'
                  ? 'Tout va être effacé : opérations, engins, chauffeurs et comptes de l’équipe.'
                  : 'Toutes les opérations vont être effacées : versements, dépenses, caisse, journées, immobilisations, échéances et journal.'}
                {' '}Cette action ne peut pas être annulée depuis l'application.
              </Alert>
              {(sync.pending.length > 0 || !sync.online) && (
                <Alert kind="info">
                  {!sync.online ? 'Pas de connexion : la réinitialisation demande le réseau.' : `${sync.pending.length} opération(s) attendent d'être envoyées : patientez avant de réinitialiser.`}
                </Alert>
              )}
              <Field
                label="Pour confirmer, tapez le mot « supprimer »"
                value={resetWord}
                onChange={(e) => setResetWord(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" disabled={busy !== null} onClick={() => setResetStep(0)}>Annuler</Button>
                <Button
                  type="submit"
                  variant="danger"
                  className="flex-1"
                  busy={busy === 'reset'}
                  disabled={busy !== null || resetWord.trim().toLowerCase() !== 'supprimer' || sync.pending.length > 0 || !sync.online}
                >
                  Effacer
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  )
}
