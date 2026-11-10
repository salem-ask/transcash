import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { MoneyTotals } from '../../components/Money'
import { Alert, BackLink, Button, Card, Field, Segmented, Select, Spinner, TextArea } from '../../components/ui'
import { formatDay, todayIn } from '../../domain/fleet'
import { allocate, totalIn, type LedgerDay, type Totals } from '../../domain/ledger'
import { DECIMALS, formatMoney, parseAmount } from '../../domain/money'
import type { Currency, Driver, LedgerPayload, PaymentKind, PaymentMethod } from '../../domain/types'
import { errorText } from '../../lib/useLoad'

const keyOf = (d: { vehicleId: string; date: string }) => `${d.vehicleId}|${d.date}`
const toText = (amount: number, c: Currency) => (amount / 10 ** DECIMALS[c]).toString().replace('.', ',')

/** Encaisser un versement : on choisit le chauffeur, puis les journées payées (ou un versement exceptionnel). */
export function NewPaymentPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { bundle } = useSession()
  const base = bundle!.settings.baseCurrency
  const today = todayIn(bundle!.settings.timezone)

  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const [driverId, setDriverId] = useState(params.get('chauffeur') ?? '')
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  const [kind, setKind] = useState<PaymentKind>('daily')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amountText, setAmountText] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [currency, setCurrency] = useState<Currency>(base)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const [showFuture, setShowFuture] = useState(false)
  // Identifiant fixé à l'ouverture : renvoyer le formulaire (réseau coupé) ne crée pas de doublon
  const [paymentId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    backend.listDrivers().then(setDrivers, (e) => setError(errorText(e)))
  }, [])

  useEffect(() => {
    setLedger(null)
    setSelected(new Set())
    setAmountTouched(false)
    if (!driverId) return
    backend.getLedger(driverId).then((l) => {
      setLedger(l)
      const todayDue = l.days.filter((d) => d.date === l.today && d.remaining > 0)
      setSelected(new Set(todayDue.map(keyOf)))
      const firstCur = l.days.find((d) => d.remaining > 0)?.currency
      if (firstCur) setCurrency(firstCur)
    }, (e) => setError(errorText(e)))
  }, [driverId])

  const rate = ledger?.rate?.rate ?? bundle?.rate?.rate ?? null
  const due = useMemo(() => (ledger?.days ?? []).filter((d) => d.kind === 'due' && d.remaining > 0), [ledger])
  const late = due.filter((d) => d.date < (ledger?.today ?? today))
  const todays = due.filter((d) => d.date === ledger?.today)
  const future = due.filter((d) => d.date > (ledger?.today ?? today)).slice(0, 14)
  const chosen = due.filter((d) => selected.has(keyOf(d))) // ordre chronologique

  const chosenTotals: Totals = {}
  for (const d of chosen) chosenTotals[d.currency] = (chosenTotals[d.currency] ?? 0) + d.remaining
  const autoAmount = totalIn(chosenTotals, currency, rate)

  // Montant proposé automatiquement tant que l'utilisateur ne l'a pas modifié
  useEffect(() => {
    if (!amountTouched && kind === 'daily') setAmountText(autoAmount ? toText(autoAmount, currency) : '')
  }, [autoAmount, currency, amountTouched, kind])

  const amount = parseAmount(amountText, currency)
  let preview: ReturnType<typeof allocate> | null = null
  try {
    preview = amount && kind === 'daily' ? allocate(amount, currency, rate, chosen) : null
  } catch {
    preview = null
  }
  const allocatedByDay = new Map(preview?.allocations.map((a) => [keyOf(a), a.amount]))

  function toggle(d: LedgerDay) {
    const next = new Set(selected)
    if (next.has(keyOf(d))) next.delete(keyOf(d))
    else next.add(keyOf(d))
    setSelected(next)
    setAmountTouched(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!amount) return setError(currency === 'CDF' ? 'Montant invalide : nombre entier de francs' : 'Montant invalide, ex. 20 ou 20,50')
    if (kind === 'daily' && chosen.length === 0) return setError('Cochez au moins une journée')
    setBusy(true)
    try {
      const saved = await backend.createPayment({
        id: paymentId, driverId, kind, amount, currency, method, paidOn,
        reference: method === 'cash' ? undefined : reference, note: note || undefined,
        days: kind === 'daily' ? chosen.map((d) => ({ date: d.date, vehicleId: d.vehicleId })) : undefined,
      })
      navigate(`/versements/${saved.id}?nouveau=1`, { replace: true })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  const multiVehicle = new Set(due.map((d) => d.vehicleId)).size > 1
  const dayList = (items: LedgerDay[]) => (
    <ul className="divide-y divide-line">
      {items.map((d) => {
        const k = keyOf(d)
        const on = selected.has(k)
        const alloc = allocatedByDay.get(k)
        const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))
        return (
          <li key={k}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
              <input type="checkbox" checked={on} onChange={() => toggle(d)} className="size-6 shrink-0 accent-[var(--color-brand)]" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium first-letter:uppercase">{weekday}</span>
                <span className="block text-xs text-ink-soft">
                  {multiVehicle ? `${d.vehicleName} · ` : ''}
                  {d.paid > 0 ? `déjà ${formatMoney(d.paid, d.currency)} payés · ` : ''}
                  {d.override ? 'montant exceptionnel' : ''}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <span className="block font-semibold">{formatMoney(d.remaining, d.currency)}</span>
                {on && amount !== null && (
                  <span className={`block text-xs ${alloc === d.remaining ? 'text-brand' : alloc ? 'text-ink' : 'text-danger'}`}>
                    {alloc === d.remaining ? 'complet' : alloc ? `partiel : ${formatMoney(alloc, d.currency)}` : 'non couvert'}
                  </span>
                )}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackLink to="/versements">Versements</BackLink>
      <h1 className="text-xl font-bold">Encaisser un versement</h1>

      <Card>
        {drivers === null ? (
          <Spinner />
        ) : (
          <Select label="Chauffeur" value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
            <option value="">Choisir…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.currentVehicle ? ` — ${d.currentVehicle.name}` : d.active ? '' : ' (désactivé)'}
              </option>
            ))}
          </Select>
        )}
        {ledger && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              Dettes :{' '}
              {Object.keys(ledger.summary.arrears).length ? (
                <MoneyTotals totals={ledger.summary.arrears} className="!inline-flex !flex-row items-baseline gap-1 text-danger" />
              ) : (
                <strong>aucune</strong>
              )}
            </span>
            {Object.keys(ledger.summary.advance).length > 0 && (
              <span>
                Avance : <MoneyTotals totals={ledger.summary.advance} className="!inline-flex !flex-row items-baseline gap-1" />
              </span>
            )}
          </div>
        )}
      </Card>

      {driverId && !ledger && !error && <Spinner />}

      {ledger && (
        <>
          <Segmented
            label="Type de versement"
            value={kind}
            onChange={(k) => {
              setKind(k)
              setAmountTouched(k === 'extra')
              if (k === 'extra') setAmountText('')
            }}
            options={[
              { id: 'daily', label: 'Journées' },
              { id: 'extra', label: 'Exceptionnel' },
            ]}
          />

          {kind === 'daily' ? (
            <>
              {due.length === 0 && <Alert kind="info">Rien à payer : aucune journée due, ni en retard, ni à venir.</Alert>}
              {late.length > 0 && (
                <Card
                  title={`En retard (${late.length})`}
                  action={
                    <button type="button" className="text-sm font-medium text-brand" onClick={() => { setSelected(new Set([...selected, ...late.map(keyOf)])); setAmountTouched(false) }}>
                      Tout cocher
                    </button>
                  }
                >
                  {dayList(late)}
                </Card>
              )}
              {todays.length > 0 && <Card title="Aujourd'hui">{dayList(todays)}</Card>}
              {future.length > 0 && (
                <Card title="Payer d'avance">
                  {showFuture ? (
                    dayList(future)
                  ) : (
                    <button type="button" className="text-sm font-medium text-brand" onClick={() => setShowFuture(true)}>
                      Afficher les prochains jours ({future.length})
                    </button>
                  )}
                </Card>
              )}
            </>
          ) : (
            <Alert kind="info">
              Somme versée en plus du journalier (prime, participation à une réparation, amende…). Elle entre en caisse mais ne rembourse aucune dette.
            </Alert>
          )}

          <Card title="Paiement">
            <div className="space-y-3">
              <Segmented
                label="Devise reçue"
                value={currency}
                onChange={(c) => {
                  setCurrency(c)
                  setAmountTouched(false)
                }}
                options={[
                  { id: 'CDF', label: 'Francs (FC)' },
                  { id: 'USD', label: 'Dollars ($)' },
                ]}
              />
              <Field
                label="Montant reçu"
                inputMode={currency === 'CDF' ? 'numeric' : 'decimal'}
                value={amountText}
                onChange={(e) => {
                  setAmountText(e.target.value)
                  setAmountTouched(true)
                }}
                hint={
                  kind === 'daily' && autoAmount !== null && chosen.length > 0
                    ? `Total des journées cochées : ${formatMoney(autoAmount, currency)}${rate && chosen.some((d) => d.currency !== currency) ? ` (taux ${rate})` : ''}`
                    : undefined
                }
                required
              />
              {kind === 'daily' && preview && preview.leftover > 0 && (
                <Alert>
                  Il reste {formatMoney(preview.leftover, currency)} non affectés : cochez une journée de plus, ou enregistrez ce surplus comme versement exceptionnel.
                </Alert>
              )}
              {kind === 'daily' && preview && preview.allocations.length < chosen.length && (
                <Alert>Le montant ne couvre pas toutes les journées cochées : décochez celles marquées « non couvert ».</Alert>
              )}
              <Segmented
                label="Mode de paiement"
                value={method}
                onChange={setMethod}
                options={[
                  { id: 'cash', label: 'Espèces' },
                  { id: 'mobile_money', label: 'Mobile Money' },
                  { id: 'bank', label: 'Banque' },
                ]}
              />
              {method !== 'cash' && (
                <Field label="Référence de la transaction" placeholder="Facultatif" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
              )}
              <Field label="Date de réception" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
              {kind === 'extra' ? (
                <TextArea label="Motif" placeholder="Ex. participation au changement de pneu" value={note} onChange={(e) => setNote(e.target.value)} required maxLength={255} rows={2} />
              ) : (
                <Field label="Note" placeholder="Facultatif" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
              )}
            </div>
          </Card>

          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full" disabled={kind === 'daily' && chosen.length === 0}>
            Enregistrer{amount ? ` ${formatMoney(amount, currency)}` : ''}
          </Button>
          {kind === 'daily' && chosen.length > 0 && (
            <p className="text-center text-xs text-ink-soft">
              {chosen.length} journée{chosen.length > 1 ? 's' : ''} : du {formatDay(chosen[0].date)} au {formatDay(chosen[chosen.length - 1].date)}
            </p>
          )}
        </>
      )}
      {!ledger && error && <Alert>{error}</Alert>}
    </form>
  )
}
