import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/rbac.decorators';
import { ReferenceService } from './reference.service';

@ApiTags('reference')
@Controller('reference')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Public()
  @Get('regions')
  @ApiOperation({ summary: 'Liste officielle des 12 régions marocaines (trilingue)' })
  @ApiOkResponse({ description: 'Référentiel des 12 régions' })
  getRegions() {
    return {
      statusCode: HttpStatus.OK,
      data: this.referenceService.getRegions(),
    };
  }

  @Public()
  @Get('specialties')
  @ApiOperation({ summary: 'Liste des spécialités cliniques et éducatives' })
  @ApiOkResponse({ description: 'Spécialités disponibles' })
  async getSpecialties() {
    const data = await this.referenceService.getSpecialties();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Public()
  @Get('skills')
  @ApiOperation({ summary: 'Référentiel des compétences cliniques, éducatives et psychométriques' })
  @ApiOkResponse({ description: 'Compétences référencées' })
  async getSkills() {
    const data = await this.referenceService.getSkills();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
