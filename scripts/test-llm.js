import 'dotenv/config';
const t = Date.now();
const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  body: JSON.stringify({ model: process.env.LLM_MODEL, reasoning_effort: 'none', response_format: { type: 'json_object' }, temperature: 0.8, max_tokens: 300,
    messages: [{ role: 'system', content: 'You are Lord Bobo, a paranoid medieval chancellor. Reply as JSON {"line": string, "expression": string}.' }, { role: 'user', content: 'Bobo, raise the army.' }] }) });
console.log(res.status, Date.now() - t, 'ms');
console.log(JSON.stringify(await res.json(), null, 1).slice(0, 1500));
