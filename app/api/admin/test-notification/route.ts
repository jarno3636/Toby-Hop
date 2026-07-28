import { NextRequest, NextResponse } from 'next/server';
import { sendTobyHopNotification } from '@/lib/notifications/send';
import { requireCanonicalIdentity } from '@/lib/auth/require-canonical-identity';

const ADMIN_FIDS = new Set([1121193]); // your FID

export async function GET(req: NextRequest) {
  const user = await requireCanonicalIdentity(req);

  if (!ADMIN_FIDS.has(user.fid)) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  try {
    await sendTobyHopNotification({
      fid: user.fid,
      title: '🐸 Toby Hop Test',
      body: 'If you received this, notifications are working!',
      notificationId: `manual-test-${Date.now()}`
    });

    return NextResponse.json({
      success: true,
      message: 'Notification sent.'
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
}
