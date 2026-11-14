import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MOROCCAN_REGIONS, MoroccanRegion } from '../../constants/moroccan-regions.constant';

@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  getRegions(): readonly MoroccanRegion[] {
    return MOROCCAN_REGIONS;
  }

  async getSpecialties() {
    return this.prisma.refSpecialty.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        titleFr: true,
        titleAr: true,
        titleEn: true,
        description: true,
        parentId: true,
      },
    });
  }

  async getSkills() {
    return this.prisma.refSkill.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        category: true,
        titleFr: true,
        titleAr: true,
        titleEn: true,
        isVerifiedEligible: true,
        parentId: true,
      },
    });
  }
}
