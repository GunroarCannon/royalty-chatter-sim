// Game controller: owns the state, the map view, the HUD and the character panel; runs turns and
// flushes the memory outbox to the server (→ Walrus).
import {
  createWorld, player, playerRealm, provincesOf, fullName, roleLabel, opinionOf, ageOf, TRAITS, council, income, maxLevies,
  atWar, allied, neighborsOfRealm, dateStr, SEASONS, COUNCIL, livingCourt, applyProvNames,
} from '../shared/world.js';
import { PRESETS } from '../shared/cultures.js';
import { generateMap } from '../shared/mapgen.js';
import { endSeason, reputation } from '../shared/sim.js';
import { canTalk, ACTIONS, marriageablesOfMine, marriageBlock, marriageChance } from '../shared/actions.js';
import { resolveEvent } from '../shared/events.js';
import { MapView } from './map/MapView.js';
import { stillURL, moodExpr } from './portraits.js';
import { api, playerId } from './api.js';
import { h, $, esc, toast, opinionBadge, tipHTML, floatDelta, setLinkifier } from './ui/dom.js';
import { draggable, resetPositions } from './ui/drag.js';
import { confirmBox, chooseBox } from './ui/dialog.js';
import { linkify, relationOf } from './ui/links.js';
import { openWar, warBar, warsOf, scoreFor } from './ui/war.js';
import { openAdvisor } from './ui/advisor.js';
import { showEvent } from './ui/eventModal.js';
import { openAudience } from './ui/audience.js';
import { openChronicle } from './ui/chronicle.js';
import { installSketch } from './ui/sketch.js';
import { armsEl } from './ui/heraldry.js';
import { openSetup } from './ui/setup.js';
import { runTutorial } from './ui/tutorial.js';
import { applyOptions, openOptions, getOpt, setOpt } from './ui/options.js';
import { openLobby, pickRealm } from './ui/lobby.js';

const CROWN_SVG = '<svg class="crown" viewBox="0 0 70 44"><g fill="#d4ac34" stroke="#2a1d10" stroke-width="2" stroke-linejoin="round" filter="url(#rough2)"><path d="M6 38 L4 10 L20 24 L35 4 L50 24 L66 10 L64 38 Z"/><path d="M6 38 H64 V43 H6Z" fill="#a8302a"/></g><g fill="#f1e8d0" stroke="#2a1d10" stroke-width="1.4"><circle cx="4" cy="9" r="3"/><circle cx="35" cy="4" r="3.4"/><circle cx="66" cy="9" r="3"/></g></svg>';

export class Game {
  constructor() {
    this.state = null; this.map = null; this.view = null; this.selected = null; this.busy = false; this.modal = false;
    this.mp = null; // { id, v, meta, skew } when playing in a shared world
  }

  // ------------------------------------------------------------ boot & campaigns
  async boot() {
    installSketch();
    applyOptions();
    document.body.append(h('div#vignette'));
    this.backdrop();
    let profile = null, health = null;
    try { [profile, health] = await Promise.all([api.profile(), api.health()]); } catch (e) { console.warn(e); }
    this.profile = profile || { campaigns: [] };
    // a copy of the solo save lives in the browser too, in case the server's disk was wiped
    try { const local = JSON.parse(localStorage.getItem('rb-save') || 'null'); if (local && (!this.profile.save || (local.turn > (this.profile.save.turn || 0) && local.seed === this.profile.save.seed) || local.seed !== this.profile.save.seed && !this.profile.save)) this.profile.save = local; } catch {}
    this.health = health;
    this.titleScreen();
  }

  /** A drifting map of some random world behind the title screen. */
  backdrop() {
    const ids = Object.keys(PRESETS);
    const preset = ids[Math.floor(Math.random() * ids.length)];
    const seed = 'title' + Math.floor(Math.random() * 1e6);
    const { state, map } = createWorld(seed, { preset });
    state.playerRealm = -1;
    this.titleWorld = { state, map };
    this.map = map;
    if (!this.view) this.view = new MapView($('#map'), map, () => (this.state || (this.titleWorld && this.titleWorld.state)), {
      onClick: p => this.state && this.clickProvince(p),
      onHover: (p, e) => this.state && this.hoverProvince(p, e),
      onHoverMove: e => this.moveHover(e),
    });
    else this.view.setMap(map);
    this.view.view.z = this.view.minZ * 1.5;
    this.view.startDrift();
  }

  toTitle() {
    this.save();
    this.leaveMp();
    this.state = null; this.selected = null;
    $('#hud').innerHTML = '';
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    this.backdrop();
    this.titleScreen();
  }

  titleScreen() {
    const save = this.profile.save;
    const past = (this.profile.campaigns || []).slice(-4).reverse();
    const mem = this.health && this.health.memory && this.health.memory.enabled;
    const back = h('div.modal-back.clear', null, h('div.panel.title-screen', null,
      ['tl', 'tr', 'bl', 'br'].map(c => h('i.corner.' + c)),
      h('h1', { html: CROWN_SVG + 'Royal Banter' }),
      h('div.tag', null, 'Make promises. Break them. See who remembers.'),
      h('hr.orn'),
      h('p', null, 'Every character remembers what you say.', mem ? null : h('span.muted', null, ' (Memory is offline right now.)')),
      h('div.stack', null,
        save && !save.gameOver ? h('button.btn.dark', { onclick: () => { back.remove(); this.load(save); } }, `Continue: ${save.dynasty ? 'House ' + save.dynasty : 'your reign'}, ${SEASONS[save.season]} ${save.year}`) : null,
        h('button.btn' + (save && !save.gameOver ? '' : '.dark'), { onclick: () => { back.remove(); this.newCampaign(() => this.titleScreen()); } }, save ? '📜 Begin a new campaign' : '👑 Begin your reign'),
        h('button.btn', { onclick: () => { back.remove(); openLobby(this, () => this.titleScreen()); } }, '🌍 Shared worlds (multiplayer)'),
        h('button.btn', { onclick: () => openOptions(this) }, '⚙ Options'),
      ),
    ));
    document.body.append(back);
  }

  newCampaign(onCancel) {
    const prev = this.profile.save;
    openSetup(this, { prev, onCancel, onStart: ({ state, map }) => this.beginCampaign(state, map, prev) });
  }

