import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from '@farcaster/miniapp-node';
import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupportedEvent =
  | 'miniapp_added'
  | 'miniapp_removed'
  | 'notifications_enabled'
  | 'notifications_disabled';

type NotificationDetails = {
  url: string;
  token: string;
};

function isSupportedEvent(
  value: string,
): value is SupportedEvent {
  return (
    value === 'miniapp_added' ||
    value === 'miniapp_removed' ||
    value === 'notifications_enabled' ||
    value === 'notifications_disabled'
  );
}

function getNotificationDetails(
  value: unknown,
): NotificationDetails | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  const details =
    value as {
      url?: unknown;
      token?: unknown;
    };

  if (
    typeof details.url !== 'string' ||
    typeof details.token !== 'string'
  ) {
    return null;
  }

  const url =
    details.url.trim();

  const token =
    details.token.trim();

  if (
    !url ||
    !token
  ) {
    return null;
  }

  try {
    const parsedUrl =
      new URL(url);

    if (
      parsedUrl.protocol !==
      'https:'
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    url,
    token,
  };
}

function verificationErrorResponse(
  cause: unknown,
) {
  const error =
    cause as ParseWebhookEvent.ErrorType;

  switch (error?.name) {
    case 'VerifyJsonFarcasterSignature.InvalidDataError':
    case 'VerifyJsonFarcasterSignature.InvalidEventDataError':
      return NextResponse.json(
        {
          ok: false,
          error:
            'Invalid Farcaster webhook payload.',
        },
        {
          status: 400,
        },
      );

    case 'VerifyJsonFarcasterSignature.InvalidAppKeyError':
      return NextResponse.json(
        {
          ok: false,
          error:
            'Invalid Farcaster webhook signature.',
        },
        {
          status: 401,
        },
      );

    case 'VerifyJsonFarcasterSignature.VerifyAppKeyError':
      return NextResponse.json(
        {
          ok: false,
          error:
            'Farcaster webhook verification is temporarily unavailable.',
        },
        {
          status: 503,
        },
      );

    default:
      return NextResponse.json(
        {
          ok: false,
          error:
            'Unable to verify Farcaster webhook.',
        },
        {
          status: 400,
        },
      );
  }
}

export async function POST(
  request: Request,
) {
  let requestJson: unknown;

  try {
    requestJson =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Webhook body must be valid JSON.',
      },
      {
        status: 400,
      },
    );
  }

  /*
    Never trust fid, event type, URL, or token directly from
    requestJson. parseWebhookEvent verifies the Farcaster
    signature and returns the authenticated event data.
  */
  let verifiedData:
    Awaited<
      ReturnType<
        typeof parseWebhookEvent
      >
    >;

  try {
    verifiedData =
      await parseWebhookEvent(
        requestJson,
        verifyAppKeyWithNeynar,
      );
  } catch (cause) {
    console.error(
      'Toby Hop webhook verification failed:',
      cause,
    );

    return verificationErrorResponse(
      cause,
    );
  }

  try {
    const db =
      supabaseAdmin();

    const fid =
      verifiedData.fid;

    const event =
      verifiedData.event;

    const eventType =
      String(
        event.event,
      );

    if (
      !Number.isSafeInteger(fid) ||
      fid <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'The verified webhook did not contain a valid FID.',
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isSupportedEvent(
        eventType,
      )
    ) {
      /*
        Acknowledge valid but currently unsupported Farcaster
        events so the client does not repeatedly retry them.
      */
      const {
        error: unknownEventError,
      } =
        await db
          .from(
            'toby_hop_webhook_events',
          )
          .insert({
            event_type:
              eventType ||
              'unknown',

            fid,

            payload: {
              verified:
                verifiedData,

              received:
                requestJson,
            },
          });

      if (
        unknownEventError
      ) {
        console.error(
          'Unable to audit unsupported webhook event:',
          unknownEventError,
        );
      }

      return NextResponse.json({
        ok: true,
        ignored: true,
      });
    }

    const notificationDetails =
      'notificationDetails' in
        event
        ? getNotificationDetails(
            event.notificationDetails,
          )
        : null;

    /*
      Save the verified event for debugging and auditing.

      The raw signed envelope is also retained, but only the
      verifiedData object is used to update user records.
    */
    const {
      error: eventError,
    } =
      await db
        .from(
          'toby_hop_webhook_events',
        )
        .insert({
          event_type:
            eventType,

          fid,

          payload: {
            verified:
              verifiedData,

            received:
              requestJson,
          },
        });

    if (eventError) {
      throw eventError;
    }

    switch (eventType) {
      case 'miniapp_added': {
        /*
          Warpcast commonly includes notificationDetails when
          adding the Mini App. Other clients may add the app
          without enabling notifications.
        */
        const update =
          notificationDetails
            ? {
                notification_url:
                  notificationDetails.url,

                notification_token:
                  notificationDetails.token,

                notifications_enabled:
                  true,

                updated_at:
                  new Date()
                    .toISOString(),
              }
            : {
                notification_url:
                  null,

                notification_token:
                  null,

                notifications_enabled:
                  false,

                updated_at:
                  new Date()
                    .toISOString(),
              };

        const {
          error,
        } =
          await db
            .from(
              'toby_hop_users',
            )
            .update(update)
            .eq(
              'fid',
              fid,
            );

        if (error) {
          throw error;
        }

        break;
      }

      case 'notifications_enabled': {
        if (
          !notificationDetails
        ) {
          throw new Error(
            'The notifications_enabled event did not contain valid notification credentials.',
          );
        }

        const {
          error,
        } =
          await db
            .from(
              'toby_hop_users',
            )
            .update({
              notification_url:
                notificationDetails.url,

              notification_token:
                notificationDetails.token,

              notifications_enabled:
                true,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'fid',
              fid,
            );

        if (error) {
          throw error;
        }

        break;
      }

      case 'miniapp_removed':
      case 'notifications_disabled': {
        const {
          error,
        } =
          await db
            .from(
              'toby_hop_users',
            )
            .update({
              notification_url:
                null,

              notification_token:
                null,

              notifications_enabled:
                false,

              updated_at:
                new Date()
                  .toISOString(),
            })
            .eq(
              'fid',
              fid,
            );

        if (error) {
          throw error;
        }

        break;
      }
    }

    return NextResponse.json({
      ok: true,
      event:
        eventType,
      fid,
      notificationsEnabled:
        eventType ===
          'notifications_enabled' ||
        (
          eventType ===
            'miniapp_added' &&
          Boolean(
            notificationDetails,
          )
        ),
    });
  } catch (cause) {
    console.error(
      'Toby Hop webhook processing error:',
      cause,
    );

    /*
      Return a retriable error. Farcaster clients can retry
      webhook delivery when your server does not return 200.
    */
    return NextResponse.json(
      {
        ok: false,
        error:
          'Unable to process the verified webhook.',
      },
      {
        status: 500,
      },
    );
  }
}
