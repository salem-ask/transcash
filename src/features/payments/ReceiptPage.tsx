import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { backend } from '../../data'
import { useSession } from '../../app/session'
import { Money } from '../../components/Money'
import { Alert, BackLink, Button, ButtonLink, Card, Field, Spinner } from '../../components/ui'
import { formatDay } from '../../domain/fleet'
import { totalIn } from '../../domain/ledger'
import { formatMoney } from '../../domain/money'
import { can } from '../../domain/permissions'
import { METHOD_LABEL, receiptNumber, receiptText, smsLink, whatsappLink } from '../../domain/receipt'
import type { LedgerPayload, PaymentDetail } from '../../domain/types'
import { formatDateTime } from '../../lib/format'
import { msgOf, useLoad } from '../../lib/useLoad'

/** Reçu d'un versement : détail, envoi WhatsApp / SMS, annulation. */
export function ReceiptPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { session, bundle } = useSession()
  const role = session!.user!.role
  const { data: p, error, setData } = useLoad(() => backend.getPayment(id!), [id])
  const [ledger, setLedger] = useState<LedgerPayload | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(
    params.get('nouveau') ? { kind: 'success', text: 'Versement enregistré' } : null,
  )
  const [busy, setBusy] = useState(false)

  // Situation du chauffeur après ce versement (pour le reste dû sur le reçu)
  useEffect(() => {
    if (!p) return
    const load = role === 'driver' ? backend.myLedger() : can(role, 'drivers.view') ? backend.getLedger(p.driverId) : null
    load?.then(setLedger, () => setLedger(null))
  }, [p, role])

  if (error) return <Alert>{error}</Alert>
  if (!p) return <Spinner />

  const base = bundle!.settings.baseCurrency
  const owed = ledger ? { ...ledger.summary.arrears } : null
  if (owed && ledger) for (const [c, n] of Object.entries(ledger.summary.dueToday)) owed[c as 'CDF'] = (owed[c as 'CDF'] ?? 0) + (n ?? 0)
  const owedTotal = owed ? totalIn(owed, base, bundle?.rate?.rate ?? null) : null
  const remaining = owedTotal === null ? null : formatMoney(owedTotal, base)
  const expectedByDay = new Map(ledger?.days.map((d) => [`${d.vehicleId}|${d.date}`, d.expected]))
  const text = receiptText(p, { ownerName: p.ownerName ?? session!.ownerName ?? 'TransCash', remaining, expectedByDay })
  const phone = p.driverPhone ?? ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setMsg({ kind: 'success', text: 'Reçu copié : collez-le dans WhatsApp ou un SMS' })
    } catch {
      setMsg({ kind: 'error', text: 'Copie impossible ici : sélectionnez le texte du reçu à la main' })
    }
  }

  async function cancel(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      setData((await backend.cancelPayment(p!.id, reason)) as PaymentDetail)
      setCancelOpen(false)
      setMsg({ kind: 'success', text: 'Versement annulé : les journées concernées sont de nouveau dues' })
    } catch (err) {
      setMsg(msgOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <BackLink to={role === 'driver' ? '/' : '/versements'}>{role === 'driver' ? 'Accueil' : 'Versements'}</BackLink>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {/* Le reçu, présenté comme un ticket */}
      <section className={`rounded-2xl border-2 border-dashed border-line bg-surface p-5 ${p.cancelled ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">Reçu de versement</p>
            <p className="text-lg font-bold tabular-nums">{receiptNumber(p.receiptNo)}</p>
          </div>
          <div className="text-right text-sm">
            <p>{formatDay(p.paidOn)}</p>
            {p.cancelled && <p className="font-bold text-danger">ANNULÉ</p>}
          </div>
        </div>
        <div className="py-4 text-center">
          <Money amount={p.amount} currency={p.currency} large className="items-center" />
          <p className="mt-1 text-sm text-ink-soft">
            {METHOD_LABEL[p.method]}
            {p.reference ? ` · ${p.reference}` : ''}
            {p.kind === 'extra' ? ' · Exceptionnel' : ''}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-dashed border-line pt-3 text-sm">
          <dt className="text-ink-soft">Chauffeur</dt>
          <dd>
            {can(role, 'drivers.view') ? <Link to={`/chauffeurs/${p.driverId}`} className="underline-offset-2 hover:underline">{p.driverName}</Link> : p.driverName}
          </dd>
          {p.vehicleName && (
            <>
              <dt className="text-ink-soft">Engin</dt>
              <dd>{p.vehicleName}</dd>
            </>
          )}
          {p.note && (
            <>
              <dt className="text-ink-soft">{p.kind === 'extra' ? 'Motif' : 'Note'}</dt>
              <dd>{p.note}</dd>
            </>
          )}
          {p.currency !== base && p.rate && (
            <>
              <dt className="text-ink-soft">Taux</dt>
              <dd className="tabular-nums">1 $ = {p.rate} FC</dd>
            </>
          )}
          {p.createdByName && (
            <>
              <dt className="text-ink-soft">Reçu par</dt>
              <dd>{p.createdByName} · {formatDateTime(p.createdAt, bundle?.settings.timezone)}</dd>
            </>
          )}
          {p.cancelled && (
            <>
              <dt className="text-danger">Annulation</dt>
              <dd className="text-danger">{p.cancelReason}</dd>
            </>
          )}
        </dl>
        {p.allocations.length > 0 && (
          <div className="mt-3 border-t border-dashed border-line pt-3">
            <p className="mb-1 text-sm font-medium">Journées payées</p>
            <ul className="text-sm">
              {p.allocations.map((a) => {
                const expected = expectedByDay.get(`${a.vehicleId}|${a.date}`)
                return (
                  <li key={a.vehicleId + a.date} className="flex justify-between py-0.5 tabular-nums">
                    <span>
                      {formatDay(a.date)}
                      {expected !== undefined && a.amount < expected && <span className="text-ink-soft"> (partiel)</span>}
                    </span>
                    <span>{formatMoney(a.amount, a.currency)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {remaining && !p.cancelled && (
          <p className="mt-3 border-t border-dashed border-line pt-3 text-sm">
            Reste dû par le chauffeur à ce jour : <strong className={owedTotal ? 'text-danger' : ''}>{remaining}</strong>
          </p>
        )}
      </section>

      {!p.cancelled && role !== 'driver' && (
        <Card title="Envoyer le reçu au chauffeur">
          <div className="grid grid-cols-2 gap-2">
            <a href={whatsappLink(phone, text)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#1f9d55] px-3 font-semibold text-white">
              WhatsApp
            </a>
            <a href={smsLink(phone, text)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface-2 px-3 font-semibold">
              SMS
            </a>
          </div>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => void copy()}>
            Copier le texte du reçu
          </Button>
          <p className="mt-1 text-xs text-ink-soft">Numéro : <span className="select-all">{phone}</span></p>
        </Card>
      )}

      {role !== 'driver' && (
        <div className="flex gap-2">
          <ButtonLink to="/versements/nouveau">Nouveau versement</ButtonLink>
        </div>
      )}

      {!p.cancelled && can(role, 'payments.edit') && (
        <Card>
          {cancelOpen ? (
            <form onSubmit={cancel} className="space-y-3">
              <p className="text-sm">Le versement restera visible avec la mention « annulé », et les journées qu'il payait redeviendront dues.</p>
              <Field label="Motif de l'annulation" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={255} />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
                  Retour
                </Button>
                <Button type="submit" variant="danger" className="flex-1" busy={busy}>
                  Annuler le versement
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="ghost" className="w-full text-danger" onClick={() => setCancelOpen(true)}>
              Annuler ce versement (erreur de saisie…)
            </Button>
          )}
        </Card>
      )}
      {role !== 'driver' && (
        <details className="text-sm">
          <summary className="cursor-pointer py-1 font-medium text-brand">Voir le texte du reçu</summary>
          <pre className="mt-1 overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs whitespace-pre-wrap select-all">{text}</pre>
        </details>
      )}
    </div>
  )
}
