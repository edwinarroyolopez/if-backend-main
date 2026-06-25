import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { MissionMediaResourceType } from './mission-media-asset.schema';

export type UploadableFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

export type UploadedCloudinaryAsset = {
  cloudinaryPublicId: string;
  secureUrl: string;
  resourceType: MissionMediaResourceType;
  originalFilename?: string;
};

@Injectable()
export class CloudinaryUploadService {
  async uploadMissionMedia(input: {
    file: UploadableFile;
    organizationId: string;
    missionId: string;
  }): Promise<UploadedCloudinaryAsset> {
    const resourceType = this.detectResourceType(input.file.mimetype);
    const folder = `organizations/${input.organizationId}/missions/${input.missionId}`;
    const cloudName = process.env.CLOUDINARY_CLOUD?.trim();
    const apiKey = process.env.CLOUDINARY_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_SECRET?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      const digest = createHash('sha1')
        .update(input.file.buffer)
        .update(input.file.originalname)
        .digest('hex')
        .slice(0, 16);
      const cloudinaryPublicId = `${folder}/${digest}`;
      return {
        cloudinaryPublicId,
        secureUrl: `https://res.cloudinary.com/inflight-placeholder/${resourceType}/upload/${cloudinaryPublicId}`,
        resourceType,
        originalFilename: input.file.originalname,
      };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsToSign = {
      folder,
      overwrite: 'false',
      timestamp,
      unique_filename: 'true',
      use_filename: 'true',
    };
    const signaturePayload = Object.entries(paramsToSign)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const signature = createHash('sha1')
      .update(`${signaturePayload}${apiSecret}`)
      .digest('hex');

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(input.file.buffer)], { type: input.file.mimetype }), input.file.originalname);
    formData.append('api_key', apiKey);
    formData.append('signature', signature);
    for (const [key, value] of Object.entries(paramsToSign)) {
      formData.append(key, value);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      { method: 'POST', body: formData },
    );
    const body = (await response.json()) as {
      public_id?: string;
      secure_url?: string;
      error?: { message?: string };
    };
    if (!response.ok || !body.public_id || !body.secure_url) {
      throw new AppException(
        502,
        REASON_CODES.MEDIA_UPLOAD_FAILED,
        body.error?.message ?? 'Cloudinary upload failed',
      );
    }
    return {
      cloudinaryPublicId: body.public_id,
      secureUrl: body.secure_url,
      resourceType,
      originalFilename: input.file.originalname,
    };
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
}
