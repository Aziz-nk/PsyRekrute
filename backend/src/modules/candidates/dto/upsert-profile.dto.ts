import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityStatus, ProfileCategory } from '@prisma/client';
import {
  IsArray,
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

export class UpsertCandidateProfileDto {
  @ApiProperty({ example: 'Kenza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'El Fassi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: '+212661000001' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ enum: ProfileCategory, example: ProfileCategory.STUDENT })
  @IsEnum(ProfileCategory)
  profileCategory!: ProfileCategory;

  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID()
  primarySpecialtyId!: string;

  @ApiProperty({ example: 'MA-06', description: 'Code ISO de la région marocaine' })
  @IsString()
  @IsNotEmpty()
  regionCode!: string;

  @ApiProperty({ example: 'Casablanca' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityName!: string;

  @ApiPropertyOptional({ example: 25, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  mobilityRadiusKm?: number = 0;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  openToRelocation?: boolean = false;

  @ApiProperty({ enum: AvailabilityStatus, example: AvailabilityStatus.IMMEDIATE })
  @IsEnum(AvailabilityStatus)
  availabilityStatus!: AvailabilityStatus;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsString()
  availableFrom?: string;

  @ApiPropertyOptional({ example: ['STAGE_OBSERVATION', 'STAGE_PFE'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetContractTypes?: string[] = [];

  @ApiPropertyOptional({ example: 'Étudiante passionnée par la psychologie cognitive et le développement de l enfant.' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: true, default: true, description: 'Anonymisation des coordonnées dans le vivier (DEC-02 / D4)' })
  @IsOptional()
  @IsBoolean()
  isAnonymizedInPool?: boolean = true;
}
