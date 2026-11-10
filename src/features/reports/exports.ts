// Exports PDF et Excel d'un rapport. Les bibliothèques ne sont chargées qu'au moment du clic.
import { EXPENSE_LABEL } from '../../domain/finance'
import { DECIMALS, formatMoney } from '../../domain/money'
import { METHOD_LABEL } from '../../domain/receipt'
import type { Report, ReportLine } from '../../domain/report'

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`)
/** Les polices standard du PDF ne connaissent pas certains caractères : on les remplace. */
const pdfText = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/[—–]/g, '-').replace(/…/g, '...').replace(/[’‘]/g, "'").replace(/≈/g, '~')

export function fileName(r: Report, ext: string) {
  const scope = r.title.replace(/^Rapport — /, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
  return `transcash-${scope}-${r.from}-au-${r.to}.${ext}`
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------------------------------------------------------------- PDF

export async function exportPdf(r: Report, ownerName: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const m = (n: number) => pdfText(formatMoney(n, r.currency))
  const green: [number, number, number] = [15, 122, 85]
  const tableStyle = { styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: green }, margin: { left: 36, right: 36 } }
  let y = 40

  doc.setFontSize(16)
  doc.text(pdfText(`${ownerName} — ${r.title.replace(/^Rapport — /, '')}`), 36, y)
  doc.setFontSize(9)
  doc.setTextColor(90)
  y += 16
  doc.text(pdfText(`Période du ${dmy(r.from)} au ${dmy(r.to)} · montants en ${r.currency} · édité le ${dmy(new Date().toISOString().slice(0, 10))}`), 36, y)
  doc.setTextColor(0)
  if (r.missingRate) {
    y += 12
    doc.setTextColor(194, 65, 12)
    doc.text(pdfText('Attention : taux de change manquant, certains montants dans l\'autre devise sont comptés à 0.'), 36, y)
    doc.setTextColor(0)
  }

  const t = r.totals
  autoTable(doc, {
    ...tableStyle,
    startY: y + 12,
    head: [['Résumé', '']],
    body: [
      ['Montant attendu (journées travaillées)', m(t.expected)],
      ['Payé pour ces journées', m(t.paid)],
      ['Reste dû (dettes de la période)', m(t.remaining)],
      ['Taux de recouvrement', pct(t.collectionRate)],
      ['Versements reçus (date de réception)', m(t.received)],
      ['  dont en caisse', m(t.receivedCash)],
      ['  dont dépenses payées par les chauffeurs', m(t.receivedDriverExpenses)],
      ['  dont versements exceptionnels', m(t.receivedExtra)],
      ['Dépenses', m(t.expenses)],
      ['Bénéfice réel (versements - dépenses)', m(t.profit)],
      ['Journées dues / impayées / panne / repos', `${t.dueDays} / ${t.unpaidDays} / ${t.breakdownDays} / ${t.restDays}`],
    ].map((row) => row.map(pdfText)),
    columnStyles: { 1: { halign: 'right' } },
  })

  const lines = (title: string, items: ReportLine[], relatedLabel: string) =>
    autoTable(doc, {
      ...tableStyle,
      head: [[title, relatedLabel, 'Attendu', 'Payé', 'Reste dû', 'Reçu', 'Dépenses', 'Bénéfice', 'Impayés']].map((h) => h.map(pdfText)),
      body: items.map((l) => [l.name, l.related.join(', '), m(l.expected), m(l.paid), m(l.remaining), m(l.received), m(l.expenses), m(l.profit), String(l.unpaidDays)].map(pdfText)),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    })
  if (r.byVehicle.length) lines('Engin', r.byVehicle, 'Chauffeurs')
  if (r.byDriver.length) lines('Chauffeur', r.byDriver, 'Engins')

  if (r.expensesByCategory.length) {
    autoTable(doc, {
      ...tableStyle,
      head: [['Dépenses par catégorie', 'Montant']],
      body: r.expensesByCategory.map((e) => [EXPENSE_LABEL[e.category], m(e.amount)].map(pdfText)),
      columnStyles: { 1: { halign: 'right' } },
    })
  }
  if (r.payments.length) {
    autoTable(doc, {
      ...tableStyle,
      head: [['Date', 'Reçu', 'Chauffeur', 'Engin', 'Mode', 'Montant']],
      body: r.payments.map((p) => [dmy(p.date), String(p.receiptNo), p.driverName, p.vehicleName, METHOD_LABEL[p.method] + (p.kind === 'extra' ? ' (exceptionnel)' : ''), formatMoney(p.amount, p.currency)].map(pdfText)),
      columnStyles: { 5: { halign: 'right' } },
    })
  }
  if (r.expenses.length) {
    autoTable(doc, {
      ...tableStyle,
      head: [['Date', 'Catégorie', 'Engin', 'Payée par', 'Note', 'Montant']],
      body: r.expenses.map((e) => [dmy(e.date), EXPENSE_LABEL[e.category], e.vehicleName, e.paidBy === 'driver' ? 'Chauffeur' : 'Caisse', e.note ?? '', formatMoney(e.amount, e.currency)].map(pdfText)),
      columnStyles: { 5: { halign: 'right' } },
    })
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(130)
    doc.text(`TransCash · page ${i}/${pages}`, 36, doc.internal.pageSize.getHeight() - 20)
  }
  save(doc.output('blob'), fileName(r, 'pdf'))
}

// ---------------------------------------------------------------- Excel

type Cell = { value: string | number | null; fontWeight?: 'bold'; format?: string; type?: NumberConstructor | StringConstructor } | null

export async function exportExcel(r: Report, ownerName: string) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const dec = DECIMALS[r.currency]
  const moneyFmt = dec ? '#,##0.00' : '#,##0'
  const money = (n: number): Cell => ({ value: n / 10 ** dec, type: Number, format: moneyFmt })
  const text = (s: string | null | undefined): Cell => ({ value: s ?? '', type: String })
  const head = (...h: string[]): Cell[] => h.map((x) => ({ value: x, fontWeight: 'bold' as const }))
  const native = (n: number, c: 'CDF' | 'USD'): Cell => ({ value: n / 10 ** DECIMALS[c], type: Number, format: DECIMALS[c] ? '#,##0.00' : '#,##0' })

  const t = r.totals
  const summary: Cell[][] = [
    [{ value: `${ownerName} — ${r.title.replace(/^Rapport — /, '')}`, fontWeight: 'bold' }],
    [text(`Période du ${dmy(r.from)} au ${dmy(r.to)} — montants en ${r.currency}`)],
    [],
    head('Indicateur', 'Montant'),
    [text('Montant attendu'), money(t.expected)],
    [text('Payé pour ces journées'), money(t.paid)],
    [text('Reste dû (dettes de la période)'), money(t.remaining)],
    [text('Taux de recouvrement'), text(pct(t.collectionRate))],
    [text('Versements reçus'), money(t.received)],
    [text('  dont en caisse'), money(t.receivedCash)],
    [text('  dont dépenses payées par les chauffeurs'), money(t.receivedDriverExpenses)],
    [text('  dont versements exceptionnels'), money(t.receivedExtra)],
    [text('Dépenses'), money(t.expenses)],
    [text('Bénéfice réel'), money(t.profit)],
    [text('Journées dues'), { value: t.dueDays, type: Number }],
    [text('Journées impayées'), { value: t.unpaidDays, type: Number }],
    [text('Journées de panne'), { value: t.breakdownDays, type: Number }],
    [text('Journées de repos'), { value: t.restDays, type: Number }],
  ]
  const lineSheet = (title: string, items: ReportLine[], related: string): Cell[][] => [
    head(title, related, 'Attendu', 'Payé', 'Reste dû', 'Reçu', 'Dépenses', 'Bénéfice', 'Jours dus', 'Impayés', 'Panne', 'Repos'),
    ...items.map((l) => [text(l.name), text(l.related.join(', ')), money(l.expected), money(l.paid), money(l.remaining), money(l.received), money(l.expenses), money(l.profit),
      { value: l.dueDays, type: Number }, { value: l.unpaidDays, type: Number }, { value: l.breakdownDays, type: Number }, { value: l.restDays, type: Number }] as Cell[]),
  ]
  const daily: Cell[][] = [head('Date', 'Attendu', 'Payé', 'Reçu', 'Dépenses'), ...r.daily.map((d) => [text(dmy(d.date)), money(d.expected), money(d.paid), money(d.received), money(d.expenses)])]
  const payments: Cell[][] = [
    head('Date', 'Reçu n°', 'Chauffeur', 'Engin', 'Type', 'Mode', 'Référence', 'Montant', 'Devise', `En ${r.currency}`),
    ...r.payments.map((p) => [text(dmy(p.date)), { value: p.receiptNo, type: Number }, text(p.driverName), text(p.vehicleName), text(p.kind === 'extra' ? 'Exceptionnel' : 'Journées'),
      text(METHOD_LABEL[p.method]), text(p.reference), native(p.amount, p.currency), text(p.currency), money(p.converted)] as Cell[]),
  ]
  const expenses: Cell[][] = [
    head('Date', 'Catégorie', 'Engin', 'Payée par', 'Fournisseur', 'Note', 'Montant', 'Devise', `En ${r.currency}`),
    ...r.expenses.map((e) => [text(dmy(e.date)), text(EXPENSE_LABEL[e.category]), text(e.vehicleName), text(e.paidBy === 'driver' ? 'Chauffeur' : 'Caisse'), text(e.supplier), text(e.note),
      native(e.amount, e.currency), text(e.currency), money(e.converted)] as Cell[]),
  ]
  const wide = (n: number, first = 24) => [{ width: first }, ...Array.from({ length: n - 1 }, () => ({ width: 14 }))]
  const blob = await writeExcelFile([
    { data: summary, sheet: 'Résumé', columns: [{ width: 42 }, { width: 18 }] },
    { data: lineSheet('Engin', r.byVehicle, 'Chauffeurs'), sheet: 'Par engin', columns: wide(12), stickyRowsCount: 1 },
    { data: lineSheet('Chauffeur', r.byDriver, 'Engins'), sheet: 'Par chauffeur', columns: wide(12), stickyRowsCount: 1 },
    { data: daily, sheet: 'Par jour', columns: wide(5, 12), stickyRowsCount: 1 },
    { data: payments, sheet: 'Versements', columns: wide(10, 12), stickyRowsCount: 1 },
    { data: expenses, sheet: 'Dépenses', columns: wide(9, 12), stickyRowsCount: 1 },
  ] as never).toBlob()
  save(blob, fileName(r, 'xlsx'))
}
