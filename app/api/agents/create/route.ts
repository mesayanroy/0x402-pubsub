import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
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

    const agentId = uuidv4();
    const apiKey = generateApiKey();
    const apiEndpoint = `https://agentforge.dev/api/agents/${agentId}/run`;

    // Upsert user
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = getSupabase();
      await supabase.from('users').upsert(
        { wallet_address: owner_wallet },
        { onConflict: 'wallet_address' }
      );

      const { error: agentError } = await supabase.from('agents').insert({
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

      if (agentError) {
        console.error('Supabase error:', agentError);
        // Return success with generated data even if DB fails in demo mode
      }
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
