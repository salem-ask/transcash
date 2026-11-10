import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, Button, Card, Field, Segmented, Spinner } from '../../components/ui'
import { EXPENSE_LABEL } from '../../domain/finance'
import { addDays, formatDay, todayIn } from '../../domain/fleet'
import { DECIMALS, formatMoney, parseAmount } from '../../domain/money'
import { METHOD_LABEL, receiptNumber } from '../../domain/receipt'
import type { CashLine, CashMovement, Currency } from '../../domain/types'
import { errorText, useLoad } from '../../lib/useLoad'

const ENTRY_LABEL: Record<CashLine['type'], string> = {
  payment: 'Versement',
  expense: 'Dépense',
  withdrawal: 'Retrait du propriétaire',
  deposit: 'Apport',
}

/** Caisse unique : solde en FC et en $, entrées et sorties, retraits et apports du propriétaire. */
export function CashPage() {
  const { bundle } = useSession()
  const today = todayIn(bundle!.settings.timezone)
  const [days, setDays] = useState(30)
  const from = addDays(today, -days + 1)
  const { data, error, setData } = useLoad(() => backend.getCash(from, today), [from])
  const [form, setForm] = useState<null | { id: string; kind: 'withdrawal' | 'deposit'; amount: string; currency: Currency; movedOn: string; note: string; editing: boolean }>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Spinner />

  const openNew = (kind: 'withdrawal' | 'deposit') => {
    setMsg(null)
    setForm({ id: crypto.randomUUID(), kind, amount: '', currency: bundle!.settings.baseCurrency, movedOn: today, note: '', editing: false })
  }
  const openEdit = (m: CashMovement) => {
    setMsg(null)
    setForm({ id: m.id, kind: m.kind, amount: (m.amount / 10 ** DECIMALS[m.currency]).toString().replace('.', ','), currency: m.currency, movedOn: m.movedOn, note: m.note ?? '', editing: true })
  }

  async function run(action: () => Promise<typeof data>, success: string) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await action()
      // Recharger la période affichée (le serveur renvoie la période par défaut)
      setData(r && r.from === from ? r : await backend.getCash(from, today))
      setForm(null)
      setCancelId(null)
      setReason('')
      setMsg({ kind: 'success', text: success })
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const amount = parseAmount(form.amount, form.currency)
    if (!amount) return setMsg({ kind: 'error', text: 'Montant invalide' })
    const input = { id: form.id, kind: form.kind, amount, currency: form.currency, movedOn: form.movedOn, note: form.note }
    void run(
      () => (form.editing ? backend.updateMovement(form.id, input) : backend.createMovement(input)),
      form.editing ? 'Mouvement modifié' : form.kind === 'withdrawal' ? 'Retrait enregistré' : 'Apport enregistré',
    )
  }

  const movementsById = new Map(data.movements.map((m) => [m.id, m]))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Caisse</h1>

      <div className="grid grid-cols-2 gap-2">
        {(['CDF', 'USD'] as const).map((c) => (
          <section key={c} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">Solde {c === 'CDF' ? 'francs' : 'dollars'}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${data.balance[c] < 0 ? 'text-danger' : ''}`}>{formatMoney(data.balance[c], c)}</p>
          </section>
        ))}
      </div>
      {(data.balance.CDF < 0 || data.balance.USD < 0) && (
        <Alert>Solde négatif : il manque probablement un apport (solde initial) ou un versement non saisi.</Alert>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => openNew('withdrawal')}>− Retrait</Button>
        <Button variant="secondary" onClick={() => openNew('deposit')}>+ Apport</Button>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {form && (
        <Card title={form.editing ? 'Modifier le mouvement' : form.kind === 'withdrawal' ? 'Retrait du propriétaire' : 'Apport (ex. solde initial)'}>
          <form onSubmit={save} className="space-y-3">
            {form.editing && (
              <Segmented label="Type" value={form.kind} onChange={(k) => setForm({ ...form, kind: k })} options={[{ id: 'withdrawal', label: 'Retrait' }, { id: 'deposit', label: 'Apport' }]} />
            )}
            <Segmented label="Devise" value={form.currency} onChange={(c) => setForm({ ...form, currency: c })} options={[{ id: 'CDF', label: 'Francs (FC)' }, { id: 'USD', label: 'Dollars ($)' }]} />
            <Field label="Montant" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <Field label="Date" type="date" max={today} value={form.movedOn} onChange={(e) => setForm({ ...form, movedOn: e.target.value })} required />
            <Field label="Note" placeholder="Facultatif" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={255} />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setForm(null)}>Fermer</Button>
              <Button type="submit" className="flex-1" busy={busy}>Enregistrer</Button>
            </div>
          </form>
        </Card>
      )}

      <Card
        title="Mouvements"
        action={
          <select aria-label="Période" value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
            <option value={365}>12 derniers mois</option>
          </select>
        }
      >
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-soft">Entrées</p>
            <p className="font-semibold tabular-nums text-brand-strong">+ {formatMoney(data.totalIn.CDF, 'CDF')}</p>
            <p className="font-semibold tabular-nums text-brand-strong">+ {formatMoney(data.totalIn.USD, 'USD')}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-xs text-ink-soft">Sorties</p>
            <p className="font-semibold tabular-nums text-danger">− {formatMoney(data.totalOut.CDF, 'CDF')}</p>
            <p className="font-semibold tabular-nums text-danger">− {formatMoney(data.totalOut.USD, 'USD')}</p>
          </div>
        </div>
        <p className="mb-2 text-xs text-ink-soft">
          Solde au {formatDay(addDays(from, -1))} : {formatMoney(data.opening.CDF, 'CDF')} · {formatMoney(data.opening.USD, 'USD')}
        </p>
        {data.entries.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun mouvement sur la période.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.entries.map((e) => {
              const movement = movementsById.get(e.id)
              const detail =
                e.type === 'payment'
                  ? `${e.receiptNo ? receiptNumber(e.receiptNo) : ''} · ${e.method ? METHOD_LABEL[e.method] : ''}`
                  : e.type === 'expense'
                    ? `${e.category ? EXPENSE_LABEL[e.category] : ''}${e.label ? ` · ${e.label}` : ''}${e.note ? ` · ${e.note}` : ''}`
                    : (e.note ?? '')
              const link = e.type === 'payment' ? `/versements/${e.id}` : e.type === 'expense' ? `/depenses/${e.id}` : null
              const row = (
                <>
                  <div className="w-12 shrink-0 text-xs text-ink-soft tabular-nums">{e.date.slice(8, 10)}/{e.date.slice(5, 7)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.type === 'payment' ? e.label : ENTRY_LABEL[e.type]}</p>
                    <p className="truncate text-xs text-ink-soft">{detail}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${e.direction === 'in' ? 'text-brand-strong' : 'text-danger'}`}>
                    {e.direction === 'in' ? '+' : '−'} {formatMoney(e.amount, e.currency)}
                  </span>
                </>
              )
              return (
                <li key={e.type + e.id}>
                  {link ? (
                    <Link to={link} className="flex items-center gap-3 py-2 hover:bg-surface-2">{row}</Link>
                  ) : (
                    <button type="button" className="flex w-full items-center gap-3 py-2 text-left hover:bg-surface-2" onClick={() => movement && (cancelId === e.id ? setCancelId(null) : setCancelId(e.id))}>
                      {row}
                    </button>
                  )}
                  {movement && cancelId === e.id && (
                    <div className="mb-2 space-y-2 rounded-xl bg-surface-2 p-3">
                      <p className="text-xs text-ink-soft">Saisi par {movement.createdByName ?? '—'}</p>
                      <Button variant="secondary" className="w-full" onClick={() => { setCancelId(null); openEdit(movement) }}>Modifier</Button>
                      <form
                        className="flex items-end gap-2"
                        onSubmit={(ev) => {
                          ev.preventDefault()
                          void run(() => backend.cancelMovement(movement.id, reason), 'Mouvement annulé')
                        }}
                      >
                        <div className="flex-1"><Field label="Motif d'annulation" value={reason} onChange={(ev) => setReason(ev.target.value)} required /></div>
                        <Button type="submit" variant="danger" busy={busy}>Annuler</Button>
                      </form>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-soft">
          Les dépenses payées par un chauffeur et les versements annulés ne passent pas par la caisse.
        </p>
      </Card>
    </div>
  )
}
