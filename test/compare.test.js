import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseChapters, findSongInFeed } from '../lib/parse.js';
import { compareEpisode, titlesMatch } from '../lib/compare.js';

const NODE = '03ecb3ee55ba6324d40bea174de096dc9134cb35d990235723b37ae9b5c49f4f53';

// Shape copied from Homegrown Hits episode 159 (first three songs).
const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>Homegrown Hits</title>
  <podcast:guid>ac746d09-7c3b-5bcd-b28a-f12d6456ca8f</podcast:guid>
  <item>
    <title>Homegrown Hits - Episode 159</title>
    <guid isPermaLink="false">ep159</guid>
    <enclosure url="https://example.com/159.mp3" type="audio/mpeg" length="1"/>
    <podcast:chapters url="https://example.com/ch-159.json" type="application/json+chapters"/>
    <podcast:value type="lightning" method="keysend" suggested="0.00000069420">
      <podcast:valueRecipient name="Host" type="node" address="${NODE}" split="99"/>
      <podcast:valueRecipient name="Podcastindex.org" type="lnaddress" address="podcastindex@getalby.com" split="1" fee="true"/>
      <podcast:valueTimeSplit startTime="30.042" duration="170.211" remotePercentage="99">
        <podcast:remoteItem feedGuid="f1" itemGuid="i1"/>
      </podcast:valueTimeSplit>
      <podcast:valueTimeSplit startTime="392.349" duration="207.464" remotePercentage="99">
        <podcast:remoteItem feedGuid="f2" itemGuid="i2"/>
      </podcast:valueTimeSplit>
      <podcast:valueTimeSplit startTime="598.483" duration="181.08" remotePercentage="99">
        <podcast:remoteItem feedGuid="f3" itemGuid="i3"/>
      </podcast:valueTimeSplit>
    </podcast:value>
  </item>
