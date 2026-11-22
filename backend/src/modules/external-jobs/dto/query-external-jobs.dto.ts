import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ExternalJobStatus } from '@prisma/client';

export class QueryExternalJobsDto {
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

  @ApiPropertyOptional({ description: 'Filtrer par ville marocaine (ex: Rabat, Casablanca)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cityName?: string;

  @ApiPropertyOptional({ description: 'Filtrer par catégorie' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Filtrer par type de contrat (ex: Stage, Emploi)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractType?: string;

  @ApiPropertyOptional({ description: 'Recherche textuelle dans le titre ou le résumé' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ExternalJobStatus, description: 'Statut (utilisé par la console admin)' })
  @IsOptional()
  @IsEnum(ExternalJobStatus)
  status?: ExternalJobStatus;
}
