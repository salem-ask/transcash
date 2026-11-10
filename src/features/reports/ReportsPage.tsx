import { useMemo, useState } from 'react'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { Alert, Button, Card, Field, Select, Spinner } from '../../components/ui'
import { EXPENSE_LABEL } from '../../domain/finance'
import { todayIn } from '../../domain/fleet'
import { buildReport, periodPresets, type ReportLine } from '../../domain/report'
import { errorText, useLoad } from '../../lib/useLoad'
import { exportExcel, exportPdf } from './exports'

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className={`rounded-xl p-3 ${tone === 'bad' ? 'bg-danger/10' : tone === 'good' ? 'bg-brand/10' : 'bg-surface-2'}`}>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

/** Barres « attendu / payé » par jour, à l'échelle du plus grand montant attendu. */
function DailyBars({ days }: { days: { date: string; expected: number; paid: number }[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.expected, d.paid)))
  if (days.length === 0) return <p className="text-sm text-ink-soft">Aucune journée sur la période.</p>
  return (
    <div>
      <div className="flex h-36 items-end gap-px overflow-x-auto" role="img" aria-label="Attendu et payé par jour">
        {days.map((d) => (
          <div key={d.date} className="relative flex h-full min-w-2 flex-1 items-end" title={`${d.date} — attendu ${d.expected}, payé ${d.paid}`}>
            <div className="absolute bottom-0 w-full rounded-t-sm bg-line" style={{ height: `${(d.expected / max) * 100}%` }} />
            <div className={`absolute bottom-0 w-full rounded-t-sm ${d.paid >= d.expected ? 'bg-brand' : 'bg-accent'}`} style={{ height: `${(Math.min(d.paid, d.expected || d.paid) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-soft">
        <span>{days[0].date.slice(8)}/{days[0].date.slice(5, 7)}</span>
        <span className="flex gap-3">
          <span><span className="mr-1 inline-block size-2 rounded-sm bg-line" />Attendu</span>
          <span><span className="mr-1 inline-block size-2 rounded-sm bg-brand" />Payé</span>
          <span><span className="mr-1 inline-block size-2 rounded-sm bg-accent" />Partiel</span>
        </span>
        <span>{days[days.length - 1].date.slice(8)}/{days[days.length - 1].date.slice(5, 7)}</span>
      </div>
    </div>
  )
}

function Lines({ items, currency, relatedLabel }: { items: ReportLine[]; currency: 'CDF' | 'USD'; relatedLabel: string }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">Rien sur la période.</p>
  return (
    <ul className="divide-y divide-line">
      {items.map((l) => (
        <li key={l.id} className="py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate font-semibold">{l.name}</p>
            <Money amount={l.profit} currency={currency} className={`items-end text-sm ${l.profit < 0 ? 'text-danger' : ''}`} />
          </div>
          {l.related.length > 0 && <p className="truncate text-xs text-ink-soft">{relatedLabel} : {l.related.join(', ')}</p>}
          <dl className="mt-1 grid grid-cols-3 gap-x-2 text-xs tabular-nums">
            <div><dt className="text-ink-soft">Attendu</dt><dd><Money amount={l.expected} currency={currency} /></dd></div>
            <div><dt className="text-ink-soft">Payé</dt><dd><Money amount={l.paid} currency={currency} /></dd></div>
            <div><dt className="text-ink-soft">Reste dû</dt><dd className={l.remaining ? 'text-danger' : ''}><Money amount={l.remaining} currency={currency} /></dd></div>
            <div><dt className="text-ink-soft">Reçu</dt><dd><Money amount={l.received} currency={currency} /></dd></div>
            <div><dt className="text-ink-soft">Dépenses</dt><dd><Money amount={l.expenses} currency={currency} /></dd></div>
            <div><dt className="text-ink-soft">Jours impayés</dt><dd>{l.unpaidDays}{l.breakdownDays ? ` · ${l.breakdownDays} panne` : ''}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  )
}

/** Rapports : période, tout le parc / un engin / un chauffeur, export PDF et Excel. */
export function ReportsPage() {
  const { session, bundle } = useSession()
  const today = todayIn(bundle!.settings.timezone)
  const presets = periodPresets(today)
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: presets[1].from, to: today })
  const [scope, setScope] = useState('')
  const period = preset === 'custom' ? custom : presets.find((p) => p.id === preset)!
  const { data, error } = useLoad(() => backend.reportData(period.from, period.to), [period.from, period.to])
  const [busy, setBusy] = useState<null | 'pdf' | 'xlsx'>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const report = useMemo(() => {
    if (!data) return null
    const [kind, id] = scope.split(':')
    return buildReport(data, kind === 'v' ? { vehicleId: id } : kind === 'd' ? { driverId: id } : {})
  }, [data, scope])

  async function download(kind: 'pdf' | 'xlsx') {
    if (!report || !data) return
    setBusy(kind)
    setMsg(null)
    try {
      await (kind === 'pdf' ? exportPdf(report, data.ownerName) : exportExcel(report, data.ownerName))
    } catch (e) {
      setMsg(`Export impossible : ${errorText(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const c = bundle!.settings.baseCurrency
  const t = report?.totals

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Rapports</h1>

      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Période">
            {[...presets, { id: 'custom', label: 'Autre période' }].map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} onClick={() => setPreset(p.id)}
                className={`min-h-10 rounded-full border px-3 text-sm ${preset === p.id ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Du" type="date" max={custom.to} value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
              <Field label="Au" type="date" min={custom.from} value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
            </div>
          )}
          <Select label="Rapport sur" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Tout le parc</option>
            {data && data.vehicles.length > 0 && (
              <optgroup label="Un engin">
                {data.vehicles.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.name}{v.status === 'retired' ? ' (retiré)' : ''}</option>)}
              </optgroup>
            )}
            {data && data.drivers.length > 0 && (
              <optgroup label="Un chauffeur">
                {data.drivers.map((d) => <option key={d.id} value={`d:${d.id}`}>{d.name}</option>)}
              </optgroup>
            )}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" busy={busy === 'pdf'} disabled={!report || busy !== null} onClick={() => void download('pdf')}>Télécharger PDF</Button>
            <Button variant="secondary" busy={busy === 'xlsx'} disabled={!report || busy !== null} onClick={() => void download('xlsx')}>Télécharger Excel</Button>
          </div>
          {msg && <Alert>{msg}</Alert>}
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      {!report || !t ? (
        !error && <Spinner />
      ) : (
        <>
          <p className="text-sm text-ink-soft">
            {report.title.replace(/^Rapport — /, '')} · du {period.from.split('-').reverse().join('/')} au {period.to.split('-').reverse().join('/')}
            {session?.ownerName ? ` · ${session.ownerName}` : ''}
          </p>
          {report.missingRate && <Alert>Taux de change manquant : certains montants dans l'autre devise sont comptés à zéro.</Alert>}

          <Card title="Résumé">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Attendu"><Money amount={t.expected} currency={c} /></Stat>
              <Stat label="Payé pour ces jours"><Money amount={t.paid} currency={c} /></Stat>
              <Stat label="Reste dû" tone={t.remaining ? 'bad' : undefined}><Money amount={t.remaining} currency={c} className={t.remaining ? 'text-danger' : ''} /></Stat>
              <Stat label="Recouvrement">
                <span className="text-xl font-bold">{t.collectionRate === null ? '—' : `${Math.round(t.collectionRate * 100)} %`}</span>
              </Stat>
              <Stat label="Versements reçus"><Money amount={t.received} currency={c} /></Stat>
              <Stat label="Dépenses"><Money amount={t.expenses} currency={c} /></Stat>
            </div>
            <div className={`mt-2 flex items-center justify-between rounded-xl p-3 ${t.profit < 0 ? 'bg-danger/10' : 'bg-brand/10'}`}>
              <span className="font-medium">Bénéfice réel</span>
              <Money amount={t.profit} currency={c} large className={`items-end ${t.profit < 0 ? 'text-danger' : 'text-brand-strong'}`} />
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              {t.dueDays} journées dues, {t.unpaidDays} impayées ou partielles, {t.breakdownDays} de panne, {t.restDays} de repos.
              {t.receivedDriverExpenses > 0 && ' Les versements reçus comprennent les dépenses payées par les chauffeurs.'}
            </p>
          </Card>

          <Card title="Jour par jour"><DailyBars days={report.daily} /></Card>

          {!scope.startsWith('v:') && <Card title="Par engin"><Lines items={report.byVehicle} currency={c} relatedLabel="Chauffeurs" /></Card>}
          {!scope.startsWith('d:') && <Card title="Par chauffeur"><Lines items={report.byDriver} currency={c} relatedLabel="Engins" /></Card>}

          {report.expensesByCategory.length > 0 && (
            <Card title="Dépenses par catégorie">
              <ul className="space-y-2">
                {report.expensesByCategory.map((e) => (
                  <li key={e.category}>
                    <div className="flex justify-between text-sm">
                      <span>{EXPENSE_LABEL[e.category]}</span>
                      <Money amount={e.amount} currency={c} className="items-end" />
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-brand" style={{ width: `${(e.amount / Math.max(1, t.expenses)) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
