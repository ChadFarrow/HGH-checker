// Local dev server: serves public/ and runs api/*.js like Vercel does.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const name = path.basename(url.pathname).replace(/[^a-z0-9-]/gi, '');
      try {
        const { default: handler } = await import(`./api/${name}.js`);
        req.query = Object.fromEntries(url.searchParams);
        res.status = (code) => ((res.statusCode = code), res);
        res.json = (obj) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(obj)));
        return handler(req, res);
      } catch {
        res.statusCode = 404;
        return res.end('Not found');
      }
    }
    const file = path.join('public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    try {
      const body = await fs.readFile(file);
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  })
  .listen(PORT, () => console.log(`HGH Checker on http://localhost:${PORT}`));
