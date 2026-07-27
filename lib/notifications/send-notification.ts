import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  FarcasterNotificationResponse,
  NotificationDeliveryStatus,
  SendTobyHopNotificationInput,
  SendTobyHopNotificationResult,
} from "@/lib/notifications/types";

const TITLE_MAX_LENGTH = 32;
const BODY_MAX_LENGTH = 128;
const NOTIFICATION_ID_MAX_LENGTH = 128;
const TARGET_URL_MAX_LENGTH = 1024;
const REQUEST_TIMEOUT_MS = 12_000;

type TobyHopUserNotificationRow = {
  fid: number;
  notification_url: string | null;
  notification_token: string | null;
  notifications_enabled: boolean | null;
};

type DeliveryInsert = {
  fid: number;
  notification_id: string;
  notification_type: string;
  pond_date: string | null;
  title: string;
  body: string;
  target_url: string;
  status: NotificationDeliveryStatus;
  provider_response: unknown;
  error_message: string | null;
  attempted_at: string;
  delivered_at: string | null;
};

function requireAppUrl(): URL {
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://tobyhop.vercel.app";

  try {
    return new URL(rawUrl);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not a valid absolute URL.",
    );
  }
}

function validateNotificationInput(
  input: SendTobyHopNotificationInput,
): void {
  if (!Number.isSafeInteger(input.fid) || input.fid <= 0) {
    throw new Error(
      "A valid positive Farcaster FID is required.",
    );
  }

  const notificationId = input.notificationId.trim();
  const title = input.title.trim();
  const body = input.body.trim();

  if (!notificationId) {
    throw new Error("notificationId is required.");
  }

  if (notificationId.length > NOTIFICATION_ID_MAX_LENGTH) {
    throw new Error(
      `notificationId cannot exceed ${NOTIFICATION_ID_MAX_LENGTH} characters.`,
    );
  }

  if (!title) {
    throw new Error("Notification title is required.");
  }

  if (title.length > TITLE_MAX_LENGTH) {
    throw new Error(
      `Notification title cannot exceed ${TITLE_MAX_LENGTH} characters.`,
    );
  }

  if (!body) {
    throw new Error("Notification body is required.");
  }

  if (body.length > BODY_MAX_LENGTH) {
    throw new Error(
      `Notification body cannot exceed ${BODY_MAX_LENGTH} characters.`,
    );
  }

  if (input.targetUrl.length > TARGET_URL_MAX_LENGTH) {
    throw new Error(
      `targetUrl cannot exceed ${TARGET_URL_MAX_LENGTH} characters.`,
    );
  }

  const appUrl = requireAppUrl();
  const targetUrl = new URL(input.targetUrl, appUrl);

  if (targetUrl.hostname !== appUrl.hostname) {
    throw new Error(
      `Notification target hostname must exactly match ${appUrl.hostname}.`,
    );
  }

  if (
    targetUrl.protocol !== "https:" &&
    appUrl.hostname !== "localhost"
  ) {
    throw new Error(
      "Notification targetUrl must use HTTPS.",
    );
  }
}

function normalizeTargetUrl(targetUrl: string): string {
  return new URL(targetUrl, requireAppUrl()).toString();
}

function isProviderResponse(
  value: unknown,
): value is FarcasterNotificationResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response =
    value as Partial<FarcasterNotificationResponse>;

  return (
    Array.isArray(response.successfulTokens) &&
    Array.isArray(response.invalidTokens) &&
    Array.isArray(response.rateLimitedTokens)
  );
}

function isUniqueViolation(
  error: {
    code?: string | null;
    message?: string | null;
  } | null,
): boolean {
  return error?.code === "23505";
}

async function safeReadResponse(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      raw: text.slice(0, 4_000),
    };
  }
}