  beginCampaign(state, map, prev) {
    const campaign = state.campaign;
    if (campaign > 1 && prev && prev.seed === state.seed) {
      state.reigns[0].note = 'restoration';
      state.outbox.push({ scope: 'dyn', text: `[${dateStr(state)}, campaign ${campaign}] [campaign] A new chapter: ${prev ? 'a generation after the fall of the previous ruler, ' : ''}${fullName(state, player(state))} of House ${state.dynasty} now rules ${playerRealm(state).name}. Old families still tell stories of earlier rulers.` });
    }
    this.map = map;
    this.start(state);
    this.save();
  }

  // ------------------------------------------------------------ shared worlds
  async enterWorld(id) {
    let r;
    try { r = await api.worldView(id); } catch (e) { toast(e.message, '✖'); return this.titleScreen(); }
    document.querySelectorAll('.modal-back').forEach(e => e.remove());
    this.mp = { id, v: r.meta.version, meta: r.meta, skew: Date.now() - r.meta.now, inbox: +(localStorage.getItem('rb-inbox-' + id) || 0) };
    this.map = this.map && this.map.seed === r.state.seed ? this.map : generateMap(r.state.seed);
    applyProvNames(this.map, r.state);
    this.start(r.state);
    this.toastInbox();
    clearInterval(this.poll);
    this.poll = setInterval(() => this.sync(), 2500);
    clearInterval(this.clock);
    this.clock = setInterval(() => this.renderClock(), 1000);
  }
  leaveMp() { clearInterval(this.poll); clearInterval(this.clock); this.mp = null; this.pending = null; }

  async sync() {
    if (!this.mp || this.syncing) return;
    this.syncing = true;
    try {
      const r = await api.worldView(this.mp.id, this.mp.v);
      if (r.same) { this.mp.meta = r.meta; this.renderClock(); }
      else if (this.modal || this.busy) this.pending = r; // apply once the open window closes
      else this.applyView(r);
    } catch (e) { if (e.status === 403) { toast(e.message, '✖'); this.toTitle(); } }
    finally { this.syncing = false; }
  }
  applyView(r) {
    if (!this.mp || !r || !r.state) return;
    const prevOwner = this.state && this.state.owner.join(',');
    const before = this.state && this.state.turn !== r.state.turn ? this.snapshot() : null;
    this.mp.v = r.meta.version; this.mp.meta = r.meta; this.mp.skew = Date.now() - r.meta.now;
    const flags = this.state ? this.state.flags : {};
    this.state = r.state;
    this.state.flags = Object.assign(r.state.flags || {}, { mapDirty: false });
    if (prevOwner !== this.state.owner.join(',') || flags.mapDirty) this.view.invalidate();
    this.pending = null;
    this.refresh();
    if (before) this.ledger(before, this.snapshot());
    this.toastInbox();
    if (this.state.gameOver) return this.gameOver();
    this.processQueue();
  }
  toastInbox() {
    const s = this.state, mp = this.mp;
    if (!mp || !s.inbox) return;
    for (const n of s.inbox) if (n.id > mp.inbox) { toast(n.text, n.icon); mp.inbox = n.id; }
    try { localStorage.setItem('rb-inbox-' + mp.id, mp.inbox); } catch {}
  }
  applyPending() { if (this.pending && !this.modal) this.applyView(this.pending); }

  /** Do something to the world. Single player: run the rule locally. Shared world: ask the server. */
  async action(name, ...args) {
    if (!this.mp) {
      const res = ACTIONS[name](this.state, this.map, ...args);
      this.act(res);
      return res;
    }
    try {
      const r = await api.worldAct(this.mp.id, name, args);
      const wasModal = this.modal;
      this.modal = false;
      this.applyView(r);
      this.modal = wasModal;
      if (name !== 'resolve' && name !== 'audience') this.act(r.res);
      return r.res;
    } catch (e) { toast(e.message, '✖'); return { ok: false, msg: e.message }; }
  }
  async resolveEvent(item, key) {
    if (!this.mp) return resolveEvent(this.state, this.map, item, key);
    const res = await this.action('resolve', item.uid, key);
    return (res && res.msg) || '';
  }

  load(state) {
    if (!this.map || this.map.seed !== state.seed) this.map = generateMap(state.seed);
    applyProvNames(this.map, state);
    this.start(state);
  }

  start(state) {
    this.state = state;
    state.flags = state.flags || {};
    this.snap = null; this.opSeen = {};
    setLinkifier((text, ids) => this.link(text, ids));
    document.getElementById('advisor')?.remove();
    if (!this.view) {
      this.view = new MapView($('#map'), this.map, () => this.state, {
        onClick: p => this.clickProvince(p),
        onHover: (p, e) => this.hoverProvince(p, e),
        onHoverMove: e => this.moveHover(e),
      });
    } else { this.view.stopDrift(); this.view.setMap(this.map); }
    this.titleWorld = null;
    const cap = this.map.provinces[playerRealm(state).capital].center;
    this.view.centerOn(cap[0], cap[1], this.view.minZ * 1.35);
    this.buildHUD();
    this.refresh();
    this.flush();
    setTimeout(() => this.processQueue(), 300);
    if (state.turn === 0) setTimeout(() => this.welcome(), 400);
    if (!getOpt('tutorialDone')) setTimeout(() => this.tutorial(), 900);
  }

  welcome() {
    const s = this.state, pl = player(s);
    if (getOpt('tutorialDone')) toast(`You are ${fullName(s, pl)}, ruler of ${playerRealm(s).name}. Click characters to talk. Each season you gain one audience 🔔.`, '👑', 8000);
  }

