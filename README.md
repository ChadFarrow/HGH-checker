# HGH Feed Checker

A quick sanity check for music shows like Homegrown Hits. Paste the feed URL. The page checks the newest episode and shows **PASS**, **CHECK**, or **FAIL**. If something is wrong, it tells you what and where, with a timestamp you can click to hear it.

It does the hand check for you: play the show, skip with chapters, and confirm that the song changes when the chapter changes and that the boost goes to the right wallet.

## What it checks

The tool compares three timelines for each episode:

1. **Chapters** — the `podcast:chapters` JSON file.
2. **Value time splits** — `podcast:valueTimeSplit` in the episode `podcast:value` block.
3. **Songs** — each split's `podcast:remoteItem`, looked up in Podcast Index and then read from the song's own feed (the same wallet a player uses for a boost).

| Code | Level | Meaning |
|---|---|---|
| `NO_CHAPTER_AT_SPLIT` | fail | A split starts, but no chapter starts within 3 s |
| `CHAPTER_IS_OTHER_SONG` | fail | The chapter at the split is a different song in this episode (swapped or shifted) |
| `SONG_CHAPTER_UNPAID` | fail | A chapter has a song title from this episode, but no split starts there |
| `SONG_NOT_FOUND` | fail | The remoteItem feedGuid/itemGuid does not resolve to a song |
| `NO_PI_KEYS` | fail | The server has no Podcast Index keys, so no song was checked (shown once) |
| `SONG_FEED_DOWN` | warn | The song's own feed does not load or is not RSS; the wallet comes from the Podcast Index copy |
| `NO_WALLET` / `BAD_ADDRESS` / `ZERO_SPLITS` | fail | Song or episode has no usable value recipients |
| `SPLIT_OVERLAP` | warn / fail | One split runs more than 3 s into the next one (FAIL above 10 s) |
| `SPLIT_TIMES`, `NO_REMOTE_ITEM` | fail | The split is missing data |
| `NO_CHAPTERS_TAG`, `CHAPTERS_UNREADABLE`, `NO_ENCLOSURE` | fail | Episode is missing a basic part |
| `TITLE_MISMATCH` | warn | Chapter title and song title are different |
| `DURATION_MISMATCH` | warn | Split duration and song length differ by more than 5 s |
| `SPLIT_RUNS_LONG` | warn | The split still pays the song more than 5 s into the next chapter |
| `CHAPTER_NO_ART`, `SONG_NO_ART` | warn | Missing artwork |
| `NO_SPLITS` | warn | The episode pays no songs |
| `BROKEN_TEXT` | warn | A chapter title has broken characters (UTF-8 saved as Windows-1252, like `âš¡` for ⚡) |
| `CHAPTER_NO_SPLIT` | note | A chapter with a link has no split. It does not change the result. |

Tolerances are in `lib/compare.js` (`DEFAULTS`).

## What the server fetches

The server fetches the feed URL you paste, and the chapters and song-feed URLs that the feed names. Every fetch goes through `lib/safe-fetch.js`:

- Only public `http://` and `https://` addresses. It refuses `localhost`, `*.local`, `*.internal`, private, loopback, link-local and cloud-metadata addresses (IPv4 and IPv6, in every spelling), and a name whose DNS answer includes any of them. A name that does not resolve is refused too.
- Redirects: at most 5, and each target is checked again.
- Time: 15 s for one fetch, redirects and body included.
- Size: 16 MB for the feed you paste, 8 MB for a chapters file or a song feed.

Two limits remain: DNS rebinding (a DNS server that answers the check and the connection differently), and any port on a public host is allowed.

## Setup

The server needs a Podcast Index API key pair (free at <https://api.podcastindex.org>). Set these in Vercel (Project → Settings → Environment Variables) or in your shell for local runs:

```
PODCASTINDEX_API_KEY=...
PODCASTINDEX_API_SECRET=...
```

The keys stay on the server. The browser never sees them.

## Run locally

```bash
npm install
npm test                      # unit tests (no network)
npm run dev                   # http://localhost:3000
node cli.js https://feed.homegrownhits.xyz/feed.xml   # one episode, exit code 1 on FAIL
```

## Files

```
lib/parse.js     feed, chapters, and song feed parsing
lib/compare.js   the timeline comparison (pure functions, all the rules)
lib/net.js       fetch, Podcast Index lookup, song resolution
lib/safe-fetch.js  guard on every server fetch: public addresses only, time and size limits
lib/check.js     glue: load a feed, check one episode
api/feed.js      GET /api/feed?url=          -> episode list
api/episode.js   GET /api/episode?url=&guid= -> full check of one episode
public/          the page (index.html, app.js, styles.css)
cli.js           command-line check
dev-server.js    local server that runs public/ and api/
```

## License

MIT