async function updateDelivery(
  fid: number,
  notificationId: string,
  values: {
    status: NotificationDeliveryStatus;
    providerResponse?: unknown;
    errorMessage?: string | null;
    deliveredAt?: string | null;
  },
): Promise<void> {
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("toby_hop_notification_deliveries")
    .update({
      status: values.status,
      provider_response: values.providerResponse ?? null,
      error_message: values.errorMessage ?? null,
      delivered_at: values.deliveredAt ?? null,
    })
    .eq("fid", fid)
    .eq("notification_id", notificationId);

  if (error) {
    console.error(
      "Failed to update notification delivery log",
      {
        fid,
        notificationId,
        error,
      },
    );
  }
}

async function disableInvalidNotificationToken(
  fid: number,
  token: string,
): Promise<void> {
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("toby_hop_users")
    .update({
      notifications_enabled: false,
      notification_url: null,
      notification_token: null,
      notifications_updated_at: new Date().toISOString(),
    })
    .eq("fid", fid)
    .eq("notification_token", token);

  if (error) {
    console.error(
      "Failed to disable invalid notification token",
      {
        fid,
        error,
      },
    );
  }
}

export async function sendTobyHopNotification(
  input: SendTobyHopNotificationInput,
): Promise<SendTobyHopNotificationResult> {
  validateNotificationInput(input);

  const supabase = supabaseAdmin();
  const notificationId = input.notificationId.trim();
  const title = input.title.trim();
  const body = input.body.trim();
  const targetUrl = normalizeTargetUrl(input.targetUrl);
  const attemptedAt = new Date().toISOString();

  const { data: userData, error: userError } = await supabase
    .from("toby_hop_users")
    .select(
      "fid, notification_url, notification_token, notifications_enabled",
    )
    .eq("fid", input.fid)
    .maybeSingle<TobyHopUserNotificationRow>();

  if (userError) {
    throw new Error(
      `Failed to load notification credentials: ${userError.message}`,
    );
  }

  if (!userData) {
    return {
      success: false,
      status: "missing_credentials",
      fid: input.fid,
      notificationId,
      error: "No Toby Hop user record exists for this FID.",
    };
  }

  if (!userData.notifications_enabled) {
    return {
      success: false,
      status: "disabled",
      fid: input.fid,
      notificationId,
      error: "Notifications are not enabled for this user.",
    };
  }

  const notificationUrl =
    userData.notification_url?.trim();
  const notificationToken =
    userData.notification_token?.trim();

  if (!notificationUrl || !notificationToken) {
    return {
      success: false,
      status: "missing_credentials",
      fid: input.fid,
      notificationId,
      error:
        "The user does not have a saved notification URL and token.",
    };
  }

  let parsedNotificationUrl: URL;

  try {
    parsedNotificationUrl = new URL(notificationUrl);
  } catch {
    return {
      success: false,
      status: "missing_credentials",
      fid: input.fid,
      notificationId,
      error: "The saved notification URL is invalid.",
    };
  }

  if (parsedNotificationUrl.protocol !== "https:") {
    return {
      success: false,
      status: "missing_credentials",
      fid: input.fid,
      notificationId,
      error: "The saved notification URL must use HTTPS.",
    };
  }

  const delivery: DeliveryInsert = {
    fid: input.fid,
    notification_id: notificationId,
    notification_type: input.type,
    pond_date: input.pondDate ?? null,
    title,
    body,
    target_url: targetUrl,
    status: "pending",
    provider_response: null,
    error_message: null,
    attempted_at: attemptedAt,
    delivered_at: null,
  };

  const { error: insertError } = await supabase
    .from("toby_hop_notification_deliveries")
    .insert(delivery);

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      return {
        success: false,
        status: "duplicate",
        fid: input.fid,
        notificationId,
        error:
          "A delivery with this FID and notificationId has already been logged.",
      };
    }

    throw new Error(
      `Failed to create notification delivery log: ${insertError.message}`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const startedAt = Date.now();

  try {
    const response = await fetch(notificationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        notificationId,
        title,
        body,
        targetUrl,
        tokens: [notificationToken],
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;
    const providerResponse =
      await safeReadResponse(response);
    console.log("========== FARCASTER RESPONSE ==========");
console.log("HTTP:", response.status);
console.log("URL:", notificationUrl);
console.log(
  "BODY:",
  JSON.stringify(providerResponse, null, 2),
);
console.log("=======================================");

    const loggedProviderResponse = {
      httpStatus: response.status,
      latencyMs,
      response: providerResponse,
    };

    if (!response.ok) {
      const errorMessage =
        `Notification server returned HTTP ${response.status}.`;

      await updateDelivery(input.fid, notificationId, {
        status: "failed",
        providerResponse: loggedProviderResponse,
        errorMessage,
      });

      return {
        success: false,
        status: "failed",
        fid: input.fid,
        notificationId,
        httpStatus: response.status,
        latencyMs,
        error: errorMessage,
        providerResponse,
      };
    }

    if (!isProviderResponse(providerResponse)) {
      const errorMessage =
        "Notification server returned an unexpected response format.";

      await updateDelivery(input.fid, notificationId, {
        status: "failed",
        providerResponse: loggedProviderResponse,
        errorMessage,
      });

      return {
        success: false,
        status: "failed",
        fid: input.fid,
        notificationId,
        httpStatus: response.status,
        latencyMs,
        error: errorMessage,
        providerResponse,
      };
    }

    if (
      providerResponse.invalidTokens.includes(
        notificationToken,
      )
    ) {
      await updateDelivery(input.fid, notificationId, {
        status: "invalid_token",
        providerResponse: loggedProviderResponse,
        errorMessage:
          "The Farcaster client marked the token as invalid.",
      });

      await disableInvalidNotificationToken(
        input.fid,
        notificationToken,
      );

      return {
        success: false,
        status: "invalid_token",
        fid: input.fid,
        notificationId,
        httpStatus: response.status,
        latencyMs,
        error:
          "The notification token is invalid and has been disabled.",
        providerResponse,
      };
    }

    if (
      providerResponse.rateLimitedTokens.includes(
        notificationToken,
      )
    ) {
      await updateDelivery(input.fid, notificationId, {
        status: "rate_limited",
        providerResponse: loggedProviderResponse,
        errorMessage:
          "The notification token was rate limited.",
      });

      return {
        success: false,
        status: "rate_limited",
        fid: input.fid,
        notificationId,
        httpStatus: response.status,
        latencyMs,
        error:
          "The notification was rate limited. Try again later.",
        providerResponse,
      };
    }

    if (
      !providerResponse.successfulTokens.includes(
        notificationToken,
      )
    ) {
      const errorMessage =
        "The notification server did not report the token as successful.";

      await updateDelivery(input.fid, notificationId, {
        status: "failed",
        providerResponse: loggedProviderResponse,
        errorMessage,
      });

      return {
        success: false,
        status: "failed",
        fid: input.fid,
        notificationId,
        httpStatus: response.status,
        latencyMs,
        error: errorMessage,
        providerResponse,
      };
    }

    const deliveredAt = new Date().toISOString();

    await updateDelivery(input.fid, notificationId, {
      status: "sent",
      providerResponse: loggedProviderResponse,
      errorMessage: null,
      deliveredAt,
    });

    return {
      success: true,
      status: "sent",
      fid: input.fid,
      notificationId,
      httpStatus: response.status,
      latencyMs,
      providerResponse,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    const errorMessage =
      error instanceof Error
        ? error.name === "AbortError"
          ? "The notification request timed out."
          : error.message
        : "An unknown notification error occurred.";

    await updateDelivery(input.fid, notificationId, {
      status: "failed",
      providerResponse: {
        latencyMs,
      },
      errorMessage,
    });

    return {
      success: false,
      status: "failed",
      fid: input.fid,
      notificationId,
      latencyMs,
      error: errorMessage,
    };
  } finally {
    clearTimeout(timeout);
  }
}
