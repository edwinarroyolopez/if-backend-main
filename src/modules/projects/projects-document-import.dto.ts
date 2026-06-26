import { IsObject, IsString, MinLength } from 'class-validator';

export class PreviewProjectDocumentImportDto {
  @IsObject()
  documentImport!: Record<string, unknown>;
}

export class CommitProjectDocumentImportDto extends PreviewProjectDocumentImportDto {
  @IsString()
  @MinLength(16)
  previewToken!: string;
}
