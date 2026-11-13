import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password-hash.service';

export class LoginDto {
  @ApiProperty({
    example: 'kenza.etudiante@example.ma',
    description: 'Adresse e-mail normalisee (trim + lowercase)',
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
    description: 'Mot de passe ou phrase de passe (sans trim)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
