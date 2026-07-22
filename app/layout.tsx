import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL || 'https://example.com'),

  title: 'Toby Hop',
  description: 'One hop. Every day.',

  openGraph: {
    title: 'Toby Hop',
    description: 'One hop. Every day.',
    url: APP_URL,
    siteName: 'Toby Hop',
    images: [
      {
        url: `${APP_URL}/og.png`,
        width: 1200,
        height: 630,
        alt: 'Toby Hop',
      },
    ],
    type: 'website',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Toby Hop',
    description: 'One hop. Every day.',
    images: [`${APP_URL}/og.png`],
  },

  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },

  other: {
    // ✅ Base App verification
    'base:app_id': '6a611b16426d14cfbad577d3',

    // ✅ Farcaster Mini App manifest
    'fc:miniapp': JSON.stringify({
      version: '1',
      imageUrl: `${APP_URL}/og.png`,
      button: {
        title: 'Hop into the pond',
        action: {
          type: 'launch_miniapp',
          name: 'Toby Hop',
          url: APP_URL,
          splashImageUrl: `${APP_URL}/splash.png`,
          splashBackgroundColor: '#071b21',
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
