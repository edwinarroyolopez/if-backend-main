import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UpdateProjectRoadmapItemDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsIn(['PLANNED', 'ACTIVE', 'DONE', 'BLOCKED', 'CANCELLED'])
  status!: 'PLANNED' | 'ACTIVE' | 'DONE' | 'BLOCKED' | 'CANCELLED';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  owners?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryRisk?: string;
}

export class UpdateProjectRoadmapDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PLANNING', 'ACTIVE', 'REVIEW', 'ARCHIVED'])
  status?: 'DRAFT' | 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'ARCHIVED';

  @IsOptional()
  @IsInt()
  @Min(1)
  horizonMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProjectRoadmapItemDto)
  items?: UpdateProjectRoadmapItemDto[];
}

export class BuildRoadmapPromptDto {
  @IsString()
  @MinLength(1)
  snapshotId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60000)
  roadmapDraft?: string;
}

export class PreviewProjectRoadmapImportDto {
  @IsObject()
  roadmapImport!: Record<string, unknown>;
}

export class CommitProjectRoadmapImportDto extends PreviewProjectRoadmapImportDto {
  @IsString()
  @MinLength(16)
  previewToken!: string;
}
