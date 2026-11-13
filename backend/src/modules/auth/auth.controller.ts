import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AuthRegistrationService,
  RegisteredUserView,
} from './auth-registration.service';
import { AuthSessionService, AuthUserSummary } from './auth-session.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { extractClientIp, extractUserAgent } from './ip-extractor.util';
import { AuthenticatedUser, JwtAuthGuard } from './jwt-auth.guard';
import { ProxyAwareThrottlerGuard } from './proxy-throttler.guard';
import {
  clearRefreshTokenCookie,
  extractRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from './refresh-cookie.util';

export interface RegisterUserHttpResponse {
  statusCode: HttpStatus.CREATED;
  message: string;
  data: RegisteredUserView;
}

export interface AuthTokenHttpResponse {
  statusCode: HttpStatus.OK;
  message: string;
  data: {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
    user: AuthUserSummary;
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registrationService: AuthRegistrationService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ProxyAwareThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Inscription publique d un candidat ou d un utilisateur d organisation (M1.2)',
  })
  @ApiCreatedResponse({
    description: 'Compte cree avec succes (sans JWT ni session ouverte)',
  })
  @ApiBadRequestResponse({
    description:
      'Donnees invalides, mot de passe hors bornes (12-128), termsAccepted != true ou role SYSTEM_ADMIN interdit',
  })
  @ApiConflictResponse({ description: 'Adresse e-mail deja enregistree' })
  @ApiTooManyRequestsResponse({
    description: 'Limite de debit depassee (5 requetes / minute / IP)',
  })
  async register(
    @Body() dto: RegisterUserDto,
    @Req() req: Request,
  ): Promise<RegisterUserHttpResponse> {
    const data = await this.registrationService.register(dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'User registered successfully',
      data,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProxyAwareThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Connexion utilisateur : retourne un JWT HS256 (15 min) et depose le refresh token en cookie HttpOnly (M1.3)',
  })
  @ApiOkResponse({ description: 'Authentification reussie' })
  @ApiUnauthorizedResponse({ description: 'Identifiants invalides' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenHttpResponse> {
    const result = await this.authSessionService.login(dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });

    setRefreshTokenCookie(res, result.rawRefreshToken);

    return {
      statusCode: HttpStatus.OK,
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        expiresIn: result.expiresIn,
        user: result.user,
      },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Renouvellement de session par rotation atomique du refresh token HttpOnly (M1.3)',
  })
  @ApiOkResponse({ description: 'Jetons renouveles avec succes' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token manquant, expire, revoque ou reutilise',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokenHttpResponse> {
    const rawRefreshToken = extractRefreshTokenFromRequest(req);
    try {
      const result = await this.authSessionService.refresh(rawRefreshToken, {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      });

      setRefreshTokenCookie(res, result.rawRefreshToken);

      return {
        statusCode: HttpStatus.OK,
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.accessToken,
          tokenType: result.tokenType,
          expiresIn: result.expiresIn,
          user: result.user,
        },
      };
    } catch (error) {
      clearRefreshTokenCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Deconnexion de la session courante et suppression du cookie HttpOnly (M1.3)',
  })
  @ApiOkResponse({ description: 'Session revoquee et cookie efface' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    statusCode: HttpStatus.OK;
    message: string;
    data: { revoked: boolean };
  }> {
    const rawRefreshToken = extractRefreshTokenFromRequest(req);
    const data = await this.authSessionService.logout(rawRefreshToken);
    clearRefreshTokenCookie(res);

    return {
      statusCode: HttpStatus.OK,
      message: 'Logged out successfully',
      data,
    };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Deconnexion de toutes les sessions actives de l utilisateur authentifie (M1.3)',
  })
  @ApiOkResponse({ description: 'Toutes les sessions actives ont ete revoquees' })
  @ApiUnauthorizedResponse({ description: 'Access token manquant ou invalide' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    statusCode: HttpStatus.OK;
    message: string;
    data: { revokedCount: number };
  }> {
    const data = await this.authSessionService.logoutAll(user.userId, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });
    clearRefreshTokenCookie(res);

    return {
      statusCode: HttpStatus.OK,
      message: 'All active sessions revoked',
      data,
    };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Recupere le profil de l utilisateur authentifie (M1.3)',
  })
  @ApiOkResponse({ description: 'Profil utilisateur courant' })
  @ApiUnauthorizedResponse({ description: 'Access token manquant ou invalide' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<{
    statusCode: HttpStatus.OK;
    data: AuthenticatedUser;
  }> {
    const data = await this.authSessionService.getMe(user);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
