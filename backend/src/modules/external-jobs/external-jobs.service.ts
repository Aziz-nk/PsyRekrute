import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ExternalJobStatus, Prisma } from '@prisma/client';
import { XMLParser } from 'fast-xml-parser';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CollectRssDto } from './dto/collect-rss.dto';
import { QueryExternalJobsDto } from './dto/query-external-jobs.dto';
import { ReviewExternalJobDto } from './dto/review-external-job.dto';
import {
  computeContentHash,
  detectMoroccanCity,
  extractPageMetadata,
  isRelevantSpecialty,
  stripHtmlToText,
} from './semantic-filter.util';
import { safeFetch } from './ssrf-guard.util';

interface ParsedRssItem {
  title?: string;
  link?: string;
  guid?: string | { '#text'?: string };
  pubDate?: string;
  description?: string;
  'content:encoded'?: string;
  category?: string | string[];
}

@Injectable()
export class ExternalJobsService {
  private readonly logger = new Logger(ExternalJobsService.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 1. Collecte semi-automatique contrôlée depuis le flux RSS officiel de Dreamjob.ma
   * Déclenchée exclusivement par un administrateur (aucun CRON).
   */
  async collectFromDreamjobRss(dto: CollectRssDto) {
    const targetKeywords =
      dto.keywords && dto.keywords.length > 0
        ? dto.keywords
        : [
            'psychologue',
            'psychologue scolaire',
            'orthophoniste',
            'autisme',
            'neuropsychologue',
            'psychoeducation',
            'educateur specialise',
          ];

    let discoveredCount = 0;
    let duplicateCount = 0;
    let filteredOutCount = 0;

    for (const keyword of targetKeywords) {
      const feedUrl = `https://www.dreamjob.ma/feed/?s=${encodeURIComponent(keyword.trim())}`;
      this.logger.log(`Interrogation du flux RSS Dreamjob : ${feedUrl}`);

      let fetchResult;
      try {
        fetchResult = await safeFetch(feedUrl);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur réseau';
        this.logger.warn(`Impossible de récupérer le flux pour "${keyword}" : ${msg}`);
        continue;
      }

      let parsedXml: { rss?: { channel?: { item?: ParsedRssItem | ParsedRssItem[] } } } | undefined;
      try {
        parsedXml = this.xmlParser.parse(fetchResult.bodyText);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'XML invalide';
        this.logger.warn(`Échec d'analyse XML pour "${keyword}" : ${msg}`);
        continue;
      }

      const rawItems = parsedXml?.rss?.channel?.item;
      if (!rawItems) {
        continue;
      }

      const items: ParsedRssItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];

      for (const item of items) {
        const rawTitle = item.title ? String(item.title).trim() : '';
        const guidText =
          typeof item.guid === 'object' && item.guid !== null
            ? (item.guid as Record<string, string>)['#text']
            : '';
        const rawLink =
          typeof item.link === 'string'
            ? item.link.trim()
            : typeof item.guid === 'string'
              ? item.guid.trim()
              : guidText?.trim() || '';

        if (!rawTitle || !rawLink) {
          continue;
        }

        const rawBody =
          (item['content:encoded'] ? String(item['content:encoded']) : '') ||
          (item.description ? String(item.description) : '');
        const textSummary = stripHtmlToText(rawBody, 600);

        // A. Filtrage sémantique obligatoire (rejet des offres sans rapport avec les spécialités)
        const combinedText = `${rawTitle} ${textSummary}`;
        if (!isRelevantSpecialty(combinedText)) {
          filteredOutCount++;
          continue;
        }

        // B. Détection de la ville marocaine
        const cityDetection = detectMoroccanCity(combinedText);
        const cityName = cityDetection?.cityName || null;
        const regionCode = cityDetection?.regionCode || null;

        // C. Extraction indicative du nom de l'organisme depuis le titre
        let organizationName = 'Organisme non spécifié';
        const matchRecrute = rawTitle.match(/^(?:Concours\s+)?([A-Za-z0-9À-ÿ\s.'-]{2,40})\s+(?:recrute|lance|cherche|ouvre)/i);
        if (matchRecrute?.[1]) {
          organizationName = matchRecrute[1].trim();
        } else if (rawTitle.toLowerCase().includes('groupe edc')) {
          organizationName = 'Groupe EDC';
        }

        // D. Date de publication
        let publicationDate: Date | null = null;
        if (item.pubDate) {
          const parsedDate = new Date(item.pubDate);
          if (!Number.isNaN(parsedDate.getTime())) {
            publicationDate = parsedDate;
          }
        }

        // E. Détection de doublons (URL unique + ContentHash normalisé)
        const contentHash = computeContentHash(rawTitle, organizationName, cityName);

        const existingByUrl = await this.prisma.externalJobListing.findUnique({
          where: { sourceUrl: rawLink },
        });

        if (existingByUrl) {
          duplicateCount++;
          await this.prisma.externalJobListing.update({
            where: { id: existingByUrl.id },
            data: { lastCheckedAt: new Date() },
          });
          continue;
        }

        const existingByHash = await this.prisma.externalJobListing.findUnique({
          where: { contentHash },
        });

        if (existingByHash) {
          duplicateCount++;
          await this.prisma.externalJobListing.update({
            where: { id: existingByHash.id },
            data: { lastCheckedAt: new Date() },
          });
          continue;
        }

        // F. Enregistrement avec statut initial PENDING_REVIEW
        await this.prisma.externalJobListing.create({
          data: {
            title: rawTitle.slice(0, 255),
            organizationName: organizationName.slice(0, 255),
            descriptionSummary: textSummary || rawTitle,
            cityName,
            regionCode,
            contractType: rawTitle.toLowerCase().includes('stage') ? 'Stage' : 'Emploi',
            category: 'Psychologie / Éducation spécialisée',
            publicationDate,
            sourceName: 'Dreamjob.ma',
            sourceUrl: rawLink,
            originalApplicationUrl: rawLink,
            status: ExternalJobStatus.PENDING_REVIEW,
            contentHash,
          },
        });

        discoveredCount++;
      }
    }

    return {
      message: 'Collecte RSS terminée avec succès',
      discovered: discoveredCount,
      skippedDuplicates: duplicateCount,
      filteredOut: filteredOutCount,
    };
  }

  /**
   * 2. Importation manuelle d'une annonce externe par URL par SYSTEM_ADMIN.
   * Utilise safeFetch pour bloquer toute tentative SSRF.
   */
  async importFromUrl(url: string, adminUserId: string) {
    const fetchResult = await safeFetch(url);
    const meta = extractPageMetadata(fetchResult.bodyText);

    if (!meta.title) {
      throw new BadRequestException(
        'Impossible d\'extraire un titre valide depuis cette page web.',
      );
    }

    const combinedText = `${meta.title} ${meta.description}`;
    const cityDetection = detectMoroccanCity(combinedText);
    const cityName = cityDetection?.cityName || null;
    const regionCode = cityDetection?.regionCode || null;

    let organizationName = meta.siteName || 'Organisme externe';
    const matchRecrute = meta.title.match(/^(?:Concours\s+)?([A-Za-z0-9À-ÿ\s.'-]{2,40})\s+(?:recrute|lance|cherche|ouvre)/i);
    if (matchRecrute?.[1]) {
      organizationName = matchRecrute[1].trim();
    }

    const canonicalUrl = meta.canonicalUrl || fetchResult.url;
    const contentHash = computeContentHash(meta.title, organizationName, cityName);

    // Vérification des doublons
    const existing = await this.prisma.externalJobListing.findFirst({
      where: {
        OR: [{ sourceUrl: canonicalUrl }, { contentHash }],
      },
    });

    if (existing) {
      throw new ConflictException(
        `Cette annonce existe déjà dans la base (ID: ${existing.id}, statut: ${existing.status}).`,
      );
    }

    const created = await this.prisma.externalJobListing.create({
      data: {
        title: meta.title.slice(0, 255),
        organizationName: organizationName.slice(0, 255),
        descriptionSummary: meta.description || meta.title,
        cityName,
        regionCode,
        contractType: meta.title.toLowerCase().includes('stage') ? 'Stage' : 'Emploi',
        category: 'Psychologie / Éducation spécialisée',
        publicationDate: new Date(),
        sourceName: meta.siteName || new URL(canonicalUrl).hostname,
        sourceUrl: canonicalUrl,
        originalApplicationUrl: canonicalUrl,
        status: ExternalJobStatus.PENDING_REVIEW,
        contentHash,
      },
    });

    await this.auditService.record({
      userId: adminUserId,
      action: 'EXTERNAL_JOB_IMPORT_URL',
      entityType: 'EXTERNAL_JOB',
      entityId: created.id,
      details: { url: canonicalUrl, title: created.title },
    });

    return created;
  }

  /**
   * 3. Liste des annonces pour la console SYSTEM_ADMIN.
   */
  async listForAdmin(query: QueryExternalJobsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ExternalJobListingWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.cityName && query.cityName.trim().length > 0) {
      where.cityName = { equals: query.cityName.trim(), mode: 'insensitive' };
    }

    if (query.category && query.category.trim().length > 0) {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { descriptionSummary: { contains: term, mode: 'insensitive' } },
        { organizationName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items, pendingCount, publishedCount, rejectedCount, expiredCount] =
      await Promise.all([
        this.prisma.externalJobListing.count({ where }),
        this.prisma.externalJobListing.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ discoveredAt: 'desc' }],
          include: {
            reviewedByUser: {
              select: { id: true, email: true },
            },
          },
        }),
        this.prisma.externalJobListing.count({
          where: { status: ExternalJobStatus.PENDING_REVIEW },
        }),
        this.prisma.externalJobListing.count({
          where: { status: ExternalJobStatus.PUBLISHED },
        }),
        this.prisma.externalJobListing.count({
          where: { status: ExternalJobStatus.REJECTED },
        }),
        this.prisma.externalJobListing.count({
          where: { status: ExternalJobStatus.EXPIRED },
        }),
      ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        countsByStatus: {
          PENDING_REVIEW: pendingCount,
          PUBLISHED: publishedCount,
          REJECTED: rejectedCount,
          EXPIRED: expiredCount,
        },
      },
    };
  }

  /**
   * 4. Validation / Rejet / Expiration par SYSTEM_ADMIN avec traçabilité dans AUDIT_LOGS.
   */
  async reviewListing(
    id: string,
    dto: ReviewExternalJobDto,
    adminUserId: string,
  ) {
    const listing = await this.prisma.externalJobListing.findUnique({
      where: { id },
    });

    if (!listing) {
      throw new NotFoundException('Annonce externe introuvable');
    }

    let nextStatus: ExternalJobStatus;
    if (dto.action === 'PUBLISH') {
      nextStatus = ExternalJobStatus.PUBLISHED;
    } else if (dto.action === 'REJECT') {
      nextStatus = ExternalJobStatus.REJECTED;
    } else if (dto.action === 'EXPIRE') {
      nextStatus = ExternalJobStatus.EXPIRED;
    } else {
      throw new BadRequestException('Action de revue invalide');
    }

    const updated = await this.prisma.externalJobListing.update({
      where: { id },
      data: {
        status: nextStatus,
        title: dto.title?.trim() || listing.title,
        organizationName: dto.organizationName?.trim() || listing.organizationName,
        descriptionSummary: dto.descriptionSummary?.trim() || listing.descriptionSummary,
        cityName: dto.cityName !== undefined ? dto.cityName : listing.cityName,
        contractType: dto.contractType !== undefined ? dto.contractType : listing.contractType,
        category: dto.category !== undefined ? dto.category : listing.category,
        rejectionReason: dto.action === 'REJECT' ? dto.rejectionReason || 'Non retenu par l\'administrateur' : null,
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
      },
    });

    const auditActionMap = {
      PUBLISH: 'EXTERNAL_JOB_PUBLISH',
      REJECT: 'EXTERNAL_JOB_REJECT',
      EXPIRE: 'EXTERNAL_JOB_EXPIRE',
    } as const;

    await this.auditService.record({
      userId: adminUserId,
      action: auditActionMap[dto.action],
      entityType: 'EXTERNAL_JOB',
      entityId: id,
      details: {
        previousStatus: listing.status,
        newStatus: nextStatus,
        title: updated.title,
        sourceName: updated.sourceName,
      },
    });

    return updated;
  }

  /**
   * 5. Consultation publique pour tous les visiteurs (statut PUBLISHED uniquement).
   */
  async listPublishedForPublic(query: QueryExternalJobsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ExternalJobListingWhereInput = {
      status: ExternalJobStatus.PUBLISHED,
    };

    if (query.cityName && query.cityName.trim().length > 0) {
      where.cityName = { equals: query.cityName.trim(), mode: 'insensitive' };
    }

    if (query.category && query.category.trim().length > 0) {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { descriptionSummary: { contains: term, mode: 'insensitive' } },
        { organizationName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.externalJobListing.count({ where }),
      this.prisma.externalJobListing.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ publicationDate: 'desc' }, { discoveredAt: 'desc' }],
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 6. Détail public d'une annonce externe publiée.
   */
  async getPublicById(id: string) {
    const listing = await this.prisma.externalJobListing.findUnique({
      where: { id },
    });

    if (!listing || listing.status !== ExternalJobStatus.PUBLISHED) {
      throw new NotFoundException('Annonce externe introuvable ou non publiée');
    }

    return listing;
  }
}
