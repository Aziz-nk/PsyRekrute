import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyOrganizationDto {
  @ApiProperty({
    enum: VerificationStatus,
    example: VerificationStatus.VERIFIED,
    description: 'Nouveau statut de vérification administrative',
  })
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;

  @ApiPropertyOptional({
    example: 'Conforme au registre du commerce et ICE vérifié',
    description: 'Motif ou observation de la décision',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
