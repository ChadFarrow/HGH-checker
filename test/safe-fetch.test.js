// The SSRF guard, the time limit and the size limit. No network: DNS is a fake, and a
// local HTTP server stands in for a public host through the `deps.fetch` seam.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { assertSafeFetchUrl, isPrivateIp } from '../lib/safe-fetch.js';
import { fetchText } from '../lib/net.js';

const noDns = async (host) => {
  throw new Error(`test made a DNS lookup for ${host}`);
};
const dns = (table) => async (host) => {
  if (!(host in table)) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  return table[host].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

// --- 1. literal URLs: refused before any DNS lookup or request --------------------

const MUST_REFUSE = [
  'http://localhost/',
  'http://localhost./',
  'http://LOCALHOST:8080/',
  'http://app.localhost/',
  'http://printer.local/',
  'http://metadata.google.internal/',
  'http://metadata.google.internal./',
  'http://127.0.0.1/',
  'http://127.0.0.1:3355/',
  'http://127.1/',
  'http://2130706433/',
  'http://0177.0.0.1/',
  'http://0x7f.0.0.1/',
  'http://0.0.0.0/',
  'http://10.0.0.1/',
  'http://10.255.255.255/',
  'http://172.16.0.1/',
  'http://172.31.255.1/',
  'http://192.168.0.243/',
  'http://169.254.169.254/latest/meta-data/',
  'http://good.example@169.254.169.254/',
  'http://100.64.0.1/',
  'http://224.0.0.1/',
  'http://255.255.255.255/',
  'http://192.0.2.1/',
  'http://198.18.0.1/',
  'http://[::1]/',
  'http://[::]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:169.254.169.254]/',
  'http://[::ffff:10.0.0.1]/',
  'http://[::7f00:1]/',
  'http://[64:ff9b::a9fe:a9fe]/',
  'http://[2002:7f00:1::]/',
  'http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/',
  'http://[fe80::1]/',
  'http://[fec0::1]/',
  'http://[fd00::1]/',
  'http://[100::1]/',
  'file:///etc/passwd',
  'gopher://example.com/',
  'ftp://example.com/feed.xml',
  'not a url',
];

for (const url of MUST_REFUSE) {
  test(`refuses ${url} with no DNS lookup and no request`, async () => {
    assert.throws(() => assertSafeFetchUrl(url), (e) => e.code === 'UNSAFE_URL');
    const calls = [];
    const fetch = async (u) => (calls.push(u), new Response('leak'));
    await assert.rejects(fetchText(url, { deps: { fetch, lookup: noDns } }), (e) => e.code === 'UNSAFE_URL');
    assert.deepEqual(calls, []);
  });
}

const MUST_ALLOW = [
  'https://feed.homegrownhits.xyz/feed.xml',
  'http://feeds.example.org/rss',
  'https://example.com:8443/feed.xml',
  'https://1.1.1.1/',
  'https://[2606:4700:4700::1111]/',
  'https://fdrecords.com/feed.xml',
  'https://fcc.gov/',
  'https://fe80.example.com/',
  'http://172.32.0.1/',
  'http://100.128.0.1/',
  'http://223.255.255.1/',
  'http://198.20.0.1/',
];
for (const url of MUST_ALLOW) {
  test(`allows ${url}`, () => {
    assert.doesNotThrow(() => assertSafeFetchUrl(url));
  });
}

test('resolved addresses in resolver form count as private', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '169.254.169.254', 'fe80::1%en0', '10.1.2.3']) {
    assert.equal(isPrivateIp(a), true, a);
  }
  for (const a of ['93.184.215.14', '2606:4700:4700::1111']) assert.equal(isPrivateIp(a), false, a);
});

// --- 2. DNS: a public name that resolves to a private address --------------------