  tutorial() {
    if (this.tut || !this.state) return;
    const s = this.state, pl = player(s), pr = playerRealm(s);
    const cn = council(s);
    const adviser = cn.chancellor || cn.steward || Object.values(cn)[0];
    const nb = neighborsOfRealm(s, this.map, s.playerRealm)[0];
    const nbRealm = nb != null ? s.realms[nb] : null;
    const mapPoint = () => {
      if (!nbRealm) return null;
      const [x, y] = this.map.provinces[nbRealm.capital].center;
      const [sx, sy] = this.view.toScreen(x, y);
      return { left: sx - 26, top: sy - 26, width: 52, height: 52 };
    };
    const steps = [
      { title: `Hail, ${fullName(s, pl)}!`, text: `You rule ${pr.name}. A quick tour?` },
      { title: 'This is you', text: 'Your ruler. Click for family, realm and promises.', target: () => $('#ruler-badge') },
      { title: 'The treasury', text: 'Gold, soldiers, prestige, reputation. Hover for details.', target: () => $('#topbar') },
      { title: 'The world', text: nbRealm ? `Your neighbour, ${nbRealm.name}. Click a realm to meet its ruler.` : 'Click a realm to meet its ruler.',
        before: () => { this.closePanel(); if (nbRealm) { const c = this.map.provinces[nbRealm.capital].center; const m = this.map.provinces[pr.capital].center; this.view.centerOn((c[0] + m[0]) / 2, (c[1] + m[1]) / 2); } }, target: mapPoint, pad: 4 },
      { title: 'Your court', text: 'Your council. Each has opinions of you.', before: () => this.selectChar(pl.id, null, 'court'), target: () => $('#charpanel') },
      adviser ? { title: 'Talk to anyone', text: `Talk to ${adviser.name}. They will remember it, for years.`, before: () => this.selectChar(adviser.id), target: () => $('#charpanel .actions .btn.dark') || $('#charpanel') } : null,
      { title: 'Audience bells', text: 'Each talk costs a 🔔. You get one per season.', target: () => $('#endturn .seals'), before: () => this.closePanel() },
      { title: 'Promises', text: 'Promises you make get deadlines. They will collect.', target: () => $('#menu') },
      { title: this.mp ? 'The season clock' : 'End the season', text: this.mp ? 'Seasons turn by themselves for everyone. Watch the ring run down.' : 'Time passes. Events, wars, births and deaths happen.', target: () => $('.end-btn') },
      { title: 'Options', text: 'Settings, and this tour again. Good luck!', target: () => $('#menu .opt-btn') },
    ].filter(Boolean);
    this.tut = runTutorial(steps, { onDone: () => { this.tut = null; setOpt('tutorialDone', true); this.closePanel(); const c = this.map.provinces[pr.capital].center; this.view.centerOn(c[0], c[1]); } });
  }

  // ------------------------------------------------------------ persistence & memory
  async flush() {
    const s = this.state;
    if (!s || !s.outbox.length || this.mp) return;
    const entries = s.outbox.splice(0);
    try { await api.remember(entries); } catch (e) { console.warn('memory flush failed', e); s.outbox.unshift(...entries); }
  }
  async save() {
    const s = this.state;
    if (!s || this.mp) return;
    const r = s.reigns[0], last = s.reigns[s.reigns.length - 1];
    const summary = { campaign: s.campaign, dynasty: s.dynasty, realm: playerRealm(s).name, from: r.from, to: s.year, rep: last.rep || reputation(s.stats), rulers: s.reigns.map(x => x.name) };
    try { localStorage.setItem('rb-save', JSON.stringify(s)); } catch {}
    try { await api.save(s, summary); } catch (e) { console.warn('save failed', e); }
    this.profile.save = s;
  }

  // ------------------------------------------------------------ turns
  async endTurn() {
    if (this.mp) {
      if (this.state.queue.length && !this.modal) return this.processQueue();
      return this.hurrySeason();
    }
    if (this.busy || this.modal || this.state.queue.length) { if (this.state.queue.length) this.processQueue(); return; }
    this.busy = true;
    $('.end-btn').disabled = true;
    const before = this.snapshot();
    try {
      endSeason(this.state, this.map);
      this.ledger(before, this.snapshot());
      for (const t of this.state.flags.lastTurnEvents || []) toast(t.text, t.icon);
      if (this.state.flags.mapDirty) this.view.invalidate();
      this.refresh();
      this.flush();
      this.save();
      if (this.state.gameOver) return this.gameOver();
      this.processQueue();
    } finally { this.busy = false; $('.end-btn').disabled = false; }
  }

  processQueue() {
    const s = this.state;
    if (this.modal || !s.queue.length) return;
    this.modal = true;
    showEvent(this, s.queue[0], () => {
      this.modal = false;
      const st = this.state;
      if (st.flags.mapDirty) this.view.invalidate();
      if (this.pending) return this.applyView(this.pending);
      this.refresh(); this.flush();
      if (st.gameOver) return this.gameOver();
      if (st.queue.length) setTimeout(() => this.processQueue(), 200);
      else this.save();
    });
  }

  talk(charId, { free = false, reason = '', onClose } = {}) {
    const s = this.state, c = s.chars[charId];
    if (!canTalk(s, c)) { toast('They cannot speak with you.', '🤐'); return; }
    if (!free && s.audiences <= 0) { toast('No audience bells left. End the season to get another 🔔.', '🔔'); this.nudgeEnd(); return; }
    if (!free && !this.mp) { s.audiences--; floatDelta($('#endturn .seals'), '−1 🔔', 'neg', { below: true }); }
    const wasModal = this.modal;
    this.modal = true;
    this.refresh();
    openAudience(this, c, { reason, free, onClose: () => {
      this.modal = wasModal;
      if (this.mp) { this.sync(); onClose && onClose(); return; }
      this.refresh(); this.flush(); this.save();
      if (this.view && s.flags.mapDirty) this.view.invalidate();
      onClose && onClose();
      if (!wasModal) this.processQueue();
    } });
  }

  gameOver() {
    const s = this.state;
    if (document.querySelector('.gameover')) return;
    const back = h('div.modal-back.gameover', null, h('div.panel.title-screen', null,
      h('h1', null, s.gameOver.reason === 'conquered' ? 'Conquered!' : 'The End'),
      h('p', null, s.gameOver.reason === 'conquered' ? `${playerRealm(s).name} has fallen. House ${s.dynasty} is driven into exile.` : `The tale of House ${s.dynasty} closes here.`),
      h('p.muted', null, 'But the world remembers. Start a new campaign and the great houses will still tell stories of what your dynasty did.'),
      h('div.row', { style: { justifyContent: 'center', gap: '10px' } },
        h('button.btn', { onclick: () => openChronicle(this) }, 'Read the Chronicle'),
        this.mp ? h('button.btn.dark', { onclick: () => { back.remove(); const id = this.mp.id; this.leaveMp(); pickRealm(this, id, () => this.toTitle()); } }, 'Claim another realm')
          : h('button.btn.dark', { onclick: () => { back.remove(); this.profile.save = s; this.newCampaign(); } }, 'Begin a new campaign')),
    ));
    document.body.append(back);
  }

