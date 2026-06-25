import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMissionDto {
  @IsString()
  organizationId!: string;

  @IsMongoId()
  projectId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  key!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PLANNED', 'READY', 'IN_PROGRESS'])
  status?: 'DRAFT' | 'PLANNED' | 'READY' | 'IN_PROGRESS';
}

export class ListMissionsQueryDto {
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsIn([
    'DRAFT',
    'PLANNED',
    'READY',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'FAILED',
  ])
  status?:
    | 'DRAFT'
    | 'PLANNED'
    | 'READY'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'FAILED';
}
