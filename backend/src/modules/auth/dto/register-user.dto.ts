import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../password-hash.service';

export const ALLOWED_PUBLIC_REGISTRATION_ROLES = [
  'CANDIDATE',
  'ORGANIZATION_USER',
] as const;
export type PublicRegistrationRole =
  (typeof ALLOWED_PUBLIC_REGISTRATION_ROLES)[number];

export const ALLOWED_LOCALES = ['fr', 'ar', 'en'] as const;
export type SupportedLocale = (typeof ALLOWED_LOCALES)[number];

export class RegisterUserDto {
  @ApiProperty({
    example: 'kenza.etudiante@example.ma',
    description: 'Adresse e-mail (normalisee automatiquement en trim + lowercase)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'une phrase de passe tres longue et securisee',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description:
      'Mot de passe ou phrase de passe (12 a 128 caracteres, sans trim ni complexite artificielle)',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiProperty({
    enum: ALLOWED_PUBLIC_REGISTRATION_ROLES,
    example: 'CANDIDATE',
    description:
      'Role d inscription publique (CANDIDATE ou ORGANIZATION_USER uniquement ; SYSTEM_ADMIN interdit)',
  })
  @IsString()
  @IsIn(ALLOWED_PUBLIC_REGISTRATION_ROLES, {
    message:
      'globalRole must be either CANDIDATE or ORGANIZATION_USER for public registration',
  })
  globalRole!: PublicRegistrationRole;

  @ApiPropertyOptional({
    enum: ALLOWED_LOCALES,
    default: 'fr',
    example: 'fr',
  })
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_LOCALES)
  preferredLocale?: SupportedLocale = 'fr';

  @ApiProperty({
    example: true,
    description:
      'Acceptation explicite obligatoire des CGU et de la Politique de Confidentialite',
  })
  @IsBoolean()
  @Equals(true, {
    message: 'termsAccepted must be explicitly set to true',
  })
  termsAccepted!: boolean;
}