  // ------------------------------------------------------------ map interaction
  clickProvince(p) {
    if (p < 0) { this.closePanel(); return; }
    const r = this.state.realms[this.state.owner[p]];
    this.selectChar(r.ruler, p);
  }
  hoverProvince(p, e) {
    const el = $('#hoverinfo');
    if (p < 0) { el.style.display = 'none'; return; }
    const s = this.state, prov = this.map.provinces[p], r = s.realms[s.owner[p]], ruler = s.chars[r.ruler];
    const op = r.id === s.playerRealm ? null : opinionOf(s, ruler).total;
    el.innerHTML = '';
    el.append(h('div.panel.hover-card', null, armsEl(r),
      h('b', null, prov.name), h('span.muted', null, ` · ${prov.terrain}`), h('br'),
      `${r.kind} of ${r.name}`, h('br'),
      h('span', null, fullName(s, ruler)), op != null ? h('span', null, ' ', opinionBadge(op)) : h('span.muted', null, ' (you)'),
      r.id === s.playerRealm ? h('div', { style: { color: 'var(--gold-2)', fontFamily: 'var(--hand)' } }, '♛ Your land') : null,
      atWar(s, r.id, s.playerRealm) ? h('div', { style: { color: 'var(--red)' } }, '⚔ At war with you') : allied(s, r.id, s.playerRealm) ? h('div', { style: { color: 'var(--green)' } }, '🤝 Your ally') : null,
    ));
    el.style.display = 'block';
    this.moveHover(e);
  }
  moveHover(e) {
    const el = $('#hoverinfo');
    if (!e || el.style.display !== 'block') return;
    el.style.left = (e.clientX + 18) + 'px'; el.style.top = (e.clientY + 18) + 'px';
  }

  // ------------------------------------------------------------ HUD
  buildHUD() {
    const hud = $('#hud');
    hud.innerHTML = '';
    hud.append(
      h('div#ruler-badge.panel', { onclick: () => this.selectChar(player(this.state).id), 'data-tip': tipHTML('Your ruler', 'Family, realm, wars and promises. Drag to move.') }),
      h('div#topbar.panel'),
      h('div#alerts'),
      h('div#endturn.panel', null,
        h('div.et-top', null,
          h('button.round-btn', { onclick: () => openAdvisor(this), 'data-tip': tipHTML('Ask your advisor', '"Who should I attack?" "Find me a match." Click a suggestion to go there.') }, '?'),
          h('button.round-btn', { onclick: () => this.goHome(), 'data-tip': tipHTML('Go home', 'Fly the map back to your lands.') }, '⌂')),
        h('div', null, h('div.date.sc', { 'data-tip': tipHTML('The date', 'Each season is one turn.') }), h('div.seals', { 'data-tip': tipHTML('Audience bells', 'Talking to someone costs one 🔔.<br>You get one more each season (up to 3).<br>When an event offers a talk, it is free.') })),
        h('button.end-btn', { onclick: () => this.endTurn() }, 'End', h('br'), 'Season')),
      h('div#menu.panel', null,
        h('button.btn.small', { onclick: () => this.selectChar(player(this.state).id, null, 'court'), 'data-tip': tipHTML('Your court', 'Council and courtiers, and how they feel about you.') }, '👥', h('span.mlbl', null, ' Court')),
        h('button.btn.small', { onclick: () => openChronicle(this, 'chronicle'), 'data-tip': tipHTML('The chronicle', 'Everything that has happened in your reign.') }, '📖', h('span.mlbl', null, ' Chronicle')),
        h('button.btn.small', { onclick: () => openChronicle(this, 'promises'), 'data-tip': tipHTML('Promises', 'What you swore, to whom, and when it is due.') }, '🤞', h('span.mlbl', null, ' Promises')),
        h('button.btn.small', { onclick: () => openChronicle(this, 'tales'), 'data-tip': tipHTML('Tales from afar', 'Stories other players\' dynasties left in the world (Walrus Memory).') }, '🦭', h('span.mlbl', null, ' Tales')),
        h('button.btn.small.opt-btn', { onclick: () => openOptions(this), 'data-tip': tipHTML('Options', 'Settings, the tutorial again, the title screen.') }, '⚙'),
      ),
      h('div#charpanel.panel'),
      this.mp ? h('div#players.panel') : null,
    );
    draggable($('#ruler-badge'), { key: 'badge' });
    draggable($('#topbar'), { key: 'topbar' });
    draggable($('#endturn'), { key: 'endturn' });
    draggable($('#menu'), { key: 'menu' });
    draggable($('#charpanel'), { handle: '.titlebar', key: 'charpanel' });
    if (this.mp) draggable($('#players'), { key: 'players' });
  }

  // ------------------------------------------------------------ getting around
  goHome() {
    const s = this.state, pr = playerRealm(s);
    const c = this.map.provinces[pr.capital].center;
    this.view.centerOn(c[0], c[1], Math.max(this.view.view.z, this.view.minZ * 1.35));
    this.view.flash(provincesOf(s, pr.id), '#f3d77a', 2200);
  }
  goToRealm(id) {
    const r = this.state.realms[id];
    if (!r) return;
    const c = this.map.provinces[r.capital].center;
    this.view.centerOn(c[0], c[1], Math.max(this.view.view.z, this.view.minZ * 1.35));
    this.view.flash(provincesOf(this.state, id), r.id === this.state.playerRealm ? '#f3d77a' : '#fff0c0', 2200);
  }
  goToProvince(p) {
    const c = this.map.provinces[p].center;
    this.view.centerOn(c[0], c[1], Math.max(this.view.view.z, this.view.minZ * 1.8));
    this.view.flash([p], '#e05a3a', 2600);
  }
  link(text, ids) { return linkify(this, String(text), ids); }

