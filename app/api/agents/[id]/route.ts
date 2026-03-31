import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDemoAgentById } from '@/lib/demo-agents';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
