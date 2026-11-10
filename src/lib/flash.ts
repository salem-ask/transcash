// Message à afficher sur l'écran suivant (ex. « enregistré sur le téléphone » après un formulaire hors ligne).
type Flash = { kind: 'success' | 'info' | 'error'; text: string; at: number }
let pending: Flash | null = null
const listeners = new Set<() => void>()

export function setFlash(text: string, kind: Flash['kind'] = 'info') {
  pending = { kind, text, at: Date.now() }
  for (const l of listeners) l()
}
/** Le message en attente, sans le consommer (affichage immédiat sur l'écran courant). */
export const peekFlash = () => pending
/** Au changement d'écran : consomme le message s'il vient d'être posé (moins de 3 s), sinon rien. */
export function takeFlash(): Flash | null {
  const f = pending
  pending = null
  return f && Date.now() - f.at < 3000 ? f : null
}
export function onFlash(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
