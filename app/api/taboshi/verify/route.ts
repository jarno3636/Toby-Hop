import { NextResponse } from 'next/server';
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  isHash,
  type Address,
  type Hash,
  type TransactionReceipt,
} from 'viem';
import { base } from 'viem/chains';

import { requireCanonicalIdentity, requireRequestedHopWallet } from '@/lib/auth/canonical-identity';
import { TABOSHI_USDC_ATOMIC, TABOSHI_ADDRESS, USDC_ADDRESS } from '@/lib/contracts';
import { formatAtomic } from '@/lib/format';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
});

const RECEIPT_LOOKUP_ATTEMPTS = 8;
const RECEIPT_LOOKUP_DELAY_MS = 1_250;
const ENERGY_AWARD = 10;

type VerifyBody = { txHash?: string; walletAddress?: string };
type ParsedTransfers = { usdcSpent: bigint; taboshiReceived: bigint };

type ExistingTaboshi = {
  id: string;
  transaction_hash: string;
  wallet_address: string;
  input_amount_atomic: string | null;
  taboshi_amount_atomic: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function addressesMatch(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

async function findReceipt(hash: Hash): Promise<TransactionReceipt> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RECEIPT_LOOKUP_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(RECEIPT_LOOKUP_DELAY_MS);
    try {
      return await publicClient.getTransactionReceipt({ hash });
    } catch (cause) {
      lastError = cause;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The Base transaction is not confirmed yet.');
}

function parseTransfers(receipt: TransactionReceipt, wallet: Address): ParsedTransfers {
  let usdcSpent = 0n;
  let taboshiReceived = 0n;

  for (const log of receipt.logs) {
    const isUsdc = addressesMatch(log.address, USDC_ADDRESS);
    const isTaboshi = addressesMatch(log.address, TABOSHI_ADDRESS);
    if (!isUsdc && !isTaboshi) continue;

    try {
      const decoded = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics });
      const args = decoded.args as { from?: Address; to?: Address; value?: bigint };
      const value = typeof args.value === 'bigint' ? args.value : 0n;

      if (isUsdc && addressesMatch(args.from, wallet)) usdcSpent += value;
      if (isTaboshi && addressesMatch(args.to, wallet)) taboshiReceived += value;
    } catch {
      // Ignore unrelated logs.
    }
  }

  return { usdcSpent, taboshiReceived };
}

function buildTaboshiCast(totalEnergy: number): string {
  return `Collected a green leaf at the pond 🍃\n\nSwapped 0.10 USDC for $TABOSHI and earned +10 Big Pond Energy.\n\nBig Pond Energy: ${totalEnergy.toLocaleString('en-US')}\n\n$toby $taboshi`;
}

async function totalTaboshiForIdentity(wallet: Address, fid: number | null): Promise<string> {
  const filters = [`wallet_address.eq.${wallet.toLowerCase()}`];
  if (fid && fid > 0) filters.push(`fid.eq.${fid}`);

  const { data, error } = await supabaseAdmin()
    .from('toby_taboshi_swaps')
    .select('taboshi_amount_atomic')
    .or(filters.join(','));
  if (error) throw error;
  return (data ?? [])
    .reduce((sum: bigint, row: { taboshi_amount_atomic?: string | null }) => sum + BigInt(row.taboshi_amount_atomic ?? '0'), 0n)
    .toString();
}

async function existingByHash(hash: string): Promise<ExistingTaboshi | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('toby_taboshi_swaps')
    .select('id,transaction_hash,wallet_address,input_amount_atomic,taboshi_amount_atomic')
    .eq('transaction_hash', hash.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ExistingTaboshi | null;
}

