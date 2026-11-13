import { SetMetadata } from '@nestjs/common';
import { GlobalRole, OrgMemberRole } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const GLOBAL_ROLES_KEY = 'globalRoles';
export const ORG_ROLES_KEY = 'orgRoles';
export const ORG_ID_PARAM_KEY = 'orgIdParam';

/**
 * Marque une route ou un controleur comme public (exempte d'authentification dans JwtAuthGuard).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restreint l'acces aux utilisateurs possedant l'un des roles globaux specifies (`USERS.global_role`).
 * Separe strictement `GlobalRole` (`CANDIDATE`, `ORGANIZATION_USER`, `SYSTEM_ADMIN`) de `OrgMemberRole`.
 */
export const Roles = (...roles: GlobalRole[]) =>
  SetMetadata(GLOBAL_ROLES_KEY, roles);

/**
 * Restreint l'acces aux membres d'une organisation cible (`ORGANIZATION_MEMBERS.role`)
 * possedant l'un des roles contextuels specifies (`OWNER`, `ADMIN`, `RECRUITER`, `VIEWER`).
 */
export const OrgRoles = (...roles: OrgMemberRole[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);

/**
 * Specifie optionnellement le nom du parametre de route contenant l'identifiant
 * de l'organisation cible (par defaut : `organizationId`, repli sur `orgId`).
 */
export const OrgIdParam = (paramName: string = 'organizationId') =>
  SetMetadata(ORG_ID_PARAM_KEY, paramName);

/**
 * Actions de reference de la matrice des permissions du DCTF §4.2.
 */
export type DctfMatrixAction =
  | 'MANAGE_CANDIDATE_PROFILE'
  | 'VIEW_PUBLISHED_OFFERS'
  | 'CREATE_OR_UPDATE_OFFER'
  | 'DELETE_OR_ARCHIVE_OFFER'
  | 'EXPLORE_TALENT_POOL'
  | 'INVITE_CANDIDATE_FROM_POOL'
  | 'APPLY_TO_OFFER'
  | 'SCHEDULE_INTERVIEW'
  | 'DOWNLOAD_CANDIDATE_CV'
  | 'MANAGE_ORG_MEMBERS'
  | 'VERIFY_ORGANIZATION_ICE'
  | 'MANAGE_REFERENTIALS'
  | 'VIEW_AUDIT_LOGS';

export interface DctfActionRule {
  globalRoles: readonly GlobalRole[];
  orgRoles: readonly OrgMemberRole[];
}

/**
 * Codification exacte de la matrice des permissions du DCTF §4.2 :
 * - Dissociation stricte entre `GlobalRole` et `OrgMemberRole`.
 * - Aucun privilege implicite invente pour `SYSTEM_ADMIN` (ex: postuler a une offre,
 *   inviter un candidat du vivier, planifier un entretien ou gerer les membres d'une
 *   organisation lui sont explicitement interdits).
 */
export const DCTF_PERMISSION_MATRIX: Record<DctfMatrixAction, DctfActionRule> =
  {
    MANAGE_CANDIDATE_PROFILE: {
      globalRoles: [GlobalRole.CANDIDATE, GlobalRole.SYSTEM_ADMIN],
      orgRoles: [],
    },
    VIEW_PUBLISHED_OFFERS: {
      globalRoles: [
        GlobalRole.CANDIDATE,
        GlobalRole.ORGANIZATION_USER,
        GlobalRole.SYSTEM_ADMIN,
      ],
      orgRoles: [
        OrgMemberRole.VIEWER,
        OrgMemberRole.RECRUITER,
        OrgMemberRole.ADMIN,
        OrgMemberRole.OWNER,
      ],
    },
    CREATE_OR_UPDATE_OFFER: {
      globalRoles: [GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN],
      orgRoles: [
        OrgMemberRole.RECRUITER,
        OrgMemberRole.ADMIN,
        OrgMemberRole.OWNER,
      ],
    },
    DELETE_OR_ARCHIVE_OFFER: {
      globalRoles: [GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN],
      orgRoles: [OrgMemberRole.ADMIN, OrgMemberRole.OWNER],
    },
    EXPLORE_TALENT_POOL: {
      globalRoles: [GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN],
      orgRoles: [
        OrgMemberRole.VIEWER,
        OrgMemberRole.RECRUITER,
        OrgMemberRole.ADMIN,
        OrgMemberRole.OWNER,
      ],
    },
    INVITE_CANDIDATE_FROM_POOL: {
      globalRoles: [GlobalRole.ORGANIZATION_USER],
      orgRoles: [
        OrgMemberRole.RECRUITER,
        OrgMemberRole.ADMIN,
        OrgMemberRole.OWNER,
      ],
    },
    APPLY_TO_OFFER: {
      globalRoles: [GlobalRole.CANDIDATE],
      orgRoles: [],
    },
    SCHEDULE_INTERVIEW: {
      globalRoles: [GlobalRole.CANDIDATE, GlobalRole.ORGANIZATION_USER],
      orgRoles: [
        OrgMemberRole.RECRUITER,
        OrgMemberRole.ADMIN,
        OrgMemberRole.OWNER,
      ],
    },
    DOWNLOAD_CANDIDATE_CV: {
      globalRoles: [
        GlobalRole.CANDIDATE,
        GlobalRole.ORGANIZATION_USER,
        GlobalRole.SYSTEM_ADMIN,
      ],
      orgRoles: [
        OrgMemberRole.RECRUITER,
        OrgMemberRole.ADMIN,
        OrgMemberRole.OWNER,
      ],
    },
    MANAGE_ORG_MEMBERS: {
      globalRoles: [GlobalRole.ORGANIZATION_USER],
      orgRoles: [OrgMemberRole.ADMIN, OrgMemberRole.OWNER],
    },
    VERIFY_ORGANIZATION_ICE: {
      globalRoles: [GlobalRole.SYSTEM_ADMIN],
      orgRoles: [],
    },
    MANAGE_REFERENTIALS: {
      globalRoles: [GlobalRole.SYSTEM_ADMIN],
      orgRoles: [],
    },
    VIEW_AUDIT_LOGS: {
      globalRoles: [GlobalRole.SYSTEM_ADMIN],
      orgRoles: [],
    },
  };
