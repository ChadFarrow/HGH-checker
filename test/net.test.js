import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSong } from '../lib/net.js';

test('resolveSong marks a missing key pair with code NO_KEYS (no network call)', async () => {
  const saved = [process.env.PODCASTINDEX_API_KEY, process.env.PODCASTINDEX_API_SECRET];
  delete process.env.PODCASTINDEX_API_KEY;
  delete process.env.PODCASTINDEX_API_SECRET;
  try {
    const [key, song] = await resolveSong({ feedGuid: 'f-nokeys', itemGuid: 'i-nokeys' });
    assert.equal(key, 'f-nokeys|i-nokeys');
    assert.equal(song.code, 'NO_KEYS');
    assert.match(song.error, /Podcast Index/);
  } finally {
    if (saved[0] !== undefined) process.env.PODCASTINDEX_API_KEY = saved[0];
    if (saved[1] !== undefined) process.env.PODCASTINDEX_API_SECRET = saved[1];
  }
});

const NODE = '03ecb3ee55ba6324d40bea174de096dc9134cb35d990235723b37ae9b5c49f4f53';
const piEpisode = {
  episode: {
    title: 'November Anthem',
    feedTitle: 'The Leaves, Shimmering Gold',
    duration: 355,
    image: 'art.jpg',
    value: { model: { type: 'lightning', method: 'keysend' }, destinations: [{ name: 'Ariel Powell', type: 'node', address: NODE, split: 90 }] },
  },
};
const fakePi = (path) =>
  path.startsWith('podcasts/byguid') ? { feed: { url: 'https://example.com/song.xml' } } : path.startsWith('episodes/byguid') ? piEpisode : null;

test('resolveSong falls back to the Podcast Index copy when the song feed is not RSS', async () => {
  const [, s] = await resolveSong(
    { feedGuid: 'f-jpeg', itemGuid: 'i-jpeg' },
    { getText: async () => 'ÿØÿàJFIF binary', piGet: async (p) => fakePi(p) },
  );
  assert.equal(s.error, undefined, s.error);
  assert.equal(s.title, 'November Anthem');
  assert.equal(s.value.recipients[0].address, NODE);
  assert.match(s.feedProblem, /RSS/);
});

test('resolveSong falls back to the Podcast Index copy when the song feed does not load', async () => {
  const [, s] = await resolveSong(
    { feedGuid: 'f-404', itemGuid: 'i-404' },
    {
      getText: async (u) => {
        throw new Error(`HTTP 404 for ${u}`);
      },
      piGet: async (p) => fakePi(p),
    },
  );
  assert.equal(s.title, 'November Anthem');
  assert.match(s.feedProblem, /HTTP 404/);
});

test('the Podcast Index fallback uses the feed value and art when the episode has none', async () => {
  // HGH 159, November Anthem: the wallet is on the channel, so the PI episode record has no value.
  const feedValue = { model: { type: 'lightning', method: 'keysend' }, destinations: [{ name: 'Ariel Powell', type: 'node', address: NODE, split: 90 }] };
  const piGet = async (p) =>
    p.startsWith('podcasts/byguid')
      ? { feed: { url: 'https://example.com/leaves.xml', value: feedValue, image: 'leaves.jpg' } }
      : { episode: { title: 'November Anthem', feedTitle: 'The Leaves, Shimmering Gold', duration: 355, image: '', feedImage: '', value: null } };
  const [, s] = await resolveSong({ feedGuid: 'f-chanvalue', itemGuid: 'i-chanvalue' }, { getText: async () => 'JFIF', piGet });
  assert.equal(s.value?.recipients?.[0]?.address, NODE);
  assert.equal(s.image, 'leaves.jpg');
});
