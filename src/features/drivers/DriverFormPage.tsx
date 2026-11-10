import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backend } from '../../data'
import { Alert, BackLink, Button, Card, Field, Spinner, TextArea } from '../../components/ui'
import type { DriverDetail, DriverInput } from '../../domain/types'
import { errorText } from '../../lib/useLoad'
import { isQueued } from '../../data/offline'
import { setFlash } from '../../lib/flash'

const EMPTY: Required<Omit<DriverInput, 'active'>> = { name: '', phone: '', idNumber: '', licenseNumber: '', address: '', notes: '' }

/** Création (/chauffeurs/nouveau) et modification (/chauffeurs/:id/modifier). */
export function DriverFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [original, setOriginal] = useState<DriverDetail | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    backend.getDriver(id).then((d) => {
      setOriginal(d)
      const x = d.driver
      setForm({ name: x.name, phone: x.phone, idNumber: x.idNumber ?? '', licenseNumber: x.licenseNumber ?? '', address: x.address ?? '', notes: x.notes ?? '' })
    }, (e) => setError(errorText(e)))
  }, [id])

  if (id && !original && !error) return <Spinner />
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = original ? await backend.updateDriver(original.driver.id, form) : await backend.createDriver(form)
      navigate(`/chauffeurs/${saved.driver.id}`, { replace: true })
    } catch (err) {
      if (isQueued(err)) {
        setFlash(err.message)
        return navigate('/chauffeurs', { replace: true })
      }
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <BackLink to={original ? `/chauffeurs/${original.driver.id}` : '/chauffeurs'}>{original ? original.driver.name : 'Chauffeurs'}</BackLink>
      <h1 className="text-xl font-bold">{original ? 'Modifier le chauffeur' : 'Nouveau chauffeur'}</h1>

      <Card>
        <div className="space-y-3">
          <Field label="Nom complet" autoComplete="off" value={form.name} onChange={set('name')} required maxLength={150} />
          <Field
            label="Téléphone"
            type="tel"
            inputMode="tel"
            placeholder="Ex. +243 81 234 5678"
            hint="Pour le joindre, et pour envoyer ses reçus par WhatsApp ou SMS"
            value={form.phone}
            onChange={set('phone')}
            required
          />
          <Field label="Pièce d'identité (n°)" value={form.idNumber} onChange={set('idNumber')} maxLength={60} />
          <Field label="Permis de conduire (n°)" value={form.licenseNumber} onChange={set('licenseNumber')} maxLength={60} />
          <Field label="Adresse" placeholder="Quartier, commune" value={form.address} onChange={set('address')} maxLength={255} />
          <TextArea label="Notes" placeholder="Garant, contact d'urgence…" value={form.notes} onChange={set('notes')} maxLength={2000} />
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      <Button type="submit" busy={busy} className="w-full">
        {original ? 'Enregistrer les modifications' : 'Ajouter le chauffeur'}
      </Button>
    </form>
  )
}
