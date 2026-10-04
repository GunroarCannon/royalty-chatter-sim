// One tiny OpenAI-compatible client with a provider switch (groq | openrouter | openai-compatible).
const PROVIDERS = {
  groq: () => ({ base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY }),
  openrouter: () => ({ base: 'https://openrouter.ai/api/v1', key: process.env.OPENROUTER_API_KEY }),
  'openai-compatible': () => ({ base: process.env.OPENAI_COMPATIBLE_BASE_URL, key: process.env.OPENAI_COMPATIBLE_API_KEY }),
};

export const llmInfo = () => ({ provider: process.env.LLM_PROVIDER || 'groq', model: process.env.LLM_MODEL || 'qwen/qwen3.8-27b' });

export async function chatJSON(messages, { temperature = 0.85, max_tokens = 450 } = {}) {
  const { provider, model } = llmInfo();
  const { base, key } = (PROVIDERS[provider] || PROVIDERS.groq)();
  const body = { model, messages, temperature, max_tokens, response_format: { type: 'json_object' } };
  if (provider === 'groq' && /qwen3/i.test(model)) body.reasoning_effort = 'none';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) { await new Promise(r => setTimeout(r, 800)); continue; }
      throw new Error(`LLM ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); }
    catch { if (attempt === 0) continue; return { line: text.slice(0, 300) }; }
  }
}
