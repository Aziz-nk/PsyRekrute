import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const REVIEW_ACTIONS = ['PUBLISH', 'REJECT', 'EXPIRE'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export class ReviewExternalJobDto {
  @ApiProperty({
    description: 'Action administrative à exécuter',
    enum: REVIEW_ACTIONS,
    example: 'PUBLISH',
  })
  @IsNotEmpty()
  @IsIn(REVIEW_ACTIONS)
  action!: ReviewAction;

  @ApiPropertyOptional({ description: 'Titre ajusté de l\'annonce' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Nom de l\'organisme recruteur ajusté' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organizationName?: string;

  @ApiPropertyOptional({ description: 'Résumé des missions et compétences ajusté' })
  @IsOptional()
  @IsString()
  descriptionSummary?: string;

  @ApiPropertyOptional({ description: 'Nom de la ville marocaine' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cityName?: string;

  @ApiPropertyOptional({ description: 'Type de contrat (CDI, CDD, Stage...)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractType?: string;

  @ApiPropertyOptional({ description: 'Catégorie métier' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Motif du rejet (si action = REJECT)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rejectionReason?: string;
}
