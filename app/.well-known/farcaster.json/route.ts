import { NextResponse } from 'next/server';

export function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return NextResponse.json({
    accountAssociation: {
      header: process.env.ACCOUNT_ASSOCIATION_HEADER ?? '',
      payload: process.env.ACCOUNT_ASSOCIATION_PAYLOAD ?? '',
      signature: process.env.ACCOUNT_ASSOCIATION_SIGNATURE ?? '',
    },

    miniapp: {
      version: '1',

      name: 'Toby Hop',

      homeUrl: appUrl,

      iconUrl: `${appUrl}/icon.png`,

      splashImageUrl: `${appUrl}/splash.png`,

      splashBackgroundColor: '#071b21',

      heroImageUrl: `${appUrl}/hero.png`,

      webhookUrl: `${appUrl}/api/webhook`,

      tagline: 'One hop. Every day.',

      subtitle: 'Daily $TOBY Rewards',

      description:
        'Tap Toby once each day. Exchange $0.01 USDC for $TOBY, earn Big Pond Energy, build streaks, unlock titles, climb the global leaderboard, and share every hop on Farcaster.',

      primaryCategory: 'games',

      tags: [
        'toby',
        'base',
        'farcaster',
        'miniapp',
        'crypto',
        'daily',
        'streak',
        'leaderboard',
        'rewards',
        'gaming'
      ],

      requiredChains: [
        'eip155:8453'
      ],

      requiredCapabilities: [
        'wallet.getEthereumProvider',
        'actions.composeCast',
        'actions.addMiniApp',
        'actions.ready',
        'haptics.impactOccurred',
        'haptics.notificationOccurred'
      ],

      ogTitle: 'Toby Hop',

      ogDescription:
        'One hop. Every day. Exchange one small drop for $TOBY and build your Big Pond Energy.',

      ogImageUrl: `${appUrl}/og.png`
    }
  });
}
