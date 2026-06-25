import {
  ArrayNotEmpty,
  ArrayUnique,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PROJECT_SPRINT_ITEM_BOARD_STATUSES } from './project-sprint-item.schema';

export class CreateProjectSprintDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  goal?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
}

export class AddProjectSprintItemsDto {
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsMongoId({ each: true })
  backlogItemIds!: string[];
}

export class MoveProjectSprintItemDto {
  @IsMongoId()
  itemId!: string;

  @IsIn(PROJECT_SPRINT_ITEM_BOARD_STATUSES)
  toStatus!: (typeof PROJECT_SPRINT_ITEM_BOARD_STATUSES)[number];

  @IsInt()
  @Min(0)
  order!: number;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
