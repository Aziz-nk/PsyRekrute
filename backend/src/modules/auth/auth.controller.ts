import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AuthRegistrationService,
  RegisteredUserView,
} from './auth-registration.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { extractClientIp, extractUserAgent } from './ip-extractor.util';
import { ProxyAwareThrottlerGuard } from './proxy-throttler.guard';

export interface RegisterUserHttpResponse {
  statusCode: HttpStatus.CREATED;
  message: string;
  data: RegisteredUserView;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registrationService: AuthRegistrationService,
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
}
