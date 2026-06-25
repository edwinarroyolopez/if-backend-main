import {
  IsMongoId,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ConnectProjectConnectorDto {
  @IsMongoId()
  connectionId!: string;

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  projectKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(253)
  @Matches(
    /^(localhost|127\.0\.0\.1|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)(?::[1-9][0-9]{0,4})?$/,
  )
  host!: string;
}
