// One tiny OpenAI-compatible client with a provider switch (groq | openrouter | openai-compatible).
const PROVIDERS = {
  groq: () => ({ base: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY }),
  openrouter: () => ({ base: 'https://openrouter.ai/api/v1', key: process.env.OPENROUTER_API_KEY }),
  'openai-compatible': () => ({ base: process.env.OPENAI_COMPATIBLE_BASE_URL, key: process.env.OPENAI_COMPATIBLE_API_KEY }),
};

export const llmInfo = () => ({ provider: process.env.LLM_PROVIDER || 'groq', model: process.env.LLM_MODEL || 'qwen/qwen3.8-27b' });

/** Best effort: turn almost-JSON (or plain prose) from the model into an object with at least a `line`. */
export function salvageJSON(text) {
  text = String(text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  const m = text.match(/"line"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { return { line: JSON.parse(`"${m[1]}"`) }; } catch { return { line: m[1] }; } }
  // the model forgot the JSON and just spoke: that is still a usable line
  if (a < 0 && text.length < 400) return { line: text };
  return null;
}

export async function chatJSON(messages, { temperature = 0.85, max_tokens = 450 } = {}) {
  const { provider, model } = llmInfo();
  const { base, key } = (PROVIDERS[provider] || PROVIDERS.groq)();
  const body = { model, messages, temperature, max_tokens, response_format: { type: 'json_object' } };
  if (provider === 'groq' && /qwen3/i.test(model)) body.reasoning_effort = 'none';
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      last = new Error(`LLM ${res.status}: ${t.slice(0, 300)}`);
      // Groq rejects replies that are not valid JSON ("json_validate_failed") but hands back what the model wrote
      if (res.status === 400 && /json_validate_failed|failed_generation/.test(t)) {
        let gen = null;
        try { gen = JSON.parse(t).error.failed_generation; } catch {}
        const got = salvageJSON(gen);
        if (got && got.line) return got;
        body.temperature = Math.max(0.3, body.temperature - 0.25);
        continue;
      }
      if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
      throw last;
    }
    const data = await res.json();
    const got = salvageJSON(data.choices?.[0]?.message?.content || '');
    if (got) return got;
    last = new Error('LLM returned no usable JSON');
    body.temperature = Math.max(0.3, body.temperature - 0.25);
  }
  throw last || new Error('LLM failed');
}
