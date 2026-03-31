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
    || message.includes('relation "public.agents" does not exist')
    || error.code === 'PGRST205'
    || error.code === '42P01';
}

function getMissingColumnName(error: { message?: string } | null | undefined): string | null {
  if (!error?.message) return null;
  const match = error.message.match(/Could not find the '([^']+)' column of 'agents'/i);
  return match?.[1] ?? null;
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

    if (!canUseSupabase) {
      // Supabase not configured – use local demo store
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
        message: 'Agent deployed (local demo mode – configure Supabase env vars to persist)',
        storage_mode: 'demo_fallback',
      });
    }

    const supabase = getSupabase();

    // Also upsert wallet into users table (best-effort; failures are non-fatal
    // because agents table no longer has an FK to users).
    try {
      await supabase
        .from('users')
        .upsert({ wallet_address: owner_wallet }, { onConflict: 'wallet_address' });
    } catch (err) {
      // Non-fatal: users table may not exist yet
      console.debug('[create] User upsert skipped:', err);
    }

    const baseInsertPayload: Record<string, unknown> = {
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
    };

    // Some environments may still run an older agents table. Retry by dropping
    // unknown columns reported by PostgREST schema cache errors.
    const insertPayload = { ...baseInsertPayload };
    let agentError: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from('agents').insert(insertPayload);
      if (!error) {
        agentError = null;
        break;
      }

      const missingColumn = getMissingColumnName(error);
      if (error.code === 'PGRST204' && missingColumn && missingColumn in insertPayload) {
        delete insertPayload[missingColumn];
        continue;
      }

      agentError = error;
      break;
    }

    if (agentError) {
      if (isMissingTableError(agentError)) {
        // Tables not yet created – fall back to local demo store and inform caller
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
          message: 'Agent deployed (demo fallback – run supabase-schema.sql in your Supabase SQL editor to persist agents)',
          storage_mode: 'demo_fallback',
          warning: 'Apply supabase-schema.sql to persist agents in database',
        });
      }

      console.error('Supabase agent insert error:', agentError);

      if (agentError.code === '42501') {
        return NextResponse.json(
          {
            error: 'Database permission denied – check SUPABASE_SERVICE_ROLE_KEY and that RLS is disabled on the agents table',
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
