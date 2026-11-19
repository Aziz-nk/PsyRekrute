import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Notification, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Création d'une notification in-app (PostgreSQL)
   * Supporte une transaction Prisma existante ou le client global.
   */
  async createNotification(
    txOrPrisma: Prisma.TransactionClient | PrismaService,
    params: CreateNotificationParams,
  ): Promise<Notification> {
    return txOrPrisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        linkUrl: params.linkUrl || null,
        isRead: false,
      },
    });
  }

  /**
   * Liste paginée des notifications de l'utilisateur connecté avec compteur de non-lus.
   */
  async listUserNotifications(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<{
    data: Notification[];
    meta: { page: number; limit: number; total: number; totalPages: number };
    unreadCount: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [total, unreadCount, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      unreadCount,
    };
  }

  /**
   * Marquer une notification comme lue.
   */
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      throw new NotFoundException('Notification not found');
    }

    if (notif.userId !== userId) {
      throw new ForbiddenException(
        'Cannot modify notifications belonging to another user',
      );
    }

    if (notif.isRead) {
      return notif;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Marquer toutes les notifications non lues de l'utilisateur comme lues.
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { count: result.count };
  }
}
