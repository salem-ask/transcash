// Droits par rôle — source unique : api/permissions.json (partagé avec l'API PHP).
import config from '../../api/permissions.json'
import type { Role } from './types'

export type Permission = keyof typeof config.permissions

const table = config.permissions as Record<Permission, Role[]>

export const ROLES = Object.keys(config.roles) as Role[]

export function roleLabel(role: Role): string {
  return config.roles[role].label
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && table[permission].includes(role)
}

/** Rôles qu'un utilisateur peut attribuer : seul un super admin attribue « super admin ». */
export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((r) => r !== 'super_admin' || actor === 'super_admin')
}
