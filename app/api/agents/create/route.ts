import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import { upsertDemoAgent } from '@/lib/demo-agents';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseWriteKey = supabaseServiceRoleKey || supabaseAnonKey;

function isMissingTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return message.includes("could not find the table 'public.agents'")
    || message.includes("could not find the table 'public.users'")
    || message.includes('relation "public.agents" does not exist')
    || message.includes('relation "public.users" does not exist')
    || error.code === 'PGRST205';
}

function getSupabase() {
  return createClient(supabaseUrl, supabaseWriteKey, {
    auth: { persistSession: false },
  });
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'af_';
  for (let i = 0; i < 40; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      owner_wallet,
      name,
      description,
      tags,
      model,
      system_prompt,
      tools,
      price_xlm,
      visibility,
    } = body;

    if (!owner_wallet || !name || !model || !system_prompt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['openai-gpt4o-mini', 'anthropic-claude-haiku'].includes(model)) {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 });
    }

    if (parseFloat(price_xlm) < 0.01) {
      return NextResponse.json({ error: 'Minimum price is 0.01 XLM' }, { status: 400 });
    }

    const keyMode = supabaseServiceRoleKey ? 'service_role' : 'anon_fallback';

    const agentId = uuidv4();
    const apiKey = generateApiKey();
    const origin = new URL(req.url).origin;
    const apiEndpoint = `${origin}/api/agents/${agentId}/run`;

    const canUseSupabase = Boolean(supabaseUrl && supabaseWriteKey);
    const supabase = canUseSupabase ? getSupabase() : null;

    const ensureUser = async () => {
      if (!supabase) return { message: 'Supabase not configured', code: 'NO_SUPABASE' };

      const upsertRes = await supabase
        .from('users')
        .upsert({ wallet_address: owner_wallet }, { onConflict: 'wallet_address' });

      // Some DBs may miss a unique constraint on wallet_address; fallback to insert.
      if (upsertRes.error?.code === '42P10') {
        const insertRes = await supabase
          .from('users')
          .insert({ wallet_address: owner_wallet });

        if (insertRes.error && insertRes.error.code !== '23505') {
          return insertRes.error;
        }
        return null;
      }

      if (upsertRes.error && upsertRes.error.code !== '23505') {
        return upsertRes.error;
      }

      return null;
    };

    const insertAgent = async () => {
      if (!supabase) return { data: null, error: { message: 'Supabase not configured', code: 'NO_SUPABASE' } };

      return supabase.from('agents').insert({
        id: agentId,
        owner_wallet,
        name,
        description,
        tags: tags || [],
        model,
        system_prompt,
        tools: tools || [],
        price_xlm: parseFloat(price_xlm) || 0.01,
        visibility: visibility || 'public',
        api_endpoint: apiEndpoint,
        api_key: apiKey,
      });
    };

    const userError = await ensureUser();
    if (userError && !isMissingTableError(userError) && userError.code !== 'NO_SUPABASE') {
      console.error('Supabase user upsert error:', userError);
    }

    let { error: agentError } = await insertAgent();

    // Retry once when FK fails due owner row race/order issues.
    if (agentError?.code === '23503') {
      const retryUserError = await ensureUser();
      if (retryUserError) {
        console.error('Supabase user upsert retry error:', retryUserError);
      }
      ({ error: agentError } = await insertAgent());
    }

    if (agentError && (agentError.code === 'NO_SUPABASE' || isMissingTableError(agentError))) {
      upsertDemoAgent({
        id: agentId,
        owner_wallet,
        name,
        description,
        tags: tags || [],
        model,
        system_prompt,
        tools: tools || [],
        price_xlm: parseFloat(price_xlm) || 0.01,
        visibility: visibility || 'public',
        api_endpoint: apiEndpoint,
        api_key: apiKey,
      });

      return NextResponse.json({
        id: agentId,
        api_key: apiKey,
        api_endpoint: apiEndpoint,
        message: 'Agent deployed using fallback storage (Supabase tables not found)',
        storage_mode: 'demo_fallback',
        warning: 'Apply supabase-schema.sql to persist agents in database',
      });
    }

    if (agentError) {
      console.error('Supabase agent insert error:', agentError);
      if (agentError.code === '23503') {
        return NextResponse.json(
          { error: 'Failed to persist deployed agent: owner wallet is not available in users table', key_mode: keyMode },
          { status: 500 }
        );
      }
      if (agentError.code === '42501') {
        return NextResponse.json(
          {
            error: 'Failed to persist deployed agent: database permission denied (check SUPABASE_SERVICE_ROLE_KEY and RLS policies)',
            details: agentError.message,
            key_mode: keyMode,
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        {
          error: 'Failed to persist deployed agent',
          details: agentError.message,
          code: agentError.code,
          key_mode: keyMode,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: agentId,
      api_key: apiKey,
      api_endpoint: apiEndpoint,
      message: 'Agent deployed successfully',
    });
  } catch (err) {
    console.error('Create agent error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
