'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import { NotificationItem, notificationsApi } from '@/lib/api-client';

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tNav = useTranslations('nav');
  const { user, isLoading: authLoading } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);
  const [markingIds, setMarkingIds] = useState<Record<string, boolean>>({});

  const loadNotifications = async (filterUnread: boolean) => {
    setIsLoading(true);
    try {
      const res = await notificationsApi.list({ unreadOnly: filterUnread, limit: 50 });
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // keep current state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications(unreadOnly);
    }
  }, [user, unreadOnly]);

  const handleMarkAsRead = async (id: string) => {
    setMarkingIds((prev) => ({ ...prev, [id]: true }));
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } finally {
      setMarkingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } finally {
      setIsMarkingAll(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl text-center py-16 px-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('title')}</h2>
          <p className="text-sm text-gray-600 mb-6">{t('subtitle')}</p>
          <Link
            href="/auth/login"
            className="inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            {tNav('login')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-gray-200 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900" data-testid="notifications-page-title">
              {t('title')}
            </h1>
            {unreadCount > 0 && (
              <span
                data-testid="notifications-header-badge"
                className="inline-flex items-center justify-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800"
              >
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              data-testid="filter-all-btn"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                !unreadOnly
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('all')}
            </button>
            <button
              type="button"
              onClick={() => setUnreadOnly(true)}
              data-testid="filter-unread-btn"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                unreadOnly
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('unreadOnly')}
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isMarkingAll}
              data-testid="mark-all-read-btn"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              {isMarkingAll ? t('markingAll') : t('markAllRead')}
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : notifications.length === 0 ? (
          <div
            data-testid="notifications-empty-state"
            className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-12 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-3">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600">
              {unreadOnly ? t('emptyUnread') : t('empty')}
            </p>
          </div>
        ) : (
          notifications.map((item) => (
            <div
              key={item.id}
              data-testid={`notification-item-${item.id}`}
              className={`relative rounded-xl border p-4 transition text-left rtl:text-right ${
                !item.isRead
                  ? 'border-brand-200 bg-brand-50/40 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {!item.isRead && (
                      <span className="h-2 w-2 rounded-full bg-brand-600 shrink-0" />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                      {t(`types.${item.type}` as any) || item.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      • {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1 whitespace-pre-line leading-relaxed">
                    {item.message}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                  {item.linkUrl && (
                    <Link
                      href={item.linkUrl}
                      data-testid={`notification-link-${item.id}`}
                      className="rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 transition"
                    >
                      {t('viewAction')}
                    </Link>
                  )}
                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={() => handleMarkAsRead(item.id)}
                      disabled={markingIds[item.id]}
                      data-testid={`notification-mark-read-${item.id}`}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      {t('markAsRead')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
