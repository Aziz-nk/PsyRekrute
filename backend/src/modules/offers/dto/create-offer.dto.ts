import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DegreeLevel,
  LanguageProficiency,
  OfferType,
  SkillLevel,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MOROCCAN_REGION_CODES } from '../../../constants/moroccan-regions.constant';

export const CONTRACT_SUB_TYPES = [
  'CONVENTION_STAGE',
  'CDD',
  'CDI',
  'VACATION',
] as const;

export const OFFER_LANGUAGE_CODES = [
  'AR_STANDARD',
  'AR_DARIJA',
  'FR',
  'EN',
] as const;

export class OfferRequiredSkillItemDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID()
  skillId!: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean = false;

  @ApiProperty({ enum: SkillLevel, example: SkillLevel.AUTONOME })
  @IsEnum(SkillLevel)
  minRequiredLevel!: SkillLevel;

  @ApiPropertyOptional({ example: 2, default: 1, minimum: 1, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  weight?: number = 1;
}

export class OfferRequiredLanguageItemDto {
  @ApiProperty({
    example: 'FR',
    enum: OFFER_LANGUAGE_CODES,
  })
  @IsString()
  @IsIn(OFFER_LANGUAGE_CODES)
  languageCode!: string;

  @ApiProperty({
    enum: LanguageProficiency,
    example: LanguageProficiency.COURANT_PROFESSIONNEL,
  })
  @IsEnum(LanguageProficiency)
  minProficiencyLevel!: LanguageProficiency;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean = true;
}

export class CreateJobOfferDto {
  @ApiProperty({ example: 'Stage PFE Neuropsychologie Infantile' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @ApiProperty({ enum: OfferType, example: OfferType.STAGE_PFE })
  @IsEnum(OfferType)
  offerType!: OfferType;

  @ApiProperty({
    example: 'CONVENTION_STAGE',
    enum: CONTRACT_SUB_TYPES,
  })
  @IsString()
  @IsIn(CONTRACT_SUB_TYPES)
  contractSubType!: string;

  @ApiProperty({ enum: DegreeLevel, example: DegreeLevel.BAC_5_MASTER })
  @IsEnum(DegreeLevel)
  requiredDegreeLevel!: DegreeLevel;

  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID()
  targetSpecialtyId!: string;

  @ApiProperty({ example: 'MA-04', enum: MOROCCAN_REGION_CODES })
  @IsString()
  @IsIn(MOROCCAN_REGION_CODES)
  regionCode!: string;

  @ApiProperty({ example: 'Rabat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityName!: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  minExperienceMonths?: number = 0;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isExperienceMandatory?: boolean = false;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths?: number;

  @ApiPropertyOptional({ example: '2000 MAD / mois' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  remunerationStipend?: string;

  @ApiProperty({
    example:
      'Accompagnement psycho-éducatif et passation de bilans cognitifs supervisés auprès d enfants présentant des troubles des apprentissages.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(10000)
  description!: string;

  @ApiPropertyOptional({ type: [OfferRequiredSkillItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferRequiredSkillItemDto)
  requiredSkills?: OfferRequiredSkillItemDto[];

  @ApiPropertyOptional({ type: [OfferRequiredLanguageItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferRequiredLanguageItemDto)
  requiredLanguages?: OfferRequiredLanguageItemDto[];
}

export class UpdateJobOfferDto {
  @ApiPropertyOptional({ example: 'Stage PFE Neuropsychologie Infantile' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ enum: OfferType, example: OfferType.STAGE_PFE })
  @IsOptional()
  @IsEnum(OfferType)
  offerType?: OfferType;

  @ApiPropertyOptional({
    example: 'CONVENTION_STAGE',
    enum: CONTRACT_SUB_TYPES,
  })
  @IsOptional()
  @IsString()
  @IsIn(CONTRACT_SUB_TYPES)
  contractSubType?: string;

  @ApiPropertyOptional({ enum: DegreeLevel, example: DegreeLevel.BAC_5_MASTER })
  @IsOptional()
  @IsEnum(DegreeLevel)
  requiredDegreeLevel?: DegreeLevel;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID()
  targetSpecialtyId?: string;

  @ApiPropertyOptional({ example: 'MA-04', enum: MOROCCAN_REGION_CODES })
  @IsOptional()
  @IsString()
  @IsIn(MOROCCAN_REGION_CODES)
  regionCode?: string;

  @ApiPropertyOptional({ example: 'Rabat' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityName?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  minExperienceMonths?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isExperienceMandatory?: boolean;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths?: number | null;

  @ApiPropertyOptional({ example: '2000 MAD / mois' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  remunerationStipend?: string | null;

  @ApiPropertyOptional({
    example: 'Description mise à jour de l offre de stage.',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ type: [OfferRequiredSkillItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferRequiredSkillItemDto)
  requiredSkills?: OfferRequiredSkillItemDto[];

  @ApiPropertyOptional({ type: [OfferRequiredLanguageItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferRequiredLanguageItemDto)
  requiredLanguages?: OfferRequiredLanguageItemDto[];
}
