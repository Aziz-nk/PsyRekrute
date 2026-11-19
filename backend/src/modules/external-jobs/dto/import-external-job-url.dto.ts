import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class ImportExternalJobUrlDto {
  @ApiProperty({
    description: 'URL publique de l\'annonce d\'emploi externe au Maroc',
    example:
      'https://www.dreamjob.ma/emploi/groupe-edc-recrute-des-psychologues-scolaires-dans-huit-villes/',
  })
  @IsNotEmpty()
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(1000)
  url!: string;
}
