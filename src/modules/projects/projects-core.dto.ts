import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PROJECT_HEALTH_STATUSES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
} from 'src/common/types/domain.types';

export class CreateProjectDto {
  @IsString()
  organizationId!: string;

  @IsOptional()
  @IsIn(PROJECT_KINDS)
  projectKind?: ProjectKind;

  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxLength(160)
  key?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string;

  @IsOptional()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  accessRoleIds?: string[];
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  objective?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string;
}

export class TransitionProjectDto {
  @IsIn(PROJECT_STATUSES)
  targetStatus!: ProjectStatus;
}

export class UpdateProjectHealthDto {
  @IsIn(PROJECT_HEALTH_STATUSES)
  health!: ProjectHealth;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  healthReason?: string;
}

export class UpdateProjectAccessRolesDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  accessRoleIds!: string[];
}
