// Compare the three timelines of one episode: chapters, value time splits, songs.
// Pure functions only. Input is already fetched and parsed.

export const DEFAULTS = {
  startTolerance: 3, // seconds between a split start and its chapter start
  durationTolerance: 5, // seconds between split duration and song length
  overlapTolerance: 3, // seconds two splits can overlap (crossfades)
  tailTolerance: 5, // seconds a split can run past the next chapter
  overlapFail: 10, // seconds of overlap that is a FAIL, not a CHECK
};

const LEVEL_RANK = { pass: 0, info: 0, warn: 1, fail: 2 };

export function worst(levels) {
  let out = 'pass';
  for (const l of levels) if (LEVEL_RANK[l] > LEVEL_RANK[out]) out = l;
  return out;
}

export function normalizeTitle(s, { dropBrackets = true } = {}) {
  let t = (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (dropBrackets) t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  return t.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function titlesMatch(a, b) {
  for (const dropBrackets of [false, true]) {
    const x = normalizeTitle(a, { dropBrackets });
    const y = normalizeTitle(b, { dropBrackets });
    if (!x || !y) continue;
    if (x === y) return true;
    // "Artist - Song" chapter titles contain the song title.
    if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  }
  return false;
}

// UTF-8 text that was read as Windows-1252 and saved again ("⚡" -> "âš¡").
// A UTF-8 lead byte shows as Â-ô, each continuation byte as one of CONT.
const CONT = '[\\u0080-\\u00BF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]';
const BROKEN_RE = new RegExp(`[\\u00C2-\\u00DF]${CONT}|[\\u00E0-\\u00EF]${CONT}{2}|[\\u00F0-\\u00F4]${CONT}{3}`);

/** The first broken sequence in s, or null. */
export function brokenText(s) {
  return (s || '').match(BROKEN_RE)?.[0] ?? null;
}

function brokenTitleCheck(chapter) {
  const bad = chapter && brokenText(chapter.title);
  return bad
    ? {
        level: 'warn',
        code: 'BROKEN_TEXT',
        message: `Chapter title has broken characters ("${bad}"). The chapters file was saved with the wrong text encoding.`,
      }
    : null;
}

const NODE_RE = /^0[23][0-9a-f]{64}$/i;
const LNADDRESS_RE = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function addressProblem(r) {
  const type = (r.type || '').toLowerCase();
  if (!r.address) return 'has no address';
  if (type === 'node' && !NODE_RE.test(r.address)) return 'has a node address that is not a valid 66-character pubkey';
  if (type === 'lnaddress' && !LNADDRESS_RE.test(r.address)) return 'has a Lightning address that is not valid';
  if (type && type !== 'node' && type !== 'lnaddress') return `has an unknown recipient type "${r.type}"`;
  return null;
}

export function walletIssues(value, who) {
  const out = [];
  if (!value || !value.recipients?.length) {
    out.push({ level: 'fail', code: 'NO_WALLET', message: `${who} has no value block, so a boost has nowhere to go.` });
    return out;
  }
  const paid = value.recipients.filter((r) => !r.fee);
  if (!paid.some((r) => r.split > 0)) {
    out.push({ level: 'fail', code: 'ZERO_SPLITS', message: `${who} has no recipient with a split above 0.` });
  }
  for (const r of value.recipients) {
    const p = addressProblem(r);
    if (p) out.push({ level: 'fail', code: 'BAD_ADDRESS', message: `${who}: recipient "${r.name || '?'}" ${p}.` });
  }
  return out;
}

export function fmtTime(sec) {
  if (sec == null) return '?';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function nearestChapter(chapters, t) {
  let best = null;
  for (const c of chapters) {
    if (c.startTime == null) continue;
    const d = Math.abs(c.startTime - t);
    if (!best || d < best.offset) best = { chapter: c, offset: d };
  }
  return best;
}

/**
 * @param {object} episode   parsed item from parseFeed
 * @param {Array}  chapters  parsed chapters, or null when they did not load
 * @param {Map}    songs     key `${feedGuid}|${itemGuid}` -> song or { error }
 * @param {object} opts      tolerances
 */
export function compareEpisode(episode, chapters, songs, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const issues = [];
  const rows = [];

  // Episode level
  if (!episode.chaptersUrl) {
    issues.push({ level: 'fail', code: 'NO_CHAPTERS_TAG', message: 'Episode has no podcast:chapters tag.' });
  } else if (!chapters) {
    issues.push({ level: 'fail', code: 'CHAPTERS_UNREADABLE', message: 'The chapters file did not load or is not valid JSON.' });
  } else if (!chapters.length) {
    issues.push({ level: 'fail', code: 'CHAPTERS_EMPTY', message: 'The chapters file has no chapters.' });
  }
  if (!episode.audioUrl) {
    issues.push({ level: 'fail', code: 'NO_ENCLOSURE', message: 'Episode has no audio enclosure.' });
  }
  issues.push(...walletIssues(episode.value, 'Episode'));
  if (!episode.splits.length) {
    issues.push({ level: 'warn', code: 'NO_SPLITS', message: 'Episode has no value time splits, so no song gets paid.' });
  }

  const chs = chapters || [];
  const splits = [...episode.splits].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  const songTitles = splits.map((s) => songs.get(`${s.feedGuid}|${s.itemGuid}`)?.title).filter(Boolean);
  const usedChapters = new Set();
  let noKeys = false;

  splits.forEach((split, i) => {
    const checks = [];
    const song = split.feedGuid ? songs.get(`${split.feedGuid}|${split.itemGuid}`) : null;
    const start = split.startTime;
    const end = start != null && split.duration != null ? start + split.duration : null;

    if (start == null || split.duration == null) {
      checks.push({ level: 'fail', code: 'SPLIT_TIMES', message: 'Split has no startTime or no duration.' });
    }

    // Overlap with the next split
    const next = splits[i + 1];
    if (end != null && next?.startTime != null && end > next.startTime + o.overlapTolerance) {
      const over = end - next.startTime;
      checks.push({
        level: over > o.overlapFail ? 'fail' : 'warn',
        code: 'SPLIT_OVERLAP',
        message: `Split runs ${over.toFixed(1)} s into the next split (ends ${fmtTime(end)}, next starts ${fmtTime(next.startTime)}).`,
      });
    }

    // Chapter at the split start
    let chapter = null;
    if (start != null && chs.length) {
      const near = nearestChapter(chs, start);
      if (near && near.offset <= o.startTolerance) {
        chapter = near.chapter;
        usedChapters.add(chapter.index);
      } else {
        checks.push({
          level: 'fail',
          code: 'NO_CHAPTER_AT_SPLIT',
          message: near
            ? `No chapter starts at ${fmtTime(start)}. Nearest chapter "${near.chapter.title}" is ${near.offset.toFixed(1)} s away.`
            : `No chapter starts at ${fmtTime(start)}.`,
        });
      }
    }

    // Song resolution
    if (!split.feedGuid || !split.itemGuid) {
      if (!split.recipients.length) {
        checks.push({ level: 'fail', code: 'NO_REMOTE_ITEM', message: 'Split has no remoteItem feedGuid/itemGuid and no recipients.' });
      } else {
        checks.push(...walletIssues({ recipients: split.recipients }, 'Split'));
      }
    } else if (song?.code === 'NO_KEYS') {
      noKeys = true; // reported once for the episode, below
    } else if (!song || song.error) {
      checks.push({ level: 'fail', code: 'SONG_NOT_FOUND', message: song?.error || 'Song could not be found.' });
    } else {
      // Title
      if (chapter && song.title && !titlesMatch(chapter.title, song.title)) {
        const other = songTitles.find((t) => t !== song.title && titlesMatch(chapter.title, t));
        checks.push(
          other
            ? {
                level: 'fail',
                code: 'CHAPTER_IS_OTHER_SONG',
                message: `Chapter "${chapter.title}" is a different song than the split pays ("${song.title}").`,
              }
            : {
                level: 'warn',
                code: 'TITLE_MISMATCH',
                message: `Chapter title "${chapter.title}" does not match song title "${song.title}".`,
              },
        );
      }
      // Duration
      if (split.duration != null && song.duration) {
        const playable = song.duration - (split.remoteStartTime || 0);
        if (Math.abs(playable - split.duration) > o.durationTolerance) {
          checks.push({
            level: 'warn',
            code: 'DURATION_MISMATCH',
            message: `Split lasts ${fmtTime(split.duration)}, but the song is ${fmtTime(playable)} long.`,
          });
        }
      }
      // Wallet
      checks.push(...walletIssues(song.value, 'Song'));
      if (!song.image) checks.push({ level: 'warn', code: 'SONG_NO_ART', message: 'Song has no artwork.' });
    }

    if (chapter && !chapter.img) {
      checks.push({ level: 'warn', code: 'CHAPTER_NO_ART', message: 'Chapter has no artwork.' });
    }
    const broken = brokenTitleCheck(chapter);
    if (broken) checks.push(broken);

    // Split runs into the next chapter (next segment pays this song)
    if (end != null) {
      const after = chs.find((c) => c.startTime != null && c.startTime > start + o.startTolerance);
      if (after && end > after.startTime + o.tailTolerance) {
        checks.push({
          level: 'warn',
          code: 'SPLIT_RUNS_LONG',
          message: `Split still pays this song ${Math.round(end - after.startTime)} s into the next chapter "${after.title}".`,
        });
      }
    }

    rows.push({
      kind: 'song',
      time: start,
      end,
      chapter,
      split: {
        startTime: split.startTime,
        duration: split.duration,
        remotePercentage: split.remotePercentage,
        feedGuid: split.feedGuid,
        itemGuid: split.itemGuid,
      },
      song: song && !song.error ? song : null,
      checks,
      status: worst(checks.map((c) => c.level)),
    });
  });

  // Chapters with no split
  for (const c of chs) {
    if (usedChapters.has(c.index)) continue;
    const checks = [];
    const isKnownSong = songTitles.some((t) => titlesMatch(c.title, t));
    if (isKnownSong) {
      checks.push({
        level: 'fail',
        code: 'SONG_CHAPTER_UNPAID',
        message: `Chapter "${c.title}" has the title of a song in this episode, but no split starts here.`,
      });
    } else if (c.url && splits.length) {
      checks.push({
        level: 'info',
        code: 'CHAPTER_NO_SPLIT',
        message: 'Chapter has a link but no split. If this is a song, it is not paid.',
      });
    }
    const broken = brokenTitleCheck(c);
    if (broken) checks.push(broken);
    rows.push({ kind: 'chapter', time: c.startTime, chapter: c, checks, status: worst(checks.map((x) => x.level)) });
  }

  if (noKeys) {
    issues.push({
      level: 'fail',
      code: 'NO_PI_KEYS',
      message:
        'The server has no Podcast Index API keys, so no song could be checked. Set PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET in Vercel.',
    });
  }

  rows.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  const all = [...issues, ...rows.flatMap((r) => r.checks)];
  const count = (l) => all.filter((x) => x.level === l).length;
  return {
    status: worst(all.map((x) => x.level)),
    counts: { fail: count('fail'), warn: count('warn'), info: count('info') },
    songCount: splits.length,
    chapterCount: chs.length,
    issues,
    rows,
  };
}
