import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const event = await request.json();
    const db = supabaseAdmin();

    const eventType = String(
      event.event ||
      event.type ||
      'unknown',
    );

    const fid =
      Number(
        event.fid ||
        event.data?.fid,
      ) || null;

    const notificationDetails =
      event.notificationDetails ||
      event.data?.notificationDetails;

    const notificationUrl =
      typeof notificationDetails?.url === 'string'
        ? notificationDetails.url
        : null;

    const notificationToken =
      typeof notificationDetails?.token === 'string'
        ? notificationDetails.token
        : null;

    /*
      Store the original event for debugging and auditing.
    */
    const { error: eventError } = await db
      .from('toby_hop_webhook_events')
      .insert({
        event_type: eventType,
        fid,
        payload: event,
      });

    if (eventError) {
      throw eventError;
    }

    /*
      Save notification credentials when the Mini App is added
      or notifications are enabled.
    */
    if (
      fid &&
      (
        eventType === 'miniapp_added' ||
        eventType === 'notifications_enabled' ||
        notificationUrl
      )
    ) {
      const { error } = await db
        .from('toby_hop_users')
        .update({
          notification_url: notificationUrl,
          notification_token: notificationToken,
          notifications_enabled: Boolean(
            notificationUrl &&
            notificationToken,
          ),
          updated_at: new Date().toISOString(),
        })
        .eq('fid', fid);

      if (error) {
        throw error;
      }
    }

    /*
      Remove stored notification credentials when the app is removed
      or notifications are disabled.
    */
    if (
      fid &&
      (
        eventType === 'miniapp_removed' ||
        eventType === 'notifications_disabled'
      )
    ) {
      const { error } = await db
        .from('toby_hop_users')
        .update({
          notification_url: null,
          notification_token: null,
          notifications_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('fid', fid);

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (cause) {
    console.error('Toby Hop webhook error:', cause);

    return NextResponse.json(
      {
        ok: false,
      },
      {
        status: 400,
      },
    );
  }
}
