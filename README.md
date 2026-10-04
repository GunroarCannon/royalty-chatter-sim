# Royal Banter

**Make promises. Break them. See who remembers.**

A lighthearted, Crusader Kings–style medieval strategy game where every character is a chatbot with a long memory. Your chancellor remembers the raise you promised. The merchant remembers your debt. Your heir's courtiers remember what *your father* did. Memory is stored on **Walrus** via Walrus Memory (MemWal), so it survives page reloads, server restarts, new reigns and whole new campaigns.

Built for the Walrus Sessions hackathon *Chatbots That Remember*.

- **LLM:** Qwen 3.8 27B (`qwen/qwen3.8-27b`) on Groq, via an OpenAI-compatible client (OpenRouter, Ollama and LM Studio also work)
- **Memory:** `@mysten-incubation/memwal` → Walrus mainnet
- **Portraits:** [Portrait Atelier](https://github.com/GunroarCannon/portrait-js) (git submodule). Procedural faces that blink, talk and emote; children inherit their parents' features.

## Quick start

```bash
git clone --recurse-submodules <this repo>
cd royal-banter
npm install
cp .env.example .env      # fill in GROQ_API_KEY, MEMWAL_ACCOUNT_ID, MEMWAL_PRIVATE_KEY
npm run dev               # API on :8787, game on http://localhost:5180
```

Production: `npm run build && npm start` (the API serves `dist/` on `$PORT`; saves and shared worlds go to `$DATA_DIR`, default `./data`).

### Deploying

- **Docker:** `docker build -t royal-banter .` then `docker run -p 8080:8080 -v rbdata:/data --env-file .env royal-banter`.
- **Render (free):** see *Free hosting* below.
- **Fly.io:** `fly launch --no-deploy`, `fly volumes create data --size 1`, `fly secrets set GROQ_API_KEY=… MEMWAL_ACCOUNT_ID=… MEMWAL_PRIVATE_KEY=…`, `fly deploy`.

Shared worlds need a persistent disk, or the free Redis copy below; single-player saves are also mirrored in the browser.

#### Free hosting (Render + Upstash, no card needed)

1. Push the repo to GitHub (the `public/portrait` submodule is public, Render clones it).
2. **Upstash** ([upstash.com](https://upstash.com), sign in with GitHub): create a free Redis database and copy its **REST URL** and **REST token**.
3. **Render** ([render.com](https://render.com)): **New → Blueprint**, pick the repo. It reads `render.yaml` (free plan). Fill in the secrets: `GROQ_API_KEY`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
4. Share the `https://royal-banter-….onrender.com` link. Everyone who opens it plays in the same shared worlds.

Free-tier facts: the server sleeps after 15 minutes with nobody on it, and the first visit after that takes about a minute to wake it. Nothing is lost: worlds and profiles are copied to Redis (at most every 15 s per world, and on shutdown) and restored on wake. Walrus memories live on Walrus anyway.

Check the memory connection on its own with `npm run test:memory` (writes and recalls one test memory).

## How to play

**A season is one turn.** Do what you like during it, then press **End Season** (the big red seal, bottom right). Three months pass: your gold and soldiers come in, you get another audience bell, and events, battles, births and deaths happen. A little ledger shows what the season brought.

| You want to… | Do this |
|---|---|
| Talk to someone | Click them (on the map, in your court, or any red underlined name), then **🔔 Talk**. Each talk costs one bell 🔔. You hold up to 3 and get one back each season. Talks offered by events are free. Characters remember what you say. Their patience is shown as candles 🕯; bore or insult them and they may end the audience early (proud and wrathful ones storm out). |
| Make someone like you | **💰 Gift**, flattery, keeping your promises. Opinion changes float up next to their face. |
| Find your lands | Press **⌂** above End Season. Your provinces have a gold border and a banner over your capital. |
| Find something to do | Press **?** above End Season to ask your **advisor**: "Who should I attack?", "Find someone to marry", "Who hates me?", "How do I get gold?" Click a suggestion and the map flies there. |
| Make an ally | Open a foreign ruler, **🤝 Alliance**. They need to like you (opinion 30+). |
| Marry | Open an unmarried adult (not a ruler), **💍 Marry**, for yourself or one of your children. Foreign matches warm their ruler. |
| Go to war | Open a neighbouring ruler, **⚔ Declare war**. Enemy land is hatched red, the front line is a red dashed border, and the province at stake pulses. Each season brings one battle where you choose **Charge / Hold / Flank**. Victories push the war score toward +100 (you take the province); defeats push it toward −100 (you lose). Click the ⚔ at the top of the screen for the war window: armies, score, every battle, peace and surrender. |
| Keep track | **📖 Chronicle**, **🤞 Promises** (deadlines!), **🦭 Tales** (what other players' dynasties did). |

Panels can be dragged anywhere (a drag never presses a button); **⚙ Options → Reset panels** puts them back. Every button has a tooltip.

## How it plays

- A procedurally generated map of about 20 realms. You rule one. Each **season** you click *End Season*: income, wars, births, deaths and **events** happen.
- Events are short CK-style scenes with choices. Many offer **"Talk to …"**, which opens a free audience with that character before you decide.
- **Audiences are rationed:** you get one 🔔 per season (max 3), and each audience allows about 6 exchanges. Talking is a strategic decision, not a spam button. Characters also *request* audiences when they're upset or you owe them.
- **The engine decides, the LLM acts.** Before each audience the game pre-rolls what the character *will* agree to (a loan, an alliance, peace, troops) based on opinion and traits. The LLM gets this as "fate" and only decides *how* to say it. It returns structured JSON (`line`, `expression`, `gesture`, `opinion_delta`, `player_promise`, `granted`), which the engine validates and applies.
- **Promises are a game mechanic.** When you commit to something in conversation ("I'll pay you 60 gold by winter"), the LLM extracts it, the engine records it with a deadline, and the character comes back to collect. Breaking a promise costs opinion with them and with the whole court, can earn you the epithet *"the Forsworn"*, and is written into the shared world memory.
- Rulers age and die; your heir inherits, with the court's grudges passed down. A reign ends with a reputation card ("*Surprisingly competent disaster*").

## World presets

Pick the world you rule in: **The Known World** (the whimsical default: Cheesemark, House Pudding, every culture on one map), **Old Europe**, **Nigeria** (Yoruba obas, Igbo ezes, Hausa sarkis, the court of Benin, Kanem-Bornu, Fulani lamidos, the Ijaw and Efik trading states), **Africa** (Mali, the Akan, Wolof, Ethiopia, the Swahili coast, Nguni kingdoms, the Amazigh north), **Asia**, **East Asia** and **The Subcontinent**. Each culture brings real names, houses, place names, ruler titles (Oba, Eze, Mansa, Negus, Daimyo, Maharaja…), court offices (Bashorun, Waziri, Okyeame, Diwan, Karō…), a climate for the map (savanna, rainforest, steppe) and a line of flavour for the characters' voices. The humour comes from personalities and situations, never from the cultures.

## Shared worlds (multiplayer)

**How a shared world runs:**

1. On the title screen choose **Shared worlds**, type your name, then **Found a world** (pick a preset and a season length: 30 s, 1, 2 or 5 min) or **Enter** one from the list. Send friends the same site; the world shows up in their list.
2. Pick a realm nobody else is playing. The server holds the one true world; your browser shows your view of it and refreshes every few seconds.
3. **It runs in real time.** The season turns by itself for everyone when the clock runs out (the ring on the big button). Nobody waits for anybody: talk, gift, marry, write letters, fight whenever you like. The founder (or anyone alone in the world) can click the clock or **⏩ Now** to hurry the season.
4. Nobody online? The world pauses. Away for a while? Your events settle themselves after two seasons (with the cautious choice), and other players can still talk to your ruler: your house answers for you, and you get a report.
5. Bells, gold, promises and opinions are **per player**: a character can love you and loathe your rival.

Found or join a **shared world**: one map hosted by the server, each player rules a realm. The season turns when every ruler online is ready, or when the season clock runs out, and the world waits while nobody is online. Players can send **letters**, gold and alliance offers, and declare war on each other. Talk to another player's ruler while they are away and their house **answers in their name**, guided by their own dynasty's memories; afterwards they get a report of what was said, and so does their memory. Deeds involving other houses go into the world's shared memory, so an NPC you meet may already know what another player did to them.

## How memory works

Two Walrus Memory namespaces:

| Namespace | What goes in | Who reads it |
|---|---|---|
| `rb-dyn-<player>` | Everything about **your dynasty**: promises made, kept and broken; gifts; insults; event choices; audience summaries; successions | Every character you talk to, in every reign and every campaign |
| `rb-world` | **Public deeds** of every player's dynasty (wars, betrayals, broken oaths, a knighted chicken…) | All players, as "Tales from afar" gossip and the 🦭 Tales tab |
| `rb-dyn-<player>-<world>` | Your dynasty inside one shared world | Every character you talk to there, and *your* house when another player talks to it in your absence |
| `rb-room-<world>` | Deeds between houses in one shared world | Every player in that world (characters remember what other players did to them) |

**Write path.** Game events append to an outbox → `POST /api/memory` → `rememberBulk` (≤20 per call). After an audience, the LLM condenses the transcript into 1–3 memory notes from the character's point of view, and those are stored too. The relayer embeds, encrypts and uploads to Walrus in the background (about 30s), so the server keeps a short-lived *pending* list and merges it into recalls until Walrus has indexed the new memories.

**Read path.** When an audience starts, the server runs three semantic recalls in parallel: memories about this character, old history between the two houses, and world gossip. It filters them to the ones that mention the character or their house. These go into the system prompt as "WHAT YOU REMEMBER". Each player message also triggers a targeted recall (`"<name>: <message>"`), so a message can stir a specific old memory. The UI shows the recalled memories as little 🦭 notes beside the portrait, so you can *see* what the character remembers.

**Across campaigns.** A new campaign keeps the same world seed (realm and house names are stable), set a generation later. Your dynasty namespace persists, so the great houses still tell stories about your ancestors.

## Architecture

```
shared/        isomorphic game logic (pure state transforms, seeded RNG), ready to move server-side for multiplayer
  mapgen.js    Voronoi map: fine mesh → coastline; clustered cells → provinces; coarse mesh → sea zones
  world.js     realms, characters, traits, opinion, chronicle + memory outbox
  sim.js       season tick: economy, deaths and succession, wars, AI diplomacy, promise deadlines
  events.js    the event deck (and generated events: battles, promises due, succession…)
  actions.js   player actions (one ACTIONS registry for solo and server), audience "fate" pre-rolls, applying LLM verdicts
  cultures.js  cultures and world presets: names, houses, places, titles, court offices, flavour
server/
  index.js     Express API: saves, memory outbox, audiences (prompting, rate limits)
  memory.js    Walrus Memory wrapper (bulk writes, pending cache, recall)
  worlds.js    shared worlds: authoritative state per room, per-player views, season clock, persistence
  llm.js       OpenAI-compatible client with provider switch
src/           Vite + vanilla JS frontend: canvas map, hand-inked parchment UI, live portraits, procedural heraldry and event art
public/portrait  Portrait Atelier submodule (unmodified)
```

Anti-spam and cost controls (server-side): 6 exchanges per audience, 20 audiences and 80 LLM calls per player per hour, and a 300-character message cap.

## License

MIT
