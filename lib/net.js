// Network: fetch feeds, chapters, and resolve songs through Podcast Index.
import crypto from 'node:crypto';
import { findSongInFeed } from './parse.js';

const UA = 'HGH-Checker/2.0 (+https://github.com/ChadFarrow/HGH-checker)';
const TIMEOUT_MS = 15000;

export async function fetchText(url, { timeout = TIMEOUT_MS, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}

// Small in-memory cache. Lives while a serverless instance is warm.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

// ---- Podcast Index ----
function piHeaders() {
  const key = process.env.PODCASTINDEX_API_KEY;
  const secret = process.env.PODCASTINDEX_API_SECRET;
  if (!key || !secret) return null;
  const date = Math.floor(Date.now() / 1000).toString();
  const auth = crypto.createHash('sha1').update(key + secret + date).digest('hex');
  return { 'X-Auth-Key': key, 'X-Auth-Date': date, Authorization: auth };
}

async function pi(path) {
  const headers = piHeaders();
  if (!headers) {
    throw Object.assign(new Error('Server has no Podcast Index API keys (PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET).'), {
      code: 'NO_KEYS',
    });
  }
  return fetchJson(`https://api.podcastindex.org/api/1.0/${path}`, { headers });
}

async function feedUrlForGuid(feedGuid, piGet = pi) {
  return cached(`pi-feed:${feedGuid}`, async () => {
    const data = await piGet(`podcasts/byguid?guid=${encodeURIComponent(feedGuid)}`);
    return data?.feed?.url || null;
  });
}

function songFromPiEpisode(ep) {
  if (!ep) return null;
  const v = ep.value;
  return {
    title: ep.title || '',
    artist: ep.feedTitle || '',
    album: ep.feedTitle || '',
    duration: ep.duration || null,
    image: ep.image || ep.feedImage || null,
    value: v?.destinations
      ? {
          type: v.model?.type || '',
          method: v.model?.method || '',
          recipients: v.destinations.map((d) => ({
            name: d.name || '',
            type: d.type || '',
            address: d.address || '',
            split: Number(d.split) || 0,
            fee: !!d.fee,
          })),
        }
      : null,
    valueSource: 'podcastindex',
  };
}

/**
 * Resolve a remote item to its song: title, length, art, wallet.
 * First choice: the song feed itself (what a player reads to boost).
 * Fallback: the Podcast Index episode record, also when the song feed is down
 * (the song then carries `feedProblem`).
 * `deps` replaces the network in tests: { getText(url), piGet(path) }.
 */
export async function resolveSong({ feedGuid, itemGuid, feedUrl }, deps = {}) {
  const { getText = (u) => cached(`feed:${u}`, () => fetchText(u)), piGet = pi } = deps;
  const key = `${feedGuid}|${itemGuid}`;
  try {
    const url = feedUrl || (await feedUrlForGuid(feedGuid, piGet));
    let feedProblem = null;
    if (url) {
      try {
        const song = findSongInFeed(await getText(url), itemGuid);
        if (song) return [key, { ...song, feedUrl: url }];
      } catch (e) {
        feedProblem = e.code === 'NOT_RSS' ? 'does not return an RSS feed' : `does not load (${e.message})`;
      }
    }
    const data = await cached(`pi-ep:${key}`, () =>
      piGet(`episodes/byguid?guid=${encodeURIComponent(itemGuid)}&podcastguid=${encodeURIComponent(feedGuid)}`),
    );
    const song = songFromPiEpisode(data?.episode);
    if (song) return [key, { ...song, feedUrl: url || null, ...(feedProblem ? { feedProblem } : {}) }];
    if (feedProblem) return [key, { error: `The song feed ${feedProblem}, and Podcast Index has no copy of the song.` }];
    return [key, { error: url ? `Song feed was found, but it has no item with guid ${itemGuid}.` : `No feed in Podcast Index has guid ${feedGuid}.` }];
  } catch (e) {
    return [key, { error: `Song lookup failed: ${e.message}`, ...(e.code === 'NO_KEYS' ? { code: 'NO_KEYS' } : {}) }];
  }
}

// Run async jobs with a concurrency limit.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n], n);
    }
  });
  await Promise.all(workers);
  return out;
}

