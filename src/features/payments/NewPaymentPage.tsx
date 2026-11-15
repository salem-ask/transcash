import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { MoneyTotals } from '../../components/Money'
import { Alert, BackLink, Button, Card, Field, Segmented, Select, Spinner, TextArea } from '../../components/ui'
import { formatDay, todayIn } from '../../domain/fleet'
import { allocate, dayKey, totalIn, withoutAllocations, type LedgerDay, type Totals } from '../../domain/ledger'
import { DECIMALS, formatMoney, parseAmount } from '../../domain/money'
import type { Currency, Driver, LedgerPayload, NewPaymentInput, PaymentDetail, PaymentKind, PaymentMethod } from '../../domain/types'
import { receiptNumber } from '../../domain/receipt'
import { errorText } from '../../lib/useLoad'
import { isQueued } from '../../data/offline'
import { setFlash } from '../../lib/flash'
import { DayChecklist } from './DayChecklist'

const keyOf = dayKey
const toText = (amount: number, c: Currency) => (amount / 10 ** DECIMALS[c]).toString().replace('.', ',')

/**
 * Encaisser un versement : on choisit le chauffeur, puis les journées payées (ou un versement exceptionnel).
 * Avec ?corriger=<id> : correction d'un versement (pré-rempli ; l'ancien sera annulé et remplacé).
 */
