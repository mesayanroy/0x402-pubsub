import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deactivateDemoAgent, getDemoAgentById } from '@/lib/demo-agents';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isMissingAgentsTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return message.includes("could not find the table 'public.agents'")
    || message.includes('relation "public.agents" does not exist')
    || error.code === 'PGRST205';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!supabaseUrl || !supabaseServiceKey) {
      const demo = getDemoAgentById(id);
      if (!demo) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      return NextResponse.json({ ...demo, storage_mode: 'demo_fallback' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      const message = (error.message || '').toLowerCase();
      if (
        message.includes("could not find the table 'public.agents'")
        || message.includes('relation "public.agents" does not exist')
        || error.code === 'PGRST205'
      ) {
        const demo = getDemoAgentById(id);
        if (!demo) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        return NextResponse.json({ ...demo, storage_mode: 'demo_fallback' });
      }
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      console.error('Get agent query error:', error);
      return NextResponse.json({ error: 'Failed to fetch agent from database' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    let forkCount = 0;
    try {
      const { count } = await supabase
        .from('agent_forks')
        .select('*', { count: 'exact', head: true })
        .eq('original_agent_id', id);
      forkCount = count || 0;
    } catch {
      // Non-fatal when fork table is not migrated yet.
    }

    return NextResponse.json({ ...data, fork_count: forkCount });
  } catch (err) {
    console.error('Get agent error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { walletAddress?: string };
    const ownerWallet = body.walletAddress || req.headers.get('X-Wallet-Address') || '';

    if (!ownerWallet) {
      return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      const result = deactivateDemoAgent(id, ownerWallet);
      if (!result.ok) {
        if (result.reason === 'not_found') {
          return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Only owner can remove this agent' }, { status: 403 });
      }
      return NextResponse.json({ ok: true, id, mode: 'demo_fallback' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: existing, error: getErr } = await supabase
      .from('agents')
      .select('id, owner_wallet, is_active')
      .eq('id', id)
      .single();

    if (getErr) {
      if (isMissingAgentsTableError(getErr)) {
        const result = deactivateDemoAgent(id, ownerWallet);
        if (!result.ok) {
          if (result.reason === 'not_found') {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
          }
          return NextResponse.json({ error: 'Only owner can remove this agent' }, { status: 403 });
        }
        return NextResponse.json({ ok: true, id, mode: 'demo_fallback' });
      }
      if (getErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      console.error('Delete agent lookup error:', getErr);
      return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (existing.owner_wallet !== ownerWallet) {
      return NextResponse.json({ error: 'Only owner can remove this agent' }, { status: 403 });
    }

    if (!existing.is_active) {
      return NextResponse.json({ ok: true, id, alreadyInactive: true });
    }

    const { error: updateErr } = await supabase
      .from('agents')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_wallet', ownerWallet);

    if (updateErr) {
      console.error('Delete agent update error:', updateErr);
      return NextResponse.json({ error: 'Failed to remove agent' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error('Delete agent error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
