import {
  getAddress,
  isAddress,
} from 'viem';

export {
  erc20Abi,
} from 'viem';

export const BASE_CHAIN_ID = 8453;

const rawUsdcAddress =
  process.env.NEXT_PUBLIC_USDC_ADDRESS;

const rawTobyAddress =
  process.env.NEXT_PUBLIC_TOBY_ADDRESS;

export const HOP_USDC_ATOMIC = BigInt(
  process.env.HOP_USDC_ATOMIC ?? '10000',
);

export function getTokenConfig() {
  if (
    !rawUsdcAddress ||
    !isAddress(rawUsdcAddress)
  ) {
    throw new Error(
      'NEXT_PUBLIC_USDC_ADDRESS is missing or invalid.',
    );
  }

  if (
    !rawTobyAddress ||
    !isAddress(rawTobyAddress)
  ) {
    throw new Error(
      'NEXT_PUBLIC_TOBY_ADDRESS is missing or invalid.',
    );
  }

  return {
    USDC_ADDRESS: getAddress(
      rawUsdcAddress,
    ),

    TOBY_ADDRESS: getAddress(
      rawTobyAddress,
    ),
  };
}

export function assertTokenConfig() {
  return getTokenConfig();
}

export const USDC_ADDRESS =
  rawUsdcAddress &&
  isAddress(rawUsdcAddress)
    ? getAddress(rawUsdcAddress)
    : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const TOBY_ADDRESS =
  rawTobyAddress &&
  isAddress(rawTobyAddress)
    ? getAddress(rawTobyAddress)
    : '0xb8D98a102b0079B69FFbc760C8d857A31653e56e';
