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
