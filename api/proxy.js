export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'HGH-Checker/1.0'
            }
        });

        const contentType = response.headers.get('content-type') || 'application/xml';
        const data = await response.text();

        res.setHeader('Content-Type', contentType);
        return res.status(response.status).send(data);
    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: `Proxy error: ${error.message}` });
    }
}
