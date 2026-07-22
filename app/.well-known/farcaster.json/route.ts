{
  "accountAssociation": {
    "header": "eyJmaWQiOjExMjExOTMsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHhmNTYwMzNDMTkxYjY2NTA0QWQ0Q0Y4NzMyM0E3NzNGRDg2RGM1MGFkIn0",
    "payload": "eyJkb21haW4iOiJ0b2J5aG9wLnZlcmNlbC5hcHAifQ",
    "signature": "3DHaAZhcQmKfEHVttyxNMQm1Du0JO2jRdPdWNgZ/km8uciy4IZYe2kCazhF8fEITnaqZEQ9/4S35aoipWoOcBRw="
  },
  "miniapp": {
    "version": "1",
    "name": "Toby Hop",
    "homeUrl": "https://tobyhop.vercel.app",
    "iconUrl": "https://tobyhop.vercel.app/icon.png",
    "splashImageUrl": "https://tobyhop.vercel.app/splash.png",
    "splashBackgroundColor": "#071b21",
    "webhookUrl": "https://tobyhop.vercel.app/api/webhook",

    "subtitle": "One hop every day",
    "description": "Tap Toby each day to exchange 0.01 USDC for TOBY, earn Big Pond Energy, grow your streak, and climb the pond leaderboard.",

    "primaryCategory": "games",

    "tags": [
      "toby",
      "base",
      "daily",
      "streak",
      "leaderboard"
    ],

    "heroImageUrl": "https://tobyhop.vercel.app/hero.png",
    "tagline": "One hop. Every day.",

    "ogTitle": "Toby Hop",
    "ogDescription": "Tap Toby, receive TOBY, and grow your daily pond streak.",
    "ogImageUrl": "https://tobyhop.vercel.app/og.png",

    "requiredChains": [
      "eip155:8453"
    ],

    "requiredCapabilities": [
      "wallet.getEthereumProvider",
      "actions.ready",
      "actions.addMiniApp",
      "actions.composeCast",
      "haptics.impactOccurred",
      "haptics.notificationOccurred"
    ],

    "canonicalDomain": "tobyhop.vercel.app",
    "noindex": false
  }
}
