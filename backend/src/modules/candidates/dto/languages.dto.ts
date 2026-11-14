import { ApiProperty } from '@nestjs/swagger';
import { LanguageProficiency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CandidateLanguageItemDto {
  @ApiProperty({ example: 'FR', description: 'Code langue ISO (FR, AR, EN, BER, ES...)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  languageCode!: string;

  @ApiProperty({ enum: LanguageProficiency, example: LanguageProficiency.COURANT_PROFESSIONNEL })
  @IsEnum(LanguageProficiency)
  proficiencyLevel!: LanguageProficiency;
}

export class SetCandidateLanguagesDto {
  @ApiProperty({ type: [CandidateLanguageItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CandidateLanguageItemDto)
  languages!: CandidateLanguageItemDto[];
}
