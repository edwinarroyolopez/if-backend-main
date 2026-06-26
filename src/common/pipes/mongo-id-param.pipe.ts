import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { AppException } from 'src/common/errors/app-exception';
import { REASON_CODES } from 'src/common/errors/reason-codes';
import { isObjectId } from 'src/common/utils/object-id.util';

@Injectable()
export class MongoIdParamPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (isObjectId(value)) {
      return value;
    }

    throw new AppException(
      404,
      REASON_CODES.RESOURCE_NOT_FOUND,
      `${metadata.data ?? 'Resource'} was not found`,
    );
  }
}
