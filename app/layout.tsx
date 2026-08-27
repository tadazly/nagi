import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nagi.luyilabs.com',
  ),
  title: 'NAGI — Generative Ambient Music',
  description: 'An endless, slowly evolving space of sound and light.',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: 'NAGI — Generative Ambient Music',
    description: 'An endless, slowly evolving space of sound and light.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'NAGI' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NAGI — Generative Ambient Music',
    description: 'An endless, slowly evolving space of sound and light.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
