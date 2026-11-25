// SSRF guard for every URL the server fetches: the feed a visitor pastes, and the
// chapters and song-feed URLs that the feed itself names.
//
// Ported to plain JS from boostmebitch lib/safe-fetch.ts + lib/capped-body.ts at
// 815c551f (MIT), via the PC20-Nostr recipe catalog/recipes/safe-feed-fetch.
// The address lists are unchanged; read the recipe for why each entry is there.
//
// Each hop (the first request and every redirect) is checked twice:
//   1. the URL as written: scheme, private names, private IP literals;
//   2. every address DNS returns for its host. A name that does not resolve is refused.
// Redirects are followed by hand, at most 5. The body is read with a byte cap.
//
// Known limits (the recipe states them too):
// - DNS rebinding: we resolve, then fetch resolves again to connect. A DNS server that
//   answers the two differently can still reach a private address.
// - The port is not restricted: a public host is reachable on any port.
// - Plain http is allowed on purpose: many real podcast feeds are still http.
import { lookup as dnsLookup } from 'node:dns/promises';

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 carrier-grade NAT, tailnets
  /^(?:22[4-9]|23\d)\./, // 224.0.0.0/4 multicast
  /^(?:24\d|25[0-5])\./, // 240.0.0.0/4 reserved, incl. broadcast
  /^192\.0\.0\./, // IETF protocol assignments
  /^192\.0\.2\./, // TEST-NET-1
  /^198\.51\.100\./, // TEST-NET-2
  /^203\.0\.113\./, // TEST-NET-3
  /^198\.1[89]\./, // 198.18.0.0/15 benchmarking
  /^192\.88\.99\./, // 6to4 relay anycast
];

const PRIVATE_V6 = [
  /^::$/, // unspecified
  /^::(?!$)/, // all of ::/96: ::1 loopback, v4-compatible, and ::ffff: v4-mapped
  /^fe[89a-f]/i, // fe80::/10 link-local and fec0::/10 site-local
  /^f[cd]/i, // fc00::/7 unique-local
  /^64:ff9b:/i, // NAT64
  /^2002:/i, // 6to4
  /^2001:0?:/i, // Teredo
  /^100:/i, // discard-only
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
export const MAX_REDIRECTS = 5;
/** 8 MB: larger than any real chapters file or song feed. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

function refuse(host) {
  // One message for every refusal, so the answer does not tell a private name
  // that resolves from one that does not. `host` is what the visitor or the feed gave.
  return Object.assign(new Error(`Not fetched: ${host} is not a public internet address.`), {
    code: 'UNSAFE_URL',
  });
}

/** Is this bare IP address one that the server must never fetch? */
export function isPrivateIp(addr) {
  const ip = String(addr).toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.includes(':')) return PRIVATE_V6.some((re) => re.test(ip));
  if (IPV4.test(ip)) return PRIVATE_V4.some((re) => re.test(ip));
  return false;
}

function hostOf(u) {
  // DNS treats `localhost.` as `localhost`; a plain endsWith() does not.
  return u.hostname.toLowerCase().replace(/\.+$/, '');
}

/** Throws (code UNSAFE_URL) when `raw` is not a public http(s) URL. No DNS. */
export function assertSafeFetchUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw Object.assign(new Error('Not fetched: this is not a valid URL.'), { code: 'UNSAFE_URL' });
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw Object.assign(new Error(`Not fetched: ${u.protocol} URLs are not allowed.`), { code: 'UNSAFE_URL' });
  }
  const host = hostOf(u);
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIp(host)
  ) {
    throw refuse(host);
  }
  return u;
}

/** Resolve `host`; throw when it does not resolve or ANY address is private. */
export async function assertResolvedHostSafe(host, lookup = dnsLookup) {
  if (isPrivateIp(host)) throw refuse(host);
  if (host.includes(':') || IPV4.test(host)) return; // a literal, checked above
  let addrs;
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw refuse(host); // fail closed
  }
  if (!addrs?.length || addrs.some(({ address }) => isPrivateIp(address))) throw refuse(host);
}

// A DNS lookup cannot be cancelled, so stop waiting for it when the time limit ends.
function untilAborted(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * fetch() that checks every hop. Redirects are always followed by hand.
 * `init.signal` also limits the DNS checks. `deps` replaces the network in tests: { fetch, lookup }.
 */
export async function safeFetch(rawUrl, init = {}, deps = {}) {
  const doFetch = deps.fetch || ((u, i) => globalThis.fetch(u, i));
  let url = rawUrl;
  for (let hop = 0; ; hop++) {
    const u = assertSafeFetchUrl(url);
    await untilAborted(assertResolvedHostSafe(hostOf(u), deps.lookup), init.signal);
    const res = await doFetch(u.href, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get('location');
    if (!loc) return res;
    await res.body?.cancel().catch(() => {});
    if (hop >= MAX_REDIRECTS) {
      throw Object.assign(new Error(`Not fetched: more than ${MAX_REDIRECTS} redirects.`), { code: 'TOO_MANY_REDIRECTS' });
    }
    url = new URL(loc, u).href;
  }
}

function tooLarge(maxBytes) {
  return Object.assign(new Error(`Response is larger than ${Math.round(maxBytes / 1048576)} MB.`), {
    code: 'TOO_LARGE',
  });
}

/** Read the body as text, counting bytes as they arrive. Throws (TOO_LARGE) past `maxBytes`. */
export async function readCappedText(res, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooLarge(maxBytes);
  }
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.byteLength > maxBytes) throw tooLarge(maxBytes);
    return new TextDecoder().decode(all);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw tooLarge(maxBytes);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {}); // frees the socket on the throw path too
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    joined.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(joined);
}
