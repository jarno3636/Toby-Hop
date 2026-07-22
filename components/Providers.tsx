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
import { injected } from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import {
  useState,
  type ReactNode,
} from 'react';

const config = createConfig({
  chains: [base],

  connectors: [
    farcasterMiniApp(),
    injected(),
  ],

  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC_URL ||
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
  const [queryClient] = useState(
    () => new QueryClient(),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider
        client={queryClient}
      >
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
