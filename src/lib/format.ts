/** Date « AAAA-MM-JJ HH:MM:SS » (UTC, venant du serveur) → texte lisible dans le fuseau donné. */
export function formatDateTime(utc: string | null, timezone = 'Africa/Kinshasa'): string {
  if (!utc) return '—'
  const d = new Date(utc.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return utc
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(d)
}

export function formatToday(timezone = 'Africa/Kinshasa'): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date())
}

export const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
