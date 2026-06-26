import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { UploadableFile } from './mission-media-storage.port';

export const MAX_MISSION_MEDIA_BYTES = 25 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
]);

export function assertUploadableMissionMedia(file: UploadableFile) {
  if (!file.buffer.length) {
    throwValidation('File is empty');
  }
  if ((file.size ?? file.buffer.length) > MAX_MISSION_MEDIA_BYTES) {
    throwValidation('File exceeds the upload size limit');
  }
  if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
    throwUnsupported();
  }
  if (!magicMatchesMime(file.buffer, file.mimetype)) {
    throwUnsupported();
  }
}

export function missionMediaFileFilter(
  _request: unknown,
  file: { mimetype: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
    callback(unsupportedTypeError(), false);
    return;
  }
  callback(null, true);
}

function magicMatchesMime(buffer: Buffer, mime: string) {
  if (mime === 'image/jpeg') return startsWith(buffer, [0xff, 0xd8, 0xff]);
  if (mime === 'image/png') return startsWith(buffer, pngSignature);
  if (mime === 'image/webp') return isWebp(buffer);
  if (mime === 'image/gif') return isGif(buffer);
  if (mime === 'video/mp4' || mime === 'video/quicktime') {
    return isIsoBmff(buffer);
  }
  return false;
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer: Buffer, signature: number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer) {
  return (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isGif(buffer: Buffer) {
  const header = buffer.subarray(0, 6).toString('ascii');
  return header === 'GIF87a' || header === 'GIF89a';
}

function isIsoBmff(buffer: Buffer) {
  return (
    buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
  );
}

function throwUnsupported(): never {
  throw unsupportedTypeError();
}

function unsupportedTypeError() {
  return new AppException(
    400,
    REASON_CODES.MEDIA_UNSUPPORTED_TYPE,
    'Only supported image and video files can be uploaded',
  );
}

function throwValidation(message: string): never {
  throw new AppException(400, REASON_CODES.VALIDATION_FAILED, message);
}
