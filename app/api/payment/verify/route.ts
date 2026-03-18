import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tx_hash, expected_destination, expected_amount_xlm, expected_memo } = body;

    if (!tx_hash) {
      return NextResponse.json({ error: 'Missing tx_hash' }, { status: 400 });
    }

    const { verifyPaymentTransaction } = await import('@/lib/stellar');
    const result = await verifyPaymentTransaction(
      tx_hash,
      expected_destination || '',
      parseFloat(expected_amount_xlm) || 0,
      expected_memo || ''
    );

    return NextResponse.json({
      valid: result.valid,
      error: result.error || null,
    });
  } catch (err) {
    console.error('Payment verify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