const PUBLIC_IP = '93.184.215.14';
for (const [name, addrs] of [
  ['loopback.example', ['127.0.0.1']],
  ['metadata.example', ['169.254.169.254']],
  ['lan.example', ['10.0.0.5']],
  ['v6loop.example', ['::1']],
  ['mapped.example', ['::ffff:127.0.0.1']],
  ['mixed.example', [PUBLIC_IP, '192.168.1.1']],
]) {
  test(`refuses a name that resolves to ${addrs.join(', ')}`, async () => {
    const calls = [];
    const fetch = async (u) => (calls.push(u), new Response('leak'));
    await assert.rejects(fetchText(`https://${name}/feed.xml`, { deps: { fetch, lookup: dns({ [name]: addrs }) } }), (e) => e.code === 'UNSAFE_URL');
    assert.deepEqual(calls, []);
  });
}

test('refuses a name that does not resolve (fails closed)', async () => {
  const calls = [];
  const fetch = async (u) => (calls.push(u), new Response('leak'));
  await assert.rejects(fetchText('https://nope.invalid/feed.xml', { deps: { fetch, lookup: dns({}) } }), (e) => e.code === 'UNSAFE_URL');
  assert.deepEqual(calls, []);
});

test('the refusal message is the same for a private name and an unresolvable one', async () => {
  const lookup = dns({ 'a.example': ['10.0.0.1'] });
  const msg = async (url) => fetchText(url, { deps: { fetch: async () => new Response(''), lookup } }).catch((e) => e.message);
  assert.equal((await msg('https://a.example/')).replace('a.example', 'X'), (await msg('https://b.example/')).replace('b.example', 'X'));
});

test('a DNS lookup that never answers hits the time limit, with no request', async () => {
  const calls = [];
  const fetch = async (u) => (calls.push(u), new Response('leak'));
  const t = Date.now();
  await assert.rejects(
    fetchText('https://slow-dns.example/feed.xml', { timeout: 300, deps: { fetch, lookup: () => new Promise(() => {}) } }),
    (e) => e.code === 'TIMEOUT',
  );
  assert.ok(Date.now() - t < 2000);
  assert.deepEqual(calls, []);
});

// --- 3. a real HTTP server, reached as if it were the public host 93.184.215.14 ---

let server;
let port;
const hits = [];
const ROUTES = {
  '/feed.xml': (req, res) => res.end('<rss><channel><title>ok</title></channel></rss>'),
  '/to-metadata': (req, res) => (res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }), res.end()),
  '/to-localhost': (req, res) => (res.writeHead(301, { location: `http://localhost:${port}/secret` }), res.end()),
  '/to-loopback': (req, res) => (res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` }), res.end()),
  '/to-v6': (req, res) => (res.writeHead(307, { location: `http://[::1]:${port}/secret` }), res.end()),
  '/to-mapped': (req, res) => (res.writeHead(302, { location: `http://[::ffff:127.0.0.1]:${port}/secret` }), res.end()),
  '/to-lan-name': (req, res) => (res.writeHead(302, { location: 'http://lan.example/secret' }), res.end()),
  '/to-file': (req, res) => (res.writeHead(302, { location: 'file:///etc/passwd' }), res.end()),
  '/relative': (req, res) => (res.writeHead(302, { location: '/feed.xml' }), res.end()),
  '/loop': (req, res) => (res.writeHead(302, { location: '/loop' }), res.end()),
  '/secret': (req, res) => res.end('SECRET'),
  '/huge': (req, res) => {
    // No Content-Length: the cap must count bytes, not trust a header.
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    const chunk = Buffer.alloc(64 * 1024, 'a');
    let sent = 0;
    const pump = () => {
      while (sent < 64) {
        sent++;
        if (!res.write(chunk)) return void res.once('drain', pump);
      }
      res.end();
    };
    pump();
  },
  '/declared-huge': (req, res) => {
    res.writeHead(200, { 'content-length': String(50 * 1024 * 1024) });
    res.write('<rss>'); // then stall: the header alone must refuse it
  },
  '/stall-body': (req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.write('<rss><channel>'); // headers and a little body, then nothing
  },
  '/stall-headers': () => {}, // never answers
  '/slow-redirect': (req, res) => setTimeout(() => (res.writeHead(302, { location: '/slow-redirect-2' }), res.end()), 150),
  '/slow-redirect-2': (req, res) => setTimeout(() => res.end('<rss/>'), 150),
};

