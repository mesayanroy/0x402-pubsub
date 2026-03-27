import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listDemoAgents } from '@/lib/demo-agents';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get('owner');
    const model = searchParams.get('model');
    const tag = searchParams.get('tag');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        agents: listDemoAgents({ owner: owner || undefined, model: model || undefined, tag: tag || undefined, limit }),
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let query = supabase
      .from('agents')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (owner) {
      query = query.eq('owner_wallet', owner);
    } else {
      query = query.eq('visibility', 'public');
    }

    if (model) query = query.eq('model', model);
    if (tag) query = query.contains('tags', [tag]);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ agents: data || [] });
  } catch (err) {
    console.error('List agents error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
