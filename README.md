# Toby Hop

**One hop. Every day.**

A mobile-first Farcaster Mini App on Base. Each verified daily hop exchanges exactly $0.01 USDC for `$TOBY`, awards one Big Pond Energy, advances the user's streak, updates server-backed leaderboards, and creates a dynamic Farcaster cast.

## Included

- Polished one-screen pond experience
- Farcaster Quick Auth
- Native Farcaster profile identity
- Base wallet transaction flow
- 0x Swap API v2 quote adapter
- Server-side receipt and ERC-20 transfer verification
- One official hop per FID per UTC day
- Atomic Supabase streak and leaderboard updates
- Dynamic cast templates
- Streak, hop, and `$TOBY` leaderboards
- Farcaster manifest route, add-mini-app prompt, notification storage, and daily reminder cron
- Vercel-ready Next.js 16 project

## Required setup

1. Create a Supabase project.
2. Export and commit the production Supabase schema/migrations before treating a fresh clone as deployable. The current source expects the tables listed in `docs/V1_AUDIT_REPORT.md`.
3. Copy `.env.example` to `.env.local`.
4. Add your Supabase values.
5. Confirm the official Base `$TOBY` contract address: `0xb8D98a102b0079B69FFbc760C8d857A31653e56e`.
6. Add a 0x API key.
7. Set `NEXT_PUBLIC_APP_URL` after deploying.
8. Claim the Farcaster Mini App manifest and add the three account association values.
9. Add `icon.png`, `splash.png`, `hero.png`, and `og.png` to `/public`.
10. Run:
   ```bash
   npm install
   npm run typecheck
   npm run dev
   ```

## Important production checks

- Confirm `$TOBY` uses 18 decimals. If not, change formatting in `app/api/hop/verify/route.ts`.
- Populate `ALLOWED_SWAP_TARGETS` with the router/allowance-holder contracts returned by the selected provider.
- Verify the exact current Farcaster webhook signature format before enabling notifications.
- Add rate limiting to quote, verify, leaderboard, and webhook routes.
- Use a reliable paid Base RPC endpoint in production.
- Test fee-on-transfer behavior. The verifier records the amount actually delivered to the user.
- Review swap slippage. This starter uses 3% because very small pools can be volatile.
- The approval is exactly 10,000 USDC atomic units, not unlimited.
- A transaction can be recorded once, and a FID can receive only one official hop per UTC day.

## Design decision

The user pays the swap and receives `$TOBY` directly in their wallet. Toby Hop never custodially distributes tokens and never trusts a client-provided reward amount. The server derives both USDC spent and `$TOBY` received from confirmed Base transaction logs.

## Reminder schedule

`vercel.json` runs the reminder endpoint at 22:00 UTC daily. Change that schedule to match the community's preferred reminder window. The endpoint skips users who already hopped on the current UTC day and requires Vercel's `CRON_SECRET` authorization.

The webhook route verifies signed Farcaster events with `parseWebhookEvent()` before storing notification details.


## v1.0 audit

See `docs/V1_AUDIT_REPORT.md`, `docs/DEPENDENCY_MAP.md`, and `docs/DELETION_MANIFEST.md`. Run `npm run audit` to catch missing internal imports, broken internal API references, and unfinished TODO/stub source files.
