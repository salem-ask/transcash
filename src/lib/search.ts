/** Recherche sans tenir compte des accents ni de la casse. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const norm = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const q = norm(query.trim())
  return !q || fields.some((f) => f && norm(f).replace(/\s/g, '').includes(q.replace(/\s/g, '')))
}
