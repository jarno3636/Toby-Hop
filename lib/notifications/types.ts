export type TobyHopNotificationType =
  | "test"
  | "daily_hop_reminder"
  | "streak_warning"
  | "golden_toby"
  | "rainbow_pond"
  | "seasonal_event"
  | "system";

export type SendTobyHopNotificationInput = {
  fid: number;
  notificationId: string;
  type: TobyHopNotificationType;
  title: string;
  body: string;
  targetUrl: string;
  pondDate?: string | null;
};

export type FarcasterNotificationTokenResult = {
  successfulTokens: string[];
  invalidTokens: string[];
  rateLimitedTokens: string[];
  failedTokens?: string[];
};

export type FarcasterNotificationResponse = {
  result: FarcasterNotificationTokenResult;
};

export type NotificationDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "invalid_token"
  | "rate_limited"
  | "failed"
  | "skipped";

export type SendTobyHopNotificationResult =
  | {
      success: true;
      status: "sent";
      fid: number;
      notificationId: string;
      httpStatus: number;
      latencyMs: number;
      providerResponse: FarcasterNotificationResponse;
    }
  | {
      success: false;
      status:
        | "disabled"
        | "missing_credentials"
        | "invalid_token"
        | "rate_limited"
        | "failed"
        | "duplicate";
      fid: number;
      notificationId: string;
      httpStatus?: number;
      latencyMs?: number;
      error: string;
      providerResponse?: unknown;
    };
