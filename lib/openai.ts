import OpenAI from 'openai';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
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
