import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/rbac.decorators';
import { QueryExternalJobsDto } from './dto/query-external-jobs.dto';
import { ExternalJobsService } from './external-jobs.service';

@ApiTags('external-jobs')
@Controller('external-jobs')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class ExternalJobsController {
  constructor(private readonly externalJobsService: ExternalJobsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Consultation publique des annonces externes publiées au Maroc',
  })
  async listPublished(@Query() query: QueryExternalJobsDto) {
    const result = await this.externalJobsService.listPublishedForPublic(query);
    return {
      statusCode: HttpStatus.OK,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Détail public d\'une annonce externe publiée',
  })
  async getPublishedById(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.externalJobsService.getPublicById(id);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
