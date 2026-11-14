import { ApiProperty } from '@nestjs/swagger';
import { SkillLevel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CandidateSkillItemDto {
  @ApiProperty({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsUUID()
  @IsNotEmpty()
  skillId!: string;

  @ApiProperty({ enum: SkillLevel, example: SkillLevel.AUTONOME })
  @IsEnum(SkillLevel)
  level!: SkillLevel;
}

export class SetCandidateSkillsDto {
  @ApiProperty({ type: [CandidateSkillItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CandidateSkillItemDto)
  skills!: CandidateSkillItemDto[];
}
