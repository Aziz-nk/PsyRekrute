import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const CONSENT_TYPES = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'TALENT_POOL_MATCHING',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export class UpdateConsentDto {
  @ApiProperty({ enum: CONSENT_TYPES, example: 'TALENT_POOL_MATCHING' })
  @IsString()
  @IsIn(CONSENT_TYPES)
  consentType!: ConsentType;

  @ApiProperty({ example: true })
  @IsBoolean()
  hasConsented!: boolean;

  @ApiProperty({ example: '1.0', description: 'Version du texte consenti' })
  @IsString()
  @MaxLength(20)
  @Matches(/^v?\d+(\.\d+){0,2}$/, {
    message: 'version must look like 1.0 or v1.0',
  })
  version!: string;
}
