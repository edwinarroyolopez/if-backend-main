import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PROJECT_BACKLOG_ITEM_STATUSES,
  PROJECT_BACKLOG_ITEM_TYPES,
  ProjectBacklogItemStatus,
  ProjectBacklogItemType,
} from './project-backlog-item.schema';

export class CreateProjectBacklogItemDto {
  @IsString()
  roadmapId!: string;

  @IsString()
  roadmapVersionId!: string;

  @IsString()
  milestoneId!: string;

  @IsString()
  milestoneKey!: string;

  @IsString()
  milestoneTitle!: string;

  @IsString()
  epicId!: string;

  @IsString()
  epicKey!: string;

  @IsString()
  epicTitle!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsIn(PROJECT_BACKLOG_ITEM_TYPES)
  type!: ProjectBacklogItemType;

  @IsInt()
  @Min(0)
  priority!: number;

  @IsObject()
  estimate!: Record<string, unknown>;

  @IsOptional()
  @IsIn(['UNREFINED', 'READY', 'SELECTED_FOR_SPRINT'])
  status?: Exclude<ProjectBacklogItemStatus, 'ARCHIVED'>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];

  @IsOptional()
  @IsArray()
  sourceReferences?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  traceability?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  sourceCandidateKey?: string;
}

export class UpdateProjectBacklogItemDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(PROJECT_BACKLOG_ITEM_TYPES)
  type?: ProjectBacklogItemType;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsObject()
  estimate?: Record<string, unknown>;

  @IsOptional()
  @IsIn(PROJECT_BACKLOG_ITEM_STATUSES)
  status?: ProjectBacklogItemStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];

  @IsOptional()
  @IsArray()
  sourceReferences?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  traceability?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class ReorderProjectBacklogItemDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReorderProjectBacklogItemsDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderProjectBacklogItemDto)
  items!: ReorderProjectBacklogItemDto[];
}

export class CommitBacklogImportFromRoadmapDto {
  @IsString()
  @MinLength(16)
  previewToken!: string;
}
