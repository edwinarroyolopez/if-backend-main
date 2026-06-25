import {
  IsBooleanString,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CoordinatesDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

class ScheduledWindowDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

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

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  buildingName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(260)
  address!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;

  @ValidateNested()
  @Type(() => ScheduledWindowDto)
  scheduledWindow!: ScheduledWindowDto;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerServiceObservations?: string;

  @IsOptional()
  @IsString()
  assignedPilotId?: string;
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

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  @IsOptional()
  @IsIn(['NOT_READY', 'PENDING_REVIEW', 'REVIEWED_CLOSED'])
  reviewStatus?: 'NOT_READY' | 'PENDING_REVIEW' | 'REVIEWED_CLOSED';

  @IsOptional()
  @IsBooleanString()
  assignedToMe?: string;
}

export class AssignMissionDto {
  @IsString()
  assignedPilotId!: string;
}

export class RejectMissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  observations!: string;
}

export class CompleteMissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pilotObservations?: string;
}

export class ReviewCloseMissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewObservations?: string;
}

export class MissionObservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;
}

export class FailMissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  observations!: string;
}
