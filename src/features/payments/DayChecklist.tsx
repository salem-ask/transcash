// Liste de journées à cocher (versement ou dépense payée par le chauffeur), avec l'aperçu de la répartition.
import { formatMoney } from '../../domain/money'
import { dayKey, type LedgerDay } from '../../domain/ledger'

export function DayChecklist({
  days,
  selected,
  onToggle,
  allocated,
  showPreview,
  multiVehicle,
}: {
  days: LedgerDay[]
  selected: Set<string>
  onToggle: (d: LedgerDay) => void
  /** Montant affecté à chaque journée cochée (aperçu) */
  allocated: Map<string, number>
  showPreview: boolean
  multiVehicle: boolean
}) {
  return (
    <ul className="divide-y divide-line">
      {days.map((d) => {
        const k = dayKey(d)
        const on = selected.has(k)
        const alloc = allocated.get(k)
        const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T00:00:00Z`))
        return (
          <li key={k}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
              <input type="checkbox" checked={on} onChange={() => onToggle(d)} className="size-6 shrink-0 accent-[var(--color-brand)]" />
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
                {on && showPreview && (
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
}
