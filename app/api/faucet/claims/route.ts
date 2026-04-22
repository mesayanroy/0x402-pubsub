import { NextRequest, NextResponse } from 'next/server';

const FAUCET_MAX_CLAIMS = 3;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet || wallet.length < 56) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  // In a full implementation this would query Soroban contract state.
  // For now we track claims in Supabase if available.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('faucet_claims')
        .select('claims_count')
        .eq('wallet_address', wallet)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('[faucet/claims] DB error:', error);
      }

      const claimed = data?.claims_count ?? 0;
      return NextResponse.json({
        claimsRemaining: Math.max(0, FAUCET_MAX_CLAIMS - claimed),
        totalClaimed: claimed,
        wallet,
      });
    }

    return NextResponse.json({
      claimsRemaining: FAUCET_MAX_CLAIMS,
      totalClaimed: 0,
      wallet,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
