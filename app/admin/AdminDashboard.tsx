"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { sdk } from "@farcaster/miniapp-sdk";

type AdminStatus = {
  success: true;
  adminFid: number;

  environment: {
    appUrl: string | null;
    webhookUrl: string | null;
    audience: string | null;
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

type FailedResponse = {
  success?: false;
  ok?: false;
  error?: string;
  status?: string;
};

type TestResult = {
  success: boolean;
  status: string;
  notificationId?: string;
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
};

type ToggleSetting = {
  enabled: boolean;
};

type ChanceSetting = {
  enabled: boolean;
  chance: number;
};

type TobyHopSettings = {
  hop_cost: number;

  golden_toby: ChanceSetting;

  rainbow_pond: ChanceSetting;

  weather: ToggleSetting;

  leaderboard: ToggleSetting;

  maintenance: ToggleSetting;
};

type SettingsResponse = {
  ok: true;
  settings: TobyHopSettings;
};

function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatPercent(
  decimal: number | null | undefined,
): string {
  if (
    typeof decimal !== "number" ||
    !Number.isFinite(decimal)
  ) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits:
      decimal > 0 && decimal < 0.001
        ? 3
        : decimal < 0.01
          ? 2
          : 1,
    maximumFractionDigits: 4,
  }).format(decimal);
}

