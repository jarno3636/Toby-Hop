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
import { injected } from 'wagmi/connectors';

export const wagmiConfig =
  createConfig({
    chains: [base],

    connectors: [
      /*
        Keep this first. Inside Farcaster, Toby Hop will
        prefer the host-provided EIP-1193 wallet.
      */
      farcasterMiniApp(),

      /*
        Browser fallback for users opening Toby Hop
        outside a Farcaster client.
      */
      injected(),
    ],

    transports: {
      [base.id]: http(
        process.env
          .NEXT_PUBLIC_BASE_RPC_URL ||
          'https://mainnet.base.org',
      ),
    },

    ssr: true,
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
              staleTime: 15_000,
              retry: 1,
              refetchOnWindowFocus:
                false,
            },

            mutations: {
              retry: 0,
            },
          },
        }),
    );

  return (
    <WagmiProvider
      config={wagmiConfig}
      reconnectOnMount
    >
      <QueryClientProvider
        client={queryClient}
      >
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
