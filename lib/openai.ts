import OpenAI from 'openai';

function getApiKey(): string {
  const raw = process.env.OPENAI_API_KEY || '';
  return raw.trim().replace(/^['\"]|['\"]$/g, '');
}

const openaiClient = new OpenAI({
  apiKey: getApiKey(),
});

export async function runOpenAIAgent(systemPrompt: string, userInput: string): Promise<string> {
  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
    ],
    max_tokens: 1000,
  });
  return response.choices[0].message.content || '';
}

export default openaiClient;
