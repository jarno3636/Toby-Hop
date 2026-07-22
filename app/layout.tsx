import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Toby Hop',
  description: 'One hop. Every day.',
  other: {
    'fc:miniapp': JSON.stringify({
      version: '1',
      imageUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/og.png`,
      button: {
        title: 'Hop into the pond',
        action: {
          type: 'launch_miniapp',
          name: 'Toby Hop',
          url: process.env.NEXT_PUBLIC_APP_URL ?? '',
          splashImageUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/splash.png`,
          splashBackgroundColor: '#071b21'
        }
      }
    })
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
