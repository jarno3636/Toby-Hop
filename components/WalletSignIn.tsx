'use client';

import {
  createSiweMessage,
} from 'viem/siwe';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from 'wagmi';
import { base } from 'wagmi/chains';
import {
  useEffect,
  useState,
} from 'react';

type WalletSignInProps = {
  onAuthenticated: () => void;
};

export function WalletSignIn({
  onAuthenticated,
}: WalletSignInProps) {
  const {
    address,
    chainId,
    isConnected,
  } = useAccount();

  const {
    connectors,
    connectAsync,
    isPending: connecting,
  } = useConnect();

  const {
    disconnect,
  } = useDisconnect();

  const {
    signMessageAsync,
  } = useSignMessage();

  const {
    switchChainAsync,
  } = useSwitchChain();

  const [signingIn, setSigningIn] =
    useState(false);

  const [error, setError] =
    useState('');

  async function connectWallet(
    connectorId?: string,
  ) {
    setError('');

    const connector =
      connectorId
        ? connectors.find(
            (item) =>
              item.id ===
              connectorId,
          )
        : connectors.find(
            (item) =>
              item.id ===
              'baseAccount',
          ) || connectors[0];

    if (!connector) {
      setError(
        'No compatible wallet connector was found.',
      );

      return;
    }

    try {
      await connectAsync({
        connector,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Wallet connection failed.',
      );
    }
  }

  async function signIn() {
    if (!address) {
      await connectWallet();
      return;
    }

    setSigningIn(true);
    setError('');

    try {
      if (chainId !== base.id) {
        await switchChainAsync({
          chainId: base.id,
        });
      }

      const nonceResponse =
        await fetch(
          '/api/auth/nonce',
          {
            credentials:
              'include',
            cache: 'no-store',
          },
        );

      if (!nonceResponse.ok) {
        throw new Error(
          await nonceResponse.text(),
        );
      }

      const {
        nonce,
      } = (await nonceResponse.json()) as {
        nonce: string;
      };

      const message =
        createSiweMessage({
          address,
          chainId: base.id,
          domain:
            window.location.host,
          uri:
            window.location.origin,
          version: '1',
          nonce,
          statement:
            'Sign in to Toby Hop and protect your daily pond record.',
          issuedAt:
            new Date(),
        });

      const signature =
        await signMessageAsync({
          message,
        });

      const response =
        await fetch(
          '/api/auth/verify',
          {
            method: 'POST',
            credentials:
              'include',
            headers: {
              'content-type':
                'application/json',
            },
            body: JSON.stringify({
              message,
              signature,
            }),
          },
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Wallet authentication failed.',
        );
      }

      onAuthenticated();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Wallet authentication failed.',
      );
    } finally {
      setSigningIn(false);
    }
  }

  if (!isConnected) {
    return (
      <section className="wallet-login-card">
        <div className="wallet-login-icon">
          🐸
        </div>

        <div>
          <strong>
            Join the pond
          </strong>

          <p>
            Connect a Base wallet to save
            your hops, energy and streak.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            connectWallet()
          }
          disabled={connecting}
        >
          {connecting
            ? 'Connecting'
            : 'Connect wallet'}
        </button>

        {error && (
          <span className="wallet-login-error">
            {error}
          </span>
        )}
      </section>
    );
  }

  return (
    <section className="wallet-login-card">
      <div>
        <strong>
          Verify your pond record
        </strong>

        <p>
          {address?.slice(0, 6)}
          {'…'}
          {address?.slice(-4)}
        </p>
      </div>

      <button
        type="button"
        onClick={signIn}
        disabled={signingIn}
      >
        {signingIn
          ? 'Signing in'
          : 'Sign in with wallet'}
      </button>

      <button
        type="button"
        className="wallet-secondary"
        onClick={() =>
          disconnect()
        }
      >
        Use another wallet
      </button>

      {error && (
        <span className="wallet-login-error">
          {error}
        </span>
      )}
    </section>
  );
}
