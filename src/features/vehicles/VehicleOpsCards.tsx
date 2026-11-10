// Fiche engin, phase 4 : bilan du mois, immobilisations (pannes longues), échéances.
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { Money, MoneyTotals } from '../../components/Money'
import { Alert, Button, ButtonLink, Card, Field, Segmented, Spinner } from '../../components/ui'
import { REMINDER_LABEL, reminderName, type ReminderKind } from '../../domain/finance'
import { addDays, daysBetween, formatDay } from '../../domain/fleet'
import type { Reminder, Vehicle, VehicleBreakdown } from '../../domain/types'
import { msgOf, useLoad } from '../../lib/useLoad'

type Msg = { kind: 'error' | 'success' | 'info'; text: string } | null

/** Versements, dépenses et bénéfice du mois pour cet engin. */
export function VehicleFinanceCard({ vehicle, canExpense }: { vehicle: Vehicle; canExpense: boolean }) {
  const { data, error } = useLoad(() => backend.vehicleFinance(vehicle.id), [vehicle.id])
  if (error) return <Alert>{error}</Alert>
  return (
    <Card title="Ce mois-ci" action={canExpense ? <Link to={`/depenses/nouvelle?engin=${vehicle.id}`} className="text-sm font-medium text-brand">+ Dépense</Link> : undefined}>
      {!data ? (
        <Spinner />
      ) : data.revenue === null || data.expenses === null ? (
        <Alert>Taux de change manquant pour convertir certains montants.</Alert>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-soft">Versements</p>
            <Money amount={data.revenue} currency={data.currency} />
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-soft">Dépenses</p>
            <Money amount={data.expenses} currency={data.currency} />
          </div>
          <div className={`rounded-xl p-3 ${(data.profit ?? 0) < 0 ? 'bg-danger/10' : 'bg-brand/10'}`}>
            <p className="text-xs text-ink-soft">Bénéfice réel</p>
            <Money amount={data.profit ?? 0} currency={data.currency} className={(data.profit ?? 0) < 0 ? 'text-danger' : 'text-brand-strong'} />
          </div>
        </div>
      )}
    </Card>
  )
}

