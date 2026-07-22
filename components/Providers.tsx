'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  WagmiProvider,
  createConfig,
  createStorage,
  cookieStorage,
  http,
} from 'wagmi';
import { base } from 'wagmi/chains';
import {
  baseAccount,
  injected,
} from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { useState } from 'react';

export const wagmiConfig = createConfig({
  chains: [base],

  connectors: [
    /*
      Works inside the Farcaster Mini App host.
    */
    farcasterMiniApp(),

    /*
      Works in Base App, Safari, Chrome and standard browsers.
    */
    baseAccount({
      appName: 'Toby Hop',
      appLogoUrl:
        `${process.env.NEXT_PUBLIC_APP_URL}/icon.png`,
    }),

    /*
      Supports wallets injected into the browser.
    */
    injected(),
  ],

  storage: createStorage({
    storage: cookieStorage,
  }),

  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL ||
        'https://mainnet.base.org',
    ),
  },

  multiInjectedProviderDiscovery: true,
  ssr: true,
});

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider
      config={wagmiConfig}
      reconnectOnMount
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
