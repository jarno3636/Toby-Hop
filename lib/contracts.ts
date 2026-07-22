import { erc20Abi } from 'viem';

export { erc20Abi };

export const BASE_CHAIN_ID = 8453;
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
export const TOBY_ADDRESS = process.env.NEXT_PUBLIC_TOBY_ADDRESS as `0x${string}`;
export const HOP_USDC_ATOMIC = BigInt(process.env.HOP_USDC_ATOMIC || '10000');

export function assertTokenConfig() {
  if (!USDC_ADDRESS?.startsWith('0x') || !TOBY_ADDRESS?.startsWith('0x')) {
    throw new Error('USDC and TOBY contract addresses must be configured.');
  }
}
