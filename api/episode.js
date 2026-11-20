import { loadFeed, checkEpisode } from '../lib/check.js';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));

export default async function handler(req, res) {
  try {
    const feed = await loadFeed(req.query.url);
    const opts = {};
    const start = num(req.query.startTolerance);
    if (start !== undefined) opts.startTolerance = start;
    const result = await checkEpisode(feed, req.query.guid, opts);
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
