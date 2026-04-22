import { NextRequest, NextResponse } from 'next/server';
import {
  Keypair,
  Networks,
  Asset,
  Memo,
  TransactionBuilder,
  Operation,
  Horizon,
  StrKey,
} from 'stellar-sdk';
import Ably from 'ably';

const FAUCET_MAX_CLAIMS = 3;
const FAUCET_AMOUNT_XLM = 5; // 5 XLM per claim (AF$ on-chain via Soroban — see contracts/af_token)
const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;

async function pushFaucetActivity(wallet: string, amount: number): Promise<void> {
  const key = process.env.ABLY_API_KEY;
  if (!key) return;
  try {
    const ably = new Ably.Rest({ key });
    await ably.channels.get('marketplace').publish('faucet_claim', {
      eventType: 'faucet_claim',
      agentId: 'faucet',
      agentName: 'AF$ Faucet',
      ownerWallet: wallet,
      callerWallet: wallet,
      priceXlm: amount,
      timestamp: new Date().toISOString(),
    });
  } catch { /* ignore Ably errors */ }
}

/** Validate the faucet secret key before attempting to use it. */
function validateFaucetSecret(secret: string): { ok: true } | { ok: false; reason: string } {
  if (!secret || secret.trim().length === 0) {
    return { ok: false, reason: 'STELLAR_AGENT_SECRET is not set' };
  }
  const trimmed = secret.trim();
  if (!trimmed.startsWith('S')) {
    const firstChar = trimmed[0] ?? '?';
    const hint =
      firstChar === 'C' ? 'Soroban contract ID' :
      firstChar === 'G' ? 'Stellar public key' :
      'non-secret value';
    return {
      ok: false,
      reason: `STELLAR_AGENT_SECRET must be a Stellar secret key starting with "S". ` +
        `Got a key starting with "${firstChar}" — this looks like a ${hint}. ` +
        `Please set a valid Stellar secret key (S...) in your environment.`,
    };
  }
  if (!StrKey.isValidEd25519SecretSeed(trimmed)) {
    return { ok: false, reason: 'STELLAR_AGENT_SECRET is not a valid Stellar secret key (failed StrKey validation).' };
  }
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { walletAddress?: string };
  const { walletAddress } = body;

  if (!walletAddress || walletAddress.trim().length < 56) {
    return NextResponse.json({ error: 'Invalid wallet address — must be a 56-character Stellar G-address.' }, { status: 400 });
  }

  if (!StrKey.isValidEd25519PublicKey(walletAddress.trim())) {
    return NextResponse.json({ error: 'Invalid wallet address — not a valid Stellar public key (G...).' }, { status: 400 });
  }

  const faucetSecret = process.env.STELLAR_AGENT_SECRET?.trim() ?? '';
  const secretCheck = validateFaucetSecret(faucetSecret);
  if (secretCheck.ok === false) {
    // TypeScript narrows to { ok: false; reason: string } after the !secretCheck.ok check
    return NextResponse.json({ error: `Faucet not configured: ${secretCheck.reason}` }, { status: 503 });
  }

  // Check & update claims in Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let currentClaims = 0;

  if (supabaseUrl && supabaseKey) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from('faucet_claims')
      .select('claims_count')
      .eq('wallet_address', walletAddress.trim())
      .single();

    currentClaims = data?.claims_count ?? 0;
    if (currentClaims >= FAUCET_MAX_CLAIMS) {
      return NextResponse.json({ error: 'Faucet claim limit reached (max 3 claims per wallet)' }, { status: 429 });
    }
  }

  // Send XLM via Stellar Horizon
  try {
    const keypair = Keypair.fromSecret(faucetSecret);
    const server = new Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(keypair.publicKey());

    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({
        destination: walletAddress.trim(),
        asset: Asset.native(),
        amount: FAUCET_AMOUNT_XLM.toFixed(7),
      }))
      .addMemo(Memo.text('AF$ Faucet Claim'))
      .setTimeout(30)
      .build();

    tx.sign(keypair);
    const result = await server.submitTransaction(tx);
    const txHash = result.hash;

    // Update claims in Supabase
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('faucet_claims').upsert({
        wallet_address: walletAddress.trim(),
        claims_count: currentClaims + 1,
        last_claim_at: new Date().toISOString(),
        total_received_xlm: (currentClaims + 1) * FAUCET_AMOUNT_XLM,
      }, { onConflict: 'wallet_address' });
    }

    await pushFaucetActivity(walletAddress.trim(), FAUCET_AMOUNT_XLM);

    return NextResponse.json({
      txHash,
      claimsRemaining: Math.max(0, FAUCET_MAX_CLAIMS - (currentClaims + 1)),
      amountXlm: FAUCET_AMOUNT_XLM,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[faucet/claim] Error:', message);

    // Provide a helpful message for the most common error
    if (message.includes('invalid encoded string') || message.includes('Invalid encoded string')) {
      return NextResponse.json({
        error: 'Faucet wallet is misconfigured — STELLAR_AGENT_SECRET is not a valid Stellar secret key. ' +
          'Please set a valid S-prefixed testnet secret key and fund the faucet address via https://friendbot.stellar.org',
      }, { status: 503 });
    }

    if (message.includes('op_no_source_account') || message.includes('op_underfunded') || message.includes('insufficient')) {
      return NextResponse.json({
        error: 'Faucet wallet has insufficient XLM. Fund the faucet address via https://friendbot.stellar.org',
      }, { status: 503 });
    }

    return NextResponse.json({ error: `Faucet transaction failed: ${message}` }, { status: 500 });
  }
}
