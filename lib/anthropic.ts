import Anthropic from '@anthropic-ai/sdk';

function getApiKey(): string {
  const raw = process.env.ANTHROPIC_API_KEY || '';
  return raw.trim().replace(/^['\"]|['\"]$/g, '');
}

const anthropicClient = new Anthropic({
  apiKey: getApiKey(),
});

export async function runAnthropicAgent(systemPrompt: string, userInput: string): Promise<string> {
  const response = await anthropicClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInput }],
  });
  const block = response.content[0];
  if (block.type === 'text') return block.text;
  return '';
}

export default anthropicClient;