export async function POST(request: Request) {
  try {
    const identity = await requireCanonicalIdentity();
    const body = (await request.json().catch(() => ({}))) as VerifyBody;

    if (!body.txHash || !isHash(body.txHash)) {
      return NextResponse.json({ error: 'Invalid transaction hash.' }, { status: 400 });
    }
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet.' }, { status: 400 });
    }

    const wallet = requireRequestedHopWallet(identity, body.walletAddress);
    const hash = body.txHash as Hash;

    const already = await existingByHash(hash);
    if (already) {
      if (!addressesMatch(already.wallet_address, wallet)) {
        return NextResponse.json({ error: 'This transaction was recorded for a different wallet.' }, { status: 403 });
      }

      const statusResponse = await supabaseAdmin()
        .from('toby_hop_users')
        .select('big_pond_energy')
        .ilike('wallet_address', wallet.toLowerCase())
        .limit(1)
        .maybeSingle();

      const totalEnergy = Number(statusResponse.data?.big_pond_energy ?? 0);
      const countResult = await supabaseAdmin()
        .from('toby_taboshi_swaps')
        .select('id', { count: 'exact', head: true })
        .ilike('wallet_address', wallet.toLowerCase());
      const taboshiAtomic = already.taboshi_amount_atomic ?? '0';
      const taboshiDisplay = formatAtomic(taboshiAtomic, 18, 8);
      const totalTaboshiAtomic = await totalTaboshiForIdentity(wallet, identity.fid);
      const totalTaboshiDisplay = formatAtomic(totalTaboshiAtomic, 18, 8);

      return NextResponse.json({
        taboshiId: already.id,
        taboshiAtomic,
        taboshiDisplay,
        usdcAtomic: already.input_amount_atomic ?? TABOSHI_USDC_ATOMIC.toString(),
        energyAwarded: ENERGY_AWARD,
        totalEnergy,
        totalTaboshiSwaps: countResult.count ?? 1,
        totalTaboshiAtomic,
        totalTaboshiDisplay,
        castText: buildTaboshiCast(totalEnergy),
        txHash: hash,
        alreadyRecorded: true,
      });
    }

    const receipt = await findReceipt(hash);
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'The leaf transaction failed.' }, { status: 400 });
    }

    const transaction = await publicClient.getTransaction({ hash });
    const { usdcSpent, taboshiReceived } = parseTransfers(receipt, wallet);

    if (usdcSpent < TABOSHI_USDC_ATOMIC) {
      return NextResponse.json({ error: `The wallet did not spend the required $0.10 USDC. Found ${usdcSpent.toString()} atomic USDC.` }, { status: 403 });
    }
    if (taboshiReceived <= 0n) {
      return NextResponse.json({ error: 'No $TABOSHI transfer to the submitted wallet was found.' }, { status: 403 });
    }

    const db = supabaseAdmin();

    // Prefer RPC if available; otherwise direct insert + update
    const { data: rpcData, error: rpcError } = await db.rpc('toby_hop_record_verified_taboshi', {
      p_fid: identity.fid,
      p_wallet_address: wallet.toLowerCase(),
      p_transaction_hash: hash.toLowerCase(),
      p_block_number: receipt.blockNumber.toString(),
      p_input_amount_atomic: usdcSpent.toString(),
      p_taboshi_amount_atomic: taboshiReceived.toString(),
    });

    let taboshiId: string;
    let totalEnergy: number;
    let totalTaboshiSwaps: number;

    if (!rpcError && rpcData) {
      const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as any;
      taboshiId = result.taboshi_id || result.id;
      totalEnergy = Number(result.energy_after ?? 0);
      totalTaboshiSwaps = Number(result.total_taboshi_swaps_after ?? 1);
    } else {
      // Fallback direct write (create table if needed — see docs)
      const { data: inserted, error: insertError } = await db
        .from('toby_taboshi_swaps')
        .insert({
          fid: identity.fid,
          wallet_address: wallet.toLowerCase(),
          transaction_hash: hash.toLowerCase(),
          block_number: receipt.blockNumber.toString(),
          input_amount_atomic: usdcSpent.toString(),
          taboshi_amount_atomic: taboshiReceived.toString(),
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      taboshiId = inserted.id;

      // Update user energy + totals
      const { data: userRow } = await db
        .from('toby_hop_users')
        .select('big_pond_energy, total_taboshi_atomic, total_taboshi_swaps')
        .ilike('wallet_address', wallet.toLowerCase())
        .maybeSingle();

      const currentEnergy = Number(userRow?.big_pond_energy ?? 0);
      const currentTaboshi = BigInt(userRow?.total_taboshi_atomic ?? '0');
      const currentSwaps = Number(userRow?.total_taboshi_swaps ?? 0);

      totalEnergy = currentEnergy + ENERGY_AWARD;
      totalTaboshiSwaps = currentSwaps + 1;

      await db
        .from('toby_hop_users')
        .update({
          big_pond_energy: totalEnergy,
          total_taboshi_atomic: (currentTaboshi + taboshiReceived).toString(),
          total_taboshi_swaps: totalTaboshiSwaps,
        })
        .ilike('wallet_address', wallet.toLowerCase());
    }

    const taboshiDisplay = formatAtomic(taboshiReceived, 18, 8);
    const totalTaboshiAtomic = await totalTaboshiForIdentity(wallet, identity.fid);
    const totalTaboshiDisplay = formatAtomic(totalTaboshiAtomic, 18, 8);

    return NextResponse.json({
      taboshiId,
      taboshiAtomic: taboshiReceived.toString(),
      taboshiDisplay,
      usdcAtomic: usdcSpent.toString(),
      energyAwarded: ENERGY_AWARD,
      totalEnergy,
      totalTaboshiSwaps,
      totalTaboshiAtomic,
      totalTaboshiDisplay,
      castText: buildTaboshiCast(totalEnergy),
      txHash: hash,
      alreadyRecorded: false,
      accountAbstraction: !addressesMatch(transaction.from, wallet),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to verify leaf swap.';
    const lowered = message.toLowerCase();
    const status = lowered.includes('auth') || lowered.includes('session') ? 401 : lowered.includes('does not match') ? 403 : 500;
    console.error('POST /api/taboshi/verify failed:', cause);
    return NextResponse.json({ error: message }, { status });
  }
}
