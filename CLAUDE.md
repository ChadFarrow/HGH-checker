# HGH-checker

A post-production check for music podcasts such as Homegrown Hits. Paste a feed URL; the page
checks the newest episode and shows PASS, CHECK or FAIL. It lines up three timelines: the
`podcast:chapters` file, the `podcast:valueTimeSplit` blocks, and the song each split's
`remoteItem` points to (resolved through Podcast Index, then read from the song's own feed, which
holds the wallet a player boosts). The rules and their codes are in `lib/compare.js` and in the
README table.

## Layout

- `lib/parse.js` — feed, chapters and song-feed parsing (no network).
- `lib/compare.js` — every rule, as pure functions. Tolerances are in `DEFAULTS`.
- `lib/net.js` — fetch, Podcast Index auth, song resolution, a small in-memory cache.
- `lib/check.js` — glue used by `api/` and `cli.js`.
- `api/feed.js`, `api/episode.js` — Vercel functions. `public/` — the static page.
- `dev-server.js` — local server that serves `public/` and runs `api/*.js` like Vercel.

## Run and test

```bash
npm ci
npm test                 # node --test, no network (bare: `node --test test/` fails to resolve)
npm run dev              # http://localhost:3000
node cli.js https://feed.homegrownhits.xyz/feed.xml   # exit 1 on FAIL
```

Song lookups need `PODCASTINDEX_API_KEY` and `PODCASTINDEX_API_SECRET` in the environment.
Without them every song is skipped and the episode shows one `NO_PI_KEYS` issue.

A browser test: open the page, let it check the newest episode, and read `#latest` (the verdict
and the issue list). Test the phone layout with CDP device emulation (see `global.md`).

## Deploy

- Vercel project `hgh-checker` (team `chadfs-projects`), production at
  https://hgh-checker.vercel.app from `master`. No build step: `public/` is static, `api/*.js`
  are functions (`vercel.json` sets `maxDuration`).
- Preview URLs are behind Vercel login (SSO). Agents read them with the Vercel connector
  (`web_fetch_vercel_url`, or `get_access_to_vercel_url` for a browser).
- The Podcast Index pair lives only in Vercel env vars (Production + Preview). A change to
  them needs a redeploy.

## Rules

- Never put a key or a secret in client code or in a commit. The old `script.js` did, so the
  pair in this repo's history is public and was replaced on 2026-11-20.
- The server fetches any feed URL a visitor gives it. Keep it read-only: no proxy endpoint
  that returns arbitrary content.
