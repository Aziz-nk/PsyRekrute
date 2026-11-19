'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/routing';

export default function AdminExternalJobsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin?tab=external-jobs');
  }, [router]);

  return (
    <div className="flex justify-center items-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
    </div>
  );
}
