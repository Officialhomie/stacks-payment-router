import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Stacks Payment Router',
  description: 'Cross-chain payment routing for AI agents and applications',
  keywords: ['stacks', 'payment', 'crypto', 'blockchain', 'web3'],
  authors: [{ name: 'Stacks Payment Router' }],
  openGraph: {
    title: 'Stacks Payment Router',
    description: 'Cross-chain payment routing for AI agents and applications',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stacks Payment Router',
    description: 'Cross-chain payment routing for AI agents and applications',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
