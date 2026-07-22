'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  WagmiProvider,
  createConfig,
  http,
} from 'wagmi';
import { base } from 'wagmi/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { useState } from 'react';

const wagmiConfig = createConfig({
  chains: [base],

  connectors: [
    farcasterMiniApp(),
  ],

  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL ||
        'https://mainnet.base.org',
    ),
  },

  ssr: true,

  /*
    Prevent Wagmi from scanning for browser extension wallets.
    Inside Farcaster/Base App, the Mini App connector should control
    the wallet connection.
  */
  multiInjectedProviderDiscovery: false,
});

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () => new QueryClient(),
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
