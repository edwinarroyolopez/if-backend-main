import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { assertUploadableMissionMedia } from './mission-media-file.policy';

describe('mission media file policy', () => {
  it('accepts supported files with matching magic bytes', () => {
    expect(() =>
      assertUploadableMissionMedia({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
      }),
    ).not.toThrow();
  });

  it('rejects supported mimetypes with mismatched magic bytes', () => {
    expectReasonCode(
      () =>
        assertUploadableMissionMedia({
          buffer: Buffer.from('not-a-png'),
          mimetype: 'image/png',
          originalname: 'photo.png',
        }),
      REASON_CODES.MEDIA_UNSUPPORTED_TYPE,
    );
  });

  it('rejects empty files', () => {
    expectReasonCode(
      () =>
        assertUploadableMissionMedia({
          buffer: Buffer.alloc(0),
          mimetype: 'image/jpeg',
          originalname: 'empty.jpg',
        }),
      REASON_CODES.VALIDATION_FAILED,
    );
  });
});

function expectReasonCode(action: () => void, reasonCode: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).reasonCode).toBe(reasonCode);
    return;
  }
  throw new Error('Expected AppException');
}