export function NewPaymentPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { bundle } = useSession()
  const base = bundle!.settings.baseCurrency
  const today = todayIn(bundle!.settings.timezone)

  const [drivers, setDrivers] = useState<Driver[] | null>(null)
  const correctId = params.get('corriger')
  const [original, setOriginal] = useState<PaymentDetail | null>(null)
  const [reason, setReason] = useState('')
  const [driverId, setDriverId] = useState(correctId ? '' : (params.get('chauffeur') ?? ''))
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  // « free » : mode montant libre (un montant pour une journée, sans dette) ; « daily » : journées cochées
  const [kind, setKind] = useState<PaymentKind | 'free'>('daily')
  const [freeKey, setFreeKey] = useState('')
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

  // Correction : on charge le versement d'origine, puis le chauffeur
  useEffect(() => {
    if (!correctId) return
    backend.getPayment(correctId).then((p) => {
      if (p.cancelled) return setError('Ce versement est annulé : il ne peut plus être corrigé')
      if (p.method === 'driver_expense') return setError("Ce versement vient d'une dépense payée par le chauffeur : corrigez la dépense")
      setOriginal(p)
      setDriverId(p.driverId)
    }, (e) => setError(errorText(e)))
  }, [correctId])

  useEffect(() => {
    setLedger(null)
    setSelected(new Set())
    setAmountTouched(false)
    if (!driverId) return
    backend.getLedger(driverId).then((raw) => {
      // Correction : les journées payées par l'ancien versement redeviennent disponibles
      const l = original ? { ...raw, days: withoutAllocations(raw.days, original.allocations) } : raw
      setLedger(l)
      if (original) {
        const keys = original.allocations.map(keyOf)
        const freeAlloc = l.days.find((d) => d.free && keys.includes(keyOf(d)))
        setKind(original.kind === 'extra' ? 'extra' : freeAlloc ? 'free' : 'daily')
        setFreeKey(freeAlloc ? keyOf(freeAlloc) : '')
        setSelected(new Set(freeAlloc ? [] : keys))
        setShowFuture(original.allocations.some((a) => a.date > l.today))
        setAmountTouched(true)
        setAmountText(toText(original.amount, original.currency))
        setCurrency(original.currency)
        setMethod(original.method)
        setReference(original.reference ?? '')
        setPaidOn(original.paidOn)
        setNote(original.note ?? '')
        return
      }
      const todayDue = l.days.filter((d) => d.date === l.today && d.remaining > 0)
      setSelected(new Set(todayDue.map(keyOf)))
      // Mode montant libre : on propose directement la saisie libre sur la journée la plus récente
      const free = l.days.filter((d) => d.free && d.kind === 'due' && d.date <= l.today)
      if (free.length) {
        const last = free[free.length - 1]
        setKind('free')
        setFreeKey(keyOf(last))
        setAmountTouched(true)
        setAmountText('')
        setCurrency(last.currency)
      } else {
        setKind('daily')
      }
      const firstCur = l.days.find((d) => d.remaining > 0)?.currency
      if (firstCur) setCurrency(firstCur)
    }, (e) => setError(errorText(e)))
  }, [driverId, original])

  const rate = ledger?.rate?.rate ?? bundle?.rate?.rate ?? null
  const due = useMemo(() => (ledger?.days ?? []).filter((d) => d.kind === 'due' && d.remaining > 0), [ledger])
  const late = due.filter((d) => d.date < (ledger?.today ?? today))
  const todays = due.filter((d) => d.date === ledger?.today)
  const future = due.filter((d) => d.date > (ledger?.today ?? today)).slice(0, 14)
  const chosen = due.filter((d) => selected.has(keyOf(d))) // ordre chronologique
  const freeDays = useMemo(() => (ledger?.days ?? []).filter((d) => d.free && d.kind === 'due' && d.date <= ledger!.today).reverse(), [ledger])
  const freeDay = freeDays.find((d) => keyOf(d) === freeKey) ?? null

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
    if (kind === 'free' && !freeDay) return setError('Choisissez la journée')
    setBusy(true)
    try {
      const input: NewPaymentInput = {
        id: paymentId, driverId, kind: kind === 'extra' ? 'extra' : 'daily', amount, currency, method, paidOn,
        reference: method === 'cash' ? undefined : reference, note: note || undefined,
        days:
          kind === 'free' && freeDay
            ? [{ date: freeDay.date, vehicleId: freeDay.vehicleId }]
            : kind === 'daily'
              ? chosen.map((d) => ({ date: d.date, vehicleId: d.vehicleId }))
              : undefined,
      }
      const saved = original ? await backend.correctPayment(original.id, { ...input, reason: reason || undefined }) : await backend.createPayment(input)
      navigate(`/versements/${saved.id}?${original ? 'corrige' : 'nouveau'}=1`, { replace: true })
    } catch (err) {
      if (isQueued(err)) {
        setFlash(err.message)
        return navigate('/versements', { replace: true })
      }
      setError(errorText(err))
      setBusy(false)
    }
  }

  const multiVehicle = new Set(due.map((d) => d.vehicleId)).size > 1
  const dayList = (items: LedgerDay[]) => (
    <DayChecklist days={items} selected={selected} onToggle={toggle} allocated={allocatedByDay} showPreview={amount !== null} multiVehicle={multiVehicle} />
  )

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackLink to={correctId ? `/versements/${correctId}` : '/versements'}>{correctId ? 'Reçu' : 'Versements'}</BackLink>
      <h1 className="text-xl font-bold">{original ? `Corriger le reçu ${receiptNumber(original.receiptNo)}` : 'Encaisser un versement'}</h1>
      {original && (
        <Alert kind="info">
          Modifiez ce qui est faux (montant, journées, mode, date). À l'enregistrement, l'ancien reçu est annulé avec la mention « corrigé » et un
          nouveau reçu le remplace. Tout reste dans le journal d'activité.
        </Alert>
      )}

      <Card>
        {drivers === null ? (
          <Spinner />
        ) : (
          <Select label="Chauffeur" value={driverId} onChange={(e) => setDriverId(e.target.value)} required disabled={!!correctId}>
            <option value="">Choisir…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.currentVehicle ? ` — ${d.currentVehicle.name}` : d.active ? '' : ' (désactivé)'}
              </option>
            ))}
          </Select>
        )}
        {ledger && !original && (
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
              setAmountTouched(k !== 'daily')
              if (k !== 'daily') setAmountText('')
            }}
            options={[
              ...(freeDays.length ? [{ id: 'free' as const, label: 'Montant libre' }] : []),
              ...(!freeDays.length || due.length ? [{ id: 'daily' as const, label: freeDays.length ? 'Anciennes dettes' : 'Journées' }] : []),
              { id: 'extra' as const, label: 'Exceptionnel' },
            ]}
          />

          {kind === 'free' ? (
            <Card title="Versement du jour (montant libre)">
              <div className="space-y-2">
                <Select label="Journée" value={freeKey} onChange={(e) => setFreeKey(e.target.value)}>
                  {freeDays.slice(0, 31).map((d) => (
                    <option key={keyOf(d)} value={keyOf(d)}>
                      {new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))}
                      {d.date === ledger.today ? " (aujourd'hui)" : ''}
                      {new Set(freeDays.map((x) => x.vehicleId)).size > 1 ? ` — ${d.vehicleName}` : ''}
                      {d.paid > 0 ? ` — déjà ${formatMoney(d.paid, d.currency)}` : ''}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-ink-soft">
                  Saisissez ce que le chauffeur a versé : aucun montant minimum, pas de dette.
                  {freeDay && freeDay.objective > 0 && ` Objectif indicatif : ${formatMoney(freeDay.objective, freeDay.currency)}.`}
                  {freeDay && freeDay.paid > 0 && ' Un nouveau versement s’ajoute au précédent.'}
                </p>
              </div>
            </Card>
          ) : kind === 'daily' ? (
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

          {original && (
            <Card>
              <Field label="Raison de la correction" placeholder="Facultatif — ex. mauvais montant" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} />
            </Card>
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full" disabled={(kind === 'daily' && chosen.length === 0) || (kind === 'free' && !freeDay)}>
            {original ? 'Enregistrer la correction' : 'Enregistrer'}{amount ? ` ${formatMoney(amount, currency)}` : ''}
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