  // ------------------------------------------------------------ seeing what changed
  snapshot() {
    const s = this.state, pr = playerRealm(s);
    return { turn: s.turn, date: dateStr(s), gold: s.gold, levies: pr.levies, prestige: s.prestige, bells: s.audiences, provs: provincesOf(s, pr.id).length, owner: s.owner.slice(), realm: s.playerRealm, wars: warsOf(s).length, queue: s.queue.length };
  }
  /** Float "+40" over whatever changed since the last refresh, and flash land that changed hands. */
  showDeltas() {
    const s = this.state, now = this.snapshot(), was = this.snap;
    this.snap = now;
    if (!was || was.realm !== now.realm) return;
    const fl = (sel, d, suffix = '', opt) => { if (d) floatDelta($(sel), (d > 0 ? '+' : '−') + Math.abs(d) + suffix, d > 0 ? 'pos' : 'neg', opt); };
    fl('#res-gold', now.gold - was.gold, '', { below: true });
    fl('#res-levies', now.levies - was.levies, '', { below: true });
    fl('#res-prestige', now.prestige - was.prestige, '', { below: true });
    if (now.bells > was.bells) fl('#endturn .seals', now.bells - was.bells, ' 🔔', { below: true });
    if (now.provs !== was.provs) fl('#ruler-badge', now.provs - was.provs, now.provs - was.provs === 1 || now.provs - was.provs === -1 ? ' province' : ' provinces', { below: true });
    const won = [], lost = [];
    for (let p = 0; p < now.owner.length; p++) if (now.owner[p] !== was.owner[p]) { if (now.owner[p] === now.realm) won.push(p); else if (was.owner[p] === now.realm) lost.push(p); }
    if (won.length) { this.view.flash(won, '#f3d77a', 5000); toast(`You now hold ${won.map(p => this.map.provinces[p].name).join(', ')}!`, '👑'); }
    if (lost.length) { this.view.flash(lost, '#c0392b', 5000); toast(`You lost ${lost.map(p => this.map.provinces[p].name).join(', ')}.`, '🏳'); }
  }
  /** A little ledger card by the End Season button: what the season brought. */
  ledger(a, b) {
    document.querySelectorAll('.ledger').forEach(e => e.remove());
    const row = (ic, label, d, tip) => d ? h('div.lg-row', { 'data-tip': tip || null }, h('span.lg-ic', null, ic), h('span.lg-l', null, label), h('span.lg-v.' + (d > 0 ? 'pos' : 'neg'), null, (d > 0 ? '+' : '−') + Math.abs(d))) : null;
    const rows = [
      row('💰', 'Gold', b.gold - a.gold, 'Income from your provinces, minus upkeep'),
      row('⚔', 'Soldiers', b.levies - a.levies, 'Levies refill a little each season'),
      row('⚜', 'Prestige', b.prestige - a.prestige),
      row('🔔', 'Audience bells', b.bells - a.bells, 'One more talk this season'),
      row('🏰', 'Provinces', b.provs - a.provs),
    ].filter(Boolean);
    const news = b.queue ? h('div.lg-news', null, `${b.queue} matter${b.queue > 1 ? 's' : ''} for your attention`) : h('div.lg-news.muted', null, 'A quiet season.');
    const card = h('div.panel.ledger', { onclick: () => card.remove(), 'data-tip': 'Click to dismiss' }, h('div.lg-date', null, b.date), rows, news);
    document.body.append(card);
    const et = $('#endturn').getBoundingClientRect();
    card.style.left = Math.max(8, Math.min(innerWidth - 230, et.left + et.width / 2 - 110)) + 'px';
    card.style.top = Math.max(8, et.top - card.getBoundingClientRect().height - 34) + 'px';
    setTimeout(() => card.classList.add('out'), 6500);
    setTimeout(() => card.remove(), 7200);
  }
  nudgeEnd() { const b = $('.end-btn'); if (!b) return; b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); }

  // shared worlds run on a real-time clock: the season turns by itself, nobody waits for anybody
  async hurrySeason() {
    const m = this.mp.meta;
    if (!m.canForce) return toast('The season turns by itself when the sand runs out.', '⏳');
    const alone = m.players.filter(p => p.online).length <= 1;
    if (alone || await confirmBox({ title: 'Turn the season now?', icon: '🔔', text: 'Everyone moves on at once. Use it when the world feels slow.', ok: 'Ring the bell', cancel: 'Wait' })) await this.action('force');
  }

  renderClock() {
    if (!this.mp || !$('#endturn')) return;
    const m = this.mp.meta;
    const ms = Math.max(0, m.nextTick + this.mp.skew - Date.now()), left = Math.round(ms / 1000);
    const btn = $('.end-btn');
    btn.innerHTML = '';
    btn.append(h('span.clock-sand', { style: { '--p': Math.min(1, ms / (m.seasonSecs * 1000)) } }), 'Next season', h('small', null, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}${m.canForce ? ' · click to hurry' : ''}`));
    btn.classList.toggle('soon', left <= 10);
    btn.classList.remove('on');
    btn.setAttribute('data-tip', tipHTML('Seasons turn by themselves', `Every ${m.seasonSecs < 60 ? m.seasonSecs + ' seconds' : m.seasonSecs / 60 + ' min'} the season turns for everyone: gold, soldiers, a new bell, battles, events.${m.canForce ? '<br>Click to ring the bell early.' : ''}`));
    const pl = $('#players');
    if (pl) {
      pl.innerHTML = '';
      pl.append(h('div.pl-head', null, h('span.sc', null, 'Rulers'), m.canForce ? h('button.btn.small', { onclick: () => this.hurrySeason(), 'data-tip': tipHTML('Hurry the season', m.founder ? 'You founded this world, so you may turn the season early.' : 'You are alone here, so you may turn the season early.') }, '⏩ Now') : null));
      for (const p of m.players) {
        const r = this.state.realms[p.realm];
        pl.append(h('div.court-row', { onclick: () => this.selectChar(r.ruler), 'data-tip': tipHTML(p.name, (p.online ? 'Online' : 'Away: their house answers for them') + '<br>Click to see their ruler') }, armsEl(r),
          h('div.who', null, p.name + (p.me ? ' (you)' : ''), h('br'), h('small', null, r.name)), h('span', { style: { color: p.online ? 'var(--green)' : 'var(--ink-3)' } }, p.online ? '●' : '○')));
      }
    }
  }

  refresh() {
    const s = this.state;
    if (!s) return;
    const pl = player(s), pr = playerRealm(s);
    const badge = $('#ruler-badge');
    badge.innerHTML = '';
    badge.append(h('div.medal.lg', null, h('img', { src: stillURL(s, pl, 140) })),
      h('div', null, h('div.name', null, fullName(s, pl)), h('div.sub', null, `${pr.kind} of ${pr.name} · House ${s.dynasty} · age ${ageOf(s, pl)}`)), armsEl(pr));
    const inc = income(s);
    const top = $('#topbar');
    top.innerHTML = '';
    top.append(
      h('div.res#res-gold', { 'data-tip': `<b>Treasury</b><br>${s.gold} gold<br>Income: ${inc >= 0 ? '+' : ''}${inc} per season<br><span class="muted">${provincesOf(s, pr.id).length} provinces, steward, minus army upkeep</span>` }, h('span.ic', null, '💰'), s.gold, h('small', null, ` ${inc >= 0 ? '+' : ''}${inc}`)),
      h('div.res#res-levies', { 'data-tip': `<b>Levies</b><br>${pr.levies} of ${maxLevies(s, pr.id)} men.<br>Replenish each season. Your marshal's martial skill adds to the maximum.` }, h('span.ic', null, '⚔'), pr.levies),
      h('div.res#res-prestige', { 'data-tip': '<b>Prestige</b><br>Fame and glory. Feasts, victories and bridges earn it; humiliations cost it.' }, h('span.ic', null, '⚜'), s.prestige),
      h('div.res', { 'data-tip': `<b>Reputation this reign</b><br>Promises kept: ${s.stats.promisesKept}<br>Promises broken: ${s.stats.promisesBroken}<br>Wars started: ${s.stats.wars}<br>Insults: ${s.stats.insults}<br><i>"${reputation(s.stats)}"</i>` }, h('span.ic', null, '📜'), reputation(s.stats).split(' ').pop()),
    );
    $('#endturn .date').textContent = dateStr(s);
    if (this.mp) this.renderClock();
    const seals = $('#endturn .seals');
    seals.innerHTML = '';
    for (let i = 0; i < 3; i++) seals.append(h('div.seal' + (i < s.audiences ? '' : '.empty'), null, '🔔'));
    const endBtn = $('.end-btn');
    if (!this.mp) endBtn.setAttribute('data-tip', tipHTML('End the season', `Three months pass. You collect gold and soldiers, get another 🔔, and events, battles, births and deaths happen.${s.audiences ? '' : '<br><b>You have no bells left</b>, so this is the thing to do.'}`));
    endBtn.classList.toggle('glow', !this.mp && s.audiences === 0 && !s.queue.length);
    // alerts
    const al = $('#alerts');
    al.innerHTML = '';
    for (const w of warsOf(s)) {
      const enemy = s.realms[w.attacker === s.playerRealm ? w.defender : w.attacker];
      const sc = scoreFor(s, w);
      al.append(h('div.alert-wrap', null, h('div.alert.red', { 'data-tip': `<b>War with ${esc(enemy.name)}</b><br>Over: ${esc(this.map.provinces[w.target].name)}<br>Score: ${sc > 0 ? '+' : ''}${sc} (±100 ends it)<br>Click for the war.`, onclick: () => openWar(this, w.id) }, '⚔'), warBar(sc, { small: true })));
    }
    for (const p of s.promises.filter(p => p.status === 'open' && p.due - s.turn <= 1)) {
      al.append(h('div.alert.gold', { 'data-tip': `<b>Promise due soon</b><br>To ${esc(s.chars[p.to].name)}: "${esc(p.text)}"`, onclick: () => this.selectChar(p.to) }, '🤞'));
    }
    if (this.selected) this.renderPanel();
    this.showDeltas();
  }

  // ------------------------------------------------------------ character panel
  selectChar(id, prov, tab) {
    this.selected = id; this.selectedProv = prov; this.tab = tab || (id === player(this.state).id ? this.tab || 'self' : 'char');
    const c = this.state.chars[id];
    this.view.select(c && c.alive ? c.realm : null);
    $('#charpanel').classList.add('open');
    this.renderPanel();
  }
  closePanel() { this.selected = null; $('#charpanel').classList.remove('open'); this.view.select(null); }

  renderPanel() {
    const s = this.state, c = s.chars[this.selected];
    const el = $('#charpanel');
    if (!c) return this.closePanel();
    const pl = player(s), me = c.id === pl.id;
    const r = s.realms[c.realm];
    const op = me ? null : opinionOf(s, c);
    const body = h('div.body');
    el.innerHTML = '';
    el.append(h('div.titlebar', { 'data-tip': 'Drag to move' }, me ? 'Your Majesty' : 'Character', h('button.x', { onclick: () => this.closePanel(), 'data-tip': 'Close' }, '✕')), body);

    const traitEls = c.traits.map(t => h('span.trait', { 'data-tip': `<b>${TRAITS[t].label}</b><br>${esc(TRAITS[t].persona)}${TRAITS[t].op ? `<br>Opinion of you: <span class="${TRAITS[t].op > 0 ? 'pos' : 'neg'}">${TRAITS[t].op > 0 ? '+' : ''}${TRAITS[t].op}</span>` : ''}` }, TRAITS[t].icon + ' ' + TRAITS[t].label));
    body.append(h('div.cp-head', null,
      h('div.cp-portrait', null, h('img', { src: stillURL(s, c, 200, me ? 'neutral' : c.alive ? moodExpr(op.total) : 'neutral'), style: c.alive ? null : { filter: 'grayscale(1) sepia(.4)' } }), r ? armsEl(r) : null),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div.cp-name', null, fullName(s, c)),
        h('div.cp-title', null, c.alive ? roleLabel(s, c) : `Died ${c.died} of ${c.cause}`),
        s.humans && r && r.ruler === c.id && s.humans[r.id] && !me ? h('div', { style: { color: 'var(--red)', fontFamily: 'var(--hand)' } }, `Played by ${s.humans[r.id].name}${s.humans[r.id].online ? '' : ' (away)'}`) : null,
        h('div', null, `Age ${c.alive ? ageOf(s, c) : c.died - c.born}`, c.house ? ` · House ${c.house}` : '', c.imprisoned ? ' · ⛓ imprisoned' : ''),
        !me && c.alive ? h('div.rel-line', null, relationOf(this, c).join(' · ')) : null,
        op ? h('div', { style: { marginTop: '6px' } }, 'Opinion of you: ', h('span#cp-op', null, opinionBadge(op.total)),
          h('div.opbar', { 'data-tip': '<b>Opinion of you</b><br>' + op.parts.filter(p => p.value).map(p => `${esc(p.label)}: <span class="${p.value > 0 ? 'pos' : 'neg'}">${p.value > 0 ? '+' : ''}${p.value}</span>`).join('<br>') }, h('i', { style: { left: (50 + op.total / 2) + '%' } }))) : null,
      )));
    body.append(h('div.traits', null, traitEls), h('div.quirk', null, `${c.name} ${c.quirk}.`));
    body.append(h('div.stats', null,
      [['dip', '🗣', 'Diplomacy'], ['mar', '⚔', 'Martial'], ['stw', '💰', 'Stewardship'], ['int', '🗝', 'Intrigue']].map(([k, ic, lb]) => h('div.stat', { 'data-tip': `<b>${lb}</b>` }, ic + ' ' + c.stats[k], h('small', null, lb)))));

    if (op) { const was = this.opSeen[c.id]; this.opSeen[c.id] = op.total; if (was != null && was !== op.total) setTimeout(() => floatDelta($('#cp-op'), (op.total > was ? '+' : '−') + Math.abs(op.total - was), op.total > was ? 'pos' : 'neg'), 30); }
    if (me) return this.renderSelf(body);

    // actions
    const acts = h('div.actions');
    if (c.alive && canTalk(s, c)) acts.append(h('button.btn.dark', { onclick: () => this.talk(c.id), disabled: s.audiences <= 0, 'data-tip': s.audiences > 0 ? tipHTML('Talk', `Speak with ${esc(c.name)} in person. Costs one 🔔 (you have ${s.audiences}). They remember what you say, and may walk out.`) : tipHTML('No bells left', 'End the season to get another 🔔.') }, s.audiences > 0 ? '🔔 Talk' : '🔔 No bells'));
    if (c.alive) acts.append(h('button.btn', { onclick: () => this.action('gift', c.id, this.giftAmount()), disabled: s.gold < 25, 'data-tip': tipHTML(`Gift ${this.giftAmount()} gold`, s.gold < 25 ? 'You need at least 25 gold.' : 'They will like you more. Greedy people love it.') }, `💰 Gift ${this.giftAmount()}`));
    const fam = c.alive ? marriageablesOfMine(s).filter(w => !marriageBlock(s, c, w)) : [];
    if (fam.length) acts.append(h('button.btn', { onclick: () => this.proposeMarriage(c, fam), 'data-tip': tipHTML('Propose marriage', fam.map(w => `${w.id === pl.id ? 'You' : esc(w.name)}: ${marriageChance(s, c, w)}% chance`).join('<br>') + (c.realm !== s.playerRealm ? '<br>A foreign match warms their ruler.' : '')) }, '💍 Marry'));
    const human = s.humans && r && r.ruler === c.id && s.humans[r.id] && !s.humans[r.id].me ? s.humans[r.id] : null;
    if (human && c.alive) acts.append(h('button.btn', { onclick: () => this.writeLetter(r.id, c), 'data-tip': tipHTML('Write a letter', `To ${esc(human.name)}, the player who rules ${esc(r.name)}.`) }, '✉ Write'));
    const isRuler = r && r.ruler === c.id && r.id !== s.playerRealm;
    if (isRuler && c.alive) {
      const war = atWar(s, r.id, s.playerRealm);
      if (war) {
        acts.append(h('button.btn.dark', { onclick: () => openWar(this, war.id), 'data-tip': tipHTML('The war', 'Score, armies, battles, peace.') }, '⚔ View war'));
        acts.append(h('button.btn', { onclick: () => this.action('peace', war.id), 'data-tip': tipHTML('Offer peace', scoreFor(s, war) >= 60 ? 'You are winning: they will yield the province.' : scoreFor(s, war) >= -20 ? 'A white peace: nobody gains.' : 'You are losing. They will refuse.') }, '🕊 Offer peace'));
      } else {
        const o = opinionOf(s, c).total;
        if (!allied(s, r.id, s.playerRealm)) acts.append(h('button.btn', { onclick: () => this.action('alliance', c.id), 'data-tip': tipHTML('Propose an alliance', human ? 'Another player: they decide.' : `They need to like you (30+). Now: ${o}.`) }, '🤝 Alliance'));
        if (neighborsOfRealm(s, this.map, s.playerRealm).includes(r.id)) acts.append(h('button.btn', { onclick: () => this.declareWar(r), 'data-tip': tipHTML('Declare war', `${r.levies} of theirs against your ${playerRealm(s).levies}. You fight one battle a season.`) }, '⚔ Declare war'));
        else acts.append(h('button.btn', { disabled: true, 'data-tip': tipHTML('Too far away', 'You can only attack realms that border yours.') }, '⚔ Declare war'));
      }
    }
    if (c.alive && c.realm === s.playerRealm && c.court) {
      acts.append(c.imprisoned ? h('button.btn', { onclick: () => this.action('release', c.id), 'data-tip': tipHTML('Release', 'They will be grateful. Somewhat.') }, '🔓 Release')
        : h('button.btn', { onclick: async () => { if (await confirmBox({ title: 'To the dungeon?', icon: '⛓', text: `Imprison ${c.name}? They will hate you for years, and the council will fear you.`, ok: 'Imprison', cancel: 'Mercy', danger: true })) this.action('imprison', c.id); }, 'data-tip': tipHTML('Imprison', 'Silence a troublemaker. Everyone notices.') }, '⛓ Imprison'));
    }
    body.append(h('div.section', null, h('h4', null, 'Actions'), acts));

    const proms = s.promises.filter(p => p.to === c.id);
    if (proms.length) body.append(h('div.section', null, h('h4', null, 'Promises you made'), proms.slice(-6).reverse().map(p => this.promiseEl(p))));
    body.append(this.familyEl(c));
    if (r && r.ruler === c.id) {
      const war = atWar(s, r.id, s.playerRealm);
      body.append(h('div.section', null, h('h4', null, `${r.kind} of ${r.name}`),
        h('div', null, `${provincesOf(s, r.id).length} provinces · ${r.levies} levies · House ${r.house}`),
        h('div.muted', null, allied(s, r.id, s.playerRealm) ? '🤝 Allied with you' : war ? '⚔ At war with you' : 'Neutral'),
        war ? h('div', { style: { marginTop: '6px', cursor: 'pointer' }, onclick: () => openWar(this, war.id) }, warBar(scoreFor(s, war))) : null,
        h('button.btn.small', { style: { marginTop: '6px' }, onclick: () => this.goToRealm(r.id), 'data-tip': tipHTML('Show on map', `Fly to ${esc(r.name)}.`) }, '🗺 Show on map')));
    }
    const hist = s.chronicle.filter(e => e.chars && e.chars.includes(c.id)).slice(-5).reverse();
    if (hist.length) body.append(h('div.section', null, h('h4', null, 'Shared history'), hist.map(e => h('div.entry', null, h('span.y', null, e.y), this.link(e.text, e.chars)))));
  }

  renderSelf(body) {
    const s = this.state, pl = player(s), pr = playerRealm(s);
    const tabs = h('div.row', { style: { gap: '4px', marginTop: '10px' } },
      ['self', 'court'].map(t => h('button.btn.small' + (this.tab === t ? '.dark' : ''), { onclick: () => { this.tab = t; this.renderPanel(); }, 'data-tip': t === 'self' ? 'Your family, lands, wars and promises' : 'Your council and courtiers' }, t === 'self' ? 'Family & Realm' : 'Court & Council')));
    body.append(tabs);
    if (this.tab === 'court') {
      const cn = council(s);
      body.append(h('div.section', null, h('h4', null, 'Council'), COUNCIL.map(role => cn[role] ? this.courtRow(cn[role]) : h('div.muted', null, `${role}: vacant`))));
      const others = livingCourt(s, s.playerRealm).filter(c => c.id !== pl.id && !COUNCIL.includes(c.role) || c.imprisoned);
      body.append(h('div.section', null, h('h4', null, 'Court'), others.map(c => this.courtRow(c))));
      return;
    }
    body.append(this.familyEl(pl));
    body.append(h('div.section', null, h('h4', null, `${pr.kind} of ${pr.name}`),
      h('div', null, `${provincesOf(s, pr.id).length} provinces · ${pr.levies}/${maxLevies(s, pr.id)} levies · income ${income(s)}/season`),
      s.alliances.filter(a => a.includes(pr.id)).map(a => h('div', null, '🤝 Allied with ', s.realms[a[0] === pr.id ? a[1] : a[0]].name)),
      warsOf(s).map(w => h('div.war-mini', { onclick: () => openWar(this, w.id), 'data-tip': 'Click for the war' }, h('div', { style: { color: 'var(--red)' } }, `⚔ War with ${s.realms[w.attacker === pr.id ? w.defender : w.attacker].name}`), warBar(scoreFor(s, w), { small: true }))),
      h('button.btn.small', { style: { marginTop: '6px' }, onclick: () => this.goHome(), 'data-tip': tipHTML('Go home', 'Show your lands on the map.') }, '⌂ Show my lands')));
    const open = s.promises.filter(p => p.status === 'open');
    body.append(h('div.section', null, h('h4', null, 'Open promises'), open.length ? open.map(p => this.promiseEl(p, true)) : h('div.muted', null, 'None. Your word is unburdened.')));
    if (s.reigns.length > 1) body.append(h('div.section', null, h('h4', null, 'Your forebears'), s.reigns.slice(0, -1).map(r => h('div', null, `${r.name} (${r.from}–${r.to}) `, h('i.muted', null, r.rep || '')))));
  }

  courtRow(c) {
    const s = this.state, op = opinionOf(s, c).total;
    return h('div.court-row', { onclick: () => this.selectChar(c.id) },
      h('div.medal.sm' + (c.imprisoned ? '.jailed' : ''), null, h('img', { src: stillURL(s, c, 80, moodExpr(op)) })),
      h('div.who', null, c.name, c.house ? ` ${c.house}` : '', h('br'), h('small', null, roleLabel(s, c))), opinionBadge(op));
  }

  familyEl(c) {
    const s = this.state, rel = [];
    const add = (id, label) => { const k = s.chars[id]; if (k) rel.push(this.medal(k, label)); };
    if (c.parents) c.parents.forEach((id, i) => add(id, i === 0 ? 'Parent' : 'Parent'));
    if (c.spouse) add(c.spouse, 'Spouse');
    (c.children || []).forEach(id => add(id, s.chars[id].role === 'heir' ? 'Heir' : (s.chars[id].sex === 'm' ? 'Son' : 'Daughter')));
    return rel.length ? h('div.section', null, h('h4', null, 'Family'), h('div.family', null, rel)) : h('div');
  }
  medal(c, label) {
    const s = this.state;
    return h('div.medal-wrap', { onclick: () => this.selectChar(c.id) },
      h('div.medal.sm' + (c.alive ? '' : '.dead'), null, h('img', { src: stillURL(s, c, 80) })), h('span', null, c.name), h('span.muted', null, label));
  }
  promiseEl(p, showTo) {
    const s = this.state;
    return h('div.promise.' + p.status, { onclick: showTo ? () => this.selectChar(p.to) : null, style: showTo ? { cursor: 'pointer' } : null },
      showTo ? h('b', null, s.chars[p.to].name + ': ') : null, `"${p.text}"`, h('div.muted', { style: { fontSize: '12px' } },
        p.status === 'open' ? `Due in ${Math.max(0, p.due - s.turn)} season(s)` : p.status.toUpperCase()));
  }

  writeLetter(realmId, c) {
    const ta = h('textarea.field', { maxlength: 300, rows: 4, placeholder: `To ${fullName(this.state, c)}…`, style: { width: '100%', resize: 'vertical' } });
    const back = h('div.modal-back', null, h('div.panel.options', null, h('div.titlebar', null, 'A Letter', h('button.x', { onclick: () => back.remove(), 'data-tip': 'Tear it up' }, '✕')),
      h('div.body', null, ta, h('div.row', { style: { justifyContent: 'flex-end', marginTop: '10px' } },
        h('button.btn.dark', { onclick: async () => { const t = ta.value.trim(); if (!t) return; back.remove(); await this.action('letter', realmId, t); }, 'data-tip': tipHTML('Send', 'It arrives at once. They can reply.') }, '✉ Seal and send')))));
    document.body.append(back);
    draggable(back.firstChild, { handle: back.firstChild.querySelector('.titlebar') });
    ta.focus();
  }

  async declareWar(r) {
    const s = this.state, betray = allied(s, r.id, s.playerRealm);
    const ok = await confirmBox({
      title: 'Declare war?', icon: '⚔', danger: true, ok: 'To war!', cancel: 'Not yet',
      text: `On ${r.name}: ${r.levies} men against your ${playerRealm(s).levies}. One battle each season until someone wins.${betray ? ' This BETRAYS your alliance, and everyone will know.' : ''}`,
    });
    if (ok) await this.action('war', r.id);
  }
  async proposeMarriage(c, fam) {
    const s = this.state, pl = player(s);
    let who = fam[0];
    if (fam.length > 1) {
      const id = await chooseBox({ title: 'A match for whom?', icon: '💍', text: `Who should marry ${c.name}?`,
        choices: fam.map(w => ({ value: w.id, label: `${w.id === pl.id ? 'You' : w.name + ' (' + roleLabel(s, w) + ')'}: ${marriageChance(s, c, w)}%`, tip: tipHTML('Chance they accept', 'Better if they like you, their ruler likes you, and you have prestige.') })) });
      if (!id) return;
      who = s.chars[id];
    }
    const ok = await confirmBox({ title: 'Propose marriage?', icon: '💍', ok: 'Propose', cancel: 'Not now',
      text: `${who.id === pl.id ? 'You' : who.name} and ${c.name}. About ${marriageChance(s, c, who)}% likely to accept.${c.realm !== s.playerRealm ? ` ${c.name} would join your court.` : ''}` });
    if (ok) await this.action('marry', c.id, who.id === pl.id ? null : who.id);
  }
  giftAmount() { return Math.max(25, Math.min(100, Math.round(this.state.gold / 8 / 5) * 5)); }
  act(res) {
    if (res && res.msg) toast(res.msg, res.ok ? '✔' : '✖');
    if (this.state.flags.mapDirty) this.view.invalidate();
    this.refresh(); this.flush(); this.save();
    if (this.state.gameOver) this.gameOver();
  }
}
