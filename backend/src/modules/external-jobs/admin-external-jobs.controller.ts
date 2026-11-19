import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/rbac.decorators';
import { CollectRssDto } from './dto/collect-rss.dto';
import { ImportExternalJobUrlDto } from './dto/import-external-job-url.dto';
import { QueryExternalJobsDto } from './dto/query-external-jobs.dto';
import { ReviewExternalJobDto } from './dto/review-external-job.dto';
import { ExternalJobsService } from './external-jobs.service';

@ApiTags('admin-external-jobs')
@Controller('admin/external-jobs')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@Roles(GlobalRole.SYSTEM_ADMIN)
@ApiBearerAuth('access-token')
export class AdminExternalJobsController {
  constructor(private readonly externalJobsService: ExternalJobsService) {}

  @Post('collect-rss')
  @ApiOperation({
    summary: 'Déclenche manuellement la collecte depuis le flux RSS Dreamjob.ma',
  })
  async collectRss(@Body() dto: CollectRssDto) {
    const result = await this.externalJobsService.collectFromDreamjobRss(dto);
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  @Post('import-url')
  @ApiOperation({
    summary: 'Importe manuellement une annonce externe par son URL avec protection Anti-SSRF',
  })
  async importUrl(
    @Body() dto: ImportExternalJobUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.externalJobsService.importFromUrl(dto.url, user.userId);
    return {
      statusCode: HttpStatus.CREATED,
      data,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Liste paginée des annonces externes pour la console SYSTEM_ADMIN',
  })
  async listForAdmin(@Query() query: QueryExternalJobsDto) {
    const result = await this.externalJobsService.listForAdmin(query);
    return {
      statusCode: HttpStatus.OK,
      data: result.data,
      meta: result.meta,
    };
  }

  @Patch(':id/review')
  @ApiOperation({
    summary: 'Valide, rejette ou marque comme expirée une annonce externe (avec journalisation AUDIT_LOGS)',
  })
  async reviewListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewExternalJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.externalJobsService.reviewListing(id, dto, user.userId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
