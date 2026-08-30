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
import { MEDITATION_USDC_ATOMIC, PATIENCE_ADDRESS, USDC_ADDRESS } from '@/lib/contracts';
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
const ENERGY_AWARD = 5;

type VerifyBody = { txHash?: string; walletAddress?: string };
type ParsedTransfers = { usdcSpent: bigint; patienceReceived: bigint };
type RpcResult = {
  meditation_id: string;
  energy_after: number | string;
  total_meditations_after: number | string;
  already_recorded?: boolean;
};

type ExistingMeditation = {
  id: string;
  transaction_hash: string;
  wallet_address: string;
  input_amount_atomic: string | null;
  patience_amount_atomic: string | null;
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
  let patienceReceived = 0n;

  for (const log of receipt.logs) {
    const isUsdc = addressesMatch(log.address, USDC_ADDRESS);
    const isPatience = addressesMatch(log.address, PATIENCE_ADDRESS);
    if (!isUsdc && !isPatience) continue;

    try {
      const decoded = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics });
      const args = decoded.args as { from?: Address; to?: Address; value?: bigint };
      const value = typeof args.value === 'bigint' ? args.value : 0n;

      if (isUsdc && addressesMatch(args.from, wallet)) usdcSpent += value;
      if (isPatience && addressesMatch(args.to, wallet)) patienceReceived += value;
    } catch {
      // Ignore unrelated logs from the token contracts.
    }
  }

  return { usdcSpent, patienceReceived };
}

function buildMeditationCast(patienceDisplay: string, totalEnergy: number): string {
  return `Found stillness at the pond 🔺\n\nSwapped $0.05 USDC for ${patienceDisplay} $PATIENCE and gained +5 Big Pond Energy.\n\nBig Pond Energy: ${totalEnergy.toLocaleString('en-US')}\n\n$toby $patience`;
}

async function existingByHash(hash: string): Promise<ExistingMeditation | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('toby_meditations')
    .select('id,transaction_hash,wallet_address,input_amount_atomic,patience_amount_atomic')
    .eq('transaction_hash', hash.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ExistingMeditation | null;
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
        .from('toby_meditations')
        .select('id', { count: 'exact', head: true })
        .ilike('wallet_address', wallet.toLowerCase());
      const patienceAtomic = already.patience_amount_atomic ?? '0';
      const patienceDisplay = formatAtomic(patienceAtomic, 18, 2);

      return NextResponse.json({
        meditationId: already.id,
        patienceAtomic,
        patienceDisplay,
        usdcAtomic: already.input_amount_atomic ?? MEDITATION_USDC_ATOMIC.toString(),
        energyAwarded: ENERGY_AWARD,
        totalEnergy,
        totalMeditations: countResult.count ?? 1,
        castText: buildMeditationCast(patienceDisplay, totalEnergy),
        txHash: hash,
        alreadyRecorded: true,
      });
    }

    const receipt = await findReceipt(hash);
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'The stillness transaction failed.' }, { status: 400 });
    }

    const transaction = await publicClient.getTransaction({ hash });
    const { usdcSpent, patienceReceived } = parseTransfers(receipt, wallet);

    if (usdcSpent < MEDITATION_USDC_ATOMIC) {
      return NextResponse.json({ error: `The wallet did not spend the required $0.05 USDC. Found ${usdcSpent.toString()} atomic USDC.` }, { status: 403 });
    }
    if (patienceReceived <= 0n) {
      return NextResponse.json({ error: 'No $PATIENCE transfer to the submitted wallet was found.' }, { status: 403 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db.rpc('toby_hop_record_verified_meditation', {
      p_fid: identity.fid,
      p_wallet_address: wallet.toLowerCase(),
      p_transaction_hash: hash.toLowerCase(),
      p_block_number: receipt.blockNumber.toString(),
      p_input_amount_atomic: usdcSpent.toString(),
      p_patience_amount_atomic: patienceReceived.toString(),
    });

    if (error) {
      if (error.code === '23505' || error.message.toLowerCase().includes('already')) {
        return NextResponse.json({ error: 'Today’s stillness session is already complete.' }, { status: 409 });
      }
      throw new Error(`Unable to record verified stillness: ${error.message}`);
    }

    const result = (Array.isArray(data) ? data[0] : data) as RpcResult | null;
    if (!result?.meditation_id) throw new Error('The database did not return a meditation record.');

    const totalEnergy = Number(result.energy_after ?? 0);
    const totalMeditations = Number(result.total_meditations_after ?? 1);
    const patienceDisplay = formatAtomic(patienceReceived, 18, 2);

    return NextResponse.json({
      meditationId: result.meditation_id,
      patienceAtomic: patienceReceived.toString(),
      patienceDisplay,
      usdcAtomic: usdcSpent.toString(),
      energyAwarded: ENERGY_AWARD,
      totalEnergy,
      totalMeditations,
      castText: buildMeditationCast(patienceDisplay, totalEnergy),
      txHash: hash,
      alreadyRecorded: Boolean(result.already_recorded),
      accountAbstraction: !addressesMatch(transaction.from, wallet),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to verify stillness.';
    const lowered = message.toLowerCase();
    const status = lowered.includes('auth') || lowered.includes('session') ? 401 : lowered.includes('does not match') ? 403 : 500;
    console.error('POST /api/meditation/verify failed:', cause);
    return NextResponse.json({ error: message }, { status });
  }
}