/** Immobilisations : déclarer une panne longue, remettre en service, historique avec coût des réparations. */
export function BreakdownsCard({ vehicle, today, canEdit, canExpense, onChange }: { vehicle: Vehicle; today: string; canEdit: boolean; canExpense: boolean; onChange?: () => void }) {
  const { data, error, setData } = useLoad(() => backend.listBreakdowns(vehicle.id), [vehicle.id])
  const [panel, setPanel] = useState<null | 'new' | { end: VehicleBreakdown } | { cancel: VehicleBreakdown }>(null)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Card title="Immobilisations"><Spinner /></Card>
  const live = data.filter((b) => !b.cancelled)
  const current = live.find((b) => b.startDate <= today && (b.endDate === null || b.endDate >= today))

  async function run(action: () => Promise<VehicleBreakdown[]>, success: string) {
    setBusy(true)
    setMsg(null)
    try {
      setData(await action())
      setPanel(null)
      setMsg({ kind: 'success', text: success })
      onChange?.()
    } catch (e) {
      setMsg(msgOf(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (panel === 'new') void run(() => backend.createBreakdown(vehicle.id, { startDate: start, endDate: end || null, reason }), 'Immobilisation enregistrée : aucun versement exigé sur cette période')
    else if (panel && 'end' in panel) void run(() => backend.updateBreakdown(panel.end.id, { endDate: end }), `Remis en service : dernier jour d'immobilisation le ${formatDay(end)}`)
    else if (panel && 'cancel' in panel) void run(() => backend.cancelBreakdown(panel.cancel.id, reason), 'Immobilisation annulée')
  }

  return (
    <Card title="Immobilisations">
      {current ? (
        <div className="rounded-xl bg-danger/10 p-3">
          <p className="font-semibold text-danger">Immobilisé depuis le {formatDay(current.startDate)}</p>
          <p className="text-sm">{current.reason}{current.endDate ? ` · jusqu'au ${formatDay(current.endDate)}` : ''}</p>
          <p className="text-xs text-ink-soft">Aucun versement n'est exigé pendant l'immobilisation.</p>
          {canEdit && panel === null && (
            <div className="mt-2 flex flex-wrap gap-2">
              {current.endDate === null && (
                <Button onClick={() => { setMsg(null); setEnd(addDays(today, -1) >= current.startDate ? addDays(today, -1) : current.startDate); setPanel({ end: current }) }}>
                  Remettre en service
                </Button>
              )}
              {canExpense && <ButtonLink to={`/depenses/nouvelle?engin=${vehicle.id}&immobilisation=${current.id}`}>+ Réparation</ButtonLink>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-soft">En service.</p>
      )}
      {msg && <div className="mt-2"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      {canEdit && panel === null && !current && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => { setMsg(null); setStart(today); setEnd(''); setReason(''); setPanel('new') }}>
          Déclarer une immobilisation (panne)
        </Button>
      )}

      {panel !== null && (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
          {panel === 'new' && (
            <>
              <Field label="Cause" placeholder="Ex. moteur, accident, boîte de vitesses" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={255} />
              <Field label="Premier jour immobilisé" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
              <Field label="Dernier jour (si déjà connu)" hint="Laissez vide si l'engin est encore au garage" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
            </>
          )}
          {panel !== 'new' && 'end' in panel && (
            <Field label="Dernier jour d'immobilisation" hint="Le versement redevient exigé le lendemain" type="date" min={panel.end.startDate} value={end} onChange={(e) => setEnd(e.target.value)} required />
          )}
          {panel !== 'new' && 'cancel' in panel && (
            <Field label="Motif de l'annulation" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={255} />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setPanel(null)}>Fermer</Button>
            <Button type="submit" variant={panel !== 'new' && 'cancel' in panel ? 'danger' : 'primary'} className="flex-1" busy={busy}>Enregistrer</Button>
          </div>
        </form>
      )}

      {data.length > 0 && (
        <details className="mt-3 text-sm" open={!current && live.length > 0}>
          <summary className="cursor-pointer py-1 font-medium text-brand">Historique ({data.length})</summary>
          <ul className="divide-y divide-line">
            {data.map((b) => (
              <li key={b.id} className={`flex items-start justify-between gap-3 py-2 ${b.cancelled ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className={`font-medium ${b.cancelled ? 'line-through' : ''}`}>{b.reason}</p>
                  <p className="text-xs text-ink-soft">
                    {formatDay(b.startDate)} → {b.endDate ? formatDay(b.endDate) : 'en cours'}
                    {b.endDate && ` · ${daysBetween(b.startDate, b.endDate)} j`}
                    {b.cancelled && ` · annulée (${b.cancelReason})`}
                  </p>
                  {Object.keys(b.expenses).length > 0 && (
                    <p className="text-xs">Réparations : <MoneyTotals totals={b.expenses} className="!inline-flex !flex-row items-baseline gap-1" /></p>
                  )}
                </div>
                {canEdit && !b.cancelled && panel === null && (
                  <button type="button" className="shrink-0 text-xs text-danger" onClick={() => { setMsg(null); setReason(''); setPanel({ cancel: b }) }}>
                    Annuler
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

const KINDS = Object.keys(REMINDER_LABEL) as ReminderKind[]
const STATE_STYLE: Record<Reminder['state'], string> = {
  overdue: 'bg-danger/15 text-danger',
  soon: 'bg-accent/25 text-ink',
  later: 'bg-surface-2 text-ink-soft',
  done: 'bg-brand/15 text-brand-strong',
}

export function ReminderPill({ r, today }: { r: Reminder; today: string }) {
  const days = r.dueDate >= today ? daysBetween(today, r.dueDate) - 1 : -(daysBetween(r.dueDate, today) - 1)
  const text = r.state === 'done' ? 'Fait' : days < 0 ? `En retard de ${-days} j` : days === 0 ? "Aujourd'hui" : `Dans ${days} j`
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[r.state]}`}>{text}</span>
}

/** Échéances de l'engin : ajouter, renouveler (fait + prochaine date), supprimer. */
export function RemindersCard({ vehicle, canEdit }: { vehicle: Vehicle; canEdit: boolean }) {
  const { data, error, setData } = useLoad(() => backend.listReminders(vehicle.id), [vehicle.id])
  const [adding, setAdding] = useState(false)
  const [renew, setRenew] = useState<Reminder | null>(null)
  const [kind, setKind] = useState<ReminderKind>('insurance')
  const [label, setLabel] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notifyDays, setNotifyDays] = useState('7')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const [showDone, setShowDone] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Card title="Échéances"><Spinner /></Card>

  async function run(action: () => Promise<{ today: string; reminders: Reminder[] }>, success: string) {
    setBusy(true)
    setMsg(null)
    try {
      setData(await action())
      setAdding(false)
      setRenew(null)
      setMsg({ kind: 'success', text: success })
    } catch (e) {
      setMsg(msgOf(e))
    } finally {
      setBusy(false)
    }
  }

  const todo = data.reminders.filter((r) => r.state !== 'done')
  const done = data.reminders.filter((r) => r.state === 'done')

  return (
    <Card title="Échéances" action={canEdit && !adding ? <button type="button" className="text-sm font-medium text-brand" onClick={() => { setMsg(null); setAdding(true) }}>+ Ajouter</button> : undefined}>
      {msg && <div className="mb-2"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {adding && (
        <form
          className="mb-3 space-y-3 rounded-xl bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => backend.createReminder(vehicle.id, { kind, label, dueDate, notifyDays: Number(notifyDays) || 0 }), 'Échéance ajoutée')
          }}
        >
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type d'échéance">
            {KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={`min-h-10 rounded-full border px-3 text-sm ${kind === k ? 'border-brand bg-brand text-white' : 'border-line bg-surface'}`}>
                {REMINDER_LABEL[k]}
              </button>
            ))}
          </div>
          {kind === 'other' && <Field label="Nom" placeholder="Ex. extincteur, licence de transport" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={100} />}
          <Field label="Date limite" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          <Field label="Prévenir combien de jours avant ?" inputMode="numeric" value={notifyDays} onChange={(e) => setNotifyDays(e.target.value)} required />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setAdding(false)}>Fermer</Button>
            <Button type="submit" className="flex-1" busy={busy}>Ajouter</Button>
          </div>
        </form>
      )}
      {todo.length === 0 ? (
        <p className="text-sm text-ink-soft">Aucune échéance à venir. Ajoutez l'assurance, la vignette, la vidange…</p>
      ) : (
        <ul className="divide-y divide-line">
          {todo.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{reminderName(r)}</p>
                  <p className="text-xs text-ink-soft">{formatDay(r.dueDate)}</p>
                </div>
                <ReminderPill r={r} today={data.today} />
              </div>
              {canEdit && renew?.id !== r.id && (
                <div className="mt-1 flex gap-4 text-sm">
                  <button type="button" className="font-medium text-brand" onClick={() => { setMsg(null); setNext(''); setRenew(r) }}>Fait / renouvelé</button>
                  <button type="button" className="text-ink-soft" onClick={() => void run(() => backend.cancelReminder(r.id), 'Échéance supprimée')}>Supprimer</button>
                </div>
              )}
              {renew?.id === r.id && (
                <form
                  className="mt-2 space-y-2 rounded-xl bg-surface-2 p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(() => backend.doneReminder(r.id, next || undefined), next ? `Renouvelé : prochaine échéance le ${formatDay(next)}` : 'Marqué comme fait')
                  }}
                >
                  <Segmented
                    label="Prochaine échéance"
                    value={next === '' ? 'none' : 'date'}
                    onChange={(v) => setNext(v === 'none' ? '' : addDays(r.dueDate, r.kind === 'oil_change' ? 90 : 365))}
                    options={[{ id: 'date', label: 'Programmer la suivante' }, { id: 'none', label: 'Aucune' }]}
                  />
                  {next && <Field label="Date de la prochaine" type="date" value={next} onChange={(e) => setNext(e.target.value)} required />}
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setRenew(null)}>Fermer</Button>
                    <Button type="submit" className="flex-1" busy={busy}>Valider</Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <button type="button" className="mt-2 text-sm font-medium text-brand" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Masquer' : 'Voir'} les échéances faites ({done.length})
        </button>
      )}
      {showDone && (
        <ul className="divide-y divide-line text-sm">
          {done.map((r) => (
            <li key={r.id} className="flex justify-between py-2 text-ink-soft">
              <span>{reminderName(r)} · {formatDay(r.dueDate)}</span>
              <span>fait le {formatDay(r.doneAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
