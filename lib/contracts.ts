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

export const MEDITATION_USDC_ATOMIC = BigInt(
  process.env.MEDITATION_USDC_ATOMIC ?? '50000',
);

export const PATIENCE_ADDRESS = getAddress(
  process.env.NEXT_PUBLIC_PATIENCE_ADDRESS ??
    '0x6D96f18F00B815B2109A3766E79F6A7aD7785624',
);

export const BASE_BUILDER_CODE =
  process.env.NEXT_PUBLIC_BASE_BUILDER_CODE ?? 'bc_d0rg3wwa';

// ERC-8021 attribution suffix generated for bc_d0rg3wwa.
export const BASE_BUILDER_DATA_SUFFIX =
  (process.env.NEXT_PUBLIC_BASE_BUILDER_DATA_SUFFIX ??
    '0x62635f64307267337777610b0080218021802180218021802180218021') as `0x${string}`;

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
