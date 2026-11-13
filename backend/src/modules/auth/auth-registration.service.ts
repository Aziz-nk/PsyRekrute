import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { GlobalRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ALLOWED_LOCALES,
  ALLOWED_PUBLIC_REGISTRATION_ROLES,
  RegisterUserDto,
  SupportedLocale,
} from './dto/register-user.dto';
import { PasswordHashService } from './password-hash.service';

export const INITIAL_CONSENT_VERSION = 'v1.0';
export const MANDATORY_REGISTRATION_CONSENTS = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
] as const;

export interface RegistrationContext {
  ipAddress: string;
  userAgent: string;
}

export interface RegisteredUserView {
  userId: string;
  email: string;
  globalRole: GlobalRole;
  preferredLocale: SupportedLocale;
}

@Injectable()
export class AuthRegistrationService {
  private readonly logger = new Logger(AuthRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * M1.2 – Inscription publique et validation stricte des donnees :
   * - Refuse SYSTEM_ADMIN et tout role hors CANDIDATE / ORGANIZATION_USER (D2).
   * - Normalise l'e-mail via trim().toLowerCase().
   * - Exige termsAccepted === true.
   * - Hache le mot de passe (12-128 car., sans trim) avec Argon2id (D7).
   * - Cree atomiquement dans une seule transaction :
   *   1) User (isEmailVerified = false, isActive = true)
   *   2) Deux enregistrements Consent (TERMS_OF_SERVICE, PRIVACY_POLICY) — sans TALENT_POOL_MATCHING (D4)
   *   3) Un enregistrement AuditLog (USER_REGISTERED)
   * - Ne genere aucun JWT, ne cree aucune session, n'envoie aucun faux e-mail (D8),
   *   et n'expose jamais le mot de passe ni son hash dans la reponse ou les logs.
   */
  async register(
    dto: RegisterUserDto,
    context: RegistrationContext,
  ): Promise<RegisteredUserView> {
    if (
      !dto ||
      typeof dto.email !== 'string' ||
      dto.email.trim().length === 0
    ) {
      throw new BadRequestException('A valid email address is required');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    if (
      normalizedEmail.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      throw new BadRequestException('Invalid email address format');
    }

    if (
      !ALLOWED_PUBLIC_REGISTRATION_ROLES.includes(
        dto.globalRole as (typeof ALLOWED_PUBLIC_REGISTRATION_ROLES)[number],
      )
    ) {
      throw new BadRequestException(
        'Public registration only accepts CANDIDATE or ORGANIZATION_USER',
      );
    }

    if (dto.termsAccepted !== true) {
      throw new BadRequestException(
        'Explicit acceptance of Terms of Service and Privacy Policy is required',
      );
    }

    const locale: SupportedLocale =
      dto.preferredLocale &&
      ALLOWED_LOCALES.includes(dto.preferredLocale as SupportedLocale)
        ? dto.preferredLocale
        : 'fr';

    // Validation 12-128 car. (sans trim) + hachage Argon2id
    const passwordHash = await this.passwordHashService.hash(dto.password);

    const ipAddress = (context.ipAddress || '0.0.0.0').slice(0, 45);
    const userAgent = (context.userAgent || 'unknown').slice(0, 512);
    const globalRole = dto.globalRole as GlobalRole;

    try {
      const createdUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            globalRole,
            preferredLocale: locale,
            isEmailVerified: false,
            isActive: true,
          },
        });

        for (const consentType of MANDATORY_REGISTRATION_CONSENTS) {
          await tx.consent.create({
            data: {
              userId: user.id,
              consentType,
              version: INITIAL_CONSENT_VERSION,
              hasConsented: true,
              ipAddress,
              userAgent,
            },
          });
        }

        await this.auditService.recordInTx(tx, {
          userId: user.id,
          action: 'USER_REGISTERED',
          entityType: 'USER',
          entityId: user.id,
          ipAddress,
          userAgent,
          details: {
            globalRole,
            preferredLocale: locale,
            consentsRecorded: [...MANDATORY_REGISTRATION_CONSENTS],
          },
        });

        return user;
      });

      this.logger.log(
        `User registered: id=${createdUser.id} role=${createdUser.globalRole}`,
      );

      return {
        userId: createdUser.id,
        email: createdUser.email,
        globalRole: createdUser.globalRole,
        preferredLocale: createdUser.preferredLocale as SupportedLocale,
      };
    } catch (error) {
      if (this.isUniqueEmailError(error)) {
        throw new ConflictException('Email address is already registered');
      }
      throw error;
    }
  }

  private isUniqueEmailError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code !== 'P2002') {
        return false;
      }
      const target = error.meta?.target;
      if (Array.isArray(target)) {
        return target.some(
          (field) =>
            typeof field === 'string' &&
            /^(email|users_email_key|users_email_lower_key)$/i.test(field),
        );
      }
      if (typeof target === 'string') {
        return /(^email$|users_email)/i.test(target);
      }
      return /(`email`|\bemail\b|users_email)/i.test(error.message);
    }
    if (error instanceof Error) {
      return /(users_email_key|users_email_lower_key|unique constraint.*email)/i.test(
        error.message,
      );
    }
    return false;
  }
}
