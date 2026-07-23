'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import {
  useState,
  type ReactNode,
} from 'react';
import {
  WagmiProvider,
  createConfig,
  http,
} from 'wagmi';
import { base } from 'wagmi/chains';
import {
  injected,
  walletConnect,
} from 'wagmi/connectors';

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://example.com';

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig =
  createConfig({
    chains: [
      base,
    ],

    connectors: [
      /*
        Keep Farcaster first.

        Inside a Farcaster Mini App, your existing
        chooseConnector() logic will still select this connector.
      */
      farcasterMiniApp(),

      /*
        Standalone browser support.

        This does not replace or interfere with Farcaster.
      */
      ...(walletConnectProjectId
        ? [
            walletConnect({
              projectId:
                walletConnectProjectId,

              showQrModal:
                true,

              metadata: {
                name:
                  'Toby Hop',

                description:
                  'One hop. Every day.',

                url:
                  appUrl,

                icons: [
                  `${appUrl}/icon.png`,
                ],
              },
            }),
          ]
        : []),

      /*
        Desktop extensions and wallet browsers.

        This remains a fallback only.
      */
      injected({
        shimDisconnect:
          true,
      }),
    ],

    transports: {
      [base.id]:
        http(
          process.env
            .NEXT_PUBLIC_BASE_RPC_URL ||
          'https://mainnet.base.org',
        ),
    },

    ssr:
      true,
  });

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({
  children,
}: ProvidersProps) {
  const [queryClient] =
    useState(
      () =>
        new QueryClient({
          defaultOptions: {
            queries: {
              staleTime:
                15_000,

              retry:
                1,

              refetchOnWindowFocus:
                false,
            },

            mutations: {
              retry:
                0,
            },
          },
        }),
    );

  return (
    <WagmiProvider
      config={
        wagmiConfig
      }
      reconnectOnMount
    >
      <QueryClientProvider
        client={
          queryClient
        }
      >
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
