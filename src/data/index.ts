import { apiBackend } from './apiBackend'
import { demoBackend } from './demoBackend'

/** VITE_BACKEND=demo : données de démonstration dans le navigateur (prévisualisation). Sinon : API PHP. */
export const backend = import.meta.env.VITE_BACKEND === 'demo' ? demoBackend : apiBackend
export { BackendError } from './backend'
