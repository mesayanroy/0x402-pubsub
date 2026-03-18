import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const DEMO_AGENTS: Record<string, object> = {
  '1': {
    id: '1',
    owner_wallet: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234XYZ1',
    name: 'DeFi Analyst',
    description: 'Analyzes DeFi protocols, yields, and on-chain metrics in real time.',
    tags: ['web3', 'finance', 'defi'],
    model: 'openai-gpt4o-mini',
    system_prompt: 'You are a DeFi analyst...',
    tools: ['on_chain_data', 'web_search'],
    price_xlm: 0.05,
    visibility: 'public',
    api_endpoint: 'https://agentforge.dev/api/agents/1/run',
    total_requests: 1420,
    total_earned_xlm: 71.0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    const demo = DEMO_AGENTS[id];
    if (!demo) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    return NextResponse.json(demo);
  } catch (err) {
    console.error('Get agent error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
