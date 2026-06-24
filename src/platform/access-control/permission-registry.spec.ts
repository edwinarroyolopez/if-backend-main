import { parsePermissionKey, PERMISSION_REGISTRY } from './permission-registry';

describe('permission registry', () => {
  it('contains mandatory mission permission', () => {
    expect(PERMISSION_REGISTRY).toContain('flight.mission.complete');
  });

  it('parses permission parts', () => {
    expect(parsePermissionKey('finance.invoice.approve')).toEqual({
      moduleKey: 'finance',
      resourceKey: 'invoice',
      actionKey: 'approve',
    });
  });
});
