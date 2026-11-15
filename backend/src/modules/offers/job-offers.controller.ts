import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public, Roles } from '../auth/rbac.decorators';
import { QueryJobOffersDto } from './dto/query-offers.dto';
import { OffersService } from './offers.service';

@ApiTags('job-offers')
@Controller('job-offers')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class JobOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary:
      'Recherche publique et candidat des offres publiées avec filtres (DCTF §9.3)',
  })
  @ApiOkResponse({ description: 'Liste paginée des offres publiées' })
  async listPublicOffers(@Query() query: QueryJobOffersDto) {
    const result = await this.offersService.listPublicOffers(query);
    return {
      statusCode: HttpStatus.OK,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('my-organizations')
  @ApiBearerAuth('access-token')
  @Roles(GlobalRole.ORGANIZATION_USER)
  @ApiOperation({
    summary:
      "Liste des organisations auxquelles appartient l'utilisateur recruteur connecté",
  })
  @ApiOkResponse({ description: 'Liste des adhésions aux organisations' })
  async getMyOrganizations(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.offersService.getMyOrganizations(user.userId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: "Affichage détaillé d'une offre publiée",
  })
  @ApiOkResponse({ description: "Détails de l'offre publiée" })
  @ApiNotFoundResponse({
    description: 'Offre introuvable ou non publiée',
  })
  async getPublicOffer(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.offersService.getPublicOfferById(id);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
