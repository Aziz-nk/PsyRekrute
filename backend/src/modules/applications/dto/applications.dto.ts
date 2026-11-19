import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus, InterviewMode } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const CANDIDATE_ALLOWED_TARGET_STATUSES = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.INVITATION_DECLINED,
  ApplicationStatus.INTERVIEW_CONFIRMED,
  ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
  ApplicationStatus.HIRED,
  ApplicationStatus.WITHDRAWN,
] as const;

export const RECRUITER_ALLOWED_TARGET_STATUSES = [
  ApplicationStatus.REVIEWING,
  ApplicationStatus.INTERVIEW_PROPOSED,
  ApplicationStatus.OFFER_EXTENDED,
  ApplicationStatus.REJECTED,
] as const;

export class ApplyDirectDto {
  @ApiProperty({ example: 'b78d8a70-8911-4f1a-b6d3-2f887b6a9e10' })
  @IsUUID()
  @IsNotEmpty()
  jobOfferId!: string;

  @ApiPropertyOptional({
    example:
      'Je souhaite postuler à cette offre de stage PFE qui correspond à mon projet clinique.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  comment?: string;
}

export class InviteCandidateDto {
  @ApiProperty({ example: 'b78d8a70-8911-4f1a-b6d3-2f887b6a9e10' })
  @IsUUID()
  @IsNotEmpty()
  jobOfferId!: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  @IsNotEmpty()
  candidateId!: string;

  @ApiPropertyOptional({
    example:
      'Bonjour, votre profil en neuropsychologie correspond parfaitement à notre offre.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  personalizedMessage?: string;
}

export class CandidateTransitionDto {
  @ApiProperty({
    enum: CANDIDATE_ALLOWED_TARGET_STATUSES,
    example: ApplicationStatus.SUBMITTED,
  })
  @IsEnum(ApplicationStatus)
  @IsNotEmpty()
  targetStatus!: ApplicationStatus;

  @ApiPropertyOptional({
    example: 'Je sollicite un report en raison d un examen universitaire.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  comment?: string;
}

export class RecruiterTransitionDto {
  @ApiProperty({
    enum: RECRUITER_ALLOWED_TARGET_STATUSES,
    example: ApplicationStatus.REVIEWING,
  })
  @IsEnum(ApplicationStatus)
  @IsNotEmpty()
  targetStatus!: ApplicationStatus;

  @ApiPropertyOptional({
    example: 'Dossier présélectionné pour un entretien clinique.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  comment?: string;

  @ApiPropertyOptional({
    example: '2026-12-10T10:00:00.000Z',
    description: 'Obligatoire si targetStatus === INTERVIEW_PROPOSED',
  })
  @IsOptional()
  @IsString()
  interviewDate?: string;

  @ApiPropertyOptional({
    enum: InterviewMode,
    example: InterviewMode.IN_PERSON,
    description: 'Obligatoire si targetStatus === INTERVIEW_PROPOSED',
  })
  @IsOptional()
  @IsEnum(InterviewMode)
  interviewMode?: InterviewMode;

  @ApiPropertyOptional({
    example: 'Siège du CMPP Al-Amal, 14 Avenue Mohammed V, Rabat',
    description: 'Obligatoire si targetStatus === INTERVIEW_PROPOSED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  interviewLocationOrLink?: string;

  @ApiPropertyOptional({
    example:
      'Stage PFE conventionné de 6 mois avec gratification mensuelle de 2000 MAD.',
    description: 'Obligatoire si targetStatus === OFFER_EXTENDED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hiringOfferDetails?: string;

  @ApiPropertyOptional({
    example: '2026-12-20T23:59:59.000Z',
    description: 'Optionnel si targetStatus === OFFER_EXTENDED (défaut +7 jours)',
  })
  @IsOptional()
  @IsString()
  hiringOfferDeadline?: string;
}

export class GetCvDownloadUrlDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  @IsNotEmpty()
  candidateId!: string;

  @ApiProperty({ example: 'b78d8a70-8911-4f1a-b6d3-2f887b6a9e10' })
  @IsUUID()
  @IsNotEmpty()
  jobOfferId!: string;
}
