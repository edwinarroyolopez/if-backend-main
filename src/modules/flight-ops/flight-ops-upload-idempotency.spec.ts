import { AuthenticatedPrincipal } from 'src/common/types/authenticated-principal';
import { FlightOpsService } from './flight-ops.service';

describe('FlightOpsService upload idempotency', () => {
  it('does not call external storage for a completed idempotency key', async () => {
    const mediaStorage = { uploadMissionMedia: jest.fn() };
    const service = new FlightOpsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        runInTransaction: (handler: (session: unknown) => Promise<unknown>) =>
          handler({}),
      } as never,
      {
        begin: jest.fn().mockResolvedValue({
          type: 'completed',
          record: { responseBody: { id: 'existing-media' } },
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      mediaStorage as never,
      {} as never,
    );

    await expect(
      service.uploadMissionMedia(
        testPrincipal,
        '60f7f77bcf86cd7994390111',
        {
          buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
          mimetype: 'image/jpeg',
          originalname: 'photo.jpg',
        },
        'same-key',
      ),
    ).resolves.toEqual({ id: 'existing-media' });
    expect(mediaStorage.uploadMissionMedia).not.toHaveBeenCalled();
  });
});

const testPrincipal: AuthenticatedPrincipal = {
  sub: '60f7f77bcf86cd7994390100',
  principalType: 'USER',
  sessionId: 'session',
  sessionVersion: 0,
  authorizationVersion: 0,
  authorizationFingerprint: 'fingerprint',
  sessionKind: 'HUMAN',
  readOnly: false,
  activeOrganizationId: 'org-1',
};
