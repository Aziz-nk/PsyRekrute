import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | PsyRekrute',
    default: 'PsyRekrute – Psychologie de l\'Éducation au Maroc',
  },
  description:
    'Plateforme de mise en relation entre étudiants/diplômés en psychologie de l\'éducation et centres spécialisés au Maroc.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
