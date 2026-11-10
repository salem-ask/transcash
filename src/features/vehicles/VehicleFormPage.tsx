import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { VehicleIcon } from '../../components/fleet'
import { Alert, BackLink, Button, Card, Field, Segmented, Spinner, TextArea, Toggle, WeekdayPicker } from '../../components/ui'
import { formatMoney, parseAmount, DECIMALS } from '../../domain/money'
import { todayIn, VEHICLE_TYPES } from '../../domain/fleet'
import type { Currency, VehicleDetail, VehicleType } from '../../domain/types'
import { WEEKDAYS } from '../../lib/format'
import { errorText } from '../../lib/useLoad'

interface FormState {
  type: VehicleType
  name: string
  plate: string
  model: string
  amount: string
  currency: Currency
  serviceDate: string
  amountFrom: string
  ownRestDays: boolean
  restWeekdays: number[]
  notes: string
}

const amountToText = (amount: number, currency: Currency) => (amount / 10 ** DECIMALS[currency]).toString().replace('.', ',')

/** Création (/engins/nouveau) et modification (/engins/:id/modifier) d'un engin. */
export function VehicleFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { bundle } = useSession()
  const settings = bundle!.settings
  const today = todayIn(settings.timezone)
  const [original, setOriginal] = useState<VehicleDetail | null>(null)
  const [form, setForm] = useState<FormState>({
    type: 'moto', name: '', plate: '', model: '', amount: '', currency: settings.baseCurrency,
    serviceDate: today, amountFrom: today, ownRestDays: false, restWeekdays: settings.restWeekdays, notes: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    backend.getVehicle(id).then((d) => {
      const v = d.vehicle
      setOriginal(d)
      setForm((f) => ({
        ...f, type: v.type, name: v.name, plate: v.plate ?? '', model: v.model ?? '',
        amount: amountToText(v.dailyAmount, v.currency), currency: v.currency, serviceDate: v.serviceDate,
        ownRestDays: v.restWeekdays !== null, restWeekdays: v.restWeekdays ?? settings.restWeekdays, notes: v.notes ?? '',
      }))
    }, (e) => setError(errorText(e)))
  }, [id, settings.restWeekdays])

  if (id && !original && !error) return <Spinner />

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const parsed = parseAmount(form.amount, form.currency)
  const amountChanged =
    !!original && parsed !== null && (parsed !== original.vehicle.dailyAmount || form.currency !== original.vehicle.currency)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (parsed === null || parsed <= 0)
      return setError(form.currency === 'CDF' ? 'Montant invalide : nombre entier de francs, ex. 15000' : 'Montant invalide, ex. 35 ou 35,50')
    setBusy(true)
    setError(null)
    try {
      const input = {
        type: form.type, name: form.name, plate: form.plate, model: form.model, dailyAmount: parsed,
        currency: form.currency, restWeekdays: form.ownRestDays ? form.restWeekdays : null, notes: form.notes,
        ...(original ? { amountFrom: amountChanged ? form.amountFrom : undefined } : { serviceDate: form.serviceDate }),
      }
      const saved = original ? await backend.updateVehicle(original.vehicle.id, input) : await backend.createVehicle(input)
      navigate(`/engins/${saved.vehicle.id}`, { replace: true })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  const defaultRest = settings.restWeekdays.map((d) => WEEKDAYS[d].toLowerCase()).join(', ') || 'aucun'

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackLink to={original ? `/engins/${original.vehicle.id}` : '/engins'}>{original ? original.vehicle.name : 'Engins'}</BackLink>
      <h1 className="text-xl font-bold">{original ? "Modifier l'engin" : 'Nouvel engin'}</h1>

      <Card title="Type d'engin">
        <div role="radiogroup" aria-label="Type d'engin" className="grid grid-cols-3 gap-2">
          {VEHICLE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={form.type === t.id}
              onClick={() => set('type', t.id)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm ${
                form.type === t.id ? 'border-brand bg-brand/10 text-brand-strong' : 'border-line text-ink-soft'
              }`}
            >
              <VehicleIcon type={t.id} />
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Identification">
        <div className="space-y-3">
          <Field label="Nom" hint="Comment vous l'appelez : « Taxi 3 », « Moto rouge »…" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={100} />
          <Field label="Immatriculation" placeholder="Ex. KN 1234 AB" value={form.plate} onChange={(e) => set('plate', e.target.value)} maxLength={30} autoCapitalize="characters" />
          <Field label="Marque et modèle" placeholder="Ex. Toyota Corolla" value={form.model} onChange={(e) => set('model', e.target.value)} maxLength={100} />
        </div>
      </Card>

      <Card title="Versement journalier attendu">
        <div className="space-y-3">
          <Segmented
            label="Devise"
            value={form.currency}
            onChange={(c) => set('currency', c)}
            options={[
              { id: 'CDF', label: 'Francs (FC)' },
              { id: 'USD', label: 'Dollars ($)' },
            ]}
          />
          <Field
            label="Montant par jour"
            inputMode={form.currency === 'CDF' ? 'numeric' : 'decimal'}
            placeholder={form.currency === 'CDF' ? 'Ex. 15000' : 'Ex. 35'}
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            hint={parsed ? `Soit ${formatMoney(parsed, form.currency)} par jour travaillé` : undefined}
            required
          />
          {amountChanged && (
            <div className="rounded-xl bg-accent/15 p-3">
              <Field label="Nouveau montant applicable à partir du" type="date" value={form.amountFrom} onChange={(e) => set('amountFrom', e.target.value)} required />
              <p className="mt-1 text-xs text-ink-soft">Les jours précédents gardent l'ancien montant : l'historique ne change pas.</p>
            </div>
          )}
          {!original && (
            <Field label="Mise en service" hint="Premier jour où un versement est attendu" type="date" value={form.serviceDate} onChange={(e) => set('serviceDate', e.target.value)} required />
          )}
        </div>
      </Card>

      <Card title="Jours de repos">
        <div className="space-y-3">
          <Toggle label={`Jours propres à cet engin (sinon : ${defaultRest})`} checked={form.ownRestDays} onChange={(v) => set('ownRestDays', v)} />
          {form.ownRestDays && <WeekdayPicker value={form.restWeekdays} onChange={(v) => set('restWeekdays', v)} />}
        </div>
      </Card>

      <Card>
        <TextArea label="Notes" placeholder="Couleur, numéro de châssis, particularités…" value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
      </Card>

      {error && <Alert>{error}</Alert>}
      <Button type="submit" busy={busy} className="w-full">
        {original ? 'Enregistrer les modifications' : "Ajouter l'engin"}
      </Button>
    </form>
  )
}
