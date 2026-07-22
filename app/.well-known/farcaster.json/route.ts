import { NextResponse } from 'next/server';

export function GET() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || '';

  return NextResponse.json({
    accountAssociation: {
      header:
        process.env.ACCOUNT_ASSOCIATION_HEADER ||
        '',
      payload:
        process.env.ACCOUNT_ASSOCIATION_PAYLOAD ||
        '',
      signature:
        process.env.ACCOUNT_ASSOCIATION_SIGNATURE ||
        '',
    },

    miniapp: {
      version: '1',
      name: 'Toby Hop',
      homeUrl: appUrl,
      iconUrl: `${appUrl}/icon.png`,
      splashImageUrl: `${appUrl}/splash.png`,
      splashBackgroundColor: '#071b21',

      webhookUrl: `${appUrl}/api/webhook`,

      subtitle: 'One hop. Every day.',

      description:
        'Exchange one small drop for $TOBY, grow your streak, and climb the pond.',

      primaryCategory: 'games',

      tags: [
        'toby',
        'base',
        'daily',
        'streak',
        'farcaster',
      ],

      heroImageUrl: `${appUrl}/hero.png`,
      tagline: 'One hop. Every day.',

      ogTitle: 'Toby Hop',
      ogDescription: 'One hop. Every day.',
      ogImageUrl: `${appUrl}/og.png`,
    },
  });
}
