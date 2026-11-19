import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationOrigin,
  ApplicationStatus,
  AvailabilityStatus,
  DegreeLevel,
  GlobalRole,
  InterviewMode,
  LanguageProficiency,
  OfferType,
  OrgMemberRole,
  SkillLevel,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CandidateData,
  ENROLLMENT_CREDIT_BY_OFFER_TYPE,
  MatchingService,
  MatchingWeights,
  OfferData,
} from '../matching/matching.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApplyDirectDto,
  CandidateTransitionDto,
  GetCvDownloadUrlDto,
  InviteCandidateDto,
  RecruiterTransitionDto,
} from './dto/applications.dto';

export interface ApplicationActorContext {
  ipAddress: string;
  userAgent: string;
}

const INVITATION_VALIDITY_DAYS = 14;
const ANTI_SPAM_REINVITE_COOLDOWN_DAYS = 30;
const DEFAULT_HIRING_OFFER_DEADLINE_DAYS = 7;
const MAX_INTERVIEW_RESCHEDULES = 2;

const ALLOWED_RECRUITER_WRITE_ROLES: readonly OrgMemberRole[] = [
  OrgMemberRole.OWNER,
  OrgMemberRole.ADMIN,
  OrgMemberRole.RECRUITER,
];

const ALLOWED_RECRUITER_READ_ROLES: readonly OrgMemberRole[] = [
  OrgMemberRole.OWNER,
  OrgMemberRole.ADMIN,
  OrgMemberRole.RECRUITER,
  OrgMemberRole.VIEWER,
];

const ANONYMIZED_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.INVITED,
  ApplicationStatus.INVITATION_DECLINED,
  ApplicationStatus.INVITATION_EXPIRED,
];

const CANDIDATE_WITHDRAWABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.INTERVIEW_PROPOSED,
  ApplicationStatus.INTERVIEW_CONFIRMED,
  ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
  ApplicationStatus.OFFER_EXTENDED,
];

const RECRUITER_REJECTABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.INTERVIEW_PROPOSED,
  ApplicationStatus.INTERVIEW_CONFIRMED,
  ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
  ApplicationStatus.OFFER_EXTENDED,
];

