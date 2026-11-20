// Command line: node cli.js <feedUrl> [episodeGuid]
import { loadFeed, checkEpisode } from './lib/check.js';

const [url, guid] = process.argv.slice(2);
if (!url) {
  console.error('Usage: node cli.js <feedUrl> [episodeGuid]');
  process.exit(2);
}
const feed = await loadFeed(url);
const r = await checkEpisode(feed, guid);
console.log(`${r.status.toUpperCase()}  ${r.title}  (${r.songCount} songs, ${r.chapterCount} chapters)`);
for (const i of r.issues) console.log(`  [${i.level}] ${i.message}`);
for (const row of r.rows) for (const c of row.checks) console.log(`  [${c.level}] ${Math.round(row.time ?? 0)}s ${c.message}`);
process.exit(r.status === 'fail' ? 1 : 0);
