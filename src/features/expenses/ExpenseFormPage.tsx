import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Alert, BackLink, Button, Card, Field, Segmented, Select, Spinner } from '../../components/ui'
import { EXPENSE_LABEL, type ExpenseCategory } from '../../domain/finance'
import { todayIn } from '../../domain/fleet'
import { allocate, dayKey } from '../../domain/ledger'
import { DECIMALS, formatMoney, parseAmount } from '../../domain/money'
import { can } from '../../domain/permissions'
import type { Currency, Driver, Expense, LedgerPayload, Vehicle, VehicleBreakdown } from '../../domain/types'
import { errorText } from '../../lib/useLoad'
import { DayChecklist } from '../payments/DayChecklist'

const CATEGORIES = Object.keys(EXPENSE_LABEL) as ExpenseCategory[]
const toText = (amount: number, c: Currency) => (amount / 10 ** DECIMALS[c]).toString().replace('.', ',')

/** Nouvelle dépense (/depenses/nouvelle?engin=…) ou modification / annulation (/depenses/:id). */
export function ExpenseFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session, bundle } = useSession()
  const role = session!.user!.role
  const today = todayIn(bundle!.settings.timezone)

  const [original, setOriginal] = useState<Expense | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [breakdowns, setBreakdowns] = useState<VehicleBreakdown[]>([])
  const [category, setCategory] = useState<ExpenseCategory>('fuel')
  const [vehicleId, setVehicleId] = useState(params.get('engin') ?? '')
  const [breakdownId, setBreakdownId] = useState(params.get('immobilisation') ?? '')
  const [amountText, setAmountText] = useState('')
  const [currency, setCurrency] = useState<Currency>(bundle!.settings.baseCurrency)
  const [spentOn, setSpentOn] = useState(today)
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [paidBy, setPaidBy] = useState<'cash' | 'driver'>('cash')
  const [driverId, setDriverId] = useState('')
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expenseId] = useState(() => crypto.randomUUID())
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    backend.listVehicles().then((v) => setVehicles(v.filter((x) => x.status === 'active' || x.id === vehicleId)), (e) => setError(errorText(e)))
    if (can(role, 'drivers.view')) backend.listDrivers().then(setDrivers, () => setDrivers([]))
    if (!id) return
    backend.getExpense(id).then((e) => {
      setOriginal(e)
      setCategory(e.category)
      setVehicleId(e.vehicleId ?? '')
      setBreakdownId(e.breakdownId ?? '')
      setAmountText(toText(e.amount, e.currency))
      setCurrency(e.currency)
      setSpentOn(e.spentOn)
      setSupplier(e.supplier ?? '')
      setNote(e.note ?? '')
      setPaidBy(e.paidBy)
    }, (err) => setError(errorText(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Immobilisations de l'engin choisi (pour rattacher une réparation)
  useEffect(() => {
    setBreakdowns([])
    if (vehicleId) backend.listBreakdowns(vehicleId).then((b) => setBreakdowns(b.filter((x) => !x.cancelled)), () => undefined)
  }, [vehicleId])

  // Dépense payée par le chauffeur : par défaut, le chauffeur actuel de l'engin
  useEffect(() => {
    if (paidBy !== 'driver' || original) return
    const v = vehicles?.find((x) => x.id === vehicleId)
    if (v?.currentDriver && !driverId) setDriverId(v.currentDriver.id)
  }, [paidBy, vehicleId, vehicles, driverId, original])

  useEffect(() => {
    setLedger(null)
    setSelected(new Set())
    if (paidBy === 'driver' && driverId && !original) backend.getLedger(driverId).then(setLedger, (e) => setError(errorText(e)))
  }, [paidBy, driverId, original])

  const amount = parseAmount(amountText, currency)
  const due = useMemo(() => (ledger?.days ?? []).filter((d) => d.kind === 'due' && d.remaining > 0 && d.date <= (ledger?.today ?? today)), [ledger, today])
  const chosen = due.filter((d) => selected.has(dayKey(d)))
  let preview: ReturnType<typeof allocate> | null = null
  try {
    preview = amount && chosen.length ? allocate(amount, currency, ledger?.rate?.rate ?? bundle?.rate?.rate ?? null, chosen) : null
  } catch {
    preview = null
  }
  const allocated = new Map(preview?.allocations.map((a) => [dayKey(a), a.amount]))
  const locked = original?.paidBy === 'driver' // montant / date non modifiables
  const readOnly = !!original?.cancelled

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!amount) return setError('Montant invalide')
    if (paidBy === 'driver' && !original && chosen.length === 0) return setError('Cochez la ou les journées que cette dépense paie')
    setBusy(true)
    setError(null)
    try {
      const input = {
        id: original?.id ?? expenseId, category, vehicleId: vehicleId || null, breakdownId: breakdownId || null,
        amount, currency, spentOn, supplier, note, paidBy,
        driverId: paidBy === 'driver' ? driverId : undefined,
        days: paidBy === 'driver' ? chosen.map((d) => ({ date: d.date, vehicleId: d.vehicleId })) : undefined,
      }
      if (original) await backend.updateExpense(original.id, input)
      else await backend.createExpense(input)
      navigate('/depenses', { replace: true })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function cancel(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setOriginal(await backend.cancelExpense(original!.id, reason))
      setCancelOpen(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  if ((id && !original && !error) || vehicles === null) return <Spinner />

  return (
    <div className="space-y-4">
      <BackLink to="/depenses">Dépenses</BackLink>
      <h1 className="text-xl font-bold">{original ? 'Dépense' : 'Nouvelle dépense'}</h1>
      {original?.cancelled && <Alert>Dépense annulée : {original.cancelReason}</Alert>}
      {locked && !readOnly && (
        <Alert kind="info">
          Payée par {original?.driverName} et comptée comme versement. Pour changer le montant ou la date, annulez-la puis saisissez-la à nouveau.
        </Alert>
      )}

      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4">
          <Card title="Catégorie">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Catégorie">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  onClick={() => setCategory(c)}
                  className={`min-h-12 rounded-xl border-2 px-2 text-sm ${category === c ? 'border-brand bg-brand/10 font-semibold text-brand-strong' : 'border-line text-ink-soft'}`}
                >
                  {EXPENSE_LABEL[c]}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="space-y-3">
              <Select label="Engin" value={vehicleId} disabled={locked} onChange={(e) => { setVehicleId(e.target.value); setBreakdownId('') }}>
                <option value="">Dépense générale (aucun engin)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.plate ? ` — ${v.plate}` : ''}
                  </option>
                ))}
              </Select>
              {breakdowns.length > 0 && (
                <Select label="Liée à une immobilisation" value={breakdownId} onChange={(e) => setBreakdownId(e.target.value)}>
                  <option value="">Non</option>
                  {breakdowns.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.reason} (depuis le {b.startDate.split('-').reverse().join('/')})
                    </option>
                  ))}
                </Select>
              )}
              <Segmented label="Devise" value={currency} disabled={locked} onChange={setCurrency} options={[{ id: 'CDF', label: 'Francs (FC)' }, { id: 'USD', label: 'Dollars ($)' }]} />
              <Field label="Montant" inputMode="decimal" value={amountText} disabled={locked} onChange={(e) => setAmountText(e.target.value)} required />
              <Field label="Date" type="date" max={today} value={spentOn} disabled={locked} onChange={(e) => setSpentOn(e.target.value)} required />
              <Field label="Fournisseur / garage" placeholder="Facultatif" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={150} />
              <Field label="Note" placeholder="Ex. 20 litres, plaquettes de frein…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
            </div>
          </Card>

          {!original && can(role, 'payments.create') && (
            <Card title="Qui a payé ?">
              <Segmented
                label="Payée par"
                value={paidBy}
                onChange={setPaidBy}
                options={[
                  { id: 'cash', label: 'La caisse' },
                  { id: 'driver', label: 'Le chauffeur' },
                ]}
              />
              {paidBy === 'driver' && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-ink-soft">
                    Le chauffeur a avancé l'argent et le retient sur son versement : la dépense compte comme un versement sur les journées cochées (sa dette baisse), sans sortie de caisse.
                  </p>
                  <Select label="Chauffeur" value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
                    <option value="">Choisir…</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.currentVehicle ? ` — ${d.currentVehicle.name}` : ''}
                      </option>
                    ))}
                  </Select>
                  {driverId && !ledger && <Spinner />}
                  {ledger && (due.length === 0 ? (
                    <Alert kind="info">Ce chauffeur ne doit aucune journée : enregistrez plutôt la dépense comme payée par la caisse.</Alert>
                  ) : (
                    <DayChecklist
                      days={due}
                      selected={selected}
                      onToggle={(d) => {
                        const next = new Set(selected)
                        if (next.has(dayKey(d))) next.delete(dayKey(d))
                        else next.add(dayKey(d))
                        setSelected(next)
                      }}
                      allocated={allocated}
                      showPreview={amount !== null}
                      multiVehicle={new Set(due.map((d) => d.vehicleId)).size > 1}
                    />
                  ))}
                  {preview && preview.leftover > 0 && <Alert>Il reste {formatMoney(preview.leftover, currency)} non affectés : cochez une journée de plus.</Alert>}
                </div>
              )}
            </Card>
          )}
        </fieldset>

        {error && <Alert>{error}</Alert>}
        {!readOnly && (
          <Button type="submit" busy={busy} className="w-full">
            {original ? 'Enregistrer les modifications' : `Enregistrer${amount ? ` ${formatMoney(amount, currency)}` : ''}`}
          </Button>
        )}
      </form>

      {original && !original.cancelled && (
        <Card>
          {cancelOpen ? (
            <form onSubmit={cancel} className="space-y-3">
              <p className="text-sm">
                La dépense restera visible avec la mention « annulée »{original.paidBy === 'driver' ? ' ; le versement lié sera annulé et les journées redeviendront dues' : ''}.
              </p>
              <Field label="Motif de l'annulation" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={255} />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>Retour</Button>
                <Button type="submit" variant="danger" className="flex-1" busy={busy}>Annuler la dépense</Button>
              </div>
            </form>
          ) : (
            <Button variant="ghost" className="w-full text-danger" onClick={() => setCancelOpen(true)}>
              Annuler cette dépense
            </Button>
          )}
        </Card>
      )}
      {original && (
        <p className="text-center text-xs text-ink-soft">
          Saisie par {original.createdByName ?? '—'} · chaque modification est tracée dans le journal d'activité
        </p>
      )}
    </div>
  )
}
