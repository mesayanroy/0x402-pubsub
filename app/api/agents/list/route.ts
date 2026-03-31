import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listDemoAgents } from '@/lib/demo-agents';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isMissingAgentsTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return message.includes("could not find the table 'public.agents'")
    || message.includes('relation "public.agents" does not exist')
    || error.code === 'PGRST205';
}

function isMissingColumnError(
  error: { message?: string; code?: string } | null | undefined,
  column: string
): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return error.code === '42703' && message.includes(`column agents.${column}`.toLowerCase());
}

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
        storage_mode: 'demo_fallback',
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const buildQuery = (orderColumn?: 'created_at' | 'updated_at') => {
      let query = supabase
        .from('agents')
        .select('*')
        .eq('is_active', true)
        .limit(limit);

      if (owner) {
        // Dashboard owner view: include all agents (public, private, forked)
        query = query.eq('owner_wallet', owner);
      } else {
        // Marketplace view: public + forked agents
        query = query.in('visibility', ['public', 'forked']);
      }

      if (model) query = query.eq('model', model);
      if (tag) query = query.contains('tags', [tag]);
      if (orderColumn) query = query.order(orderColumn, { ascending: false });

      return query;
    };

    let { data, error } = await buildQuery('created_at');

    if (isMissingColumnError(error, 'created_at')) {
      ({ data, error } = await buildQuery('updated_at'));
    }

    if (isMissingColumnError(error, 'updated_at')) {
      ({ data, error } = await buildQuery());
    }

    if (error) {
      if (isMissingAgentsTableError(error)) {
        return NextResponse.json({
          agents: listDemoAgents({ owner: owner || undefined, model: model || undefined, tag: tag || undefined, limit }),
          storage_mode: 'demo_fallback',
          warning: 'Supabase agents table missing. Apply supabase-schema.sql for DB mode.',
        });
      }
      console.error('Supabase list query error:', error);
      return NextResponse.json({ error: 'Failed to fetch agents from database', agents: [] }, { status: 500 });
    }

    return NextResponse.json({ agents: data || [] });
  } catch (err) {
    console.error('List agents error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
