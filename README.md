# 👾 BitPoint Arcade

A retro 8-bit, synthwave-infused **game show cabinet for cooperative story pointing**.
Your backlog becomes a gauntlet of boss battles: the team votes 1–3 on **Complexity**
(magenta) and **Uncertainty** (cyan) on chunky 3D cabinet buttons, consensus becomes the
story-point estimate (`max(complexity, uncertainty)`), lasers fly, the boss goes down,
and the result syncs straight back to Linear as an arcade high-score comment.

Built with **React (Vite) + Tailwind + Lucide**, realtime via **Convex**, Linear OAuth
for the host, deployable 100% free on **Vercel**.

---

## Feature tour

| System | What it does |
| --- | --- |
| 🎵 Dynamic Synthwave engine | Fully synthesized Web Audio: looping Am–F–C–G synthwave bed (pads/bass/arps/drums), coin-drop on join, mechanical clunks, fast-tempo pitch-bend red-alert under 10s, winner fanfare + digitized **“PERFECT!”** on unanimous votes. Zero audio assets. |
| 🕹️ 3D Neon Cabinet | CSS-3D vote buttons that hover-glow (magenta/cyan) and physically depress. **Anti-Spam Tilt:** >5 presses in 2s → screen shake + flashing `TILT!` lockout. |
| 🐲 Mega Boss progression | Active ticket framed in a `TEAM vs BOSS` VS screen with HP bar, threat level, type and abilities parsed from the description. **Sync & Advance** fires a per-player laser volley, drains HP to 0, stamps `DEFEATED!`, and slides in the next level. |
| 🤖 Skills Data + Smart Agent | Host uploads a CSV (`Username, Skills, Confidence`) in the DATA tab. Any consensus of 3 wakes the agent: it matches skills against the ticket text across **online** players and pairs a **Navigator** (has the skill) with an **Implementor** (doesn't), as a Markdown briefing. |
| 🔄 Linear sync | Host links with a personal API key (pasted in-app, validated with Linear, stored server-side only). Imports are scoped to **triage-state issues only** (enforced server-side, so in-progress work is untouchable): filter by one team, several, or all, then hand-pick which issues enter the tournament. On defeat the estimate is written to the ticket and a **👾 Consensus Board** comment (vote table, medals, pairing intel) is posted. |
| 👻 Presence | Convex heartbeat presence — offline players drop out of the READY count and the agent's pairing pool. |

## Repo map

```
convex/
  schema.ts        # rooms · players · tickets · votes · skillProfiles · oauthStates
  rooms.ts         # create/join, round state machine, countdown auto-reveal, advance
  players.ts       # roster + presence heartbeat
  votes.ts         # blind voting (masked until reveal)
  tickets.ts       # demo quest, Linear import, defeat finalizer
  skills.ts        # skills data storage (username-keyed)
  linear.ts        # API-key connect, triage scan/import, estimate+comment sync
  lib/game.ts      # consensus math, Smart Agent pairing, comment builder, demo bosses
src/
  lib/audio.ts     # the synthwave/SFX engine (Web Audio)
  lib/tilt.tsx     # anti-spam TILT provider
  components/      # ControllerDeck · VsArena · Lobby · HostDock · GameOverPanel …
  screens/         # AttractScreen · RoomScreen · BootScreen
```

## Local development

```bash
npm install
npx convex dev          # terminal 1 — provisions a free deployment, writes .env.local
npm run dev             # terminal 2 — http://localhost:5173
```

No Convex account handy? `npx convex dev` offers an anonymous local deployment —
everything works offline except Linear sync.

**Play:** POWER ON a cabinet as host → LOAD DEMO QUEST → START GAME. Open a second
browser/incognito tab, join with the room code and the handle `ada` or `grace`
(matching [public/sample-skills.csv](public/sample-skills.csv)) — upload that CSV in
HOST CONSOLE → DATA to see the Smart Agent fire on a 3-vote.

## Linear setup (host features)

One step, no admin rights and no deployment config needed. Any workspace
member can mint a personal API key: Linear → Settings →
**Security & access → API keys** (read/write). The host pastes it into the
cabinet — the **LINK LINEAR** card in the lobby, or **HOST CONSOLE → LINEAR**
— where it's validated against Linear and stored server-side only. It unlocks
triage import, estimate write-back, and consensus-board comments. Keys are
never sent to other browsers or committed anywhere.

## Deploy free on Vercel

The repo ships with `vercel.json` (Vite framework + SPA rewrites).

1. **Convex prod:** `npx convex deploy` (or keep using your dev deployment).
2. **Vercel env var:** `VITE_CONVEX_URL = https://<deployment>.convex.cloud`.
3. Deploy: `npx vercel deploy --prod` (or connect the GitHub repo in the Vercel dashboard
   for deploy-on-push).
4. Optional CI-style builds that push Convex functions too: set the Vercel **build command**
   to `npx convex deploy --cmd "npm run build"` and add `CONVEX_DEPLOY_KEY`
   (Convex dashboard → Settings → Deploy keys) as a Vercel env var.
5. Update `APP_URL` on Convex to the Vercel URL so the OAuth redirect returns to prod.

Until `VITE_CONVEX_URL` is set, the deployed site shows a retro **SYSTEM BOOT** screen
with these same instructions — nothing crashes.

## Game rules (for the humans)

- Everyone (host included) votes **1–3** on both axes. Votes are blind until reveal.
- Consensus per axis = most common value, ties round **up**. Estimate = `max(C, U)`.
- Unanimous full-house = **PERFECT!** — enjoy the announcer.
- A consensus 3 on either axis summons the Smart Agent's pairing protocol.
- Don't mash the buttons. The cabinet remembers. `TILT!`
