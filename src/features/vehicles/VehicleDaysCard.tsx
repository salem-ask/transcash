// Vue par engin : journées récentes (chauffeur, attendu, payé) et marquage repos / panne / montant exceptionnel.
import { useState, type FormEvent } from 'react'
import { backend } from '../../data'
import { Alert, Button, Card, Field, Segmented, Spinner } from '../../components/ui'
import { DAY_KIND_LABEL, PAY_STATE_LABEL } from '../../domain/ledger'
import { DECIMALS, formatMoney, parseAmount } from '../../domain/money'
import type { Currency, Vehicle, VehicleDay } from '../../domain/types'
import { msgOf, useLoad } from '../../lib/useLoad'

type MarkChoice = 'normal' | 'rest' | 'breakdown' | 'override'

const STYLE: Record<string, string> = {
  paid: 'bg-brand/15 text-brand-strong',
  partial: 'bg-accent/25 text-ink',
  unpaid: 'bg-danger/15 text-danger',
  breakdown: 'bg-danger/10 text-danger',
  other: 'bg-surface-2 text-ink-soft',
}

function label(d: VehicleDay): [string, string] {
  if (d.kind === 'due') return [PAY_STATE_LABEL[d.state], STYLE[d.state] ?? STYLE.other]
  if (d.kind === 'no_driver') return ['Sans chauffeur', STYLE.other]
  return [DAY_KIND_LABEL[d.kind], d.kind === 'breakdown' ? STYLE.breakdown : STYLE.other]
}

export function VehicleDaysCard({ vehicle, canMark }: { vehicle: Vehicle; canMark: boolean }) {
  const { data, error, setData } = useLoad(() => backend.vehicleDays(vehicle.id), [vehicle.id])
  const [editing, setEditing] = useState<VehicleDay | null>(null)
  const [choice, setChoice] = useState<MarkChoice>('normal')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(vehicle.currency)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Card title="Journées"><Spinner /></Card>

  function open(d: VehicleDay) {
    setMsg(null)
    setEditing(d)
    setChoice(d.mark ? (d.mark.kind as MarkChoice) : 'normal')
    const c = d.mark?.currency ?? vehicle.currency
    setCurrency(c)
    setAmount(d.mark?.amount ? (d.mark.amount / 10 ** DECIMALS[c]).toString().replace('.', ',') : '')
    setReason(d.mark?.reason ?? '')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const parsed = choice === 'override' ? parseAmount(amount, currency) : null
    if (choice === 'override' && !parsed) return setMsg({ kind: 'error', text: 'Montant invalide' })
    setBusy(true)
    setMsg(null)
    try {
      setData(
        await backend.markDay(vehicle.id, {
          date: editing.date,
          kind: choice === 'normal' ? 'clear' : choice,
          amount: parsed ?? undefined,
          currency: choice === 'override' ? currency : undefined,
          reason: reason || undefined,
        }),
      )
      setEditing(null)
      setMsg({ kind: 'success', text: 'Journée mise à jour' })
    } catch (err) {
      setMsg(msgOf(err))
    } finally {
      setBusy(false)
    }
  }

  const visible = showAll ? data.days : data.days.filter((d) => d.date <= data.today).slice(0, 10)
  const upcoming = data.days.filter((d) => d.date > data.today)

  return (
    <Card title="Journées">
      {canMark && <p className="mb-2 text-xs text-ink-soft">Touchez une journée pour la marquer « repos », « panne » ou changer son montant à titre exceptionnel.</p>}
      {msg && <div className="mb-2"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      <ul className="divide-y divide-line">
        {visible.map((d) => {
          const [text, style] = label(d)
          const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))
          const isEditing = editing?.date === d.date
          const row = (
            <>
              <span className="w-24 shrink-0 text-sm font-medium capitalize">{d.date === data.today ? "Aujourd'hui" : weekday}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate">{d.driver?.name ?? '—'}</span>
                <span className="block truncate text-xs text-ink-soft">
                  {d.kind === 'due'
                    ? `${formatMoney(d.paid, d.currency)} / ${formatMoney(d.expected, d.currency)}${d.mark?.kind === 'override' ? ' · exceptionnel' : ''}`
                    : (d.mark?.reason ?? '')}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{text}</span>
            </>
          )
          return (
            <li key={d.date}>
              {canMark ? (
                <button type="button" onClick={() => (isEditing ? setEditing(null) : open(d))} className={`flex w-full items-center gap-3 py-2 text-left hover:bg-surface-2 ${isEditing ? 'bg-surface-2' : ''}`}>
                  {row}
                </button>
              ) : (
                <div className="flex items-center gap-3 py-2">{row}</div>
              )}
              {isEditing && (
                <form onSubmit={save} className="mb-2 space-y-3 rounded-xl bg-surface-2 p-3">
                  <Segmented
                    label="Cette journée est"
                    value={choice}
                    onChange={setChoice}
                    options={[
                      { id: 'normal', label: 'Normale' },
                      { id: 'rest', label: 'Repos' },
                      { id: 'breakdown', label: 'Panne' },
                      { id: 'override', label: 'Autre montant' },
                    ]}
                  />
                  {choice === 'override' && (
                    <>
                      <Segmented label="Devise" value={currency} onChange={setCurrency} options={[{ id: 'CDF', label: 'FC' }, { id: 'USD', label: '$' }]} />
                      <Field label="Montant attendu ce jour-là" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                    </>
                  )}
                  {choice !== 'normal' && (
                    <Field
                      label={choice === 'override' ? 'Raison' : 'Raison (facultatif)'}
                      placeholder={choice === 'breakdown' ? 'Ex. embrayage, crevaison' : choice === 'rest' ? 'Ex. jour férié' : 'Ex. demi-journée'}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required={choice === 'override'}
                      maxLength={255}
                    />
                  )}
                  <p className="text-xs text-ink-soft">
                    {choice === 'rest' || choice === 'breakdown'
                      ? 'Aucun versement ne sera exigé ce jour-là : pas de dette.'
                      : choice === 'override'
                        ? "Ce montant remplace le versement habituel pour ce seul jour (même si c'est un jour de repos)."
                        : 'Le montant habituel et les jours de repos normaux s’appliquent.'}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
                      Fermer
                    </Button>
                    <Button type="submit" className="flex-1" busy={busy}>
                      Enregistrer
                    </Button>
                  </div>
                </form>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" className="mt-2 text-sm font-medium text-brand" onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Afficher moins' : `Tout afficher (30 derniers jours et ${upcoming.length} à venir)`}
      </button>
    </Card>
  )
}