const DEFAULT_WEIGHTS_BY_OFFER_TYPE: Record<OfferType, MatchingWeights> = {
  [OfferType.STAGE_OBSERVATION]: {
    weightFormation: 0.35,
    weightSkills: 0.15,
    weightExperience: 0.05,
    weightLocation: 0.25,
    weightLanguages: 0.1,
    weightAvailability: 0.1,
  },
  [OfferType.STAGE_PFE]: {
    weightFormation: 0.3,
    weightSkills: 0.25,
    weightExperience: 0.15,
    weightLocation: 0.15,
    weightLanguages: 0.1,
    weightAvailability: 0.05,
  },
  [OfferType.EMPLOI]: {
    weightFormation: 0.2,
    weightSkills: 0.3,
    weightExperience: 0.25,
    weightLocation: 0.1,
    weightLanguages: 0.1,
    weightAvailability: 0.05,
  },
};

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly matchingService: MatchingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 1. Candidature directe d'un candidat sur une offre publiée (DIRECT_APPLY -> SUBMITTED).
   * Débloque immédiatement l'identité et le CV du candidat pour l'organisation émettrice.
   */
  async applyDirect(
    userId: string,
    dto: ApplyDirectDto,
    context: ApplicationActorContext,
  ) {
    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!candidate || candidate.isDeleted) {
      throw new BadRequestException(
        'Please complete your candidate profile before applying to a job offer',
      );
    }

    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: dto.jobOfferId },
      include: {
        organization: {
          select: {
            id: true,
            tradeName: true,
            isActive: true,
            verificationStatus: true,
          },
        },
        authorMember: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (
      !offer ||
      offer.status !== 'PUBLISHED' ||
      !offer.organization.isActive ||
      offer.organization.verificationStatus !== VerificationStatus.VERIFIED
    ) {
      throw new NotFoundException('Published job offer not found');
    }

    const existing = await this.prisma.application.findUnique({
      where: {
        jobOfferId_candidateId: {
          jobOfferId: offer.id,
          candidateId: candidate.id,
        },
      },
    });

    if (existing) {
      await this.expireInvitationIfNeeded(existing, userId);
      throw new ConflictException(
        'An application or invitation already exists for this job offer',
      );
    }

    const initialScore = await this.computeOrGetMatchScore(
      offer.id,
      candidate.id,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const appRecord = await tx.application.create({
        data: {
          jobOfferId: offer.id,
          candidateId: candidate.id,
          origin: ApplicationOrigin.DIRECT_APPLY,
          currentStatus: ApplicationStatus.SUBMITTED,
          initialMatchScore: initialScore,
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: appRecord.id,
          fromStatus: null,
          toStatus: ApplicationStatus.SUBMITTED,
          changedByUserId: userId,
          comment:
            dto.comment?.trim() || 'Candidature directe soumise par le candidat',
        },
      });

      await this.auditService.recordInTx(tx, {
        userId,
        action: 'APPLICATION_STATUS_UPDATE',
        entityType: 'APPLICATION',
        entityId: appRecord.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          origin: ApplicationOrigin.DIRECT_APPLY,
          fromStatus: null,
          toStatus: ApplicationStatus.SUBMITTED,
          jobOfferId: offer.id,
          candidateId: candidate.id,
        },
      });

      await this.auditService.recordInTx(tx, {
        userId,
        action: 'PROFILE_UNMASK',
        entityType: 'CANDIDATE_PROFILE',
        entityId: candidate.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          reason: 'DIRECT_APPLY',
          applicationId: appRecord.id,
          organizationId: offer.organizationId,
          jobOfferId: offer.id,
        },
      });

      await this.notificationsService.createNotification(tx, {
        userId: offer.authorMember.userId,
        type: 'STATUS_CHANGED',
        title: 'Nouvelle candidature reçue',
        message: `Un candidat a postulé directement à votre offre "${offer.title}".`,
        linkUrl: '/organization/offers',
      });

      return appRecord;
    });

    return this.getCandidateApplicationById(userId, created.id);
  }

  /**
   * 2. Invitation d'un candidat du vivier par une structure vérifiée (DCTF §7.2 & §9.5).
   * Maintient l'anonymisation stricte tant que le candidat n'a pas accepté (INVITED -> SUBMITTED).
   */
  async inviteCandidate(
    actor: { userId: string; globalRole: GlobalRole },
    dto: InviteCandidateDto,
    context: ApplicationActorContext,
  ) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: dto.jobOfferId },
      include: {
        organization: {
          select: {
            id: true,
            tradeName: true,
            isActive: true,
            verificationStatus: true,
          },
        },
        authorMember: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException('Job offer not found');
    }

    await this.verifyRecruiterWriteAccess(
      offer.organizationId,
      offer.organization.isActive,
      offer.organization.verificationStatus,
      actor,
    );

    if (offer.status !== 'PUBLISHED') {
      throw new BadRequestException(
        'Only PUBLISHED job offers can invite candidates from the talent pool',
      );
    }

    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { id: dto.candidateId },
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
            consents: {
              where: { consentType: 'TALENT_POOL_MATCHING' },
              orderBy: { consentedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!candidate || candidate.isDeleted || !candidate.user.isActive) {
      throw new NotFoundException('Candidate profile not found');
    }

    const latestConsent = candidate.user.consents[0];
    if (!latestConsent || latestConsent.hasConsented !== true) {
      throw new ForbiddenException(
        'Cannot invite a candidate who has not granted active TALENT_POOL_MATCHING consent',
      );
    }

    const existing = await this.prisma.application.findUnique({
      where: {
        jobOfferId_candidateId: {
          jobOfferId: offer.id,
          candidateId: candidate.id,
        },
      },
    });

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + INVITATION_VALIDITY_DAYS * 86_400_000,
    );

    if (existing) {
      const checked = await this.expireInvitationIfNeeded(
        existing,
        actor.userId,
      );

      if (checked.currentStatus === ApplicationStatus.INVITATION_DECLINED) {
        const cooldownMs = ANTI_SPAM_REINVITE_COOLDOWN_DAYS * 86_400_000;
        if (now.getTime() - checked.updatedAt.getTime() < cooldownMs) {
          throw new BadRequestException(
            'Anti-spam rule: cannot re-invite a candidate who declined less than 30 days ago',
          );
        }
      } else if (
        checked.currentStatus !== ApplicationStatus.INVITATION_EXPIRED
      ) {
        throw new BadRequestException(
          'An active invitation or application already exists for this candidate on this offer',
        );
      }

      const initialScore = await this.computeOrGetMatchScore(
        offer.id,
        candidate.id,
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        const appRecord = await tx.application.update({
          where: { id: checked.id },
          data: {
            origin: ApplicationOrigin.CENTER_INVITATION,
            currentStatus: ApplicationStatus.INVITED,
            initialMatchScore: initialScore,
            invitationSentAt: now,
            invitationExpiresAt: expiresAt,
          },
        });

        await tx.applicationHistory.create({
          data: {
            applicationId: appRecord.id,
            fromStatus: checked.currentStatus,
            toStatus: ApplicationStatus.INVITED,
            changedByUserId: actor.userId,
            comment:
              dto.personalizedMessage?.trim() ||
              'Nouvelle invitation envoyée par la structure',
          },
        });

        await this.auditService.recordInTx(tx, {
          userId: actor.userId,
          action: 'INVITATION_SENT',
          entityType: 'APPLICATION',
          entityId: appRecord.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: {
            jobOfferId: offer.id,
            organizationId: offer.organizationId,
            candidateId: candidate.id,
            expiresAt: expiresAt.toISOString(),
          },
        });

        await this.notificationsService.createNotification(tx, {
          userId: candidate.user.id,
          type: 'NEW_INVITATION',
          title: 'Nouvelle invitation reçue',
          message: `La structure "${offer.organization.tradeName}" vous invite à postuler pour l'offre "${offer.title}".`,
          linkUrl: '/candidate/applications',
        });

        return appRecord;
      });

      return {
        applicationId: updated.id,
        status: updated.currentStatus,
        expiresAt: updated.invitationExpiresAt,
      };
    }

    const initialScore = await this.computeOrGetMatchScore(
      offer.id,
      candidate.id,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const appRecord = await tx.application.create({
        data: {
          jobOfferId: offer.id,
          candidateId: candidate.id,
          origin: ApplicationOrigin.CENTER_INVITATION,
          currentStatus: ApplicationStatus.INVITED,
          initialMatchScore: initialScore,
          invitationSentAt: now,
          invitationExpiresAt: expiresAt,
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: appRecord.id,
          fromStatus: null,
          toStatus: ApplicationStatus.INVITED,
          changedByUserId: actor.userId,
          comment:
            dto.personalizedMessage?.trim() ||
            'Invitation envoyée depuis le vivier de talents',
        },
      });

      await this.auditService.recordInTx(tx, {
        userId: actor.userId,
        action: 'INVITATION_SENT',
        entityType: 'APPLICATION',
        entityId: appRecord.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          jobOfferId: offer.id,
          organizationId: offer.organizationId,
          candidateId: candidate.id,
          expiresAt: expiresAt.toISOString(),
        },
      });

      await this.notificationsService.createNotification(tx, {
        userId: candidate.user.id,
        type: 'NEW_INVITATION',
        title: 'Nouvelle invitation reçue',
        message: `La structure "${offer.organization.tradeName}" vous invite à postuler pour l'offre "${offer.title}".`,
        linkUrl: '/candidate/applications',
      });

      return appRecord;
    });

    return {
      applicationId: created.id,
      status: created.currentStatus,
      expiresAt: created.invitationExpiresAt,
    };
  }

  /**
   * 3. Liste des candidatures et invitations reçues par le candidat connecté.
   */
  async listCandidateApplications(userId: string) {
    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!candidate) {
      return [];
    }

    const rawApps = await this.prisma.application.findMany({
      where: { candidateId: candidate.id },
      orderBy: { updatedAt: 'desc' },
    });

    for (const app of rawApps) {
      await this.expireInvitationIfNeeded(app, userId);
    }

    const apps = await this.prisma.application.findMany({
      where: { candidateId: candidate.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        jobOffer: {
          include: {
            organization: {
              select: {
                id: true,
                legalName: true,
                tradeName: true,
                organizationType: true,
                cityName: true,
                regionCode: true,
              },
            },
            targetSpecialty: true,
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return apps.map((app) => ({
      ...app,
      initialMatchScore:
        app.initialMatchScore !== null ? Number(app.initialMatchScore) : null,
    }));
  }

  /**
   * 4. Transition de statut déclenchée par le candidat (FSM §7.1 & §7.2).
   */
  async transitionByCandidate(
    userId: string,
    applicationId: string,
    dto: CandidateTransitionDto,
    context: ApplicationActorContext,
  ) {
    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate profile not found');
    }

    const appRecord = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        jobOffer: {
          select: {
            id: true,
            title: true,
            organizationId: true,
            authorMember: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!appRecord || appRecord.candidateId !== candidate.id) {
      throw new NotFoundException('Application not found');
    }

    const checked = await this.expireInvitationIfNeeded(appRecord, userId);
    const fromStatus = checked.currentStatus;
    const toStatus = dto.targetStatus;

    if (fromStatus === ApplicationStatus.INVITATION_EXPIRED) {
      throw new BadRequestException(
        'This invitation has expired after 14 days and can no longer be accepted or modified',
      );
    }

    let nextRescheduleCount = checked.interviewRescheduleCount;
    let shouldRecordUnmask = false;

    if (toStatus === ApplicationStatus.SUBMITTED) {
      if (fromStatus !== ApplicationStatus.INVITED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
      shouldRecordUnmask = true;
    } else if (toStatus === ApplicationStatus.INVITATION_DECLINED) {
      if (fromStatus !== ApplicationStatus.INVITED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
    } else if (toStatus === ApplicationStatus.INTERVIEW_CONFIRMED) {
      if (fromStatus !== ApplicationStatus.INTERVIEW_PROPOSED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
    } else if (toStatus === ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED) {
      if (fromStatus !== ApplicationStatus.INTERVIEW_PROPOSED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
      if (!dto.comment || dto.comment.trim().length === 0) {
        throw new BadRequestException(
          'A reason (comment) is required when requesting an interview reschedule',
        );
      }
      if (checked.interviewRescheduleCount >= MAX_INTERVIEW_RESCHEDULES) {
        throw new BadRequestException(
          'Maximum number of interview reschedule requests (2) reached',
        );
      }
      nextRescheduleCount = checked.interviewRescheduleCount + 1;
    } else if (toStatus === ApplicationStatus.HIRED) {
      if (fromStatus !== ApplicationStatus.OFFER_EXTENDED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
      if (
        checked.hiringOfferDeadline &&
        checked.hiringOfferDeadline.getTime() < Date.now()
      ) {
        throw new BadRequestException('The hiring offer deadline has passed');
      }
    } else if (toStatus === ApplicationStatus.WITHDRAWN) {
      if (!CANDIDATE_WITHDRAWABLE_STATUSES.includes(fromStatus)) {
        throw new BadRequestException(
          `Cannot withdraw an application from status ${fromStatus}`,
        );
      }
    } else {
      throw new BadRequestException(
        `Status ${toStatus} cannot be triggered by a candidate`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: checked.id },
        data: {
          currentStatus: toStatus,
          interviewRescheduleCount: nextRescheduleCount,
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: checked.id,
          fromStatus,
          toStatus,
          changedByUserId: userId,
          comment: dto.comment?.trim() || null,
        },
      });

      await this.auditService.recordInTx(tx, {
        userId,
        action: 'APPLICATION_STATUS_UPDATE',
        entityType: 'APPLICATION',
        entityId: checked.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          fromStatus,
          toStatus,
          jobOfferId: appRecord.jobOffer.id,
          candidateId: candidate.id,
          interviewRescheduleCount: nextRescheduleCount,
        },
      });

      if (shouldRecordUnmask) {
        await this.auditService.recordInTx(tx, {
          userId,
          action: 'PROFILE_UNMASK',
          entityType: 'CANDIDATE_PROFILE',
          entityId: candidate.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: {
            reason: 'INVITATION_ACCEPTED',
            applicationId: checked.id,
            organizationId: appRecord.jobOffer.organizationId,
            jobOfferId: appRecord.jobOffer.id,
          },
        });
      }

      let notifType = 'STATUS_CHANGED';
      let notifTitle = 'Mise à jour de candidature';
      let notifMsg = `Le candidat a mis à jour sa candidature pour "${appRecord.jobOffer.title}" vers : ${toStatus}.`;

      if (toStatus === ApplicationStatus.SUBMITTED) {
        notifTitle = 'Invitation acceptée';
        notifMsg = `Le candidat a accepté votre invitation pour l'offre "${appRecord.jobOffer.title}". Son profil et son CV sont désormais accessibles.`;
      } else if (toStatus === ApplicationStatus.INVITATION_DECLINED) {
        notifTitle = 'Invitation déclinée';
        notifMsg = `Le candidat a décliné votre invitation pour l'offre "${appRecord.jobOffer.title}".`;
      } else if (toStatus === ApplicationStatus.INTERVIEW_CONFIRMED) {
        notifType = 'INTERVIEW_CONFIRMED';
        notifTitle = 'Entretien confirmé';
        notifMsg = `Le candidat a confirmé l'entretien pour l'offre "${appRecord.jobOffer.title}".`;
      } else if (toStatus === ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED) {
        notifType = 'INTERVIEW_RESCHEDULE';
        notifTitle = 'Report d entretien demandé';
        notifMsg = `Le candidat a demandé un report d'entretien pour "${appRecord.jobOffer.title}". Motif : ${dto.comment || 'Non précisé'}`;
      } else if (toStatus === ApplicationStatus.HIRED) {
        notifTitle = 'Proposition d embauche acceptée';
        notifMsg = `Le candidat a accepté la proposition pour l'offre "${appRecord.jobOffer.title}". Recrutement finalisé.`;
      } else if (toStatus === ApplicationStatus.WITHDRAWN) {
        notifTitle = 'Candidature retirée';
        notifMsg = `Le candidat a retiré sa candidature pour l'offre "${appRecord.jobOffer.title}".`;
      }

      await this.notificationsService.createNotification(tx, {
        userId: appRecord.jobOffer.authorMember.userId,
        type: notifType,
        title: notifTitle,
        message: notifMsg,
        linkUrl: '/organization/offers',
      });
    });

    return this.getCandidateApplicationById(userId, checked.id);
  }

  /**
   * 5. Liste des candidatures d'une offre pour l'organisation propriétaire.
   * Masque strictement l'identité et le CV tant que le statut est INVITED / INVITATION_DECLINED / INVITATION_EXPIRED.
   */
  async listOfferApplicationsForOrg(
    organizationId: string,
    offerId: string,
    actor: { userId: string; globalRole: GlobalRole },
  ) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        organization: {
          select: {
            id: true,
            isActive: true,
            verificationStatus: true,
          },
        },
      },
    });

    if (!offer || offer.organizationId !== organizationId) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    await this.verifyRecruiterReadAccess(
      organizationId,
      offer.organization.isActive,
      actor,
    );

    const rawApps = await this.prisma.application.findMany({
      where: { jobOfferId: offer.id },
      orderBy: { updatedAt: 'desc' },
    });

    for (const app of rawApps) {
      await this.expireInvitationIfNeeded(app, actor.userId);
    }

    const apps = await this.prisma.application.findMany({
      where: { jobOfferId: offer.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                email: true,
              },
            },
            primarySpecialty: true,
            education: {
              include: { specialty: true },
              orderBy: { startYear: 'desc' },
            },
            experiences: {
              orderBy: { startDate: 'desc' },
            },
            skills: {
              include: { skill: true },
            },
            languages: true,
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return apps.map((app) => this.serializeApplicationForRecruiter(app));
  }

  /**
   * 6. Transition de statut déclenchée par le recruteur (OWNER, ADMIN, RECRUITER — FSM §7.1 & §7.2).
   */
  async transitionByRecruiter(
    organizationId: string,
    applicationId: string,
    actor: { userId: string; globalRole: GlobalRole },
    dto: RecruiterTransitionDto,
    context: ApplicationActorContext,
  ) {
    const appRecord = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          select: {
            userId: true,
          },
        },
        jobOffer: {
          select: {
            id: true,
            title: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                isActive: true,
                verificationStatus: true,
              },
            },
          },
        },
      },
    });

    if (!appRecord || appRecord.jobOffer.organizationId !== organizationId) {
      throw new NotFoundException('Application not found in this organization');
    }

    await this.verifyRecruiterWriteAccess(
      organizationId,
      appRecord.jobOffer.organization.isActive,
      appRecord.jobOffer.organization.verificationStatus,
      actor,
    );

    const checked = await this.expireInvitationIfNeeded(
      appRecord,
      actor.userId,
    );
    const fromStatus = checked.currentStatus;
    const toStatus = dto.targetStatus;

    let interviewDateVal = checked.interviewDate;
    let interviewModeVal = checked.interviewMode;
    let interviewLocationVal = checked.interviewLocationOrLink;
    let hiringOfferDetailsVal = checked.hiringOfferDetails;
    let hiringOfferDeadlineVal = checked.hiringOfferDeadline;

    if (toStatus === ApplicationStatus.REVIEWING) {
      if (fromStatus !== ApplicationStatus.SUBMITTED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
    } else if (toStatus === ApplicationStatus.INTERVIEW_PROPOSED) {
      if (
        fromStatus !== ApplicationStatus.REVIEWING &&
        fromStatus !== ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED
      ) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
      if (
        !dto.interviewDate ||
        !dto.interviewMode ||
        !dto.interviewLocationOrLink?.trim()
      ) {
        throw new BadRequestException(
          'interviewDate, interviewMode, and interviewLocationOrLink are required when proposing an interview',
        );
      }
      const parsedInterviewDate = new Date(dto.interviewDate);
      if (
        Number.isNaN(parsedInterviewDate.getTime()) ||
        parsedInterviewDate.getTime() <= Date.now()
      ) {
        throw new BadRequestException('interviewDate must be a valid future date');
      }
      interviewDateVal = parsedInterviewDate;
      interviewModeVal = dto.interviewMode;
      interviewLocationVal = dto.interviewLocationOrLink.trim();
    } else if (toStatus === ApplicationStatus.OFFER_EXTENDED) {
      if (fromStatus !== ApplicationStatus.INTERVIEW_CONFIRMED) {
        throw new BadRequestException(
          `Invalid transition from ${fromStatus} to ${toStatus}`,
        );
      }
      if (!dto.hiringOfferDetails || !dto.hiringOfferDetails.trim()) {
        throw new BadRequestException(
          'hiringOfferDetails is required when extending a hiring offer',
        );
      }
      hiringOfferDetailsVal = dto.hiringOfferDetails.trim();
      if (dto.hiringOfferDeadline) {
        const parsedDeadline = new Date(dto.hiringOfferDeadline);
        if (
          Number.isNaN(parsedDeadline.getTime()) ||
          parsedDeadline.getTime() <= Date.now()
        ) {
          throw new BadRequestException(
            'hiringOfferDeadline must be a valid future date',
          );
        }
        hiringOfferDeadlineVal = parsedDeadline;
      } else {
        hiringOfferDeadlineVal = new Date(
          Date.now() + DEFAULT_HIRING_OFFER_DEADLINE_DAYS * 86_400_000,
        );
      }
    } else if (toStatus === ApplicationStatus.REJECTED) {
      if (!RECRUITER_REJECTABLE_STATUSES.includes(fromStatus)) {
        throw new BadRequestException(
          `Cannot reject an application from status ${fromStatus}`,
        );
      }
    } else {
      throw new BadRequestException(
        `Status ${toStatus} cannot be triggered by a recruiter`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: checked.id },
        data: {
          currentStatus: toStatus,
          interviewDate: interviewDateVal,
          interviewMode: interviewModeVal,
          interviewLocationOrLink: interviewLocationVal,
          hiringOfferDetails: hiringOfferDetailsVal,
          hiringOfferDeadline: hiringOfferDeadlineVal,
        },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId: checked.id,
          fromStatus,
          toStatus,
          changedByUserId: actor.userId,
          comment: dto.comment?.trim() || null,
        },
      });

      await this.auditService.recordInTx(tx, {
        userId: actor.userId,
        action: 'APPLICATION_STATUS_UPDATE',
        entityType: 'APPLICATION',
        entityId: checked.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          fromStatus,
          toStatus,
          organizationId,
          jobOfferId: appRecord.jobOfferId,
          candidateId: appRecord.candidateId,
        },
      });

      let notifType = 'STATUS_CHANGED';
      let notifTitle = 'Mise à jour de votre candidature';
      let notifMsg = `Votre candidature pour "${appRecord.jobOffer.title}" est passée au statut : ${toStatus}.`;

      if (toStatus === ApplicationStatus.REVIEWING) {
        notifTitle = 'Candidature en cours d examen';
        notifMsg = `Votre candidature pour "${appRecord.jobOffer.title}" est en cours d'examen par la structure.`;
      } else if (toStatus === ApplicationStatus.INTERVIEW_PROPOSED) {
        notifType = 'INTERVIEW_PROPOSED';
        notifTitle = 'Proposition d entretien reçue';
        notifMsg = `La structure vous propose un entretien pour l'offre "${appRecord.jobOffer.title}".`;
      } else if (toStatus === ApplicationStatus.OFFER_EXTENDED) {
        notifType = 'OFFER_EXTENDED';
        notifTitle = 'Proposition d embauche / stage reçue';
        notifMsg = `La structure vous a transmis une proposition pour l'offre "${appRecord.jobOffer.title}".`;
      } else if (toStatus === ApplicationStatus.REJECTED) {
        notifTitle = 'Candidature non retenue';
        notifMsg = `Votre candidature pour "${appRecord.jobOffer.title}" n'a pas été retenue.`;
      }

      await this.notificationsService.createNotification(tx, {
        userId: appRecord.candidate.userId,
        type: notifType,
        title: notifTitle,
        message: notifMsg,
        linkUrl: '/candidate/applications',
      });
    });

    const refreshed = await this.prisma.application.findUniqueOrThrow({
      where: { id: checked.id },
      include: {
        candidate: {
          include: {
            user: { select: { email: true } },
            primarySpecialty: true,
            education: {
              include: { specialty: true },
              orderBy: { startYear: 'desc' },
            },
            experiences: {
              orderBy: { startDate: 'desc' },
            },
            skills: {
              include: { skill: true },
            },
            languages: true,
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return this.serializeApplicationForRecruiter(refreshed);
  }

  /**
   * 7. Génération d'une URL pré-signée de téléchargement de CV (DCTF §8.2 & §9.6).
   * Autorisé uniquement au candidat propriétaire OU à un membre recruteur disposant d'une candidature débloquée.
   */
  async getCvDownloadUrl(
    actor: { userId: string; globalRole: GlobalRole },
    dto: GetCvDownloadUrlDto,
    context: ApplicationActorContext,
  ) {
    const candidate = await this.prisma.candidateProfile.findUnique({
      where: { id: dto.candidateId },
    });

    if (!candidate || candidate.isDeleted) {
      throw new NotFoundException('Candidate profile not found');
    }

    if (actor.globalRole === GlobalRole.CANDIDATE) {
      if (candidate.userId !== actor.userId) {
        throw new ForbiddenException(
          'Access denied: you can only download your own CV',
        );
      }
    } else {
      const offer = await this.prisma.jobOffer.findUnique({
        where: { id: dto.jobOfferId },
        include: {
          organization: {
            select: {
              id: true,
              isActive: true,
              verificationStatus: true,
            },
          },
        },
      });

      if (!offer) {
        throw new NotFoundException('Job offer not found');
      }

      await this.verifyRecruiterWriteAccess(
        offer.organizationId,
        offer.organization.isActive,
        offer.organization.verificationStatus,
        actor,
      );

      const appRecord = await this.prisma.application.findUnique({
        where: {
          jobOfferId_candidateId: {
            jobOfferId: offer.id,
            candidateId: candidate.id,
          },
        },
      });

      if (
        !appRecord ||
        ANONYMIZED_APPLICATION_STATUSES.includes(appRecord.currentStatus)
      ) {
        throw new ForbiddenException(
          'Access denied: CV can only be downloaded once the candidate has submitted an application or accepted the invitation',
        );
      }
    }

    if (!candidate.cvStoragePath) {
      throw new NotFoundException('No CV uploaded for this candidate profile');
    }

    const { downloadUrl, expiresInSeconds } =
      await this.storageService.generateDownloadPresignedUrl(
        candidate.cvStoragePath,
      );

    await this.auditService.record({
      userId: actor.userId,
      action: 'CV_DOWNLOAD',
      entityType: 'CANDIDATE_PROFILE',
      entityId: candidate.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: {
        jobOfferId: dto.jobOfferId,
        storageKey: candidate.cvStoragePath,
      },
    });

    return {
      presignedUrl: downloadUrl,
      downloadUrl,
      expiresInSeconds,
    };
  }

  private async getCandidateApplicationById(
    userId: string,
    applicationId: string,
  ) {
    const app = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: {
        jobOffer: {
          include: {
            organization: {
              select: {
                id: true,
                legalName: true,
                tradeName: true,
                organizationType: true,
                cityName: true,
                regionCode: true,
              },
            },
            targetSpecialty: true,
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      ...app,
      initialMatchScore:
        app.initialMatchScore !== null ? Number(app.initialMatchScore) : null,
    };
  }

  private serializeApplicationForRecruiter(app: {
    id: string;
    jobOfferId: string;
    candidateId: string;
    origin: ApplicationOrigin;
    currentStatus: ApplicationStatus;
    initialMatchScore: unknown;
    invitationSentAt: Date | null;
    invitationExpiresAt: Date | null;
    interviewDate: Date | null;
    interviewMode: string | null;
    interviewLocationOrLink: string | null;
    interviewRescheduleCount: number;
    hiringOfferDetails: string | null;
    hiringOfferDeadline: Date | null;
    createdAt: Date;
    updatedAt: Date;
    candidate: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string | null;
      profileCategory: string;
      regionCode: string;
      cityName: string;
      mobilityRadiusKm: number;
      openToRelocation: boolean;
      availabilityStatus: string;
      cvStoragePath: string | null;
      user: { email: string };
      primarySpecialty: unknown;
      education: unknown[];
      experiences: unknown[];
      skills: unknown[];
      languages: unknown[];
    };
    history: unknown[];
  }) {
    const isAnonymized = ANONYMIZED_APPLICATION_STATUSES.includes(
      app.currentStatus,
    );
    const anonymizedDisplayName = `#CAND-${app.candidateId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

    return {
      id: app.id,
      jobOfferId: app.jobOfferId,
      candidateId: app.candidateId,
      origin: app.origin,
      currentStatus: app.currentStatus,
      isAnonymized,
      initialMatchScore:
        app.initialMatchScore !== null ? Number(app.initialMatchScore) : null,
      invitationSentAt: app.invitationSentAt,
      invitationExpiresAt: app.invitationExpiresAt,
      interviewDate: app.interviewDate,
      interviewMode: app.interviewMode,
      interviewLocationOrLink: app.interviewLocationOrLink,
      interviewRescheduleCount: app.interviewRescheduleCount,
      hiringOfferDetails: app.hiringOfferDetails,
      hiringOfferDeadline: app.hiringOfferDeadline,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      candidate: isAnonymized
        ? {
            id: app.candidate.id,
            displayName: anonymizedDisplayName,
            firstName: null,
            lastName: null,
            email: null,
            phone: null,
            hasCv: false,
            profileCategory: app.candidate.profileCategory,
            regionCode: app.candidate.regionCode,
            cityName: app.candidate.cityName,
            mobilityRadiusKm: app.candidate.mobilityRadiusKm,
            openToRelocation: app.candidate.openToRelocation,
            availabilityStatus: app.candidate.availabilityStatus,
            primarySpecialty: app.candidate.primarySpecialty,
            education: [],
            experiences: [],
            skills: [],
            languages: app.candidate.languages,
          }
        : {
            id: app.candidate.id,
            displayName: `${app.candidate.firstName} ${app.candidate.lastName}`,
            firstName: app.candidate.firstName,
            lastName: app.candidate.lastName,
            email: app.candidate.user.email,
            phone: app.candidate.phone,
            hasCv: Boolean(app.candidate.cvStoragePath),
            profileCategory: app.candidate.profileCategory,
            regionCode: app.candidate.regionCode,
            cityName: app.candidate.cityName,
            mobilityRadiusKm: app.candidate.mobilityRadiusKm,
            openToRelocation: app.candidate.openToRelocation,
            availabilityStatus: app.candidate.availabilityStatus,
            primarySpecialty: app.candidate.primarySpecialty,
            education: app.candidate.education,
            experiences: app.candidate.experiences,
            skills: app.candidate.skills,
            languages: app.candidate.languages,
          },
      history: app.history,
    };
  }

  private async expireInvitationIfNeeded<
    T extends {
      id: string;
      currentStatus: ApplicationStatus;
      invitationExpiresAt: Date | null;
      updatedAt: Date;
      interviewRescheduleCount: number;
      interviewDate: Date | null;
      interviewMode: InterviewMode | null;
      interviewLocationOrLink: string | null;
      hiringOfferDetails: string | null;
      hiringOfferDeadline: Date | null;
    },
  >(app: T, actorUserId: string): Promise<T> {
    if (
      app.currentStatus === ApplicationStatus.INVITED &&
      app.invitationExpiresAt &&
      app.invitationExpiresAt.getTime() < Date.now()
    ) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.application.update({
          where: { id: app.id },
          data: {
            currentStatus: ApplicationStatus.INVITATION_EXPIRED,
          },
        });

        await tx.applicationHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: ApplicationStatus.INVITED,
            toStatus: ApplicationStatus.INVITATION_EXPIRED,
            changedByUserId: actorUserId,
            comment: 'Expiration automatique après 14 jours sans réponse',
          },
        });

        const fullApp = await tx.application.findUnique({
          where: { id: app.id },
          include: {
            candidate: { select: { userId: true } },
            jobOffer: {
              select: {
                title: true,
                authorMember: { select: { userId: true } },
              },
            },
          },
        });

        if (fullApp) {
          await this.notificationsService.createNotification(tx, {
            userId: fullApp.candidate.userId,
            type: 'INVITATION_EXPIRED',
            title: 'Invitation expirée',
            message: `L'invitation pour l'offre "${fullApp.jobOffer.title}" a expiré après 14 jours sans réponse.`,
            linkUrl: '/candidate/applications',
          });

          await this.notificationsService.createNotification(tx, {
            userId: fullApp.jobOffer.authorMember.userId,
            type: 'INVITATION_EXPIRED',
            title: 'Invitation expirée',
            message: `L'invitation pour l'offre "${fullApp.jobOffer.title}" a expiré après 14 jours sans réponse du candidat.`,
            linkUrl: '/organization/offers',
          });
        }

        return row;
      });

      return {
        ...app,
        currentStatus: updated.currentStatus,
        updatedAt: updated.updatedAt,
      };
    }

    return app;
  }

  private async verifyRecruiterReadAccess(
    organizationId: string,
    isOrgActive: boolean,
    actor: { userId: string; globalRole: GlobalRole },
  ) {
    if (!isOrgActive) {
      throw new ForbiddenException('Target organization is inactive');
    }
    if (actor.globalRole === GlobalRole.SYSTEM_ADMIN) {
      return;
    }
    if (actor.globalRole !== GlobalRole.ORGANIZATION_USER) {
      throw new ForbiddenException('Access denied');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actor.userId,
        },
      },
    });

    if (
      !membership ||
      !ALLOWED_RECRUITER_READ_ROLES.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'Access denied: you are not a member of this organization',
      );
    }
  }

  private async verifyRecruiterWriteAccess(
    organizationId: string,
    isOrgActive: boolean,
    verificationStatus: VerificationStatus,
    actor: { userId: string; globalRole: GlobalRole },
  ) {
    if (!isOrgActive) {
      throw new ForbiddenException('Target organization is inactive');
    }
    if (verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Organization must be verified (VERIFIED) to manage applications or invitations',
      );
    }
    if (actor.globalRole === GlobalRole.SYSTEM_ADMIN) {
      return;
    }
    if (actor.globalRole !== GlobalRole.ORGANIZATION_USER) {
      throw new ForbiddenException('Access denied');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: actor.userId,
        },
      },
    });

    if (
      !membership ||
      !ALLOWED_RECRUITER_WRITE_ROLES.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'Access denied: OWNER, ADMIN, or RECRUITER role required',
      );
    }
  }

  private async computeOrGetMatchScore(
    offerId: string,
    candidateId: string,
  ): Promise<number> {
    const existingMatch = await this.prisma.matchResult.findUnique({
      where: {
        jobOfferId_candidateId: {
          jobOfferId: offerId,
          candidateId,
        },
      },
    });

    if (existingMatch) {
      return Number(existingMatch.totalScore);
    }

    const [offer, cand, allSpecialties, allSkills] = await Promise.all([
      this.prisma.jobOffer.findUnique({
        where: { id: offerId },
        include: {
          requiredSkills: { include: { skill: true } },
          requiredLanguages: true,
        },
      }),
      this.prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        include: {
          education: true,
          experiences: true,
          skills: { include: { skill: true } },
          languages: true,
        },
      }),
      this.prisma.refSpecialty.findMany({
        select: { id: true, parentId: true, code: true },
      }),
      this.prisma.refSkill.findMany({
        select: { id: true, parentId: true, code: true },
      }),
    ]);

    if (!offer || !cand) {
      return 0;
    }

    const configRow = await this.prisma.matchingConfig.findUnique({
      where: { offerType: offer.offerType },
    });

    const weights: MatchingWeights =
      configRow && configRow.isActive
        ? {
            weightFormation: Number(configRow.weightFormation),
            weightSkills: Number(configRow.weightSkills),
            weightExperience: Number(configRow.weightExperience),
            weightLocation: Number(configRow.weightLocation),
            weightLanguages: Number(configRow.weightLanguages),
            weightAvailability: Number(configRow.weightAvailability),
          }
        : DEFAULT_WEIGHTS_BY_OFFER_TYPE[offer.offerType];

    const specialtyMap = new Map(allSpecialties.map((s) => [s.id, s]));
    const skillByIdMap = new Map(allSkills.map((s) => [s.id, s]));

    let degreeLevelValue = 0;
    let enrolledLevelValue = 0;
    for (const edu of cand.education) {
      const val = this.mapDegreeLevel(edu.degreeLevel);
      if (edu.isCurrentlyEnrolled) {
        if (val > enrolledLevelValue) enrolledLevelValue = val;
      } else {
        if (val > degreeLevelValue) degreeLevelValue = val;
      }
    }

    const candidateSpecialtyIds = new Set<string>([
      cand.primarySpecialtyId,
      ...cand.education.map((e) => e.specialtyId),
    ]);
    let specialtyTaxonomyFactor = 0.25;
    for (const specId of candidateSpecialtyIds) {
      const factor = this.computeSpecialtyTaxonomyFactor(
        specId,
        offer.targetSpecialtyId,
        specialtyMap,
      );
      if (factor > specialtyTaxonomyFactor) specialtyTaxonomyFactor = factor;
    }

    const mappedSkills = cand.skills.map((cs) => ({
      code: cs.skill.code,
      level: this.mapSkillLevel(cs.level),
      isVerified: cs.isVerified,
    }));

    for (const reqSkill of offer.requiredSkills) {
      const alreadyHasExact = mappedSkills.some(
        (s) => s.code === reqSkill.skill.code,
      );
      if (!alreadyHasExact) {
        const reqMeta = skillByIdMap.get(reqSkill.skillId);
        if (reqMeta) {
          let bestRelatedLevel = 0;
          for (const cs of cand.skills) {
            const candMeta = skillByIdMap.get(cs.skillId);
            if (candMeta && this.areSkillsRelated(candMeta, reqMeta)) {
              const relatedLevel = this.mapSkillLevel(cs.level) * 0.5;
              if (relatedLevel > bestRelatedLevel) {
                bestRelatedLevel = relatedLevel;
              }
            }
          }
          if (bestRelatedLevel > 0) {
            mappedSkills.push({
              code: reqSkill.skill.code,
              level: bestRelatedLevel,
              isVerified: false,
            });
          }
        }
      }
    }

    const totalExperienceMonths = cand.experiences.reduce(
      (sum, exp) => sum + Math.max(0, exp.totalMonths),
      0,
    );
    const hasTargetAudienceExperience = cand.experiences.some(
      (exp) =>
        typeof exp.targetAudience === 'string' &&
        exp.targetAudience.trim().length > 0,
    );

    const isSameCity =
      cand.cityName.trim().toLowerCase() ===
      offer.cityName.trim().toLowerCase();
    const isSameRegion =
      cand.regionCode.trim().toUpperCase() ===
      offer.regionCode.trim().toUpperCase();
    const hasMobility = cand.mobilityRadiusKm >= 30;

    const languages = cand.languages.map((l) => ({
      code: l.languageCode,
      proficiency: this.mapLanguageProficiency(l.proficiencyLevel),
    }));

    let isImmediate = cand.availabilityStatus === AvailabilityStatus.IMMEDIATE;
    let delayDays = 0;
    if (!isImmediate) {
      if (cand.availableFrom) {
        const diffMs =
          new Date(cand.availableFrom).getTime() -
          new Date(offer.startDate).getTime();
        const computedDays = Math.round(diffMs / 86_400_000);
        if (computedDays <= 0) {
          isImmediate = true;
          delayDays = 0;
        } else {
          delayDays = computedDays;
        }
      } else {
        delayDays = 45;
      }
    }

    const offerData: OfferData = {
      requiredDegreeLevelValue: this.mapDegreeLevel(offer.requiredDegreeLevel),
      enrollmentCreditScore: ENROLLMENT_CREDIT_BY_OFFER_TYPE[offer.offerType],
      requiredSkills: offer.requiredSkills.map((rs) => ({
        code: rs.skill.code,
        minRequiredLevel: this.mapSkillLevel(rs.minRequiredLevel),
        isMandatory: rs.isMandatory,
        weight: rs.weight,
      })),
      minExperienceMonths: offer.minExperienceMonths,
      requiredLanguages: offer.requiredLanguages.map((rl) => ({
        code: rl.languageCode,
        minProficiency: this.mapLanguageProficiency(rl.minProficiencyLevel),
        isMandatory: rl.isMandatory,
      })),
    };

    const candidateData: CandidateData = {
      degreeLevelValue,
      enrolledLevelValue,
      specialtyTaxonomyFactor,
      skills: mappedSkills,
      totalExperienceMonths,
      hasTargetAudienceExperience,
      isSameCity,
      isSameRegion,
      hasMobility,
      openToRelocation: cand.openToRelocation,
      languages,
      isImmediate,
      delayDays,
    };

    const evaluation = this.matchingService.calculateMatchScore(
      candidateData,
      offerData,
      weights,
    );
    return evaluation.totalScore;
  }

  private computeSpecialtyTaxonomyFactor(
    candSpecId: string,
    targetSpecId: string,
    specialtyMap: Map<
      string,
      { id: string; parentId: string | null; code: string }
    >,
  ): number {
    if (candSpecId === targetSpecId) return 1.0;
    const candSpec = specialtyMap.get(candSpecId);
    const targetSpec = specialtyMap.get(targetSpecId);
    if (!candSpec || !targetSpec) return 0.25;
    if (
      (candSpec.parentId && candSpec.parentId === targetSpec.parentId) ||
      candSpec.parentId === targetSpec.id ||
      targetSpec.parentId === candSpec.id
    ) {
      return 0.75;
    }
    const candParent = candSpec.parentId
      ? specialtyMap.get(candSpec.parentId)
      : undefined;
    const targetParent = targetSpec.parentId
      ? specialtyMap.get(targetSpec.parentId)
      : undefined;
    if (
      candParent?.parentId &&
      targetParent?.parentId &&
      candParent.parentId === targetParent.parentId
    ) {
      return 0.5;
    }
    return 0.25;
  }

  private areSkillsRelated(
    skillA: { id: string; parentId: string | null },
    skillB: { id: string; parentId: string | null },
  ): boolean {
    if (skillA.id === skillB.id) return true;
    if (skillA.parentId && skillA.parentId === skillB.parentId) return true;
    if (skillA.parentId === skillB.id || skillB.parentId === skillA.id) {
      return true;
    }
    return false;
  }

  private mapDegreeLevel(level: DegreeLevel): number {
    switch (level) {
      case DegreeLevel.BAC_3:
      case DegreeLevel.DU_SPECIALISE:
      case DegreeLevel.DIPLOME_ETAT:
        return 1;
      case DegreeLevel.BAC_5_MASTER:
        return 2;
      case DegreeLevel.BAC_8_DOCTORAT:
        return 3;
      default:
        return 1;
    }
  }

  private mapSkillLevel(level: SkillLevel): number {
    switch (level) {
      case SkillLevel.NOTIONS:
        return 1;
      case SkillLevel.PRATIQUANT:
        return 2;
      case SkillLevel.AUTONOME:
        return 3;
      case SkillLevel.EXPERT:
        return 4;
      default:
        return 1;
    }
  }

  private mapLanguageProficiency(prof: LanguageProficiency): number {
    switch (prof) {
      case LanguageProficiency.NOTIONS:
        return 1;
      case LanguageProficiency.INTERMEDIAIRE:
        return 2;
      case LanguageProficiency.COURANT_PROFESSIONNEL:
        return 3;
      case LanguageProficiency.LANGUE_MATERNELLE:
        return 4;
      default:
        return 1;
    }
  }
}
