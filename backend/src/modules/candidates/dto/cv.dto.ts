import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmCvUploadDto {
  @ApiProperty({ example: 'candidates/123e4567-e89b-12d3-a456-426614174000/cv/abc-def.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey!: string;
}
