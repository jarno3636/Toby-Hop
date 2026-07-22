import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const suppliedAuthorization =
    request.headers.get('authorization');

  if (
    !expectedSecret ||
    suppliedAuthorization !==
      `Bearer ${expectedSecret}`
  ) {
    return new NextResponse('Unauthorized', {
      status: 401,
    });
  }

  try {
    const db = supabaseAdmin();
    const today = new Date()
      .toISOString()
      .slice(0, 10);

    /*
      Only select users who:

      - Enabled notifications
      - Have notification credentials
      - Have not completed today's UTC hop
    */
    const { data: users, error } = await db
      .from('toby_hop_users')
      .select(
        `
          fid,
          notification_url,
          notification_token,
          current_streak,
          last_hop_day
        `,
      )
      .eq('notifications_enabled', true)
      .not('notification_url', 'is', null)
      .not('notification_token', 'is', null)
      .or(
        `last_hop_day.is.null,last_hop_day.lt.${today}`,
      )
      .limit(1000);

    if (error) {
      throw error;
    }

    let sent = 0;
    let failed = 0;

    for (const user of users ?? []) {
      try {
        if (!user.notification_url) {
          failed += 1;
          continue;
        }

        const body =
          user.current_streak > 0
            ? `Your ${user.current_streak}-day streak is waiting. One hop. Every day.`
            : 'The pond is ready. Make your first Toby Hop today.';

        const response = await fetch(
          user.notification_url,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              notificationId:
                `toby-hop-${today}-${user.fid}`,
              title: 'The pond misses you 🐸',
              body,
              targetUrl:
                process.env.NEXT_PUBLIC_APP_URL,
              tokens: [
                user.notification_token,
              ],
            }),
          },
        );

        if (response.ok) {
          sent += 1;
        } else {
          failed += 1;

          console.error(
            'Notification failed:',
            user.fid,
            response.status,
            await response.text(),
          );
        }
      } catch (cause) {
        failed += 1;

        console.error(
          'Notification request failed:',
          user.fid,
          cause,
        );
      }
    }

    return NextResponse.json({
      candidates: users?.length ?? 0,
      sent,
      failed,
    });
  } catch (cause) {
    return new NextResponse(
      cause instanceof Error
        ? cause.message
        : 'Unable to send reminders.',
      { status: 500 },
    );
  }
}
