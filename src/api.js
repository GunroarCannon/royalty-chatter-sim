// Thin fetch wrappers for the game server.
async function req(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || res.statusText); err.status = res.status; err.data = data; throw err; }
  return data;
}

export const playerId = (() => {
  let id = null;
  try { id = localStorage.getItem('rb-pid'); } catch {}
  if (!id) {
    id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem('rb-pid', id); } catch {}
  }
  return id;
})();

export const api = {
  health: () => req('/api/health'),
  profile: () => req(`/api/profile/${playerId}`),
  deleteSave: slot => req('/api/save/delete', { pid: playerId, slot }),
  save: (state, campaignSummary) => req('/api/save', { pid: playerId, state, campaignSummary }),
  remember: entries => req('/api/memory', { pid: playerId, entries }),
  rumours: q => req('/api/rumours' + (q ? '?q=' + encodeURIComponent(q) : '')),
  audienceStart: (ctx, fate, reason, world) => req('/api/audience/start', Object.assign({ pid: playerId, ctx, fate, reason }, world || {})),
  audienceSay: (id, message) => req('/api/audience/say', { pid: playerId, id, message }),
  audienceEnd: id => req('/api/audience/end', { pid: playerId, id }),
  worlds: () => req(`/api/worlds?pid=${playerId}`),
  createWorld: o => req('/api/worlds', Object.assign({ pid: playerId }, o)),
  worldPublic: id => req(`/api/worlds/${id}/public`),
  joinWorld: (id, realm, name) => req(`/api/worlds/${id}/join`, { pid: playerId, realm, name }),
  leaveWorld: id => req(`/api/worlds/${id}/leave`, { pid: playerId }),
  worldView: (id, v) => req(`/api/worlds/${id}/view?pid=${playerId}${v ? '&v=' + v : ''}`),
  worldAct: (id, action, args) => req(`/api/worlds/${id}/act`, { pid: playerId, action, args }),
  chatStart: (worldId, charId) => req(`/api/worlds/${worldId}/chat`, { pid: playerId, charId }),
  chatGet: (id, since) => req(`/api/chat/${id}?pid=${playerId}&since=${since || 0}`),
  chatSay: (id, text) => req(`/api/chat/${id}/say`, { pid: playerId, text }),
  chatEnd: id => req(`/api/chat/${id}/end`, { pid: playerId }),
  recap: o => req('/api/recap', Object.assign({ pid: playerId }, o)),
  advisor: (question, facts, history) => req('/api/advisor', { pid: playerId, question, facts, history }),
};
