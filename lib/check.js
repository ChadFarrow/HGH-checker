// Glue: fetch everything for one feed or one episode, then compare.
import { parseFeed, parseChapters } from './parse.js';
import { compareEpisode, walletIssues } from './compare.js';
import { fetchText, fetchJson, resolveSong, pool } from './net.js';

export async function loadFeed(url) {
  if (!/^https?:\/\//i.test(url || '')) throw new Error('Feed URL must start with http:// or https://');
  return parseFeed(await fetchText(url));
}

export function feedSummary(feed) {
  return {
    title: feed.title,
    guid: feed.guid,
    image: feed.image,
    channelValueIssues: feed.value ? walletIssues(feed.value, 'Show') : [],
    episodes: feed.items.map((e) => ({
      guid: e.guid,
      title: e.title,
      pubDate: e.pubDate,
      image: e.image,
      songCount: e.splits.length,
      hasChapters: !!e.chaptersUrl,
    })),
  };
}

export async function checkEpisode(feed, guid, opts = {}) {
  const episode = guid ? feed.items.find((e) => e.guid === guid) : feed.items[0];
  if (!episode) throw new Error(`No episode with guid ${guid} in this feed.`);

  const chaptersP = episode.chaptersUrl
    ? fetchJson(episode.chaptersUrl).then(parseChapters).catch(() => null)
    : Promise.resolve(null);

  const unique = new Map();
  for (const s of episode.splits) {
    if (s.feedGuid && s.itemGuid) unique.set(`${s.feedGuid}|${s.itemGuid}`, s);
  }
  const songsP = pool([...unique.values()], 6, resolveSong).then((pairs) => new Map(pairs));

  const [chapters, songs] = await Promise.all([chaptersP, songsP]);
  const result = compareEpisode(episode, chapters, songs, opts);
  return {
    guid: episode.guid,
    title: episode.title,
    pubDate: episode.pubDate,
    image: episode.image,
    audioUrl: episode.audioUrl,
    chaptersUrl: episode.chaptersUrl,
    value: episode.value,
    ...result,
  };
}
