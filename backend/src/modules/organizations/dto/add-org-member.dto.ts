import { ApiProperty } from '@nestjs/swagger';
import { OrgMemberRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

export const ASSIGNABLE_ORG_ROLES = [
  OrgMemberRole.ADMIN,
  OrgMemberRole.RECRUITER,
  OrgMemberRole.VIEWER,
] as const;

export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

export class AddOrgMemberDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: "Identifiant UUID de l'utilisateur à intégrer",
  })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    enum: ASSIGNABLE_ORG_ROLES,
    example: OrgMemberRole.RECRUITER,
    description: "Rôle attribué au membre (ADMIN, RECRUITER ou VIEWER)",
  })
  @IsEnum(ASSIGNABLE_ORG_ROLES, {
    message: 'role must be one of: ADMIN, RECRUITER, VIEWER',
  })
  role!: AssignableOrgRole;
}
