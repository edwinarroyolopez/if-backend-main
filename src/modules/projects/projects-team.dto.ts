import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PROJECT_MEMBERSHIP_ROLES,
  ProjectMembershipRole,
  ProjectMembershipStatus,
} from './project-membership.schema';

export class CreateProjectMembershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsIn(PROJECT_MEMBERSHIP_ROLES)
  role!: ProjectMembershipRole;

  @IsInt()
  @Min(1)
  @Max(80)
  capacity!: number;

  @IsOptional()
  @IsIn(['PLANNED', 'ACTIVE'])
  status?: Extract<ProjectMembershipStatus, 'PLANNED' | 'ACTIVE'>;
}

export class UpdateProjectMembershipDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsIn(PROJECT_MEMBERSHIP_ROLES)
  role?: ProjectMembershipRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(80)
  capacity?: number;
}

export class ExpectedProjectMembershipVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
