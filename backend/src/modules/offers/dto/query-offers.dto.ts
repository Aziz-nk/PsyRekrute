import { ApiPropertyOptional } from '@nestjs/swagger';
import { OfferType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MOROCCAN_REGION_CODES } from '../../../constants/moroccan-regions.constant';

export const OFFER_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'CLOSED',
  'ARCHIVED',
] as const;

export type OfferStatusType = (typeof OFFER_STATUSES)[number];

export class QueryJobOffersDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: OfferType })
  @IsOptional()
  @IsEnum(OfferType)
  offerType?: OfferType;

  @ApiPropertyOptional({ enum: MOROCCAN_REGION_CODES })
  @IsOptional()
  @IsString()
  @IsIn(MOROCCAN_REGION_CODES)
  regionCode?: string;

  @ApiPropertyOptional({ description: 'Nom de la ville (ex: Rabat, Casablanca)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cityName?: string;

  @ApiPropertyOptional({ description: 'UUID de la spécialité ciblée' })
  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @ApiPropertyOptional({
    description: 'Recherche textuelle dans le titre et la description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class QueryOrgJobOffersDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: OFFER_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(OFFER_STATUSES)
  status?: OfferStatusType;
}