function formatHopCost(
  value: number | null | undefined,
): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${value} USDC`;
}

function statusTone(
  successful: boolean,
): string {
  return successful
    ? "status statusGood"
    : "status statusBad";
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  const text = await response.text();

  if (!text) {
    throw new Error(
      `Request failed with HTTP ${response.status}.`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      "The server returned an invalid response.",
    );
  }
}

export function AdminDashboard() {
  const [status, setStatus] =
    useState<AdminStatus | null>(null);

  const [settings, setSettings] =
    useState<TobyHopSettings | null>(null);

  const [checking, setChecking] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [testingSettings, setTestingSettings] =
    useState(false);

  const [denied, setDenied] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [settingsError, setSettingsError] =
    useState<string | null>(null);

  const [testResult, setTestResult] =
    useState<TestResult | null>(null);

  const [settingsTestedAt, setSettingsTestedAt] =
    useState<Date | null>(null);

  const loadStatus = useCallback(
    async (initial = false) => {
      if (initial) {
        setChecking(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const response =
          await sdk.quickAuth.fetch(
            "/api/admin/notifications/status",
            {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              cache: "no-store",
            },
          );

        if (response.status === 404) {
          setDenied(true);
          setStatus(null);
          return;
        }

        const payload =
          await readJson<
            AdminStatus | FailedResponse
          >(response);

        if (
          !response.ok ||
          !("success" in payload) ||
          payload.success !== true
        ) {
          throw new Error(
            "error" in payload &&
              payload.error
              ? payload.error
              : "Failed to load admin status.",
          );
        }

        setDenied(false);
        setStatus(payload);
      } catch (cause) {
        console.error(
          "Admin status request failed.",
          cause,
        );

        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to authenticate the admin page.",
        );
      } finally {
        setChecking(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const loadSettings = useCallback(
    async () => {
      setTestingSettings(true);
      setSettingsError(null);

      try {
        const response =
          await sdk.quickAuth.fetch(
            "/api/admin/toby-hop/settings/test",
            {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              cache: "no-store",
            },
          );

        if (response.status === 404) {
          setDenied(true);
          setSettings(null);
          return;
        }

        const payload =
          await readJson<
            SettingsResponse | FailedResponse
          >(response);

        if (
          !response.ok ||
          !("ok" in payload) ||
          payload.ok !== true
        ) {
          throw new Error(
            "error" in payload &&
              payload.error
              ? payload.error
              : "Failed to load Toby Hop settings.",
          );
        }

        setDenied(false);
        setSettings(payload.settings);
        setSettingsTestedAt(new Date());
      } catch (cause) {
        console.error(
          "Toby Hop settings request failed.",
          cause,
        );

        setSettingsError(
          cause instanceof Error
            ? cause.message
            : "Failed to load Toby Hop settings.",
        );
      } finally {
        setTestingSettings(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadStatus(true);
  }, [loadStatus]);

  async function refreshEverything() {
    setRefreshing(true);

    await Promise.all([
      loadStatus(false),
      loadSettings(),
    ]);

    setRefreshing(false);
  }

  async function sendTestNotification() {
    setSending(true);
    setError(null);
    setTestResult(null);

    try {
      const response =
        await sdk.quickAuth.fetch(
          "/api/admin/notifications/send-test",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({}),
            cache: "no-store",
          },
        );

      if (response.status === 404) {
        setDenied(true);
        setStatus(null);
        return;
      }

      const payload =
        await readJson<TestResult>(response);

      setTestResult(payload);

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "The test notification failed.",
        );
      }

      await loadStatus(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The test notification failed.",
      );
    } finally {
      setSending(false);
    }
  }

  if (checking) {
    return (
      <main className="gateScreen">
        <div className="gateMark">◉</div>

        <p>Checking pond credentials…</p>

        <style jsx>{`
          .gateScreen {
            display: grid;
            min-height: 100vh;
            place-content: center;
            gap: 14px;
            color: #c7d8ce;
            text-align: center;
            background:
              radial-gradient(
                circle at 50% 20%,
                rgba(67, 133, 112, 0.24),
                transparent 40%
              ),
              #07110f;
          }

          .gateMark {
            font-size: 2rem;
            animation: pulse 1.5s ease-in-out
              infinite;
          }

          p {
            margin: 0;
          }

          @keyframes pulse {
            50% {
              opacity: 0.35;
              transform: scale(0.9);
            }
          }
        `}</style>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="notFound">
        <h1>404</h1>

        <p>Page not found.</p>

        <style jsx>{`
          .notFound {
            display: grid;
            min-height: 100vh;
            place-content: center;
            color: #edf3ed;
            text-align: center;
            background: #07110f;
          }

          h1 {
            margin: 0;
            font-size: 4rem;
          }

          p {
            color: #91a39a;
          }
        `}</style>
      </main>
    );
  }

  const notificationUser =
    status?.notificationUser;

  const credentialsReady = Boolean(
    notificationUser?.enabled &&
      notificationUser.hasNotificationUrl &&
      notificationUser.hasNotificationToken,
  );

  const settingsHealthy = Boolean(settings);

  const maintenanceEnabled =
    settings?.maintenance.enabled ?? false;

  return (
    <main className="adminShell">
      <section className="hero">
        <p className="eyebrow">
          PRIVATE CONTROL ROOM
        </p>

        <h1>Toby Hop Operations</h1>

        <p className="heroCopy">
          Notification credentials, webhook health,
          delivery results, database settings, and
          manual testing for FID{" "}
          {status?.adminFid}.
        </p>
      </section>

      <section className="actions">
        <button
          type="button"
          className="primaryButton"
          disabled={
            sending ||
            refreshing ||
            testingSettings ||
            !credentialsReady
          }
          onClick={() =>
            void sendTestNotification()
          }
        >
          {sending
            ? "Sending…"
            : "Send Test Notification"}
        </button>

        <button
          type="button"
          className="secondaryButton"
          disabled={
            refreshing ||
            sending ||
            testingSettings
          }
          onClick={() =>
            void loadSettings()
          }
        >
          {testingSettings
            ? "Testing Settings…"
            : "Test Settings"}
        </button>

        <button
          type="button"
          className="secondaryButton"
          disabled={
            refreshing ||
            sending ||
            testingSettings
          }
          onClick={() =>
            void refreshEverything()
          }
        >
          {refreshing
            ? "Refreshing…"
            : "Refresh Everything"}
        </button>
      </section>

      {error ? (
        <div className="errorBox">
          {error}
        </div>
      ) : null}

      {settingsError ? (
        <div className="errorBox">
          <strong>
            Settings test failed.
          </strong>{" "}
          {settingsError}
        </div>
      ) : null}

      {testResult?.success ? (
        <div className="successBox">
          <strong>
            Notification sent.
          </strong>

          {testResult.httpStatus
            ? ` HTTP ${testResult.httpStatus}.`
            : ""}

          {typeof testResult.latencyMs ===
          "number"
            ? ` ${testResult.latencyMs} ms.`
            : ""}
        </div>
      ) : null}

      {settingsHealthy ? (
        <div className="successBox">
          <strong>
            Settings loaded successfully.
          </strong>{" "}

          The app is reading configuration from
          Supabase.

          {settingsTestedAt
            ? ` Tested ${settingsTestedAt.toLocaleString()}.`
            : ""}
        </div>
      ) : null}

      {!credentialsReady ? (
        <div className="warningBox">
          Test sending is disabled until your
          Farcaster notification URL and token
          have been received and notifications
          are enabled.
        </div>
      ) : null}

      {maintenanceEnabled ? (
        <div className="criticalBox">
          <strong>
            Maintenance mode is enabled.
          </strong>{" "}

          This does not affect gameplay until the
          setting is wired into your app routes.
        </div>
      ) : null}

      <section className="grid">
        <article className="card settingsCard">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">
                DATABASE SETTINGS
              </p>

              <h2>Toby Hop configuration</h2>
            </div>

            <span
              className={statusTone(
                settingsHealthy,
              )}
            >
              {testingSettings
                ? "Testing"
                : settingsHealthy
                  ? "Connected"
                  : "Not tested"}
            </span>
          </div>

          <dl>
            <div>
              <dt>Hop cost</dt>

              <dd>
                {formatHopCost(
                  settings?.hop_cost,
                )}
              </dd>
            </div>

            <div>
              <dt>Golden Toby</dt>

              <dd>
                {settings
                  ? settings.golden_toby
                      .enabled
                    ? `Enabled · ${formatPercent(
                        settings.golden_toby
                          .chance,
                      )}`
                    : "Disabled"
                  : "Not loaded"}
              </dd>
            </div>

            <div>
              <dt>Rainbow pond</dt>

              <dd>
                {settings
                  ? settings.rainbow_pond
                      .enabled
                    ? `Enabled · ${formatPercent(
                        settings.rainbow_pond
                          .chance,
                      )}`
                    : "Disabled"
                  : "Not loaded"}
              </dd>
            </div>

            <div>
              <dt>Weather</dt>

              <dd>
                {settings
                  ? settings.weather.enabled
                    ? "Enabled"
                    : "Disabled"
                  : "Not loaded"}
              </dd>
            </div>

            <div>
              <dt>Leaderboard</dt>

              <dd>
                {settings
                  ? settings.leaderboard
                      .enabled
                    ? "Enabled"
                    : "Disabled"
                  : "Not loaded"}
              </dd>
            </div>

            <div>
              <dt>Maintenance</dt>

              <dd>
                {settings
                  ? settings.maintenance
                      .enabled
                    ? "Enabled"
                    : "Disabled"
                  : "Not loaded"}
              </dd>
            </div>

            <div>
              <dt>Last test</dt>

              <dd>
                {settingsTestedAt
                  ? settingsTestedAt.toLocaleString()
                  : "Never"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">
                ADMIN ACCOUNT
              </p>

              <h2>Notification access</h2>
            </div>

            <span
              className={statusTone(
                Boolean(
                  notificationUser?.enabled,
                ),
              )}
            >
              {notificationUser?.enabled
                ? "Enabled"
                : "Disabled"}
            </span>
          </div>

          <dl>
            <div>
              <dt>FID</dt>

              <dd>
                {notificationUser?.fid ??
                  status?.adminFid ??
                  "—"}
              </dd>
            </div>

            <div>
              <dt>Notification URL</dt>

              <dd>
                {notificationUser
                  ?.notificationUrl ??
                  "Not received"}
              </dd>
            </div>

            <div>
              <dt>Token</dt>

              <dd>
                {notificationUser
                  ?.tokenPreview ??
                  "Not received"}
              </dd>
            </div>

            <div>
              <dt>Updated</dt>

              <dd>
                {formatDate(
                  notificationUser?.updatedAt,
                )}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">
                WEBHOOK
              </p>

              <h2>Last event</h2>
            </div>

            <span
              className={statusTone(
                Boolean(
                  status?.lastWebhook
                    ?.processed &&
                    !status.lastWebhook
                      .processing_error,
                ),
              )}
            >
              {status?.lastWebhook
                ? status.lastWebhook
                    .processing_error
                  ? "Error"
                  : "Processed"
                : "Waiting"}
            </span>
          </div>

          <dl>
            <div>
              <dt>Event type</dt>

              <dd>
                {status?.lastWebhook
                  ?.event_type ??
                  "No event"}
              </dd>
            </div>

            <div>
              <dt>Received</dt>

              <dd>
                {formatDate(
                  status?.lastWebhook
                    ?.received_at,
                )}
              </dd>
            </div>

            <div>
              <dt>Error</dt>

              <dd>
                {status?.lastWebhook
                  ?.processing_error ??
                  "None"}
              </dd>
            </div>

            <div>
              <dt>Webhook URL</dt>

              <dd>
                {status?.environment
                  .webhookUrl ??
                  "Not configured"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">
                DELIVERY
              </p>

              <h2>Last attempt</h2>
            </div>

            <span
              className={statusTone(
                status?.lastDelivery
                  ?.status === "sent" ||
                  status?.lastDelivery
                    ?.status ===
                    "delivered",
              )}
            >
              {status?.lastDelivery
                ?.status ?? "None"}
            </span>
          </div>

          <dl>
            <div>
              <dt>Type</dt>

              <dd>
                {status?.lastDelivery
                  ?.notification_type ??
                  "No delivery"}
              </dd>
            </div>

            <div>
              <dt>Notification ID</dt>

              <dd>
                {status?.lastDelivery
                  ?.notification_id ??
                  "—"}
              </dd>
            </div>

            <div>
              <dt>Attempted</dt>

              <dd>
                {formatDate(
                  status?.lastDelivery
                    ?.attempted_at ??
                    status?.lastDelivery
                      ?.created_at,
                )}
              </dd>
            </div>

            <div>
              <dt>Error</dt>

              <dd>
                {status?.lastDelivery
                  ?.error_message ??
                  "None"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <div className="cardHeader">
            <div>
              <p className="eyebrow">
                SYSTEM
              </p>

              <h2>Configuration</h2>
            </div>
          </div>

          <dl>
            <div>
              <dt>Enabled users</dt>

              <dd>
                {status?.enabledUserCount ??
                  0}
              </dd>
            </div>

            <div>
              <dt>App URL</dt>

              <dd>
                {status?.environment
                  .appUrl ??
                  "Not configured"}
              </dd>
            </div>

            <div>
              <dt>JWT audience</dt>

              <dd>
                {status?.environment
                  .audience ??
                  "Using app URL"}
              </dd>
            </div>

            <div>
              <dt>Authorization</dt>

              <dd>
                Quick Auth · FID allowlist
              </dd>
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
            linear-gradient(
              180deg,
              #071513 0%,
              #08110f 100%
            );
        }

        .hero,
        .actions,
        .grid,
        .errorBox,
        .successBox,
        .warningBox,
        .criticalBox {
          width: min(100%, 960px);
          margin-right: auto;
          margin-left: auto;
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
          font-size: clamp(
            2rem,
            8vw,
            4rem
          );
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
          border: 1px solid
            rgba(255, 255, 255, 0.18);
          color: #f7f5e9;
          background:
            rgba(255, 255, 255, 0.06);
        }

        .grid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .card {
          min-width: 0;
          padding: 20px;
          border: 1px solid
            rgba(255, 255, 255, 0.09);
          border-radius: 20px;
          background:
            rgba(13, 31, 27, 0.8);
          box-shadow:
            0 18px 50px
            rgba(0, 0, 0, 0.22);
        }

        .settingsCard {
          grid-column: 1 / -1;
          border-color:
            rgba(158, 198, 174, 0.2);
          background:
            linear-gradient(
              145deg,
              rgba(18, 48, 40, 0.92),
              rgba(10, 29, 25, 0.9)
            );
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
          background:
            rgba(42, 154, 85, 0.18);
        }

        .statusBad {
          color: #ffd5ca;
          background:
            rgba(195, 76, 48, 0.18);
        }

        dl {
          margin: 0;
        }

        dl > div {
          display: grid;
          grid-template-columns:
            minmax(110px, 0.7fr)
            minmax(0, 1.3fr);
          gap: 12px;
          padding: 11px 0;
          border-top: 1px solid
            rgba(255, 255, 255, 0.07);
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
        .warningBox,
        .criticalBox {
          box-sizing: border-box;
          margin-bottom: 16px;
          padding: 14px 16px;
          border-radius: 14px;
        }

        .errorBox {
          border: 1px solid
            rgba(255, 115, 86, 0.35);
          color: #ffd5ca;
          background:
            rgba(133, 44, 26, 0.25);
        }

        .successBox {
          border: 1px solid
            rgba(110, 218, 144, 0.32);
          color: #c8f5d5;
          background:
            rgba(31, 113, 62, 0.25);
        }

        .warningBox {
          border: 1px solid
            rgba(238, 205, 108, 0.28);
          color: #f5e6b5;
          background:
            rgba(115, 88, 23, 0.24);
        }

        .criticalBox {
          border: 1px solid
            rgba(255, 159, 83, 0.4);
          color: #ffe2c2;
          background:
            rgba(151, 68, 17, 0.28);
        }

        @media (max-width: 720px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .settingsCard {
            grid-column: auto;
          }

          .actions button {
            flex: 1 1 100%;
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
