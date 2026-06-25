import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PROJECT_DOCUMENT_PAGE_TYPES,
  ProjectDocumentPageStatus,
  ProjectDocumentPageType,
} from './project-document-page.schema';

export class UpdateProjectDocumentationChecklistItemDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  text!: string;

  @IsBoolean()
  required!: boolean;

  @IsBoolean()
  completed!: boolean;
}

export class UpdateProjectDocumentationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentPageId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsIn([
    'OVERVIEW',
    'OBJECTIVES',
    'SCOPE',
    'TECHNOLOGIES',
    'ARCHITECTURE',
    'TEAM',
    'RISKS',
    'DEPENDENCIES',
    'DELIVERABLES',
    'DECISIONS',
    'CUSTOM',
  ])
  pageType?:
    | 'OVERVIEW'
    | 'OBJECTIVES'
    | 'SCOPE'
    | 'TECHNOLOGIES'
    | 'ARCHITECTURE'
    | 'TEAM'
    | 'RISKS'
    | 'DEPENDENCIES'
    | 'DELIVERABLES'
    | 'DECISIONS'
    | 'CUSTOM';

  @IsOptional()
  @IsIn(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED'])
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED';

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProjectDocumentationChecklistItemDto)
  checklist?: UpdateProjectDocumentationChecklistItemDto[];
}

export class ProjectDocumentPageChecklistItemDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  text!: string;

  @IsBoolean()
  required!: boolean;

  @IsBoolean()
  completed!: boolean;
}

export class CreateProjectDocumentPageDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentPageId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsIn(PROJECT_DOCUMENT_PAGE_TYPES)
  pageType?: ProjectDocumentPageType;

  @IsOptional()
  @IsIn(['DRAFT', 'IN_REVIEW'])
  status?: Extract<ProjectDocumentPageStatus, 'DRAFT' | 'IN_REVIEW'>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDocumentPageChecklistItemDto)
  checklist?: ProjectDocumentPageChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  facts?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assumptions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  decisions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  openQuestions?: string[];
}

export class UpdateProjectDocumentPageDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentPageId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsIn(PROJECT_DOCUMENT_PAGE_TYPES)
  pageType?: ProjectDocumentPageType;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDocumentPageChecklistItemDto)
  checklist?: ProjectDocumentPageChecklistItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  facts?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assumptions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  decisions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  risks?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  openQuestions?: string[];
}

export class ExpectedProjectDocumentPageVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReorderProjectDocumentPageItemDto {
  @IsMongoId()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderProjectDocumentPagesDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderProjectDocumentPageItemDto)
  items!: ReorderProjectDocumentPageItemDto[];
}

export class PreviewProjectDocumentImportDto {
  @IsObject()
  documentImport!: Record<string, unknown>;
}

export class CommitProjectDocumentImportDto extends PreviewProjectDocumentImportDto {
  @IsString()
  @MinLength(16)
  previewToken!: string;
}
