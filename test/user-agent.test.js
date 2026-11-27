// The shared User-Agent: its form, and that every server fetch sends it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { APP_NAME, APP_VERSION, APP_LINK, USER_AGENT } from '../lib/user-agent.js';
import { fetchText } from '../lib/net.js';

const pkg = createRequire(import.meta.url)('../package.json');
const dns = (table) => async (host) => table[host].map((address) => ({ address, family: 4 }));

test('USER_AGENT is `<AppName>/<version> (+<link>)` with the package.json version', () => {
  assert.equal(APP_NAME, 'HGH-Checker');
  assert.equal(APP_VERSION, pkg.version);
  assert.equal(APP_LINK, 'https://hgh-checker.vercel.app');
  assert.equal(USER_AGENT, `HGH-Checker/${pkg.version} (+https://hgh-checker.vercel.app)`);
  assert.match(USER_AGENT, /^[A-Za-z][A-Za-z0-9-]*\/\d+\.\d+\.\d+ \(\+https:\/\/\S+\)$/);
  assert.doesNotMatch(USER_AGENT, /@|Mozilla|Chrome|Safari/);
});

test('fetchText sends USER_AGENT, also next to other headers', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(new Headers(init.headers).get('user-agent'));
    return new Response('<rss/>');
  };
  const deps = { fetch, lookup: dns({ 'feeds.example.com': ['93.184.216.34'] }) };
  assert.equal(await fetchText('https://feeds.example.com/feed.xml', { deps }), '<rss/>');
  await fetchText('https://feeds.example.com/feed.xml', { deps, headers: { Accept: 'application/json' } });
  assert.deepEqual(seen, [USER_AGENT, USER_AGENT]);
});
