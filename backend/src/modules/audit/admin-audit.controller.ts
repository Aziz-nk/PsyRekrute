import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditLog, GlobalRole } from '@prisma/client';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/rbac.decorators';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface AuditLogsHttpResponse {
  statusCode: HttpStatus.OK;
  data: AuditLog[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@Roles(GlobalRole.SYSTEM_ADMIN)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultation paginee du journal d audit (SYSTEM_ADMIN, M3)',
  })
  @ApiOkResponse({ description: 'Journal d audit pagine (createdAt DESC)' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Reserve a SYSTEM_ADMIN' })
  async list(@Query() query: QueryAuditLogsDto): Promise<AuditLogsHttpResponse> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must be earlier than "to"');
    }

    const result = await this.auditService.findMany({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      from,
      to,
    });

    return { statusCode: HttpStatus.OK, ...result };
  }
}
