import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Liste paginée des notifications in-app de l utilisateur connecté',
  })
  @ApiOkResponse({ description: 'Notifications et compteur non lus' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryNotificationsDto,
  ) {
    const result = await this.notificationsService.listUserNotifications(
      user.userId,
      query,
    );

    return {
      statusCode: HttpStatus.OK,
      ...result,
    };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Marquer une notification comme lue',
  })
  @ApiOkResponse({ description: 'Notification mise à jour' })
  @ApiNotFoundResponse({ description: 'Notification introuvable' })
  @ApiForbiddenResponse({
    description: 'Impossible de modifier une notification tierce',
  })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.notificationsService.markAsRead(user.userId, id);

    return {
      statusCode: HttpStatus.OK,
      message: 'Notification marked as read',
      data,
    };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marquer toutes les notifications comme lues',
  })
  @ApiOkResponse({ description: 'Nombre de notifications mises à jour' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.notificationsService.markAllAsRead(user.userId);

    return {
      statusCode: HttpStatus.OK,
      message: 'All notifications marked as read',
      data,
    };
  }
}
