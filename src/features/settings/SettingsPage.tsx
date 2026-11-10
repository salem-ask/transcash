import { useEffect, useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Select, Spinner, Toggle, Field } from '../../components/ui'
import { formatRate } from '../../domain/money'
import { can } from '../../domain/permissions'
import type { RatesBundle, Settings } from '../../domain/types'
import { formatDateTime, WEEKDAYS } from '../../lib/format'

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
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
    </div>
  )
}
