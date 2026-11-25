// End-to-end: no URL that a visitor or a feed supplies may reach a private address.
// globalThis.fetch is replaced by a spy, so a refused URL must leave the spy empty.
// (An unguarded fetch to 10.0.0.1 also fails offline, so "it rejects" alone proves nothing.)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadFeed, checkEpisode } from '../lib/check.js';
import { parseFeed } from '../lib/parse.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function spyFetch() {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response('<rss><channel><title>leak</title></channel></rss>');
  };
  return calls;
}

const VISITOR_URLS = [
  'http://localhost/',
  'http://localhost:3000/api/feed',
  'http://127.0.0.1/',
  'http://10.0.0.1/feed.xml',
  'http://192.168.0.243:3355/',
  'http://169.254.169.254/latest/meta-data/',
  'http://[::1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:169.254.169.254]/',
  'http://2130706433/',
  'http://metadata.google.internal./',
];

for (const url of VISITOR_URLS) {
  test(`loadFeed refuses ${url} and makes no request`, async () => {
    const calls = spyFetch();
    await assert.rejects(loadFeed(url), (e) => e.code === 'UNSAFE_URL');
    assert.deepEqual(calls, []);
  });
}

test('checkEpisode makes no request when the feed points chapters and a song feed at private addresses', async () => {
  const saved = [process.env.PODCASTINDEX_API_KEY, process.env.PODCASTINDEX_API_SECRET];
  delete process.env.PODCASTINDEX_API_KEY;
  delete process.env.PODCASTINDEX_API_SECRET;
  const feed = parseFeed(`<?xml version="1.0"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
  <title>Evil show</title>
  <item>
    <title>Episode 1</title>
    <guid>ep1</guid>
    <enclosure url="https://example.com/1.mp3" type="audio/mpeg" length="1"/>
    <podcast:chapters url="http://169.254.169.254/latest/meta-data/iam" type="application/json+chapters"/>
    <podcast:value type="lightning" method="keysend">
      <podcast:valueRecipient name="Host" type="lnaddress" address="host@example.com" split="100"/>
      <podcast:valueTimeSplit startTime="10" duration="100" remotePercentage="90">
        <podcast:remoteItem feedGuid="f-evil" itemGuid="i-evil" feedUrl="http://10.0.0.1/song.xml"/>
      </podcast:valueTimeSplit>
      <podcast:valueTimeSplit startTime="120" duration="100" remotePercentage="90">
        <podcast:remoteItem feedGuid="f-evil2" itemGuid="i-evil2" feedUrl="http://[::ffff:127.0.0.1]:6379/"/>
      </podcast:valueTimeSplit>
    </podcast:value>
  </item>
</channel>
</rss>`);
  try {
    const calls = spyFetch();
    const r = await checkEpisode(feed);
    assert.deepEqual(calls, []);
    assert.equal(r.status, 'fail');
  } finally {
    if (saved[0] !== undefined) process.env.PODCASTINDEX_API_KEY = saved[0];
    if (saved[1] !== undefined) process.env.PODCASTINDEX_API_SECRET = saved[1];
  }
});
