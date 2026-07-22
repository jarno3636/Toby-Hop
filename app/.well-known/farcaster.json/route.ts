import { NextResponse } from 'next/server';

const APP_URL = 'https://tobyhop.vercel.app';

export function GET() {
  return NextResponse.json({
    accountAssociation: {
      header:
        process.env.ACCOUNT_ASSOCIATION_HEADER ??
        'eyJmaWQiOjExMjExOTMsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHhmNTYwMzNDMTkxYjY2NTA0QWQ0Q0Y4NzMyM0E3NzNGRDg2RGM1MGFkIn0',

      payload:
        process.env.ACCOUNT_ASSOCIATION_PAYLOAD ??
        'eyJkb21haW4iOiJ0b2J5aG9wLnZlcmNlbC5hcHAifQ',

      signature:
        process.env.ACCOUNT_ASSOCIATION_SIGNATURE ??
        '3DHaAZhcQmKfEHVttyxNMQm1Du0JO2jRdPdWNgZ/km8uciy4IZYe2kCazhF8fEITnaqZEQ9/4S35aoipWoOcBRw=',
    },

    miniapp: {
      version: '1',

      name: 'Toby Hop',

      homeUrl: APP_URL,

      iconUrl: `${APP_URL}/icon.png`,

      splashImageUrl: `${APP_URL}/splash.png`,

      splashBackgroundColor: '#071b21',

      webhookUrl: `${APP_URL}/api/webhook`,

      subtitle: 'Daily Toby Hop',

      description:
        'Tap Toby each day to make a hop collect Big Pond Energy build a streak and climb the leaderboard',

      primaryCategory: 'games',

      tags: [
        'toby',
        'base',
        'daily',
        'streak',
        'games',
      ],

      heroImageUrl: `${APP_URL}/hero.png`,

      tagline: 'One hop every day',

      ogTitle: 'Toby Hop',

      ogDescription:
        'Make a daily hop collect Toby and grow your pond streak',

      ogImageUrl: `${APP_URL}/og.png`,

      requiredChains: [
        'eip155:8453',
      ],

      requiredCapabilities: [
        'wallet.getEthereumProvider',
        'actions.composeCast',
        'actions.addMiniApp',
      ],
    },
  });
}
