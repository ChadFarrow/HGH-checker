const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

const server = http.createServer((req, res) => {
    // Enable CORS with all necessary headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, User-Agent');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
    }

    // Extract target URL from query parameter
    const parsedUrl = url.parse(req.url, true);
    const targetUrl = parsedUrl.query.url;

    if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing url parameter');
        return;
    }

    console.log(`🔄 Proxying request to: ${targetUrl}`);

    // Determine if we need http or https
    const client = targetUrl.startsWith('https:') ? https : http;

    const proxyReq = client.get(targetUrl, (proxyRes) => {
        console.log(`📡 Response status: ${proxyRes.statusCode}`);
        
        // Forward status code and headers
        res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'application/xml',
            'Access-Control-Allow-Origin': '*'
        });

        // Pipe the response
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`❌ Proxy error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Proxy error: ${err.message}`);
    });

    proxyReq.setTimeout(10000, () => {
        console.error('⏰ Request timeout');
        res.writeHead(504, { 'Content-Type': 'text/plain' });
        res.end('Gateway timeout');
        proxyReq.abort();
    });
});

server.listen(PORT, () => {
    console.log(`🚀 CORS proxy server running on http://localhost:${PORT}`);
    console.log(`📋 Usage: http://localhost:${PORT}?url=TARGET_URL`);
});