before(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url);
    (ROUTES[req.url] || ((q, r) => ((r.statusCode = 404), r.end())))(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

// The seam: a request to the public literal goes to the local server. Every other
// address is recorded and refused, so a guard hole shows up as an entry in `leaked`.
function viaLocal() {
  const leaked = [];
  const fetch = (url, init) => {
    const u = new URL(url);
    if (u.hostname !== PUBLIC_IP) {
      leaked.push(url);
      return Promise.reject(new Error(`guard let ${url} through`));
    }
    u.hostname = '127.0.0.1';
    return globalThis.fetch(u, init);
  };
  return { leaked, deps: { fetch, lookup: dns({ 'lan.example': ['10.0.0.5'] }) } };
}
const at = (path) => `http://${PUBLIC_IP}:${port}${path}`;

test('a public feed loads through the guard', async () => {
  const { deps } = viaLocal();
  assert.match(await fetchText(at('/feed.xml'), { deps }), /<title>ok<\/title>/);
});

for (const path of ['/to-metadata', '/to-localhost', '/to-loopback', '/to-v6', '/to-mapped', '/to-lan-name', '/to-file']) {
  test(`a redirect ${path} is refused before the second request`, async () => {
    const { leaked, deps } = viaLocal();
    hits.length = 0;
    await assert.rejects(fetchText(at(path), { deps }), (e) => e.code === 'UNSAFE_URL');
    assert.deepEqual(leaked, []);
    assert.deepEqual(hits, [path]);
  });
}

test('a relative redirect to a public path is followed', async () => {
  const { deps } = viaLocal();
  assert.match(await fetchText(at('/relative'), { deps }), /<title>ok/);
});

test('a redirect loop stops after 5 redirects', async () => {
  const { deps } = viaLocal();
  hits.length = 0;
  await assert.rejects(fetchText(at('/loop'), { deps }), (e) => e.code === 'TOO_MANY_REDIRECTS');
  assert.equal(hits.length, 6);
});

test('a huge body with no Content-Length is cut off at the cap', async () => {
  const { deps } = viaLocal();
  await assert.rejects(fetchText(at('/huge'), { deps, maxBytes: 256 * 1024 }), (e) => e.code === 'TOO_LARGE');
});

test('a body under the cap is read whole', async () => {
  const { deps } = viaLocal();
  assert.equal((await fetchText(at('/huge'), { deps, maxBytes: 4 * 1024 * 1024 })).length, 64 * 64 * 1024);
});

test('a declared Content-Length over the cap is refused without waiting for the body', async () => {
  const { deps } = viaLocal();
  const t = Date.now();
  await assert.rejects(fetchText(at('/declared-huge'), { deps, timeout: 5000 }), (e) => e.code === 'TOO_LARGE');
  assert.ok(Date.now() - t < 2000);
});

test('a server that sends headers and then stalls the body hits the time limit', async () => {
  const { deps } = viaLocal();
  const t = Date.now();
  await assert.rejects(fetchText(at('/stall-body'), { deps, timeout: 300 }), (e) => e.code === 'TIMEOUT');
  assert.ok(Date.now() - t < 2000);
});

test('a server that never answers hits the time limit', async () => {
  const { deps } = viaLocal();
  const t = Date.now();
  await assert.rejects(fetchText(at('/stall-headers'), { deps, timeout: 300 }), (e) => e.code === 'TIMEOUT');
  assert.ok(Date.now() - t < 2000);
});

test('one time limit covers all redirect hops', async () => {
  const { deps } = viaLocal();
  // Each hop takes 150 ms; a fresh 250 ms limit per hop would pass, one shared limit must not.
  await assert.rejects(fetchText(at('/slow-redirect'), { deps, timeout: 250 }), (e) => e.code === 'TIMEOUT');
  assert.match(await fetchText(at('/slow-redirect'), { deps, timeout: 2000 }), /<rss/);
});
