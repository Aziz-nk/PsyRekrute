import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExperienceType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AddCandidateExperienceDto {
  @ApiProperty({ enum: ExperienceType, example: ExperienceType.STAGE_OBSERVATION })
  @IsEnum(ExperienceType)
  experienceType!: ExperienceType;

  @ApiProperty({ example: 'Centre Psycho-Éducatif Al-Amal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organizationName!: string;

  @ApiProperty({ example: 'Stagiaire en observation clinique' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  positionTitle!: string;

  @ApiPropertyOptional({ example: 'Enfants 6-12 ans (TSA et DYS)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetAudience?: string;

  @ApiProperty({ example: '2025-02-01' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiPropertyOptional({ example: '2025-05-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean = false;

  @ApiProperty({ example: 4, description: 'Durée totale en mois' })
  @IsInt()
  @Min(1)
  totalMonths!: number;

  @ApiPropertyOptional({ example: 'Observation des bilans psychométriques et participation aux ateliers psycho-éducatifs.' })
  @IsOptional()
  @IsString()
  description?: string;
}
