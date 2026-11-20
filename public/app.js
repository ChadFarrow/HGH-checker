const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const LABEL = { pass: 'PASS', warn: 'CHECK', fail: 'FAIL' };
const OLDER_LIMIT = 10;

function fmtTime(sec) {
  if (sec == null) return '';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function fmtDate(s) {
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function api(path, params) {
  const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function summaryLine(r) {
  if (r.status === 'pass') {
    return `All ${r.songCount} songs have a chapter and a wallet.`;
  }
  const parts = [];
  if (r.counts.fail) parts.push(`${r.counts.fail} problem${r.counts.fail > 1 ? 's' : ''} to fix`);
  if (r.counts.warn) parts.push(`${r.counts.warn} thing${r.counts.warn > 1 ? 's' : ''} to look at`);
  return parts.join(', ') + '.';
}

function issueList(r) {
  const items = [
    ...r.issues.map((i) => ({ ...i, time: null, label: 'Episode' })),
    ...r.rows.flatMap((row) =>
      row.checks.map((c) => ({
        ...c,
        time: row.time,
        label: row.song?.title || row.chapter?.title || 'Split',
      })),
    ),
  ];
  const order = { fail: 0, warn: 1, info: 2 };
  items.sort((a, b) => order[a.level] - order[b.level] || (a.time ?? -1) - (b.time ?? -1));
  return items;
}

function timeLink(t) {
  return t == null ? '' : `<button class="time" data-seek="${t}">${fmtTime(t)}</button>`;
}

function renderIssues(items) {
  const main = items.filter((i) => i.level !== 'info');
  const notes = items.filter((i) => i.level === 'info');
  const li = (i) =>
    `<li class="${i.level}">${timeLink(i.time)}<span><b>${esc(i.label)}</b> ${esc(i.message)}</span></li>`;
  let html = '';
  if (main.length) html += `<ul class="issues">${main.map(li).join('')}</ul>`;
  if (notes.length)
    html += `<details class="notes"><summary>${notes.length} note${notes.length > 1 ? 's' : ''}</summary><ul class="issues">${notes.map(li).join('')}</ul></details>`;
  return html;
}

function recipients(value) {
  if (!value?.recipients?.length) return '<span class="muted">none</span>';
  return value.recipients
    .map((r) => {
      const addr = r.type === 'node' ? `${r.address.slice(0, 10)}…` : r.address;
      const link =
        r.type === 'node' ? `<a href="https://amboss.space/node/${esc(r.address)}" target="_blank" rel="noopener">${esc(addr)}</a>` : esc(addr);
      return `<div>${esc(r.name || '?')} <span class="muted">${r.split}${r.fee ? ' fee' : ''}</span> ${link}</div>`;
    })
    .join('');
}

function renderTimeline(r) {
  const rows = r.rows
    .map((row) => {
      const ch = row.chapter;
      const song = row.song;
      const art = song?.image || ch?.img;
      return `<tr class="${row.status} ${row.kind}">
        <td>${timeLink(row.time)}</td>
        <td>${art ? `<img src="${esc(art)}" alt="" loading="lazy" />` : ''}</td>
        <td>${ch ? esc(ch.title) : '<span class="muted">no chapter</span>'}</td>
        <td>${
          row.kind === 'song'
            ? song
              ? `${esc(song.title)}<div class="muted">${esc(song.artist)} · ${fmtTime(row.split.duration)} split · ${row.split.remotePercentage}%</div>`
              : '<span class="muted">not found</span>'
            : '<span class="muted">talk / no split</span>'
        }</td>
        <td class="wallet">${row.kind === 'song' ? recipients(song?.value) : ''}</td>
        <td><span class="dot ${row.status}" title="${esc(row.checks.map((c) => c.message).join('\n'))}"></span></td>
      </tr>`;
    })
    .join('');
  return `
    <details class="timeline">
      <summary>Full timeline (${r.chapterCount} chapters, ${r.songCount} songs)</summary>
      ${r.audioUrl ? `<audio controls preload="none" src="${esc(r.audioUrl)}"></audio>` : ''}
      <div class="tablewrap"><table>
        <thead><tr><th>Time</th><th></th><th>Chapter</th><th>Song (split)</th><th>Wallet</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="muted small">Episode wallet:</p>
      <div class="wallet small">${recipients(r.value)}</div>
    </details>`;
}

function renderResult(el, r) {
  el.className = `result ${r.status}`;
  el.innerHTML = `
    <div class="verdict">
      ${r.image ? `<img class="cover" src="${esc(r.image)}" alt="" />` : ''}
      <div>
        <div class="status">${LABEL[r.status]}</div>
        <div class="title">${esc(r.title)}</div>
        <div class="muted">${fmtDate(r.pubDate)} · ${summaryLine(r)}</div>
      </div>
    </div>
    ${r.status === 'pass' ? '' : renderIssues(issueList(r))}
    ${r.status === 'pass' && r.counts.info ? renderIssues(issueList(r)) : ''}
    ${renderTimeline(r)}`;
}

// Seek buttons: open the timeline and play from that time.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-seek]');
  if (!btn) return;
  const result = btn.closest('.result');
  const details = $('.timeline', result);
  const audio = $('audio', result);
  if (details) details.open = true;
  if (audio) {
    audio.currentTime = Number(btn.dataset.seek);
    audio.play().catch(() => {});
  }
});

async function checkInto(el, url, guid) {
  el.className = 'result loading';
  el.innerHTML = '<div class="verdict"><div class="status">…</div><div class="muted">Checking songs and wallets</div></div>';
  try {
    renderResult(el, await api('episode', { url, guid }));
  } catch (err) {
    el.className = 'result fail';
    el.innerHTML = `<div class="verdict"><div><div class="status">ERROR</div><div class="muted">${esc(err.message)}</div></div></div>`;
  }
}

async function run(url) {
  const latest = $('#latest');
  const older = $('#older');
  const list = $('#list');
  const error = $('#error');
  error.hidden = true;
  older.hidden = true;
  latest.hidden = false;
  latest.className = 'result loading';
  latest.innerHTML = '<div class="verdict"><div class="status">…</div><div class="muted">Loading feed</div></div>';

  let feed;
  try {
    feed = await api('feed', { url });
  } catch (err) {
    latest.hidden = true;
    error.textContent = err.message;
    error.hidden = false;
    return;
  }
  if (!feed.episodes.length) {
    latest.hidden = true;
    error.textContent = 'This feed has no episodes.';
    error.hidden = false;
    return;
  }

  const [first, ...rest] = feed.episodes;
  checkInto(latest, url, first.guid);

  list.innerHTML = rest
    .slice(0, OLDER_LIMIT)
    .map(
      (e) => `<li>
        <div class="row">
          <span>${esc(e.title)} <span class="muted">${fmtDate(e.pubDate)}</span></span>
          <button class="small" data-check="${esc(e.guid)}">Check</button>
        </div>
        <div class="slot"></div>
      </li>`,
    )
    .join('');
  older.hidden = rest.length === 0;
  list.onclick = (e) => {
    const btn = e.target.closest('[data-check]');
    if (!btn) return;
    const slot = $('.slot', btn.closest('li'));
    btn.remove();
    checkInto(slot, url, btn.dataset.check);
  };
}

const form = $('#form');
const input = $('#url');
const params = new URLSearchParams(location.search);
if (params.get('feed')) input.value = params.get('feed');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = input.value.trim();
  history.replaceState(null, '', `?feed=${encodeURIComponent(url)}`);
  run(url);
});

run(input.value.trim());
