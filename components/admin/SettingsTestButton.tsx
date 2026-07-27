'use client';

import { useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

type SettingsResponse = {
  ok?: boolean;
  settings?: unknown;
  error?: string;
};

export function SettingsTestButton() {
  const [result, setResult] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function testSettings() {
    setLoading(true);
    setResult(null);

    try {
      const { token } = await sdk.quickAuth.getToken();

      const response = await fetch(
        '/api/admin/toby-hop/settings/test',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        },
      );

      const data = (await response.json()) as SettingsResponse;

      setResult(data);
    } catch (error) {
      console.error('[settings-test] Failed:', error);

      setResult({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to test settings.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        padding: 16,
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 16,
        marginTop: 16,
      }}
    >
      <button
        type="button"
        onClick={testSettings}
        disabled={loading}
        style={{
          padding: '12px 16px',
          borderRadius: 12,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Testing…' : 'Test Toby Hop Settings'}
      </button>

      {result ? (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
