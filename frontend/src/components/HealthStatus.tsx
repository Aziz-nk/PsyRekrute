'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface HealthResponse {
  status: string;
  info?: { postgresql?: { status: string } };
}

export default function HealthStatus() {
  const t = useTranslations('health');
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    fetch(`${API}/api/v1/health`)
      .then((res) => res.json())
      .then((json: HealthResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const pgStatus = data?.info?.postgresql?.status;
  const isOk = data?.status === 'ok';

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-medium text-gray-500">{t('status')}:</span>
      {loading && (
        <span className="text-gray-400">{t('checking')}</span>
      )}
      {!loading && !error && (
        <>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              isOk
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isOk ? 'bg-green-500' : 'bg-red-500'}`}
            />
            API {isOk ? t('connected') : t('disconnected')}
          </span>
          {pgStatus && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                pgStatus === 'up'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${pgStatus === 'up' ? 'bg-green-500' : 'bg-red-500'}`}
              />
              PostgreSQL {pgStatus === 'up' ? t('connected') : t('disconnected')}
            </span>
          )}
        </>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          API {t('disconnected')}
        </span>
      )}
    </div>
  );
}