</channel>
</rss>`;

const CHAPTERS = {
  version: '1.2.0',
  chapters: [
    { startTime: 0.001, title: 'Homegrown Hits', img: 'a.png' },
    { startTime: 30.042, title: 'Up The Hill Over Yonder There', img: 'b.png', url: 'x' },
    { startTime: 197.544, title: 'HGH 159', img: 'c.png', url: 'x' },
    { startTime: 392.349, title: 'Coffee Fear Despair Beer', img: 'd.png', url: 'x' },
    { startTime: 598.483, title: 'Girl Like Me (Psycho Mix)', img: 'e.png', url: 'x' },
    { startTime: 776.349, title: 'What Do You Desire?', img: 'f.png' },
  ],
};

const wallet = { type: 'lightning', method: 'keysend', recipients: [{ name: 'Artist', type: 'node', address: NODE, split: 100 }] };
const song = (title, duration) => ({ title, artist: 'A', duration, image: 'art.png', value: wallet });

function songs(overrides = {}) {
  return new Map(
    Object.entries({
      'f1|i1': song('Up The Hill Over Yonder There', 171),
      'f2|i2': song('Coffee Fear Despair Beer', 207),
      'f3|i3': song('Girl Like Me', 181),
      ...overrides,
    }),
  );
}

const episode = () => parseFeed(FEED).items[0];
const chapters = () => parseChapters(CHAPTERS);

test('parses the feed: value block and splits', () => {
  const ep = episode();
  assert.equal(ep.guid, 'ep159');
  assert.equal(ep.splits.length, 3);
  assert.equal(ep.splits[1].startTime, 392.349);
  assert.equal(ep.splits[1].feedGuid, 'f2');
  assert.equal(ep.value.recipients.length, 2);
});

test('a clean episode passes', () => {
  const r = compareEpisode(episode(), chapters(), songs());
  assert.equal(r.status, 'pass', JSON.stringify(r.rows.flatMap((x) => x.checks), null, 1));
  assert.equal(r.songCount, 3);
});

test('fails when a split has no chapter at its start', () => {
  const c = parseChapters({ chapters: CHAPTERS.chapters.map((x) => (x.startTime === 392.349 ? { ...x, startTime: 380 } : x)) });
  const r = compareEpisode(episode(), c, songs());
  assert.equal(r.status, 'fail');
  assert.ok(r.rows.some((x) => x.checks.some((k) => k.code === 'NO_CHAPTER_AT_SPLIT')));
});

test('fails when the chapter title belongs to another song (swapped)', () => {
  const r = compareEpisode(
    episode(),
    chapters(),
    songs({ 'f2|i2': song('Girl Like Me', 207), 'f3|i3': song('Coffee Fear Despair Beer', 181) }),
  );
  assert.ok(r.rows.some((x) => x.checks.some((k) => k.code === 'CHAPTER_IS_OTHER_SONG')));
  assert.equal(r.status, 'fail');
});

test('fails when a song has no wallet', () => {
  const r = compareEpisode(episode(), chapters(), songs({ 'f1|i1': { ...song('Up The Hill Over Yonder There', 171), value: null } }));
  assert.ok(r.rows.some((x) => x.checks.some((k) => k.code === 'NO_WALLET')));
});

test('fails when a song cannot be resolved', () => {
  const r = compareEpisode(episode(), chapters(), songs({ 'f1|i1': { error: 'not found' } }));
  assert.ok(r.rows.some((x) => x.checks.some((k) => k.code === 'SONG_NOT_FOUND')));
});

test('fails when a song chapter has no split', () => {
  const ep = episode();
  ep.splits = ep.splits.filter((s) => s.feedGuid !== 'f3');
  // Song 3 is still known from another source: the chapter title matches a split song.
  const r = compareEpisode(ep, chapters(), songs({ 'f1|i1': song('Girl Like Me', 171) }));
  assert.ok(r.rows.some((x) => x.checks.some((k) => k.code === 'SONG_CHAPTER_UNPAID')));
});

test('warns when split duration and song length differ', () => {
  const r = compareEpisode(episode(), chapters(), songs({ 'f2|i2': song('Coffee Fear Despair Beer', 300) }));
  assert.ok(r.rows.some((x) => x.checks.some((k) => k.code === 'DURATION_MISMATCH')));
  assert.equal(r.status, 'warn');
});

test('short split overlap is CHECK, long overlap is FAIL', () => {
  const ep = episode();
  ep.splits[1].duration = 213; // runs 6.1 s into song 3 (like HGH 159 at 1:32:47)
  let r = compareEpisode(ep, chapters(), songs({ 'f2|i2': song('Coffee Fear Despair Beer', 213) }));
  assert.equal(r.rows.find((x) => x.split?.feedGuid === 'f2').checks.find((k) => k.code === 'SPLIT_OVERLAP').level, 'warn');
  ep.splits[0].duration = 400;
  r = compareEpisode(ep, chapters(), songs());
  assert.equal(r.rows[1].checks.find((k) => k.code === 'SPLIT_OVERLAP').level, 'fail');
});

test('fails on a bad node address in the episode wallet', () => {
  const ep = episode();
  ep.value.recipients[0].address = '03abc';
  const r = compareEpisode(ep, chapters(), songs());
  assert.ok(r.issues.some((k) => k.code === 'BAD_ADDRESS'));
});

test('title matching ignores case, punctuation, brackets', () => {
  assert.ok(titlesMatch('Girl Like Me (Psycho Mix)', 'girl like me'));
  assert.ok(titlesMatch('Artist - Hand In Box', 'Hand in Box'));
  assert.ok(!titlesMatch('HGH 159', 'Coffee Fear Despair Beer'));
});

test('finds a song in its own feed; item value overrides channel value', () => {
  const xml = `<rss xmlns:podcast="x" xmlns:itunes="y"><channel><title>Album</title><itunes:author>Band</itunes:author>
    <podcast:value type="lightning" method="keysend"><podcast:valueRecipient name="Label" type="node" address="${NODE}" split="100"/></podcast:value>
    <item><title>Track</title><guid>i9</guid><itunes:duration>3:05</itunes:duration>
      <podcast:value type="lightning" method="keysend"><podcast:valueRecipient name="Band" type="lnaddress" address="band@getalby.com" split="100"/></podcast:value>
    </item></channel></rss>`;
  const s = findSongInFeed(xml, 'i9');
  assert.equal(s.title, 'Track');
  assert.equal(s.artist, 'Band');
  assert.equal(s.duration, 185);
  assert.equal(s.valueSource, 'item');
  assert.equal(s.value.recipients[0].address, 'band@getalby.com');
});
