"use client";

import { useCallback, useEffect, useState } from "react";

type NotificationStatus = {
  success: true;
  adminFid: number;

  environment: {
    appUrl: string | null;
    webhookUrl: string | null;
  };

  notificationUser: {
    fid: number;
    enabled: boolean;
    notificationUrl: string | null;
    tokenPreview: string | null;
    hasNotificationUrl: boolean;
    hasNotificationToken: boolean;
    updatedAt: string | null;
  } | null;

  enabledUserCount: number;

  lastWebhook: {
    event_type: string;
    processed: boolean;
    processing_error: string | null;
    received_at: string;
  } | null;

  lastDelivery: {
    notification_id: string;
    notification_type: string;
    status: string;
    title: string;
    body: string;
    target_url: string;
    attempted_at: string | null;
    delivered_at: string | null;
    created_at: string;
    error_message: string | null;
    provider_response: unknown;
  } | null;
};

type ApiError = {
  success?: false;
  error?: string;
};

type TestNotificationResult = {
  success: boolean;
  status: string;
  notificationId?: string;
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
};

type AdminNotificationsClientProps = {
  adminFid: number;
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getStatusClass(value: boolean): string {
  return value ? "status statusGood" : "status statusBad";
}

export function AdminNotificationsClient({
  adminFid,
}: AdminNotificationsClientProps) {
  const [status, setStatus] = useState<NotificationStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] =
    useState<TestNotificationResult | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/admin/notifications/status",
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload = (await response.json()) as
        | NotificationStatus
        | ApiError;

      if (!response.ok || !payload.success) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Failed to load notification status.",
        );
      }

      setStatus(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load notification status.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function sendTestNotification() {
    setSending(true);
    setError(null);
    setTestResult(null);

    try {
      const response = await fetch(
        "/api/admin/notifications/send-test",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const payload =
        (await response.json()) as TestNotificationResult;

      setTestResult(payload);

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ?? "The test notification failed.",
        );
      }

      await loadStatus();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The test notification failed.",
      );
    } finally {
      setSending(false);
    }
  }

  const notificationUser = status?.notificationUser;
  const credentialsReady = Boolean(
    notificationUser?.enabled &&
      notificationUser.hasNotificationUrl &&
      notificationUser.hasNotificationToken,
  );

  return (
    <main className="adminShell">
      <section className="hero">
        <p className="eyebrow">PRIVATE CONTROL ROOM</p>
        <h1>Toby Hop Notifications</h1>
        <p className="heroCopy">
          Webhook status, notification credentials, delivery logs,
          and manual testing for FID {adminFid}.
        </p>
      </section>

      <section className="actions">
        <button
          type="button"
          className="primaryButton"
          onClick={() => void sendTestNotification()}
          disabled={sending || loading || !credentialsReady}
        >
          {sending ? "Sending…" : "Send Test Notification"}
        </button>

        <button
          type="button"
          className="secondaryButton"
          onClick={() => void loadStatus()}
          disabled={loading || sending}
        >
          {loading ? "Refreshing…" : "Refresh Status"}
        </button>
      </section>

      {error ? <div className="errorBox">{error}</div> : null}

      {testResult?.success ? (
        <div className="successBox">
          <strong>Notification sent.</strong>
          <span>
            {testResult.httpStatus
              ? ` HTTP ${testResult.httpStatus}.`
              : ""}
            {typeof testResult.latencyMs === "number"
              ? ` ${testResult.latencyMs} ms.`
              : ""}
          </span>
        </div>
      ) : null}

      {!loading && !credentialsReady ? (
        <div className="warningBox">
          Test sending is disabled until your FID has notifications
          enabled and both webhook credentials are stored.
        </div>
      ) : null}

      <section className="grid">
        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">ADMIN ACCOUNT</p>
              <h2>Notification access</h2>
            </div>

            <span
              className={getStatusClass(
                Boolean(notificationUser?.enabled),
              )}
            >
              {notificationUser?.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <dl>
            <div>
              <dt>FID</dt>
              <dd>{notificationUser?.fid ?? adminFid}</dd>
            </div>

            <div>
              <dt>Notification URL</dt>
              <dd>
                {notificationUser?.notificationUrl ??
                  "Not received"}
              </dd>
            </div>

            <div>
              <dt>Token</dt>
              <dd>
                {notificationUser?.tokenPreview ?? "Not received"}
              </dd>
            </div>

            <div>
              <dt>Credentials updated</dt>
              <dd>{formatDate(notificationUser?.updatedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">WEBHOOK</p>
              <h2>Last event</h2>
            </div>

            <span
              className={getStatusClass(
                Boolean(
                  status?.lastWebhook?.processed &&
                    !status.lastWebhook.processing_error,
                ),
              )}
            >
              {status?.lastWebhook
                ? status.lastWebhook.processing_error
                  ? "Error"
                  : "Processed"
                : "Waiting"}
            </span>
          </div>

          <dl>
            <div>
              <dt>Event type</dt>
              <dd>
                {status?.lastWebhook?.event_type ?? "No event"}
              </dd>
            </div>

            <div>
              <dt>Received</dt>
              <dd>
                {formatDate(status?.lastWebhook?.received_at)}
              </dd>
            </div>

            <div>
              <dt>Error</dt>
              <dd>
                {status?.lastWebhook?.processing_error ?? "None"}
              </dd>
            </div>

            <div>
              <dt>Configured URL</dt>
              <dd>
                {status?.environment.webhookUrl ??
                  "APP URL missing"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">DELIVERY</p>
              <h2>Last attempt</h2>
            </div>

            <span
              className={getStatusClass(
                status?.lastDelivery?.status === "sent" ||
                  status?.lastDelivery?.status === "delivered",
              )}
            >
              {status?.lastDelivery?.status ?? "None"}
            </span>
          </div>

          <dl>
            <div>
              <dt>Type</dt>
              <dd>
                {status?.lastDelivery?.notification_type ??
                  "No delivery"}
              </dd>
            </div>

            <div>
              <dt>Notification ID</dt>
              <dd>
                {status?.lastDelivery?.notification_id ?? "—"}
              </dd>
            </div>

            <div>
              <dt>Attempted</dt>
              <dd>
                {formatDate(
                  status?.lastDelivery?.attempted_at ??
                    status?.lastDelivery?.created_at,
                )}
              </dd>
            </div>

            <div>
              <dt>Error</dt>
              <dd>
                {status?.lastDelivery?.error_message ?? "None"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">SYSTEM</p>
              <h2>Overview</h2>
            </div>
          </div>

          <dl>
            <div>
              <dt>Enabled users</dt>
              <dd>{status?.enabledUserCount ?? 0}</dd>
            </div>

            <div>
              <dt>App URL</dt>
              <dd>
                {status?.environment.appUrl ?? "Not configured"}
              </dd>
            </div>

            <div>
              <dt>Admin page</dt>
              <dd>FID protected</dd>
            </div>

            <div>
              <dt>Service credentials</dt>
              <dd>Server only</dd>
            </div>
          </dl>
        </article>
      </section>

      <style jsx>{`
        .adminShell {
          min-height: 100vh;
          padding: 28px 18px 80px;
          color: #f7f5e9;
          background:
            radial-gradient(
              circle at 50% -10%,
              rgba(76, 158, 133, 0.24),
              transparent 42%
            ),
            linear-gradient(180deg, #071513 0%, #08110f 100%);
        }

        .hero,
        .actions,
        .grid,
        .errorBox,
        .successBox,
        .warningBox {
          width: min(100%, 960px);
          margin-left: auto;
          margin-right: auto;
        }

        .hero {
          padding: 28px 0 20px;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #9ec6ae;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.16em;
        }

        h1,
        h2,
        p {
          margin-top: 0;
        }

        h1 {
          margin-bottom: 12px;
          font-size: clamp(2rem, 8vw, 4rem);
          line-height: 0.98;
        }

        h2 {
          margin-bottom: 0;
          font-size: 1.12rem;
        }

        .heroCopy {
          max-width: 620px;
          color: #b9c7bf;
          line-height: 1.6;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 18px;
        }

        button {
          min-height: 48px;
          padding: 0 18px;
          border-radius: 14px;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .primaryButton {
          border: 1px solid #dceeb7;
          color: #102017;
          background: #dceeb7;
        }

        .secondaryButton {
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #f7f5e9;
          background: rgba(255, 255, 255, 0.06);
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .card {
          min-width: 0;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 20px;
          background: rgba(13, 31, 27, 0.8);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
        }

        .cardHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .status {
          flex: none;
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: capitalize;
        }

        .statusGood {
          color: #bff6ce;
          background: rgba(42, 154, 85, 0.18);
        }

        .statusBad {
          color: #ffd5ca;
          background: rgba(195, 76, 48, 0.18);
        }

        dl {
          margin: 0;
        }

        dl > div {
          display: grid;
          grid-template-columns: minmax(110px, 0.7fr) minmax(0, 1.3fr);
          gap: 12px;
          padding: 11px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
        }

        dt {
          color: #8ea198;
          font-size: 0.82rem;
        }

        dd {
          min-width: 0;
          margin: 0;
          color: #f2f5ed;
          font-size: 0.82rem;
          overflow-wrap: anywhere;
        }

        .errorBox,
        .successBox,
        .warningBox {
          box-sizing: border-box;
          margin-bottom: 16px;
          padding: 14px 16px;
          border-radius: 14px;
        }

        .errorBox {
          border: 1px solid rgba(255, 115, 86, 0.35);
          color: #ffd5ca;
          background: rgba(133, 44, 26, 0.25);
        }

        .successBox {
          border: 1px solid rgba(110, 218, 144, 0.32);
          color: #c8f5d5;
          background: rgba(31, 113, 62, 0.25);
        }

        .warningBox {
          border: 1px solid rgba(238, 205, 108, 0.28);
          color: #f5e6b5;
          background: rgba(115, 88, 23, 0.24);
        }

        @media (max-width: 720px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .actions button {
            flex: 1;
          }

          dl > div {
            grid-template-columns: 1fr;
            gap: 4px;
          }
        }
      `}</style>
    </main>
  );
}
