import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Centre Psychologique Atlas SARL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName!: string;

  @ApiProperty({ example: 'Atlas Psy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tradeName!: string;

  @ApiProperty({
    enum: OrganizationType,
    example: OrganizationType.CABINET_LIBERAL,
  })
  @IsEnum(OrganizationType)
  organizationType!: OrganizationType;

  @ApiPropertyOptional({
    example: '001234567000089',
    description: "Identifiant Commun de l'Entreprise marocain (15 chiffres)",
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, {
    message: "identifierIce must be a 15-digit number",
  })
  identifierIce?: string;

  @ApiPropertyOptional({ example: 'RC-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  officialRegistrationNumber?: string;

  @ApiPropertyOptional({ example: 'https://atlas-psy.ma' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiProperty({ example: '+212522000001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone!: string;

  @ApiProperty({ example: 'contact@atlas-psy.ma' })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'MA-06' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  regionCode!: string;

  @ApiProperty({ example: 'Casablanca' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityName!: string;

  @ApiProperty({ example: '10 Bd Anfa, Quartier Gauthier' })
  @IsString()
  @IsNotEmpty()
  addressLine!: string;
}
