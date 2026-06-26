import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { MissionMediaResourceType } from './mission-media-asset.schema';
import {
  MissionMediaStoragePort,
  UploadedMissionMediaAsset,
  UploadableFile,
} from './mission-media-storage.port';

@Injectable()
export class CloudinaryUploadService implements MissionMediaStoragePort {
  constructor(private readonly configService: ConfigService) {}

  async uploadMissionMedia(input: {
    file: UploadableFile;
    organizationId: string;
    missionId: string;
  }): Promise<UploadedMissionMediaAsset> {
    const resourceType = this.detectResourceType(input.file.mimetype);
    const folder = `organizations/${input.organizationId}/missions/${input.missionId}`;
    const config = this.getConfig();

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsToSign = {
      folder,
      overwrite: 'false',
      timestamp,
      unique_filename: 'true',
      use_filename: 'true',
    };
    const signature = signCloudinaryParams(paramsToSign, config.apiSecret);

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(input.file.buffer)], {
        type: input.file.mimetype,
      }),
      input.file.originalname,
    );
    formData.append('api_key', config.apiKey);
    formData.append('signature', signature);
    for (const [key, value] of Object.entries(paramsToSign)) {
      formData.append(key, value);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
      { method: 'POST', body: formData },
    );
    const body = await parseCloudinaryResponse(response);
    if (!response.ok || !body.publicId || !body.secureUrl) {
      throw new AppException(
        502,
        REASON_CODES.MEDIA_UPLOAD_FAILED,
        body.errorMessage ?? 'Cloudinary upload failed',
      );
    }
    return {
      storagePublicId: body.publicId,
      secureUrl: body.secureUrl,
      resourceType,
      originalFilename: input.file.originalname,
    };
  }

  async deleteMissionMedia(input: {
    storagePublicId: string;
    resourceType: MissionMediaResourceType;
  }): Promise<void> {
    const config = this.getConfig();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsToSign = {
      public_id: input.storagePublicId,
      timestamp,
    };
    const formData = new FormData();
    formData.append('api_key', config.apiKey);
    formData.append('public_id', input.storagePublicId);
    formData.append(
      'signature',
      signCloudinaryParams(paramsToSign, config.apiSecret),
    );
    formData.append('timestamp', timestamp);

    await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/${input.resourceType}/destroy`,
      { method: 'POST', body: formData },
    );
  }

  private detectResourceType(mime: string): MissionMediaResourceType {
    if (mime.startsWith('image/')) {
      return 'image';
    }
    if (mime.startsWith('video/')) {
      return 'video';
    }
    throw new AppException(
      400,
      REASON_CODES.MEDIA_UNSUPPORTED_TYPE,
      'Only image and video files are supported',
    );
  }

  private getConfig() {
    const cloudName = this.configService.get<string>('app.cloudinaryCloudName');
    const apiKey = this.configService.get<string>('app.cloudinaryApiKey');
    const apiSecret = this.configService.get<string>('app.cloudinaryApiSecret');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new AppException(
        503,
        REASON_CODES.MEDIA_UPLOAD_FAILED,
        'Cloudinary storage is not configured',
      );
    }
    return { cloudName, apiKey, apiSecret };
  }
}

function signCloudinaryParams(
  params: Record<string, string>,
  apiSecret: string,
) {
  const signaturePayload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return createHash('sha1')
    .update(`${signaturePayload}${apiSecret}`)
    .digest('hex');
}

async function parseCloudinaryResponse(response: Response): Promise<{
  publicId?: string;
  secureUrl?: string;
  errorMessage?: string;
}> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppException(
      502,
      REASON_CODES.MEDIA_UPLOAD_FAILED,
      'Cloudinary returned a non-JSON response',
    );
  }
  if (!isRecord(payload)) {
    throw new AppException(
      502,
      REASON_CODES.MEDIA_UPLOAD_FAILED,
      'Cloudinary returned an invalid response',
    );
  }
  return {
    publicId: getString(payload.public_id),
    secureUrl: getString(payload.secure_url),
    errorMessage: isRecord(payload.error)
      ? getString(payload.error.message)
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
