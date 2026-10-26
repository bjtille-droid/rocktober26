# Rocktober

A Sloan Street Afterlife Production: Halloween, October 31, 2026 at 8 PM Eastern.

The site keeps its printed campus-flyer look, haunted illustrations, live countdown, Swell / Karaoke + Spooky Games / DJ Campbell lineup, costume roll call, and Rock Run arcade. Guests can open a prefilled Google Calendar event or download the event for other calendar apps. Both use the same 8 PM Eastern start. The Google link is a start-time reminder with no assumed party end time; guests choose Save in Google Calendar.

## Pages

- `/` is a shorter party flyer: countdown, time and place, rock rule, lineup, and links to the two interactive pages. Tap the perched bat to release a small flock; it stays within the title area and never intercepts links. Reduced-motion visitors get a static response. Haunted artwork is tucked into an optional disclosure. The page does not load the game or poll the community API.
- `/arcade` is Rock Run and its shared leaderboard. The score-name form appears after a run ends.
- `/roll-call` is the shared costume guest book.

Phone visitors have a fixed three-link navigation bar with the current page marked. All routes are real pages that can be linked, reloaded, and reached with browser Back. The existing website address stays the same. Legacy home fragments `#game` and `#costumes` forward to their new pages.

## Shared features

- Rock Run is an endless three-lane arcade with rock combos, survival points, increasing difficulty, three lives, and a ten-minute cap. Players may pause/resume with the main button on phones or with P/Escape, and bank a score early.
- The server issues a seeded run and replays every submitted move. It calculates the score itself, checks elapsed time and ownership, and consumes each run once. This prevents arbitrary score submissions; it does not prove that a player is human or prevent every form of automation.
- Each browser keeps one best score and one costume entry. Costume entries and the top ten scores are visible to every visitor. The page refreshes shared data every twenty seconds and after a submission.
- A signed HttpOnly cookie identifies the entry owner. Only that owner can update or delete the entry. The delete API accepts no entry ID, so a visitor cannot choose someone else's entry to remove. Clearing cookies or switching devices loses access to the old entry.
- Guest names, costumes, and arcade names pass server-side English profanity checks, including common Unicode, spacing, and character substitutions. Filtering is a heuristic and cannot guarantee detection of every possible phrase or language. The site does not claim otherwise.
- Writes have database-backed rate limits. Browser text is rendered with `textContent`.

## Architecture

`public/` is a static website. `api/index.js` runs as a Vercel Node function. Supabase Postgres stores costumes, scores, runs, and rate buckets. All app tables have RLS enabled and no public or authenticated table grants. Service-only database functions provide transactional rate limits and score updates.

The preferred configuration uses `supabase/functions/rocktober-gateway/`: a narrow, authenticated Edge gateway. It uses its built-in Supabase server secret, so no database secret needs to be copied to Vercel. Vercel stores a separate random gateway token and session-signing secret. The gateway only accepts a fixed list of app operations and its source contains only the token's SHA-256 verifier.

The gateway template intentionally has a verifier placeholder. Provisioning must substitute the hash of the generated gateway token before deploying the function with its platform JWT check disabled; the function performs its own token authentication. Never commit the actual token or any filled-in `.env` file.

## Local development

Requires Node 22 or newer. The pinned Obscenity dependency is vendored under its MIT license, so installation does not need registry downloads.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
DEVELOPMENT_STORE=memory npm run dev
```

The explicit memory preview is for local development and tests. It is never selected as a production fallback. For the real shared backend, copy `.env.example` to `.env.local` and configure the server-only values instead.

## Deployment

1. Create or select a dedicated Supabase project and apply the reviewed SQL under `supabase/migrations/`. Check actual schema grants, RLS, and advisors after application.
2. Deploy the authenticated gateway and verify its health. It needs no browser-facing database credentials.
3. Set `SUPABASE_GATEWAY_URL`, `SUPABASE_GATEWAY_SECRET`, and `SESSION_SECRET` in Vercel production/preview environments. Use at least 32 random bytes for each secret. `APP_ORIGIN` can pin the production site's origin.
4. Deploy this repository with the included `vercel.json`. Installation uses the lockfile; output is `public/`; `/api/*` endpoints are rewritten to the server function.
5. Confirm `/api/health` reports `configured: true, mode: shared`. Check cross-browser costume visibility, own-entry deletion, profanity rejection, and a verified high score before sharing the URL.

An alternative server configuration accepts `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (or a legacy `SUPABASE_SERVICE_ROLE_KEY`). Keep these server-only.

No analytics, camera access, AI portrait generation, or third-party browser scripts are included. Costume-photo generation would require a separate server-side image service integration.

## Maintenance

The host can moderate entries directly in the dedicated Supabase project's table editor. Tables are prefixed `rocktober_`. Expired run/rate records are periodically cleaned during rate-limit calls. No guest receives database administration access.

The event time is set in `public/party.js`; its label is in `public/index.html` and its Google Calendar link is in `public/index.html`; the calendar download is `public/rocktober.ics`. Update the countdown, label, link, and download together if the date changes. Game rule changes must update `RULES_VERSION` in `public/game-core.js` to keep old replays from being accepted under new rules.

Third-party notices and exact source provenance are in `vendor/obscenity/LICENSE.md` and `vendor/obscenity/PROVENANCE.md`.
