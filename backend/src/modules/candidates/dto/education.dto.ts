import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DegreeLevel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddCandidateEducationDto {
  @ApiProperty({ enum: DegreeLevel, example: DegreeLevel.BAC_3 })
  @IsEnum(DegreeLevel)
  degreeLevel!: DegreeLevel;

  @ApiProperty({ example: 'Licence fondamentale en psychologie' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  degreeTitle!: string;

  @ApiProperty({ example: 'Université Hassan II - Faculté des Lettres et Sciences Humaines' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  institutionName!: string;

  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID()
  specialtyId!: string;

  @ApiProperty({ example: 2023 })
  @IsInt()
  @Min(1970)
  @Max(2100)
  startYear!: number;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2100)
  endYear?: number;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isCurrentlyEnrolled?: boolean = false;
}
