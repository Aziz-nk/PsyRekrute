import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgMemberRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';

export const ASSIGNABLE_ORG_ROLES = [
  OrgMemberRole.ADMIN,
  OrgMemberRole.RECRUITER,
  OrgMemberRole.VIEWER,
] as const;

export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

export class AddOrgMemberDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: "Identifiant UUID de l'utilisateur à intégrer",
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'recruteur@entreprise.ma',
    description: "Adresse email du compte utilisateur organisation à intégrer",
  })
  @IsOptional()
  @IsEmail()
  email?: string;

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
