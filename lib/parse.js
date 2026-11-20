// Feed and chapter parsing. No network here, so it is easy to test.
import { XMLParser } from 'fast-xml-parser';

const ARRAY_TAGS = new Set([
  'item',
  'podcast:value',
  'podcast:valueRecipient',
  'podcast:valueTimeSplit',
  'podcast:remoteItem',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

export function parseXml(xml) {
  return parser.parse(xml);
}

// Text of a node that can be a string or { '#text': ... }.
export function text(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object' && '#text' in node) return String(node['#text']).trim();
  return '';
}

export function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// "1:02:03", "62:03", "3723" -> seconds
export function parseDuration(value) {
  const s = text(value);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseRecipients(valueNode) {
  return (valueNode?.['podcast:valueRecipient'] || []).map((r) => ({
    name: r['@_name'] || '',
    type: r['@_type'] || '',
    address: r['@_address'] || '',
    split: num(r['@_split']) ?? 0,
    fee: String(r['@_fee']).toLowerCase() === 'true',
    customKey: r['@_customKey'] || null,
    customValue: r['@_customValue'] || null,
  }));
}

export function parseValue(valueNode) {
  if (!valueNode) return null;
  return {
    type: valueNode['@_type'] || '',
    method: valueNode['@_method'] || '',
    recipients: parseRecipients(valueNode),
  };
}

function itemImage(item, channel) {
  return (
    item?.['itunes:image']?.['@_href'] ||
    text(item?.['podcast:images']?.['@_srcset']).split(' ')[0] ||
    channel?.['itunes:image']?.['@_href'] ||
    text(channel?.image?.url) ||
    null
  );
}

function parseSplits(valueNode) {
  return (valueNode?.['podcast:valueTimeSplit'] || []).map((s, index) => {
    const remote = s['podcast:remoteItem']?.[0];
    return {
      index,
      startTime: num(s['@_startTime']),
      duration: num(s['@_duration']),
      remoteStartTime: num(s['@_remoteStartTime']) ?? 0,
      remotePercentage: num(s['@_remotePercentage']) ?? 100,
      feedGuid: remote?.['@_feedGuid'] || null,
      itemGuid: remote?.['@_itemGuid'] || null,
      feedUrl: remote?.['@_feedUrl'] || null,
      // A split can name recipients directly instead of a remote item.
      recipients: parseRecipients(s),
    };
  });
}

function parseItem(item, channel) {
  const values = item['podcast:value'] || [];
  const lightning = values.find((v) => (v['@_type'] || '').toLowerCase() === 'lightning') || values[0];
  const chapters = item['podcast:chapters'];
  return {
    guid: text(item.guid),
    title: text(item.title),
    pubDate: text(item.pubDate),
    audioUrl: item.enclosure?.['@_url'] || null,
    duration: parseDuration(item['itunes:duration']),
    image: itemImage(item, channel),
    chaptersUrl: chapters?.['@_url'] || null,
    value: parseValue(lightning),
    splits: parseSplits(lightning),
  };
}

export function parseFeed(xml) {
  const doc = parseXml(xml);
  const channel = doc?.rss?.channel;
  if (!channel) throw new Error('This is not an RSS feed (no <rss><channel>).');
  const channelValues = channel['podcast:value'] || [];
  return {
    title: text(channel.title),
    guid: text(channel['podcast:guid']),
    image: itemImage(null, channel),
    value: parseValue(channelValues[0]),
    items: (channel.item || []).map((item) => parseItem(item, channel)),
  };
}

// Find one item in a song (remote) feed. Item value overrides channel value.
export function findSongInFeed(xml, itemGuid) {
  const doc = parseXml(xml);
  const channel = doc?.rss?.channel;
  if (!channel) return null;
  const item = (channel.item || []).find((i) => text(i.guid) === itemGuid);
  if (!item) return null;
  const itemValue = parseValue((item['podcast:value'] || [])[0]);
  const channelValue = parseValue((channel['podcast:value'] || [])[0]);
  return {
    title: text(item.title),
    artist: text(item['itunes:author']) || text(channel['itunes:author']) || text(channel.title),
    album: text(channel.title),
    duration: parseDuration(item['itunes:duration']),
    image: itemImage(item, channel),
    value: itemValue?.recipients.length ? itemValue : channelValue,
    valueSource: itemValue?.recipients.length ? 'item' : channelValue ? 'channel' : null,
  };
}

export function parseChapters(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const list = Array.isArray(data?.chapters) ? data.chapters : [];
  return list
    .map((c, index) => ({
      index,
      startTime: num(c.startTime),
      title: (c.title || '').trim(),
      img: c.img || null,
      url: c.url || null,
      toc: c.toc !== false,
    }))
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
}
