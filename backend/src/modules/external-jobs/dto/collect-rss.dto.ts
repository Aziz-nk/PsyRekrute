import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CollectRssDto {
  @ApiPropertyOptional({
    description: 'Mots-clés optionnels pour cibler la requête RSS (par défaut : psychologue, orthophoniste, autisme, etc.)',
    example: ['psychologue', 'orthophoniste', 'autisme'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}
