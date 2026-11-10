import { describe, expect, it } from 'vitest'
import { assignableRoles, can } from './permissions'

describe('permissions', () => {
  it('seuls super admin et admin modifient les paramètres', () => {
    expect(can('super_admin', 'settings.edit')).toBe(true)
    expect(can('admin', 'settings.edit')).toBe(true)
    expect(can('accountant', 'settings.edit')).toBe(false)
    expect(can('manager', 'settings.edit')).toBe(false)
    expect(can('driver', 'settings.edit')).toBe(false)
  })
  it('le chauffeur ne voit que sa propre situation', () => {
    expect(can('driver', 'dashboard.view')).toBe(false)
    expect(can('driver', 'dashboard.own')).toBe(true)
    expect(can('driver', 'payments.create')).toBe(false)
  })
  it('sans rôle : aucun droit', () => {
    expect(can(null, 'dashboard.view')).toBe(false)
  })
  it("un admin ne peut pas attribuer le rôle super admin", () => {
    expect(assignableRoles('admin')).not.toContain('super_admin')
    expect(assignableRoles('super_admin')).toContain('super_admin')
  })
})
