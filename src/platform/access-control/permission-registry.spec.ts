import { parsePermissionKey, PERMISSION_REGISTRY } from './permission-registry';

describe('permission registry', () => {
  it('contains mandatory mission permission', () => {
    expect(PERMISSION_REGISTRY).toContain('flight.mission.complete');
    expect(PERMISSION_REGISTRY).toContain('flight.request.create');
    expect(PERMISSION_REGISTRY).toContain('flight.request.read');
    expect(PERMISSION_REGISTRY).toContain('flight.request.start');
    expect(PERMISSION_REGISTRY).toContain('flight.media.upload');
    expect(PERMISSION_REGISTRY).toContain('flight.observation.write');
  });

  it('parses permission parts', () => {
    expect(parsePermissionKey('finance.invoice.approve')).toEqual({
      moduleKey: 'finance',
      resourceKey: 'invoice',
      actionKey: 'approve',
    });
  });
});
