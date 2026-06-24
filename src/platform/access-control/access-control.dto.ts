import {
  ArrayNotEmpty,
  ArrayUnique,
  IsIn,
  IsMongoId,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;
}

export class AssignPermissionsDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];
}

export class CreateRoleAssignmentDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  principalId!: string;

  @IsMongoId()
  roleId!: string;

  @IsIn([
    'ORGANIZATION',
    'MODULE',
    'PROJECT',
    'CLIENT',
    'MISSION',
    'MEDIA_BATCH',
    'SAMPLE',
    'DELIVERABLE',
    'INVOICE',
    'ENVIRONMENT',
  ])
  scopeType!:
    | 'ORGANIZATION'
    | 'MODULE'
    | 'PROJECT'
    | 'CLIENT'
    | 'MISSION'
    | 'MEDIA_BATCH'
    | 'SAMPLE'
    | 'DELIVERABLE'
    | 'INVOICE'
    | 'ENVIRONMENT';

  @IsString()
  scopeId!: string;
}
