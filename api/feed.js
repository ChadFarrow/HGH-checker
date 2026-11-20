import { loadFeed, feedSummary } from '../lib/check.js';

export default async function handler(req, res) {
  try {
    const feed = await loadFeed(req.query.url);
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(feedSummary(feed));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
